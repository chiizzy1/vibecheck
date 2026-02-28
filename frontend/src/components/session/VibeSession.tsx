import { useState, useRef, useCallback, useEffect } from "react";
import { StreamVideo, StreamCall, ParticipantsAudio } from "@stream-io/video-react-sdk";
import { useCallStateHooks } from "@stream-io/video-react-sdk";
import { motion, AnimatePresence } from "framer-motion";
import { Clapperboard, X, Sparkles } from "lucide-react";

import { useStreamCall } from "../../hooks/useStreamCall";
import { useRecording } from "../../hooks/useRecording";
import { useLiveStats } from "../../hooks/useLiveStats";
import { formatTime } from "../../lib/utils";

import { VideoFeed } from "./VideoFeed";
import { SessionControls } from "./SessionControls";
import { DirectorSidebar } from "./DirectorSidebar";

import type { Mode } from "../../App";
import type { TakeBlob } from "../../types/session";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Props {
  mode: Mode;
  topic: string;
  onReset: () => void;
  onSessionEnd: (callId: string, blobs: TakeBlob[]) => void;
}

const MODE_CONFIG: Record<Mode, { label: string; color: string; bg: string }> = {
  director: { label: "Director Mode", color: "text-primary", bg: "bg-primary" },
  bestie: { label: "Bestie Mode", color: "text-accent", bg: "bg-accent" },
  roast: { label: "Roast Mode", color: "text-orange-500", bg: "bg-orange-500" },
};

const LOADING_STAGES = [
  { message: "Waking up the AI Director…", icon: "🎬" },
  { message: "Calibrating camera feed…", icon: "📷" },
  { message: "Loading vision models…", icon: "🧠" },
  { message: "Setting the vibe…", icon: "✨" },
];

