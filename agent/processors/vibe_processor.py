"""
VibeProcessor — aesthetic scene analysis via Moondream VLM.

Runs every ANALYSIS_INTERVAL seconds. Grabs the latest video frame,
sends it to Moondream Cloud, and gets back a 2-sentence description
of the creator's outfit, background, and TikTok aesthetic.

The result is:
  1. Stored in session_store["aesthetic"] for tool calls
  2. Injected into Gemini's context via a silent text trigger
     so coaching can reference the visual style directly
"""

import asyncio
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import aiortc
import av
from vision_agents.core.processors.base_processor import VideoProcessorPublisher
from vision_agents.core.utils.video_forwarder import VideoForwarder
from vision_agents.core.utils.video_track import QueuedVideoTrack

from tools.session import session_store

logger = logging.getLogger(__name__)

AESTHETIC_PROMPT = (
    "Describe this person's outfit, background, and overall vibe in 2 concise sentences. "
    "What TikTok aesthetic are they giving? Be specific (e.g. 'clean girl', 'dark academia', "
    "'cottagecore', 'Y2K', 'street style', 'minimal', 'coquette', 'soft life'). "
    "Keep your answer under 40 words."
)

ANALYSIS_INTERVAL = 5.0  # seconds between Moondream calls
TRIGGER_COOLDOWN = 12.0   # seconds between Gemini aesthetic triggers


class VibeProcessor(VideoProcessorPublisher):
    """
    Samples a video frame every ANALYSIS_INTERVAL seconds and queries
    Moondream Cloud for aesthetic analysis. Stores the result and
    fires a context injection trigger to Gemini so coaching stays
    visually grounded.
    """

    name = "vibe_processor"

    def __init__(self, fps: int = 2, llm=None):
        self.fps = fps
        self._llm = llm
        self._video_track = QueuedVideoTrack()
        self._video_forwarder: Optional[VideoForwarder] = None
        self._shutdown = False
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="vibe_proc")

        self._last_analysis_time = 0.0
        self._last_trigger_time = 0.0
        self._latest_frame: Optional[av.VideoFrame] = None
        self._analysis_task: Optional[asyncio.Task] = None

        # Lazy-loaded Moondream model
        self._model = None
        self._api_key = os.getenv("MOONDREAM_API_KEY")

        if not self._api_key:
            logger.warning(
                "⚠️  MOONDREAM_API_KEY not set — VibeProcessor will be a no-op. "
                "Get a free key at https://moondream.ai"
            )

        logger.info("🎨 VibeProcessor initialised")

    def _get_model(self):
        """Lazy-load the Moondream SDK model on first use."""
        if self._model is not None:
            return self._model
        if not self._api_key:
            return None
        try:
            import moondream as md
            self._model = md.vl(api_key=self._api_key)
            logger.info("✅ Moondream Cloud model ready in VibeProcessor")
        except Exception:
            logger.exception("❌ Failed to load Moondream model")
        return self._model

    # ──────────────────────────────────────────────
    # VideoProcessorPublisher interface
    # ──────────────────────────────────────────────

    async def process_video(
        self,
        incoming_track: aiortc.VideoStreamTrack,
        participant_id: Optional[str],
        shared_forwarder: Optional[VideoForwarder] = None,
    ) -> None:
        logger.info("🎨 VibeProcessor starting video processing")
        self._video_forwarder = shared_forwarder or VideoForwarder(
            incoming_track,
            max_buffer=self.fps,
            fps=self.fps,
            name="vibe_proc_forwarder",
        )
        self._video_forwarder.add_frame_handler(
            self._on_frame, fps=float(self.fps), name="vibe_processor"
        )

    async def _on_frame(self, frame: av.VideoFrame) -> None:
        if self._shutdown:
            return

        # Pass frame through unchanged (no overlay needed for this processor)
        self._latest_frame = frame
        await self._video_track.add_frame(frame)

        # Schedule Moondream analysis every ANALYSIS_INTERVAL seconds
        now = time.time()
        if now - self._last_analysis_time >= ANALYSIS_INTERVAL:
            self._last_analysis_time = now
            if self._analysis_task is None or self._analysis_task.done():
                self._analysis_task = asyncio.create_task(
                    self._analyse_vibe(frame)
                )

    async def _analyse_vibe(self, frame: av.VideoFrame) -> None:
        """Query Moondream VLM with the current frame."""
        model = self._get_model()
        if model is None:
            return

        try:
            loop = asyncio.get_event_loop()
            aesthetic = await loop.run_in_executor(
                self.executor, self._run_moondream, model, frame
            )
            if not aesthetic:
                return

            session_store["aesthetic"] = aesthetic
            logger.info(f"🎨 Aesthetic: {aesthetic}")

            # Fire Gemini trigger (respecting cooldown)
            now = time.time()
            if self._llm is not None and now - self._last_trigger_time >= TRIGGER_COOLDOWN:
                self._last_trigger_time = now
                trigger = (
                    f"[Visual context] {aesthetic} "
                    f"Use this to personalise coaching — mention the aesthetic, "
                    f"background, or lighting if relevant to their content."
                )
                asyncio.create_task(self._llm.simple_response(text=trigger))

        except Exception:
            logger.exception("VibeProcessor._analyse_vibe failed")

    def _run_moondream(self, model, frame: av.VideoFrame) -> str:
        """Synchronous Moondream VQA call (runs in thread executor)."""
        try:
            from PIL import Image
            arr = frame.to_ndarray(format="rgb24")
            image = Image.fromarray(arr)
            result = model.query(image, AESTHETIC_PROMPT, stream=True)
            chunks = [
                chunk for chunk in result["answer"] if isinstance(chunk, str)
            ]
            return "".join(chunks).strip()
        except Exception:
            logger.exception("Moondream VQA call failed")
            return ""

    def publish_video_track(self) -> QueuedVideoTrack:
        return self._video_track

    async def stop_processing(self) -> None:
        if self._video_forwarder:
            await self._video_forwarder.remove_frame_handler(self._on_frame)
            self._video_forwarder = None

    async def close(self) -> None:
        self._shutdown = True
        if self._analysis_task and not self._analysis_task.done():
            self._analysis_task.cancel()
        await self.stop_processing()
        self.executor.shutdown(wait=False)
