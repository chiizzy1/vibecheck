"""
FastAPI backend — handles session credentials for the React frontend
and runs the VibeCheck agent in-process per session.
"""

import os
import uuid
import asyncio
import logging
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import getstream as getstream_sdk

from vision_agents.core import Agent, User
from vision_agents.core.agents import AgentLauncher
from vision_agents.plugins import gemini, getstream, ultralytics

from agent import create_agent, join_call

load_dotenv()
logger = logging.getLogger(__name__)

app = FastAPI(title="VibeCheck API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STREAM_API_KEY = os.environ["STREAM_API_KEY"]
STREAM_API_SECRET = os.environ["STREAM_API_SECRET"]

# Track active agent tasks so we can clean them up
_active_agents: dict[str, asyncio.Task] = {}


class StartSessionRequest(BaseModel):
    mode: Literal["director", "bestie", "roast"] = "director"
    topic: str = ""


class StartSessionResponse(BaseModel):
    api_key: str
    token: str
    user_id: str
    call_id: str


@app.post("/session/start", response_model=StartSessionResponse)
async def start_session(req: StartSessionRequest):
    """
    1. Create a unique call ID
    2. Generate a user token for the React frontend
    3. Launch the agent in-process (joins the same call)
    4. Return credentials to the frontend
    """
    call_id = f"vibecheck-{uuid.uuid4().hex[:8]}"
    user_id = f"creator-{uuid.uuid4().hex[:6]}"

    # Reset the global session store so old takes don't bleed into new sessions
    from tools.session import session_store
    import tools.caption_generator as caption_mod
    session_store["takes"] = []
    session_store["topic"] = req.topic
    session_store["mode"] = req.mode
    session_store["eye_contact_pct"] = 0
    session_store["energy_score"] = 0
    session_store["smile_count"] = 0
    caption_mod._last_caption = None

    # Generate frontend user token
    client = getstream_sdk.Stream(
        api_key=STREAM_API_KEY,
        api_secret=STREAM_API_SECRET,
    )
    token = client.create_token(user_id)

    # Launch agent in-process (no subprocess needed)
    task = asyncio.create_task(
        _run_agent_in_process(req.mode, call_id, req.topic)
    )
    _active_agents[call_id] = task

    return StartSessionResponse(
        api_key=STREAM_API_KEY,
        token=token,
        user_id=user_id,
        call_id=call_id,
    )


async def _run_agent_in_process(mode: str, call_id: str, topic: str = "") -> None:
    """Create and run the agent directly — no subprocess, no Windows issues."""
    try:
        agent = await create_agent(mode=mode, topic=topic)
        await join_call(agent, call_type="default", call_id=call_id)
    except Exception:
        logger.exception(f"Agent for {call_id} crashed")
    finally:
        _active_agents.pop(call_id, None)


@app.get("/health")
async def health():
    return {"status": "ok", "active_agents": len(_active_agents)}


@app.get("/session/live/{call_id}")
async def get_live_stats(call_id: str):
    """
    Return real-time metrics from the active session.
    FaceProcessor writes eye_contact_pct, energy_score, smile_count
    into session_store every frame. Frontend polls this every 2s.
    """
    from tools.session import session_store

    return {
        "eye_contact_pct": round(session_store.get("eye_contact_pct", 0), 1),
        "energy_score": round(session_store.get("energy_score", 0), 1),
        "smile_count": session_store.get("smile_count", 0),
        "aesthetic": session_store.get("aesthetic", ""),
        "takes": len(session_store.get("takes", [])),
    }


@app.post("/session/end/{call_id}")
async def end_session(call_id: str):
    """
    Signal session end — cancels the agent task to stop Gemini retry loops
    from blocking the asyncio event loop before the results page loads.
    """
    for task in list(_active_agents.values()):
        if not task.done():
            task.cancel()
    _active_agents.clear()
    # Yield to the event loop so cancellations can propagate
    await asyncio.sleep(0.3)
    return {"status": "ended"}


@app.get("/session/directors-cut/{call_id}")
async def get_directors_cut(call_id: str):
    """
    Return the Director's Cut comparative analysis for the Results screen.
    Compares all takes across metrics and provides actionable insights.
    """
    from tools.session import generate_directors_cut

    return await generate_directors_cut()


@app.get("/session/results/{call_id}")
async def get_results(call_id: str):
    """
    Return post-session data so the frontend can render TakeScorer and CaptionOutput.
    Reads from the shared session_store (works fine for single-session hackathon demos).
    """
    from tools.session import session_store
    import tools.caption_generator as caption_mod  # module ref so we always see the live value

    # Auto-generate caption if the LLM never called the tool (e.g. agent crashed)
    if not caption_mod._last_caption:
        aesthetic = session_store.get("aesthetic", "")
        topic = session_store.get("topic", "")
        await caption_mod.generate_caption(aesthetic or "general", topic or "my video")

    takes = list(session_store.get("takes", []))

    # If the LLM never called score_take_tool (Gemini crashed), synthesize a take
    # directly from the FaceProcessor sensor data that was written to session_store
    # every frame via OpenCV — no LLM needed for those metrics.
    if not takes:
        ec = float(session_store.get("eye_contact_pct", 0))
        en = float(session_store.get("energy_score", 0))
        sm = int(session_store.get("smile_count", 0))
        if ec > 0 or en > 0 or sm > 0:
            composite = (ec / 100) * 4.0 + (en / 10) * 3.5 + min(sm / 3, 1) * 2.5
            takes = [{
                "take_number": 1,
                "eye_contact_pct": round(ec, 1),
                "energy_score": round(en, 1),
                "smile_count": sm,
                "duration_seconds": 0,
                "composite_score": round(composite, 2),
            }]

    return {
        "call_id": call_id,
        "topic": session_store.get("topic", ""),
        "mode": session_store.get("mode", "director"),
        "takes": takes,
        "aesthetic": session_store.get("aesthetic", ""),
        "caption": caption_mod._last_caption,
    }
