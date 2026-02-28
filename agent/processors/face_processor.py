"""
FaceProcessor — eye contact, energy, and smile detection.

Uses OpenCV's built-in Haar cascades (no extra downloads) to detect faces,
eyes, and smiles. Fires text coaching triggers to Gemini when key thresholds
are crossed, enriching Gemini's coaching with specific visual observations.
"""

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import aiortc
import av
import cv2
import numpy as np
from vision_agents.core.processors.base_processor import VideoProcessorPublisher
from vision_agents.core.utils.video_forwarder import VideoForwarder
from vision_agents.core.utils.video_track import QueuedVideoTrack

from tools.session import session_store

logger = logging.getLogger(__name__)

# OpenCV bundled Haar cascades — no extra downloads needed
_CV2_DATA = cv2.data.haarcascades
_FACE_CASCADE = cv2.CascadeClassifier(_CV2_DATA + "haarcascade_frontalface_default.xml")
_EYE_CASCADE = cv2.CascadeClassifier(_CV2_DATA + "haarcascade_eye.xml")
_SMILE_CASCADE = cv2.CascadeClassifier(_CV2_DATA + "haarcascade_smile.xml")


class FaceProcessor(VideoProcessorPublisher):
    """
    Computes eye contact %, energy score, and smile count from the video stream.
    Draws a live HUD overlay so judges can see it working.
    Fires silent text triggers to Gemini when the creator loses eye contact
    or drops in energy, making coaching feel proactive and specific.
    """

    name = "face_processor"

    # Seconds between Gemini triggers (prevents spamming)
    TRIGGER_COOLDOWN = 8.0
    # Frames without eye contact before alerting Gemini
    EYE_CONTACT_LOST_THRESHOLD = 15
    # Consecutive low-motion frames before energy-drop trigger
    ENERGY_DROP_THRESHOLD = 10

    def __init__(self, fps: int = 5, llm=None):
        self.fps = fps
        self._llm = llm
        self._video_track = QueuedVideoTrack()
        self._video_forwarder: Optional[VideoForwarder] = None
        self._shutdown = False
        self.executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="face_proc")

        # Per-session metrics
        self._eye_contact_frames = 0
        self._total_frames = 0
        self._smile_count = 0
        self._prev_gray: Optional[np.ndarray] = None
        self._energy_samples: list[float] = []

        # Streak counters for threshold triggers
        self._eye_contact_lost_streak = 0
        self._low_energy_streak = 0

        # Trigger dedup flags
        self._last_trigger_time = 0.0
        self._eye_contact_notified = False
        self._energy_drop_notified = False

        logger.info("👁️  FaceProcessor initialised")

    # ──────────────────────────────────────────────
    # Computed properties (used by agent tools)
    # ──────────────────────────────────────────────

    @property
    def eye_contact_pct(self) -> float:
        if self._total_frames == 0:
            return 100.0
        return round(self._eye_contact_frames / self._total_frames * 100, 1)

    @property
    def energy_score(self) -> float:
        """0–10 energy score based on motion variance across recent frames."""
        if not self._energy_samples:
            return 5.0
        recent = self._energy_samples[-30:]
        avg = float(np.mean(recent))
        # Scale: ~0 motion = 0, ~20 motion = 10
        return min(round(avg / 2.0, 1), 10.0)

    # ──────────────────────────────────────────────
    # VideoProcessorPublisher interface
    # ──────────────────────────────────────────────

    async def process_video(
        self,
        incoming_track: aiortc.VideoStreamTrack,
        participant_id: Optional[str],
        shared_forwarder: Optional[VideoForwarder] = None,
    ) -> None:
        logger.info("👁️  FaceProcessor starting video processing")
        self._video_forwarder = shared_forwarder or VideoForwarder(
            incoming_track,
            max_buffer=self.fps,
            fps=self.fps,
            name="face_proc_forwarder",
        )
        self._video_forwarder.add_frame_handler(
            self._process_frame, fps=float(self.fps), name="face_processor"
        )

    async def _process_frame(self, frame: av.VideoFrame) -> None:
        if self._shutdown:
            return
        loop = asyncio.get_event_loop()
        out_frame = await loop.run_in_executor(self.executor, self._analyse_frame, frame)
        await self._video_track.add_frame(out_frame)

    def _analyse_frame(self, frame: av.VideoFrame) -> av.VideoFrame:
        try:
            arr = frame.to_ndarray(format="rgb24")
            arr = arr.copy()
            gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
            h_frame, w_frame = arr.shape[:2]

            self._total_frames += 1

            # ── Face + eye + smile detection ───────────────────────────────
            faces = _FACE_CASCADE.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
            )

            has_eye_contact = False

            for x, y, w, h in faces:
                # Draw face bounding box
                cv2.rectangle(arr, (x, y), (x + w, y + h), (0, 255, 100), 2)

                face_roi_gray = gray[y : y + h, x : x + w]
                face_roi_color = arr[y : y + h, x : x + w]

                # Eye detection inside face ROI
                eyes = _EYE_CASCADE.detectMultiScale(
                    face_roi_gray, scaleFactor=1.1, minNeighbors=5, minSize=(20, 20)
                )
                for ex, ey, ew, eh in eyes:
                    cv2.rectangle(
                        face_roi_color, (ex, ey), (ex + ew, ey + eh), (0, 200, 255), 1
                    )

                # Eye contact heuristic: both eyes visible + face roughly centred
                face_cx = x + w // 2
                off_centre = abs(face_cx - w_frame // 2) / w_frame
                if len(eyes) >= 2 and off_centre < 0.25:
                    has_eye_contact = True

                # Smile detection — lower half of face ROI only
                lower_roi = face_roi_gray[h // 2 :, :]
                smiles = _SMILE_CASCADE.detectMultiScale(
                    lower_roi, scaleFactor=1.7, minNeighbors=22, minSize=(25, 15)
                )
                if len(smiles) > 0:
                    self._smile_count += 1
                    cv2.putText(
                        arr,
                        "smile!",
                        (x + 4, y - 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.55,
                        (0, 255, 150),
                        2,
                    )

                break  # Only analyse first face

            # ── Eye contact tracking ────────────────────────────────────────
            if has_eye_contact:
                self._eye_contact_frames += 1
                self._eye_contact_lost_streak = 0
                if self._eye_contact_notified:
                    self._fire_trigger(
                        "The creator regained eye contact with the camera. "
                        "Acknowledge this positively and continue coaching."
                    )
                    self._eye_contact_notified = False
            else:
                self._eye_contact_lost_streak += 1
                if (
                    self._eye_contact_lost_streak >= self.EYE_CONTACT_LOST_THRESHOLD
                    and not self._eye_contact_notified
                ):
                    self._fire_trigger(
                        f"The creator has lost eye contact with the camera for "
                        f"{self._eye_contact_lost_streak} frames. "
                        f"Coach them to look directly at the lens, not the screen."
                    )
                    self._eye_contact_notified = True

            # ── Energy (frame-to-frame motion) tracking ─────────────────────
            if self._prev_gray is not None:
                diff = cv2.absdiff(gray, self._prev_gray)
                motion = float(np.mean(diff))
                self._energy_samples.append(motion)

                if motion < 1.5:
                    self._low_energy_streak += 1
                    if (
                        self._low_energy_streak >= self.ENERGY_DROP_THRESHOLD
                        and not self._energy_drop_notified
                    ):
                        self._fire_trigger(
                            "The creator's energy has dropped significantly — very little movement. "
                            "Encourage them to be more animated, expressive, and energetic."
                        )
                        self._energy_drop_notified = True
                else:
                    self._low_energy_streak = 0
                    self._energy_drop_notified = False

            self._prev_gray = gray.copy()

            # ── HUD overlay ──────────────────────────────────────────────────
            ec = self.eye_contact_pct
            en = self.energy_score

            overlay_x = w_frame - 230
            cv2.rectangle(arr, (overlay_x, 10), (w_frame - 8, 100), (0, 0, 0), -1)
            cv2.rectangle(arr, (overlay_x, 10), (w_frame - 8, 100), (80, 80, 80), 1)

            ec_col = (0, 220, 80) if ec >= 60 else (0, 120, 255)
            en_col = (0, 220, 80) if en >= 4 else (0, 165, 255)

            cv2.putText(
                arr,
                f"Eye: {ec:.0f}%",
                (overlay_x + 8, 36),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                ec_col,
                2,
            )
            cv2.putText(
                arr,
                f"Energy: {en:.1f}/10",
                (overlay_x + 8, 64),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                en_col,
                2,
            )
            cv2.putText(
                arr,
                f"Smiles: {self._smile_count}",
                (overlay_x + 8, 90),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (180, 180, 180),
                1,
            )

            # Sync live metrics into session_store for tool calls
            session_store["eye_contact_pct"] = ec
            session_store["energy_score"] = en
            session_store["smile_count"] = self._smile_count

            return av.VideoFrame.from_ndarray(arr, format="rgb24")

        except Exception:
            logger.exception("FaceProcessor._analyse_frame failed")
            return frame

    def _fire_trigger(self, text: str) -> None:
        """Send a silent observation to Gemini → triggers a coaching response."""
        if self._llm is None:
            return
        now = time.time()
        if now - self._last_trigger_time < self.TRIGGER_COOLDOWN:
            return
        self._last_trigger_time = now
        try:
            asyncio.create_task(self._llm.simple_response(text=text))
            logger.info(f"👁️  Face trigger: {text[:80]}")
        except Exception:
            logger.exception("FaceProcessor._fire_trigger failed")

    def publish_video_track(self) -> QueuedVideoTrack:
        return self._video_track

    async def stop_processing(self) -> None:
        if self._video_forwarder:
            await self._video_forwarder.remove_frame_handler(self._process_frame)
            self._video_forwarder = None

    async def close(self) -> None:
        self._shutdown = True
        await self.stop_processing()
        self.executor.shutdown(wait=False)
