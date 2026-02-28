import { useEffect, useRef, useState } from "react";
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
        await Promise.all([streamCall.camera.enable(), streamCall.microphone.enable()]);
        await streamCall.join({ create: true });

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

  const handleEndSession = () => {
    // Stop any active recording so the final take's blob is saved
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    // Small delay to let `onstop` fire and push the final blob
    setTimeout(() => {
      onSessionEnd(callId, blobsRef.current);
    }, 200);
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
}: Readonly<{
  mode: Mode;
  callId: string;
  onEndSession: () => void;
  log: { id: string; text: string; time: number }[];
  addLog: (msg: string) => void;
  blobsRef: React.RefObject<TakeBlob[]>;
  mediaRecorderRef: React.RefObject<MediaRecorder | null>;
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

  const chunksRef = useRef<Blob[]>([]);
  const takeStartRef = useRef<number>(0);
  const rawStreamRef = useRef<MediaStream | null>(null);

  // Acquire a raw getUserMedia stream for MediaRecorder (video + audio)
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!cancelled) rawStreamRef.current = stream;
      })
      .catch((err) => console.warn("Could not get raw stream for recording:", err));

    return () => {
      cancelled = true;
      if (rawStreamRef.current) {
        rawStreamRef.current.getTracks().forEach((t) => t.stop());
        rawStreamRef.current = null;
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
    const newTake = takeCount + 1;
    setTakeCount(newTake);
    addLog(`🎬 Take ${newTake} action`);
    takeStartRef.current = Date.now();
    setRecordingTime(0);

    // Use raw getUserMedia stream (video+audio) for recording,
    // fall back to Stream SDK's videoStream if unavailable
    const stream = rawStreamRef.current || localParticipant?.videoStream;
    if (stream && window.MediaRecorder) {
      try {
        if (mediaRecorderRef.current && isRecording) {
          mediaRecorderRef.current.stop();
        }

        chunksRef.current = [];

        const mimeType =
          ["video/webm;codecs=vp9", "video/webm", "video/mp4;codecs=avc1", "video/mp4"].find((t) =>
            MediaRecorder.isTypeSupported(t),
          ) ?? "";

        if (!mimeType) {
          addLog("⚠ Recording not supported in this browser");
          return;
        }

        const mr = new MediaRecorder(stream, { mimeType });

        mr.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: "video/webm" });
          const duration = (Date.now() - takeStartRef.current) / 1000;
          if (blobsRef.current) {
            blobsRef.current = [
              ...blobsRef.current.filter((b) => b.takeNumber !== newTake),
              { takeNumber: newTake, blob, duration },
            ];
          }
          addLog(`✓ Take ${newTake} saved (${duration.toFixed(0)}s)`);
        };

        mr.start(1000);
        mediaRecorderRef.current = mr;
        setIsRecording(true);
      } catch (e) {
        console.warn("MediaRecorder start failed:", e);
      }
    }
  };

  const cutTake = () => {
    if (!isRecording || !mediaRecorderRef.current) return;
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
          <div className="hidden md:flex items-center gap-8 mr-4">
            <a className="text-sm font-medium hover:text-primary transition-colors text-slate-300" href="#">
              History
            </a>
            <a className="text-sm font-medium hover:text-primary transition-colors text-slate-300" href="#">
              Presets
            </a>
            <a className="text-sm font-medium hover:text-primary transition-colors text-slate-300" href="#">
              Library
            </a>
          </div>
          <button
            onClick={onEndSession}
            className="flex items-center justify-center gap-2 px-6 py-2 rounded-full glassmorphism border border-white/10 hover:bg-white/10 transition-all text-sm font-bold"
          >
            <X className="w-4 h-4" />
            End Session
          </button>
          <div className="size-10 rounded-full border-2 border-primary/50 p-0.5 shrink-0">
            <div
              className="w-full h-full rounded-full bg-cover bg-center"
              style={{
                backgroundImage:
                  "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAXa4clraO3oE5yWlHHdSCH4yvQOxW4PLgkzlaWY4mkm7Uf_0oae-s5ezS0gCPJUCIEcJ6-_iCnaYkp98r4oS4akK1jjfflRR9S7m1uyu5MGKnOo01wJJGfk4viQiQ9RA6NRvWew48-y-q761pCogclN0vtVAoUqunPqCJ5ls8G6DlkIb60ss4cSGIwOmBvCw8Hi3KLmI3cfitHKLjJsETgP2elgw5xm-GfzWLLOHqWVax2QDpjlFI0sBgEQQjnyjzxue3iKqrCyAxu')",
              }}
            ></div>
          </div>
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
                    strokeDashoffset="16.3"
                    strokeWidth="4"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold">87%</span>
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