function LoadingSequence({ mode }: { mode: Mode }) {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const conf = MODE_CONFIG[mode];

  useEffect(() => {
    const stageTimer = setInterval(() => {
      setStageIndex((prev) => (prev < LOADING_STAGES.length - 1 ? prev + 1 : prev));
    }, 2500);
    return () => clearInterval(stageTimer);
  }, []);

  useEffect(() => {
    const progressTimer = setInterval(() => {
      setProgress((prev) => Math.min(prev + 1, 100));
    }, 100);
    return () => clearInterval(progressTimer);
  }, []);

  const stage = LOADING_STAGES[stageIndex];

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-background-dark text-white space-y-8">
      <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 ${conf.color}`}>
        <span className={`size-2 rounded-full ${conf.bg} shadow-[0_0_8px_currentColor]`}></span>
        <span className="text-xs font-bold uppercase tracking-widest">{conf.label}</span>
      </div>
      <motion.div
        key={stageIndex}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="text-5xl"
      >
        {stage.icon}
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.p
          key={stageIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="text-xl font-medium tracking-wide text-slate-200"
        >
          {stage.message}
        </motion.p>
      </AnimatePresence>
      <div className="w-64 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full iridescent-gradient rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>
      <p className="text-xs text-slate-500 font-mono tracking-wide">{progress < 100 ? `${progress}%` : "Almost there…"}</p>
    </div>
  );
}

// Ensure the sub-component gets access to the stream state
function StreamSessionOrchestrator({ mode, callId, onSessionEnd }: Omit<Props, "topic" | "onReset"> & { callId: string }) {
  const { useLocalParticipant, useRemoteParticipants } = useCallStateHooks();
  const localParticipant = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();

  const videoRef = useRef<HTMLVideoElement>(null);
  const rawAudioRef = useRef<MediaStream | null>(null);

  const [log, setLog] = useState<{ id: string; text: string; time: number }[]>([]);
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev.slice(-49), { id: Math.random().toString(36), text: msg, time: Date.now() }]);
  }, []);

  // Isolate Audio for MediaRecorder (bypass Stream audio mutations)
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: false, audio: true })
      .then((stream) => {
        if (!cancelled) rawAudioRef.current = stream;
      })
      .catch((err) => console.warn("Could not get audio stream for recording:", err));

    return () => {
      cancelled = true;
      if (rawAudioRef.current) {
        rawAudioRef.current.getTracks().forEach((t) => t.stop());
        rawAudioRef.current = null;
      }
    };
  }, []);

  const { liveStats } = useLiveStats(callId);

  const { takeCount, isRecording, recordingTime, blobs, startTake, cutTake, mediaRecorderRef, pendingBlobRef } = useRecording({
    videoRef,
    rawAudioRef,
    onLog: addLog,
  });

  const handleEndSession = async () => {
    // 1. Tell Python backend we are done to stop standard loop
    fetch(`${API_URL}/session/end/${callId}`, { method: "POST" }).catch(() => {});

    // 2. Stop recorder if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      let resolve!: () => void;
      pendingBlobRef.current = new Promise<void>((res) => {
        resolve = res;
      });
      (mediaRecorderRef.current as MediaRecorder & { _resolveBlob?: () => void })._resolveBlob = resolve;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // 3. Wait for all blobs to be processed (WebM duration fix)
    await Promise.race([pendingBlobRef.current, new Promise<void>((r) => setTimeout(r, 10000))]);
    onSessionEnd(callId, [...blobs]);
  };

  const conf = MODE_CONFIG[mode];

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background-dark font-display text-slate-100 relative overflow-hidden">
      <header className="flex items-center justify-between p-4 md:p-6 border-b border-glass-border shrink-0 z-10 bg-background-dark/80 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-primary">
            <Clapperboard className="w-8 h-8" />
            <h2 className="text-xl font-bold tracking-tighter uppercase italic">VibeCheck</h2>
          </div>
          <div className="h-6 w-px bg-glass-border"></div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 ${conf.color}`}>
            <span className={`size-2 rounded-full ${conf.bg} shadow-[0_0_8px_currentColor]`}></span>
            <span className="text-xs font-bold uppercase tracking-widest">{conf.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button
            onClick={handleEndSession}
            className="flex items-center justify-center gap-2 px-6 py-2 rounded-full glassmorphism border border-white/10 hover:bg-white/10 transition-all text-sm font-bold cursor-pointer"
          >
            <X className="w-4 h-4" />
            End Session
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6 p-4 md:p-6 min-h-0 relative">
        <section className="flex-1 flex flex-col min-w-0 relative">
          <button
            onClick={() => setIsNotesOpen(true)}
            className="lg:hidden absolute top-4 right-4 z-40 bg-black/60 backdrop-blur-xl rounded-full px-4 py-2 border border-white/20 flex items-center gap-2 shadow-2xl transition-transform active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold tracking-widest uppercase">Director</span>
          </button>

          <VideoFeed
            videoRef={videoRef}
            takeCount={takeCount}
            isRecording={isRecording}
            recordingTime={recordingTime}
            formatTime={formatTime}
          />
          <SessionControls isRecording={isRecording} startTake={startTake} cutTake={cutTake} onEndSession={handleEndSession} />
        </section>

        <DirectorSidebar
          isNotesOpen={isNotesOpen}
          setIsNotesOpen={setIsNotesOpen}
          liveStats={liveStats}
          takeCount={takeCount}
          log={log}
        />
      </main>

      <ParticipantsAudio participants={localParticipant ? [localParticipant, ...remoteParticipants] : remoteParticipants} />
    </div>
  );
}

export function VibeSession({ mode, topic, onReset, onSessionEnd }: Props) {
  // We use the useSWR concept below but wait, for stream call creation SWR is not appropriate
  // because it's a mutation/setup phase, so useStreamCall handles it imperatively as before.
  const { client, call, callId, status } = useStreamCall({
    mode,
    topic,
  });

  if (status === "connecting") {
    return <LoadingSequence mode={mode} />;
  }

  if (status === "error" || !client || !call) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-background-dark text-white space-y-6">
        <p className="text-xl font-medium text-red-500">Could not start session. Is the backend running?</p>
        <button onClick={onReset} className="px-6 py-2 glassmorphism rounded-full hover:bg-white/10 transition cursor-pointer">
          ← Back
        </button>
      </div>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <StreamSessionOrchestrator mode={mode} callId={callId} onSessionEnd={onSessionEnd} />
      </StreamCall>
    </StreamVideo>
  );
}
