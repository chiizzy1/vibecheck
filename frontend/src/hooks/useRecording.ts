import { useState, useRef, useEffect, useCallback } from "react";
import fixWebmDuration from "fix-webm-duration";
import type { TakeBlob } from "../types/session";

interface UseRecordingProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  rawAudioRef: React.RefObject<MediaStream | null>;
  onLog: (msg: string) => void;
}

export function useRecording({ videoRef, rawAudioRef, onLog }: UseRecordingProps) {
  const [takeCount, setTakeCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [blobs, setBlobs] = useState<TakeBlob[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const takeStartRef = useRef<number>(0);
  const pendingBlobRef = useRef<Promise<void>>(Promise.resolve());

  // Timer effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(Date.now() - takeStartRef.current);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startTake = useCallback(() => {
    if (!videoRef.current) {
      onLog("⚠ No video feed yet — wait a moment");
      return;
    }

    const mimeType =
      ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ??
      "";

    if (!mimeType) {
      onLog("⚠ Recording not supported in this browser");
      return;
    }

    const newTake = takeCount + 1;
    setTakeCount(newTake);
    onLog(`🎬 Take ${newTake} action`);

    const startTime = Date.now();
    takeStartRef.current = startTime;
    setRecordingTime(0);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    const videoTracks = (videoRef.current.srcObject as MediaStream | null)?.getVideoTracks() ?? [];
    const audioTracks = rawAudioRef.current?.getAudioTracks() ?? [];

    if (videoTracks.length === 0) {
      onLog("⚠ No video track available — ensure camera is enabled");
      return;
    }

    const combinedStream = new MediaStream([...videoTracks, ...audioTracks]);
    const takeChunks: Blob[] = [];
    const mr = new MediaRecorder(combinedStream, { mimeType });

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) takeChunks.push(e.data);
    };

    mr.onstop = async () => {
      const durationMs = Date.now() - startTime;
      const rawBlob = new Blob(takeChunks, { type: mimeType });
      // Fix WebM infinite duration issue
      const blob = mimeType.includes("webm") ? await fixWebmDuration(rawBlob, durationMs) : rawBlob;
      const duration = durationMs / 1000;

      setBlobs((prev) => [...prev.filter((b) => b.takeNumber !== newTake), { takeNumber: newTake, blob, duration }]);
      onLog(`✓ Take ${newTake} saved (${duration.toFixed(0)}s)`);

      const resolveBlob = (mr as MediaRecorder & { _resolveBlob?: () => void })._resolveBlob;
      if (resolveBlob) resolveBlob();
    };

    mr.start(100);
    mediaRecorderRef.current = mr;
    setIsRecording(true);
  }, [takeCount, videoRef, rawAudioRef, onLog]);

  const cutTake = useCallback(() => {
    if (!isRecording || !mediaRecorderRef.current) return;

    let resolve!: () => void;
    pendingBlobRef.current = new Promise<void>((res) => {
      resolve = res;
    });

    (mediaRecorderRef.current as MediaRecorder & { _resolveBlob?: () => void })._resolveBlob = resolve;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    onLog(`✂ Take ${takeCount} cut`);
  }, [isRecording, takeCount, onLog]);

  return {
    takeCount,
    isRecording,
    recordingTime,
    blobs,
    startTake,
    cutTake,
    mediaRecorderRef,
    pendingBlobRef,
  };
}
