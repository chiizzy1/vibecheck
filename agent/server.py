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


@app.get("/session/results/{call_id}")
async def get_results(call_id: str):
    """
    Return post-session data so the frontend can render TakeScorer and CaptionOutput.
    Reads from the shared session_store (works fine for single-session hackathon demos).
    """
    from tools.session import session_store
    from tools.caption_generator import _last_caption  # type: ignore[attr-defined]

    return {
        "call_id": call_id,
        "topic": session_store.get("topic", ""),
        "mode": session_store.get("mode", "director"),
        "takes": session_store.get("takes", []),
        "aesthetic": session_store.get("aesthetic", ""),
        "caption": _last_caption,
    }
