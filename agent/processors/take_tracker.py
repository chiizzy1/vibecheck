"""
TakeTrackerProcessor — stateful cross-take performance tracker.

Sits in the processor pipeline alongside YOLOPoseProcessor.
On each video frame it reads pose/face keypoints already drawn by YOLO and
computes lightweight metrics (head-tilt proxy, presence confidence).
State is exposed to the agent via the shared session_store so tool calls
can read it without needing direct processor access.
"""

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import aiortc
import av
import cv2
import numpy as np
from vision_agents.core.processors.base_processor import VideoProcessorPublisher
from vision_agents.core.utils.video_forwarder import VideoForwarder
from vision_agents.core.utils.video_track import QueuedVideoTrack

logger = logging.getLogger(__name__)

# YOLO keypoint indices (COCO 17-point model)
NOSE = 0
LEFT_EYE = 1
RIGHT_EYE = 2
LEFT_EAR = 3
RIGHT_EAR = 4
LEFT_SHOULDER = 5
RIGHT_SHOULDER = 6


@dataclass
class TakeMetrics:
    take_number: int
    start_time: float = field(default_factory=time.time)
    end_time: Optional[float] = None
    frame_count: int = 0
    # Presence: how many frames had a detected person (0.0–1.0)
    presence_ratio: float = 0.0
    # Head-level proxy: nose keypoint y-position variance (higher = more movement/energy)
    head_movement_score: float = 0.0
    # Shoulder alignment: difference in shoulder heights (lower = more stable/confident)
    shoulder_stability: float = 0.0

    _nose_y_samples: List[float] = field(default_factory=list, repr=False)
    _shoulder_diff_samples: List[float] = field(default_factory=list, repr=False)
    _presence_frames: int = 0

    def record_frame(self, keypoints: Optional[np.ndarray]) -> None:
        self.frame_count += 1
        if keypoints is None or len(keypoints) == 0:
            return

        self._presence_frames += 1

        # Nose y-position (normalised 0-1 by frame height)
        if keypoints[NOSE][2] > 0.3:  # confidence threshold
            self._nose_y_samples.append(float(keypoints[NOSE][1]))

        # Shoulder height difference
        ls_conf = keypoints[LEFT_SHOULDER][2] if len(keypoints) > LEFT_SHOULDER else 0
        rs_conf = keypoints[RIGHT_SHOULDER][2] if len(keypoints) > RIGHT_SHOULDER else 0
        if ls_conf > 0.3 and rs_conf > 0.3:
            diff = abs(float(keypoints[LEFT_SHOULDER][1]) - float(keypoints[RIGHT_SHOULDER][1]))
            self._shoulder_diff_samples.append(diff)

    def finalise(self) -> None:
        self.end_time = time.time()
        if self.frame_count > 0:
            self.presence_ratio = self._presence_frames / self.frame_count
        if self._nose_y_samples:
            self.head_movement_score = float(np.std(self._nose_y_samples))
        if self._shoulder_diff_samples:
            self.shoulder_stability = float(np.mean(self._shoulder_diff_samples))

    @property
    def duration_seconds(self) -> float:
        end = self.end_time or time.time()
        return end - self.start_time

    def to_dict(self) -> Dict[str, Any]:
        return {
            "take_number": self.take_number,
            "duration_seconds": round(self.duration_seconds, 1),
            "presence_ratio": round(self.presence_ratio, 2),
            "head_movement_score": round(self.head_movement_score, 2),
            "shoulder_stability": round(self.shoulder_stability, 2),
            "frame_count": self.frame_count,
        }


