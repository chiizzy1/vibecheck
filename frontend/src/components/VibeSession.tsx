import { useEffect, useRef, useState } from "react";
import fixWebmDuration from "fix-webm-duration";
import { motion } from "framer-motion";
import { Video, Scissors, Eye, CheckCircle2, Clapperboard, Sparkles, X, ChevronDown } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  useCallStateHooks,
  ParticipantsAudio,
  type Call,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";
import type { Mode } from "../App";
import type { TakeBlob } from "./ResultsScreen";

// Delete VibeSession.css import

interface Props {
  mode: Mode;
  topic: string;
  onReset: () => void;
  onSessionEnd: (callId: string, blobs: TakeBlob[]) => void;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
      {/* Mode Badge */}
      <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 ${conf.color}`}>
        <span className={`size-2 rounded-full ${conf.bg} shadow-[0_0_8px_currentColor]`}></span>
        <span className="text-xs font-bold uppercase tracking-widest">{conf.label}</span>
      </div>

      {/* Pulsing icon */}
      <motion.div
        key={stageIndex}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="text-5xl"
      >
        {stage.icon}
      </motion.div>

      {/* Stage message */}
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

      {/* Progress bar */}
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

export function VibeSession({ mode, topic, onReset, onSessionEnd }: Readonly<Props>) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [callId, setCallId] = useState<string>("");
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [log, setLog] = useState<{ id: string; text: string; time: number }[]>([]);

  const blobsRef = useRef<TakeBlob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // Tracks a promise that resolves when the current take's blob is fully saved.
  // Set on EVERY mr.stop() call (cut OR session end) so handleEndSession
  // always waits for fixWebmDuration before transitioning to results.
  const pendingBlobRef = useRef<Promise<void>>(Promise.resolve());

  const addLog = (msg: string) => {
    setLog((prev) => [...prev.slice(-49), { id: Math.random().toString(36), text: msg, time: Date.now() }]);
  };

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const res = await fetch(`${API_URL}/session/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, topic }),
        });
        if (!res.ok) throw new Error(`Backend error: ${res.status}`);
        const { api_key, token, user_id, call_id } = await res.json();

        if (!mounted) return;

        const streamClient = new StreamVideoClient({
          apiKey: api_key,
          user: { id: user_id, name: "Creator" },
          token,
        });

        const streamCall = streamClient.call("default", call_id);
        // Join first, then enable devices — enabling before join can cause the
        // WebRTC negotiation to hang waiting for a connection that isn't established yet.
        await Promise.race([
          streamCall.join({ create: true }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Stream SDK join timed out after 20s")), 20000)),
        ]);
        // Enable camera + mic with a timeout — non-fatal so session still starts
        // even if the browser takes long to grant device access.
        try {
          await Promise.race([
            Promise.all([streamCall.camera.enable(), streamCall.microphone.enable()]),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Camera/mic enable timed out after 10s")), 10000),
            ),
          ]);
        } catch (e) {
          console.warn("[VC:init] Camera/mic enable failed — continuing anyway:", e);
        }

        if (!mounted) return;

        setCallId(call_id);
        setClient(streamClient);
        setCall(streamCall);
        setStatus("live");
        addLog("Camera live. Your AI director is watching.");
      } catch (err) {
        console.error(err);
        if (mounted) setStatus("error");
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, [mode, topic]);

  const handleEndSession = async () => {
    // Signal session end to backend — stops the Gemini retry loop.
    fetch(`${API_URL}/session/end/${callId}`, { method: "POST" }).catch(() => {});

    // If recording is still active, stop it and set up a pending promise.
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      let resolve!: () => void;
      pendingBlobRef.current = new Promise<void>((res) => {
        resolve = res;
      });
      // Store resolve so onstop can signal completion
      (mediaRecorderRef.current as MediaRecorder & { _resolveBlob?: () => void })._resolveBlob = resolve;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Always await pendingBlobRef — covers both the mid-recording stop above
    // and a previous Cut that may still be running fixWebmDuration.
    await Promise.race([pendingBlobRef.current, new Promise<void>((resolve) => setTimeout(resolve, 10000))]);

    onSessionEnd(callId, [...blobsRef.current]);
  };

  // Cleanup on unmount — stop recording if user navigates away
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  if (status === "connecting") {
    return <LoadingSequence mode={mode} />;
  }

  if (status === "error" || !client || !call) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-background-dark text-white space-y-6">
        <p className="text-xl font-medium text-red-500">Could not start session. Is the backend running?</p>
        <button onClick={onReset} className="px-6 py-2 glassmorphism rounded-full hover:bg-white/10 transition">
          ← Back
        </button>
      </div>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <SessionUI
          mode={mode}
          callId={callId}
          onEndSession={handleEndSession}
          log={log}
          addLog={addLog}
          blobsRef={blobsRef}
          mediaRecorderRef={mediaRecorderRef}
          pendingBlobRef={pendingBlobRef}
        />
      </StreamCall>
    </StreamVideo>
  );
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

