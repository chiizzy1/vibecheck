"""
VibeCheck Agent — real-time content creation coach for Gen Z creators.

Modes:
  director  — precise, professional director feedback
  bestie    — warm, hype-but-honest best friend energy
  roast     — unhinged Gen Z chaos roast (still useful feedback underneath)

Usage:
  python agent.py --mode director
  python agent.py --mode bestie
  python agent.py --mode roast
"""

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
from vision_agents.core import Agent, Runner, User
from vision_agents.core.agents import AgentLauncher
from vision_agents.plugins import deepgram, gemini, getstream, moondream, ultralytics

from processors import TakeTrackerProcessor, FaceProcessor, VibeProcessor
from tools.caption_generator import generate_caption
from tools.session import get_session_summary, score_take, session_store

logger = logging.getLogger(__name__)
load_dotenv()

# ──────────────────────────────────────────────────────────────
# Mode → prompt file mapping
# ──────────────────────────────────────────────────────────────
PROMPTS_DIR = Path(__file__).parent / "prompts"
MODE_PROMPTS = {
    "director": PROMPTS_DIR / "director_mode.md",
    "bestie":   PROMPTS_DIR / "bestie_mode.md",
    "roast":    PROMPTS_DIR / "roast_mode.md",
}


def parse_mode() -> str:
    parser = argparse.ArgumentParser(description="VibeCheck Agent")
    parser.add_argument(
        "--mode",
        choices=["director", "bestie", "roast"],
        default="director",
        help="Coaching personality mode",
    )
    # Runner.cli() adds its own args so we only parse --mode here
    args, _ = parser.parse_known_args()
    return args.mode


# ──────────────────────────────────────────────────────────────
# Agent factory
# ──────────────────────────────────────────────────────────────
async def create_agent(mode: str = "director", topic: str = "", **kwargs) -> Agent:
    prompt_file = MODE_PROMPTS.get(mode, MODE_PROMPTS["director"])
    session_store["mode"] = mode
    session_store["topic"] = topic
    session_store["takes"] = []  # reset takes for new session

    # Read prompt text — Gemini can't access local files
    instructions = prompt_file.read_text(encoding="utf-8")
    if topic:
        instructions += f"\n\n## Today's video topic\n{topic}\nUse this context to give specific, relevant coaching throughout the session."

    llm = gemini.Realtime(fps=3)
    take_tracker = TakeTrackerProcessor(fps=5, llm=llm)
    face_proc = FaceProcessor(fps=5, llm=llm)
    vibe_proc = VibeProcessor(fps=2, llm=llm)

    stt = deepgram.STT(
        model="nova-2",
        eager_turn_detection=True,
    )

    moondream_face = moondream.CloudDetectionProcessor(
        detect_objects=["face", "person"],
        conf_threshold=0.3,
        fps=2,
    )

    agent = Agent(
        edge=getstream.Edge(),
        agent_user=User(name="VibeCheck", id="vibecheck-agent"),
        instructions=instructions,
        llm=llm,
        stt=stt,
        processors=[
            ultralytics.YOLOPoseProcessor(
                model_path="yolo11n-pose.pt",
                device="cpu",
                fps=5,
                enable_hand_tracking=False,
            ),
            moondream_face,
            take_tracker,
            face_proc,
            vibe_proc,
        ],
    )

    # ── Tool: score a take ─────────────────────────────────────
    @agent.llm.register_function(
        description=(
            "Score and store a completed take. Call this after the creator finishes "
            "a take. Estimate eye_contact_pct (0-100), energy_score (0-10), and "
            "smile_count from what you observed. Real-time sensor data from the "
            "FaceProcessor is also available in session context."
        )
    )
    async def score_take_tool(
        take_number: int,
        eye_contact_pct: float,
        energy_score: float,
        smile_count: int,
        duration_seconds: float,
    ) -> Dict[str, Any]:
        # Blend Gemini's estimate with real sensor data when available
        sensor_ec = session_store.get("eye_contact_pct")
        sensor_en = session_store.get("energy_score")
        sensor_sm = session_store.get("smile_count")

        final_ec = (eye_contact_pct + sensor_ec) / 2 if sensor_ec is not None else eye_contact_pct
        final_en = (energy_score + sensor_en) / 2 if sensor_en is not None else energy_score
        final_sm = sensor_sm if sensor_sm is not None else smile_count

        return await score_take(
            take_number, final_ec, final_en, final_sm, duration_seconds
        )

    # ── Tool: session summary ──────────────────────────────────
    @agent.llm.register_function(
        description=(
            "Return a comparison of all takes and identify the best one. "
            "Call this when the creator says 'show me results', 'session done', "
            "or asks which take was best."
        )
    )
    async def session_summary_tool() -> Dict[str, Any]:
        return await get_session_summary()

    # ── Tool: generate caption ─────────────────────────────────
    @agent.llm.register_function(
        description=(
            "Generate a TikTok caption and hashtags based on the creator's vibe "
            "and video topic. Call this when the creator asks for a caption or "
            "at the end of a successful session."
        )
    )
    async def generate_caption_tool(
        vibe_description: str, video_topic: str
    ) -> Dict[str, str]:
        return await generate_caption(vibe_description, video_topic)

    # Expose processors for tool functions and join_call
    agent._take_tracker = take_tracker  # type: ignore[attr-defined]
    agent._face_proc = face_proc        # type: ignore[attr-defined]
    return agent


# ──────────────────────────────────────────────────────────────
# Call handler
# ──────────────────────────────────────────────────────────────
async def join_call(agent: Agent, call_type: str, call_id: str, **kwargs) -> None:
    mode = session_store.get("mode", "director")
    
    await agent.create_user()
    
    call = await agent.create_call(call_type, call_id)

    async with agent.join(call):
        # Opening line varies by mode
        openers = {
            "director": (
                "Introduce yourself as VibeCheck, the creator's real-time AI director. "
                "Ask them what kind of video they're filming today and what vibe they're going for."
            ),
            "bestie": (
                "Introduce yourself as VibeCheck, their hype bestie who keeps it real. "
                "Ask what they're filming and get excited about it."
            ),
            "roast": (
                "Introduce yourself as VibeCheck in full roast mode. "
                "Tell them you're watching, you're judging, and they should impress you. "
                "Ask what they're filming."
            ),
        }
        await agent.llm.simple_response(text=openers.get(mode, openers["director"]))
        await agent.finish()


# ──────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    mode = parse_mode()
    logger.info(f"🎬 Starting VibeCheck in {mode.upper()} mode")

    Runner(
        AgentLauncher(
            create_agent=lambda **kw: create_agent(mode=mode, **kw),
            join_call=join_call,
        )
    ).cli()