class TakeTrackerProcessor(VideoProcessorPublisher):
    """
    Lightweight processor that overlays take-number HUD on the video and
    tracks per-take metrics from YOLO keypoints already present in frames.

    Fires text triggers to Gemini when it observes something noteworthy
    (e.g., creator leaves frame, take starts/ends). This is the mechanism
    that makes coaching proactive rather than purely reactive to voice.
    """

    name = "take_tracker"

    # Minimum seconds between coaching triggers to prevent spam
    TRIGGER_COOLDOWN = 10.0
    # Frames with no presence before we alert Gemini
    PRESENCE_LOST_THRESHOLD = 15

    def __init__(self, fps: int = 5, llm=None):
        self.fps = fps
        self._llm = llm
        self._current_take: Optional[TakeMetrics] = None
        self._takes: List[TakeMetrics] = []
        self._take_counter: int = 0
        self._video_forwarder: Optional[VideoForwarder] = None
        self._video_track = QueuedVideoTrack()
        self._shutdown = False
        self.executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="take_tracker")

        # Coaching trigger state
        self._last_trigger_time: float = 0.0
        self._consecutive_no_presence: int = 0
        self._presence_lost_notified: bool = False

        logger.info("📹 TakeTrackerProcessor initialised")

    # ──────────────────────────────────────────────
    # Public API (called by agent tool functions)
    # ──────────────────────────────────────────────

    def start_take(self) -> int:
        """Begin recording a new take. Returns the take number."""
        if self._current_take is not None:
            self._current_take.finalise()
            self._takes.append(self._current_take)
        self._take_counter += 1
        self._current_take = TakeMetrics(take_number=self._take_counter)
        logger.info(f"▶️  Take {self._take_counter} started")

        self._fire_trigger(
            f"Take {self._take_counter} has started. Watch the creator closely "
            f"and give real-time coaching on their eye contact, energy, and posture."
        )
        return self._take_counter

    def end_take(self) -> Optional[Dict[str, Any]]:
        """Stop recording the current take and return its metrics."""
        if self._current_take is None:
            return None
        self._current_take.finalise()
        self._takes.append(self._current_take)
        metrics = self._current_take.to_dict()
        self._current_take = None
        logger.info(f"⏹️  Take {metrics['take_number']} ended: {metrics}")

        self._fire_trigger(
            f"Take {metrics['take_number']} just ended. Duration: {metrics['duration_seconds']}s, "
            f"presence ratio: {metrics['presence_ratio']}, head movement: {metrics['head_movement_score']}. "
            f"Score this take and give the creator specific feedback."
        )
        return metrics

    def get_all_takes(self) -> List[Dict[str, Any]]:
        return [t.to_dict() for t in self._takes]

    def get_best_take(self) -> Optional[Dict[str, Any]]:
        if not self._takes:
            return None
        # Simple scoring: presence (must be >0.5) + head movement (energy) - shoulder instability
        def score(t: TakeMetrics) -> float:
            if t.presence_ratio < 0.4:
                return 0.0
            return t.presence_ratio * 5 + min(t.head_movement_score / 10, 3) - min(t.shoulder_stability / 20, 1)

        best = max(self._takes, key=score)
        return best.to_dict()

    # ──────────────────────────────────────────────
    # VideoProcessorPublisher interface
    # ──────────────────────────────────────────────

    async def process_video(
        self,
        incoming_track: aiortc.VideoStreamTrack,
        participant_id: Optional[str],
        shared_forwarder: Optional[VideoForwarder] = None,
    ) -> None:
        logger.info("📹 TakeTracker starting video processing")
        self._video_forwarder = shared_forwarder or VideoForwarder(
            incoming_track,
            max_buffer=self.fps,
            fps=self.fps,
            name="take_tracker_forwarder",
        )
        self._video_forwarder.add_frame_handler(
            self._process_frame, fps=float(self.fps), name="take_tracker"
        )

    async def _process_frame(self, frame: av.VideoFrame) -> None:
        if self._shutdown:
            return
        loop = asyncio.get_event_loop()
        out_frame = await loop.run_in_executor(self.executor, self._annotate_frame, frame)
        await self._video_track.add_frame(out_frame)

    def _annotate_frame(self, frame: av.VideoFrame) -> av.VideoFrame:
        """Draw take-number HUD overlay and check coaching triggers."""
        try:
            arr = frame.to_ndarray(format="rgb24")
            arr = arr.copy()

            take_label = (
                f"TAKE {self._current_take.take_number}"
                if self._current_take
                else "STANDBY"
            )
            color = (0, 220, 80) if self._current_take else (180, 180, 180)

            h, w = arr.shape[:2]
            cv2.rectangle(arr, (10, 10), (200, 50), (0, 0, 0), -1)
            cv2.rectangle(arr, (10, 10), (200, 50), color, 2)
            cv2.putText(arr, take_label, (18, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

            if self._current_take:
                dur = f"{self._current_take.duration_seconds:.1f}s"
                cv2.putText(arr, dur, (210, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)

                # --- Proactive coaching triggers ---
                if self._current_take.frame_count > 0:
                    presence = self._current_take._presence_frames / self._current_take.frame_count
                    if presence < 0.3:
                        self._consecutive_no_presence += 1
                    else:
                        if self._presence_lost_notified:
                            self._fire_trigger(
                                "The creator is back in frame. Welcome them back and continue coaching."
                            )
                            self._presence_lost_notified = False
                        self._consecutive_no_presence = 0

                    if (
                        self._consecutive_no_presence >= self.PRESENCE_LOST_THRESHOLD
                        and not self._presence_lost_notified
                    ):
                        self._fire_trigger(
                            "The creator has stepped out of frame. Let them know you noticed "
                            "and you're ready when they come back."
                        )
                        self._presence_lost_notified = True

            return av.VideoFrame.from_ndarray(arr, format="rgb24")
        except Exception:
            logger.exception("TakeTracker annotate_frame failed")
            return frame

    def _fire_trigger(self, text: str) -> None:
        """Send a text observation to Gemini to trigger proactive coaching."""
        if self._llm is None:
            return
        now = time.time()
        if now - self._last_trigger_time < self.TRIGGER_COOLDOWN:
            return
        self._last_trigger_time = now
        try:
            asyncio.create_task(self._llm.simple_response(text=text))
            logger.info(f"🎯 Coaching trigger fired: {text[:80]}")
        except Exception:
            logger.exception("Failed to fire coaching trigger")

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