interface LiveStats {
  eye_contact_pct: number;
  energy_score: number;
  smile_count: number;
  aesthetic: string;
  takes: number;
}

function SessionUI({
  mode,
  callId,
  onEndSession,
  log,
  addLog,
  blobsRef,
  mediaRecorderRef,
  pendingBlobRef,
}: Readonly<{
  mode: Mode;
  callId: string;
  onEndSession: () => void;
  log: { id: string; text: string; time: number }[];
  addLog: (msg: string) => void;
  blobsRef: React.RefObject<TakeBlob[]>;
  mediaRecorderRef: React.RefObject<MediaRecorder | null>;
  pendingBlobRef: React.RefObject<Promise<void>>;
}>) {
  const { useLocalParticipant, useRemoteParticipants } = useCallStateHooks();
  const videoRef = useRef<HTMLVideoElement>(null);
  const localParticipant = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();

  const [takeCount, setTakeCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [liveStats, setLiveStats] = useState<LiveStats>({
    eye_contact_pct: 0,
    energy_score: 0,
    smile_count: 0,
    aesthetic: "",
    takes: 0,
  });

  const takeStartRef = useRef<number>(0);
  // Audio-only stream for recording — avoids camera conflict with Stream SDK on Windows
  const rawAudioRef = useRef<MediaStream | null>(null);

  // Acquire a microphone-only stream for recording audio.
  // Video comes from localParticipant.videoStream (already confirmed working on screen).
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

  // Poll live metrics from backend every 2 seconds
  useEffect(() => {
    if (!callId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/session/live/${callId}`);
        if (res.ok) {
          const data: LiveStats = await res.json();
          setLiveStats(data);
        }
      } catch {
        // Silently ignore — backend might not be ready yet
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [callId]);

  useEffect(() => {
    if (!localParticipant?.videoStream || !videoRef.current) return;
    videoRef.current.srcObject = localParticipant.videoStream;
  }, [localParticipant?.videoStream]);

  const startTake = () => {
    if (!videoRef.current) {
      addLog("⚠ No video feed yet — wait a moment");
      return;
    }

    const mimeType =
      ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ??
      "";

    if (!mimeType) {
      addLog("⚠ Recording not supported in this browser");
      return;
    }

    const newTake = takeCount + 1;
    setTakeCount(newTake);
    addLog(`🎬 Take ${newTake} action`);

    const startTime = Date.now();
    takeStartRef.current = startTime;
    setRecordingTime(0);

    // Stop any previous recorder — its onstop closure already captured its own state.
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    // Capture directly from the live WebRTC video stream — this is far more reliable
    // than the canvas approach because the MediaStream is always active and Chrome
    // can encode it without needing a visible DOM element.
    const videoTracks = (videoRef.current.srcObject as MediaStream | null)?.getVideoTracks() ?? [];
    const audioTracks = rawAudioRef.current?.getAudioTracks() ?? [];

    if (videoTracks.length === 0) {
      addLog("⚠ No video track available — ensure camera is enabled");
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
      // MediaRecorder writes WebM with duration=Infinity — browsers refuse to render
      // any frame from such files (Chromium bug #642012). Patch the header with the
      // real duration so the file becomes seekable and the first frame shows.
      const blob = mimeType.includes("webm") ? await fixWebmDuration(rawBlob, durationMs) : rawBlob;
      const duration = durationMs / 1000;
      if (blobsRef.current) {
        blobsRef.current = [...blobsRef.current.filter((b) => b.takeNumber !== newTake), { takeNumber: newTake, blob, duration }];
      }
      addLog(`✓ Take ${newTake} saved (${duration.toFixed(0)}s)`);
      // Resolve the pending promise so handleEndSession can proceed
      const resolveBlob = (mr as MediaRecorder & { _resolveBlob?: () => void })._resolveBlob;
      if (resolveBlob) resolveBlob();
    };

    mr.start(100); // Fire ondataavailable every 100ms for fine-grained chunks
    mediaRecorderRef.current = mr;
    setIsRecording(true);
  };

  const cutTake = () => {
    if (!isRecording || !mediaRecorderRef.current) return;
    // Create a pending promise BEFORE stopping so handleEndSession can always
    // await it, even if the user presses End Session right after Cut.
    let resolve!: () => void;
    pendingBlobRef.current = new Promise<void>((res) => {
      resolve = res;
    });
    (mediaRecorderRef.current as MediaRecorder & { _resolveBlob?: () => void })._resolveBlob = resolve;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    addLog(`✂ Take ${takeCount} cut`);
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
          <div className="h-6 w-[1px] bg-glass-border"></div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 ${conf.color}`}>
            <span className={`size-2 rounded-full ${conf.bg} shadow-[0_0_8px_currentColor]`}></span>
            <span className="text-xs font-bold uppercase tracking-widest">{conf.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button
            onClick={onEndSession}
            className="flex items-center justify-center gap-2 px-6 py-2 rounded-full glassmorphism border border-white/10 hover:bg-white/10 transition-all text-sm font-bold"
          >
            <X className="w-4 h-4" />
            End Session
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6 p-4 md:p-6 min-h-0 relative">
        {/* Left Column: Video Feed (100% mobile, 70% desktop) */}
        <section className="flex-1 flex flex-col min-w-0 relative">
          {/* Mobile Notes Toggle */}
          <button
            onClick={() => setIsNotesOpen(true)}
            className="lg:hidden absolute top-4 right-4 z-40 bg-black/60 backdrop-blur-xl rounded-full px-4 py-2 border border-white/20 flex items-center gap-2 shadow-2xl transition-transform active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold tracking-widest uppercase">Director</span>
          </button>

          <div className="flex-1 glassmorphism rounded-xl border border-glass-border overflow-hidden relative">
            {/* The actual video feed */}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }} // Mirror self
            />

            {/* Top Overlay Info */}
            <div className="absolute top-6 left-6 flex items-center gap-4">
              <div className="px-3 py-1.5 rounded bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-2">
                <span className="text-xs font-bold tracking-widest uppercase">Take {takeCount}</span>
              </div>
            </div>

            {/* Recording Indicator */}
            {isRecording && (
              <div className="absolute top-6 right-6">
                <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-red-500/20 border border-red-500/40 backdrop-blur-md">
                  <span className="size-3 rounded-full bg-red-600 animate-pulse-red shadow-[0_0_12px_rgba(239,68,68,0.8)]"></span>
                  <span className="text-sm font-bold font-mono tracking-tighter text-red-500 uppercase">
                    REC {formatTime(recordingTime)}
                  </span>
                </div>
              </div>
            )}

            {/* Bottom Controls Dock */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-4 glassmorphism rounded-2xl shadow-2xl min-w-[350px] z-50">
              <button
                onClick={onEndSession}
                className="size-14 rounded-full glassmorphism flex items-center justify-center hover:bg-white/20 transition-all group shrink-0"
              >
                <X className="w-6 h-6 group-active:scale-90 transition-transform" />
              </button>

              <div className="h-8 w-[1px] bg-white/10 mx-2"></div>

              <button
                onClick={startTake}
                className={`flex-1 h-14 rounded-xl flex items-center justify-center gap-3 shadow-lg transition-transform active:scale-95 ${
                  isRecording
                    ? "bg-white/10 text-white font-medium"
                    : "bg-gradient-to-r from-primary to-accent text-black font-bold uppercase tracking-widest hover:scale-[1.02] shadow-primary/20"
                }`}
              >
                <Video className={isRecording ? "w-5 h-5" : "w-6 h-6 fill-black"} />
                {isRecording ? "Restart Take" : "New Take"}
              </button>

              <div className="h-8 w-[1px] bg-white/10 mx-2"></div>

              <button
                onClick={cutTake}
                disabled={!isRecording}
                className={`flex items-center justify-center gap-2 px-6 h-14 rounded-xl glassmorphism border border-white/10 transition-all font-bold uppercase tracking-widest text-sm
                    ${isRecording ? "hover:bg-white/20 hover:text-white" : "opacity-30 cursor-not-allowed"}
                 `}
              >
                <Scissors className="w-5 h-5" />
                Cut
              </button>
            </div>

            {/* Focus Brackets Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="size-64 sm:size-80 md:size-96 border-2 border-primary/10 rounded-lg relative">
                <div className="absolute top-0 left-0 size-8 border-t-2 border-l-2 border-primary/50 rounded-tl-lg"></div>
                <div className="absolute top-0 right-0 size-8 border-t-2 border-r-2 border-primary/50 rounded-tr-lg"></div>
                <div className="absolute bottom-0 left-0 size-8 border-b-2 border-l-2 border-primary/50 rounded-bl-lg"></div>
                <div className="absolute bottom-0 right-0 size-8 border-b-2 border-r-2 border-primary/50 rounded-br-lg"></div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: AI Teleprompter Sidebar (30%) */}
        {isNotesOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsNotesOpen(false)} />
        )}
        <aside
          className={`absolute lg:relative inset-x-0 bottom-0 z-50 h-[85vh] lg:h-auto lg:w-[30%] flex flex-col gap-4 md:gap-6 overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] lg:transition-none lg:translate-y-0 bg-background-dark/95 lg:bg-transparent backdrop-blur-3xl lg:backdrop-blur-none p-4 lg:p-0 border-t border-glass-border lg:border-none rounded-t-[2rem] lg:rounded-none shadow-[0_-20px_50px_rgba(0,0,0,0.5)] lg:shadow-none ${isNotesOpen ? "translate-y-0" : "translate-y-full"}`}
        >
          {/* Mobile Drag Handle */}
          <div
            className="w-full flex justify-center lg:hidden shrink-0 pt-2 pb-1 cursor-pointer"
            onClick={() => setIsNotesOpen(false)}
          >
            <div className="w-12 h-1.5 bg-white/20 rounded-full" />
          </div>

          {/* Director's Notes */}
          <div className="flex-1 glassmorphism rounded-xl border border-glass-border flex flex-col overflow-hidden relative">
            <button
              className="lg:hidden absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 z-10"
              onClick={() => setIsNotesOpen(false)}
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <div className="p-4 md:p-6 border-b border-glass-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xl font-bold">Director&apos;s Notes</h3>
                <p className="text-xs text-primary font-bold uppercase tracking-widest mt-1">AI Analyst Live</p>
              </div>
              <div className="size-12 relative flex items-center justify-center">
                <svg className="size-12 -rotate-90">
                  <circle
                    className="text-white/5"
                    cx="24"
                    cy="24"
                    fill="transparent"
                    r="20"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <circle
                    className="text-primary"
                    cx="24"
                    cy="24"
                    fill="transparent"
                    r="20"
                    stroke="currentColor"
                    strokeDasharray="125.6"
                    strokeDashoffset={125.6 - (125.6 * Math.min(liveStats.eye_contact_pct, 100)) / 100}
                    strokeWidth="4"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold">{liveStats.eye_contact_pct.toFixed(0)}%</span>
                </div>
              </div>
            </div>

            {/* Scrollable Notes List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {log.length === 0 ? (
                <>
                  {/* Placeholder matching stitch.html design */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <Eye className="w-4 h-4 text-primary" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xl leading-snug font-medium text-slate-100">
                          Waiting for your first take — AI analysis will appear{" "}
                          <span className="text-accent underline decoration-2 underline-offset-4">here.</span> 📉
                        </p>
                        <p className="text-xs text-slate-400 font-medium">ACTION: Start recording to begin.</p>
                      </div>
                    </div>
                  </div>
                  <div className="pt-8 border-t border-glass-border">
                    <p className="text-3xl font-bold text-white/10 select-none">NEXT: THE REVEAL...</p>
                  </div>
                </>
              ) : (
                <>
                  {log.map((item, i) => {
                    const isRecent = i === log.length - 1;
                    const isAction = item.text.includes("✂") || item.text.includes("cut");
                    const isSaved = item.text.includes("✓") || item.text.includes("saved");
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: isRecent ? 1 : 0.6, x: 0 }}
                        className={`space-y-4 ${!isRecent ? "opacity-60" : ""}`}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={`size-8 rounded-full flex items-center justify-center shrink-0 ${
                              isAction ? "bg-accent/20" : isSaved ? "bg-primary/20" : "bg-white/10"
                            }`}
                          >
                            {isAction ? (
                              <Scissors className="w-4 h-4 text-accent" />
                            ) : isSaved ? (
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                            ) : (
                              <Sparkles className="w-4 h-4 text-white" />
                            )}
                          </div>
                          <div className="space-y-2">
                            <p
                              className={`text-xl leading-snug font-medium ${isRecent ? "text-slate-100" : "text-slate-200"} ${isAction ? "italic" : ""}`}
                            >
                              {item.text}
                            </p>
                            {isAction && (
                              <p className="text-xs text-slate-400 font-medium uppercase tracking-tighter">
                                SUGGESTION: Review and re-take if needed.
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                  <div className="pt-8 border-t border-glass-border">
                    <p className="text-3xl font-bold text-white/10 select-none">NEXT: THE REVEAL...</p>
                  </div>
                </>
              )}
            </div>

            {/* Sidebar Stats Footer — Live Metrics from AI */}
            <div className="p-6 bg-primary/5 border-t border-glass-border shrink-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Eye Contact</p>
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-1000"
                        style={{ width: `${Math.min(liveStats.eye_contact_pct, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-xs font-bold">{liveStats.eye_contact_pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Energy</p>
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-1000"
                        style={{ width: `${Math.min(liveStats.energy_score * 10, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-xs font-bold">{liveStats.energy_score.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Session Mini Stats Footer — 3 Columns */}
          <div className="grid grid-cols-3 gap-4 h-24 shrink-0">
            <div className="glassmorphism rounded-xl border border-glass-border p-3 flex flex-col justify-center items-center text-center">
              <span className="text-xs text-slate-400 uppercase tracking-tighter font-bold">Takes</span>
              <span className="text-xl font-bold">{takeCount.toString().padStart(2, "0")}</span>
            </div>
            <div className="glassmorphism rounded-xl border border-glass-border p-3 flex flex-col justify-center items-center text-center">
              <span className="text-xs text-slate-400 uppercase tracking-tighter font-bold">Smiles</span>
              <span className="text-xl font-bold">{liveStats.smile_count}</span>
            </div>
            <div className="glassmorphism rounded-xl border border-glass-border p-3 flex flex-col justify-center items-center text-center">
              <span className="text-xs text-slate-400 uppercase tracking-tighter font-bold">Vibe</span>
              <span className="text-sm font-bold truncate w-full">{liveStats.aesthetic || "Analyzing…"}</span>
            </div>
          </div>
        </aside>
      </main>

      {/* Invisible component handles Audio routing */}
      <ParticipantsAudio participants={localParticipant ? [localParticipant, ...remoteParticipants] : remoteParticipants} />
    </div>
  );
}
