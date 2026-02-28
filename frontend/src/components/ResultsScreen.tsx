import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Play, Download, Sparkles, Hash, Zap, Clapperboard, Film, Scissors, Award, Target } from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import type { Mode } from "../App";

function AnimatedCounter({ value, decimal = 0 }: { value: number; decimal?: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => v.toFixed(decimal));

  useEffect(() => {
    const controls = animate(count, value, { duration: 1.5, ease: "easeOut" });
    return controls.stop;
  }, [value, count]);

  return <motion.span>{rounded}</motion.span>;
}

export interface TakeBlob {
  takeNumber: number;
  blob: Blob;
  duration: number;
}

interface TakeScore {
  take_number: number;
  eye_contact_pct: number;
  energy_score: number;
  smile_count: number;
  duration_seconds: number;
  composite_score: number;
}

interface SessionResults {
  topic: string;
  mode: Mode;
  takes: TakeScore[];
  aesthetic: string;
  caption: { caption: string; hashtags: string; tip: string } | null;
}

interface TakeInsight {
  take: number;
  score: number;
  strengths: string[];
  weaknesses: string[];
  is_best: boolean;
}

interface DirectorsCut {
  status: string;
  total_takes?: number;
  insights: TakeInsight[];
  verdict: string;
  next_take_advice?: string;
  best_take?: number;
  highlight_reel?: {
    best_eye_contact: { take: number; value: number };
    best_energy: { take: number; value: number };
    most_smiles: { take: number; value: number };
  };
}

interface Props {
  callId: string;
  blobs: TakeBlob[];
  onReset: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function ResultsScreen({ callId, blobs, onReset }: Readonly<Props>) {
  const [results, setResults] = useState<SessionResults | null>(null);
  const [directorsCut, setDirectorsCut] = useState<DirectorsCut | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetch(`${API_URL}/session/results/${callId}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch results", err);
        setLoading(false);
      });

    // Fetch Director's Cut analysis in parallel
    fetch(`${API_URL}/session/directors-cut/${callId}`)
      .then((r) => r.json())
      .then((data) => setDirectorsCut(data))
      .catch(() => {});
  }, [callId]);

  const bestTakeData = results?.takes?.length
    ? results.takes.reduce((a, b) => (a.composite_score >= b.composite_score ? a : b))
    : null;

  const activeTakeBlob = bestTakeData ? blobs.find((b) => b.takeNumber === bestTakeData.take_number) : blobs[0];

  useEffect(() => {
    if (activeTakeBlob && videoRef.current) {
      const url = URL.createObjectURL(activeTakeBlob.blob);
      videoRef.current.src = url;
      return () => URL.revokeObjectURL(url);
    }
  }, [activeTakeBlob]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleDownload = (tb: TakeBlob) => {
    const url = URL.createObjectURL(tb.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibecheck-take-${tb.takeNumber}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-screen bg-background-dark text-white space-y-6">
        <div className="size-16 border-4 border-accent/30 border-t-accent rounded-full animate-spin"></div>
        <p className="text-xl font-medium tracking-wide animate-pulse">Analyzing session data with multiple AI models...</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-dark font-display text-slate-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 lg:px-12 py-4 lg:py-6 border-b border-primary/10 glassmorphism sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="size-10 iridescent-gradient rounded-lg flex items-center justify-center text-background-dark">
            <Clapperboard className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">VibeCheck</h2>
        </div>
        <div className="flex items-center gap-12">
          <nav className="hidden md:flex items-center gap-8">
            <a className="text-primary font-medium" href="#">
              Dashboard
            </a>
            <a className="text-slate-400 hover:text-white transition-colors" href="#">
              History
            </a>
            <a className="text-slate-400 hover:text-white transition-colors" href="#">
              Creators
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              onClick={onReset}
              className="glassmorphism px-6 py-2.5 rounded-full text-sm font-bold border border-primary/30 hover:bg-primary/10 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Restart Session
            </motion.button>
            <div className="size-10 rounded-full border-2 border-primary/50 overflow-hidden">
              <img
                className="w-full h-full object-cover"
                alt="Creator profile avatar"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBmkVa3QEVqho2DbwlnDnI2eg_JKWQhXRGvCA1ZrOSdY5wGI19zu1ELHzpQkS4723wNhlvf8Q1RQoxjxY7O8iBgUeQ2prEtSSd-kzugtd9dHYXHI38o_viCde_Q6RBE8r20gYzINwwIw7Yb4kL6lH6pSLtCD4o2DoxK07FbnMbmoqCe2vTcB7agyibRy43ukont1X5tYsbINkKKB85JokYfyV8DMXMbkOSVoYzVyGeZc5eCfyJQBMgmXeoIYfTlYSw_yJ64JDH4ps6-"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 lg:px-12 py-6 lg:py-8 max-w-[1600px] mx-auto w-full">
        {/* Title Section */}
        <div className="mb-8 lg:mb-10 flex flex-col gap-2">
          <h1 className="text-3xl lg:text-5xl font-black tracking-tighter italic uppercase text-transparent bg-clip-text iridescent-gradient">
            Session Results
          </h1>
          <p className="text-slate-400 text-lg">
            AI Director&apos;s analysis for take #{bestTakeData?.take_number?.toString().padStart(2, "0") ?? "01"}: &quot;
            {results?.topic || "Session"}&quot;
          </p>
        </div>

        {/* 3-Column Grid Layout */}
        <div className="grid grid-cols-12 gap-8">
          {/* Left Column: Video Player (5 cols) */}
          <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
            <div className="glassmorphism rounded-xl overflow-hidden relative aspect-video group shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10"></div>
              {activeTakeBlob ? (
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  onEnded={() => setIsPlaying(false)}
                  onTimeUpdate={(e) => {
                    const vid = e.currentTarget;
                    if (vid.duration) {
                      setProgress((vid.currentTime / vid.duration) * 100);
                    }
                  }}
                  playsInline
                  controls={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black text-slate-500">
                  <Film className="w-12 h-12 opacity-50" />
                </div>
              )}
              {/* Play button overlay */}
              <button
                onClick={togglePlay}
                className={`absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-300 ${isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}
              >
                <div className="size-20 bg-primary rounded-full text-background-dark flex items-center justify-center shadow-primary/50 shadow-2xl">
                  {isPlaying ? <span className="text-2xl font-bold">||</span> : <Play className="w-10 h-10 fill-current ml-1" />}
                </div>
              </button>
              {/* Bottom video info */}
              <div className="absolute bottom-0 inset-x-0 p-6 z-20">
                <div className="flex items-center gap-4 mb-2">
                  <div className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }}></div>
                  </div>
                  <span className="text-xs font-mono">
                    {videoRef.current
                      ? `${formatDuration(videoRef.current.currentTime)} / ${formatDuration(videoRef.current.duration || activeTakeBlob?.duration || 0)}`
                      : "00:00 / 00:00"}
                  </span>
                </div>
                <p className="text-sm font-bold uppercase tracking-widest text-primary">Best Take: Mastered</p>
              </div>
            </div>
            {/* Download Best Take CTA */}
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              onClick={() => activeTakeBlob && handleDownload(activeTakeBlob)}
              className="w-full iridescent-gradient py-4 lg:py-5 rounded-xl text-background-dark font-black text-lg lg:text-xl uppercase tracking-tighter flex items-center justify-center gap-3 shadow-lg shadow-primary/20 cursor-pointer"
            >
              <Download className="w-5 h-5 lg:w-6 lg:h-6" />
              Download Best Take
            </motion.button>
          </div>

          {/* Middle Column: Metrics (3 cols) */}
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
            {/* Eye Contact Donut */}
            <div className="glassmorphism p-6 rounded-xl flex flex-col items-center text-center gap-4">
              <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Eye Contact</p>
              <div className="relative size-32 flex items-center justify-center">
                <svg className="size-full -rotate-90">
                  <circle
                    className="text-primary/10"
                    cx="64"
                    cy="64"
                    fill="transparent"
                    r="58"
                    stroke="currentColor"
                    strokeWidth="8"
                  />
                  <circle
                    className="text-primary"
                    cx="64"
                    cy="64"
                    fill="transparent"
                    r="58"
                    stroke="currentColor"
                    strokeDasharray="364"
                    strokeDashoffset={364 - (364 * (bestTakeData?.eye_contact_pct ?? 87)) / 100}
                    strokeWidth="8"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black">
                    <AnimatedCounter value={bestTakeData?.eye_contact_pct ?? 87} />%
                  </span>
                </div>
              </div>
              <p className="text-sm text-primary">High engagement detected throughout the take.</p>
            </div>

            {/* Energy Score Bar Chart */}
            <div className="glassmorphism p-6 rounded-xl flex flex-col gap-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Energy Score</p>
                  <h3 className="text-3xl font-black text-accent">
                    <AnimatedCounter value={bestTakeData?.energy_score ?? 9.1} decimal={1} />
                    <span className="text-sm text-slate-500">/10</span>
                  </h3>
                </div>
                <Zap className="w-6 h-6 text-accent" />
              </div>
              <div className="flex items-end gap-1.5 h-20">
                <div className="flex-1 bg-accent/20 rounded-t-sm" style={{ height: "40%" }}></div>
                <div className="flex-1 bg-accent/40 rounded-t-sm" style={{ height: "60%" }}></div>
                <div className="flex-1 bg-accent/60 rounded-t-sm" style={{ height: "80%" }}></div>
                <div className="flex-1 bg-accent rounded-t-sm shadow-[0_0_10px_#f20db4]" style={{ height: "95%" }}></div>
                <div className="flex-1 bg-accent/80 rounded-t-sm" style={{ height: "85%" }}></div>
                <div className="flex-1 bg-accent/50 rounded-t-sm" style={{ height: "55%" }}></div>
                <div className="flex-1 bg-accent/30 rounded-t-sm" style={{ height: "30%" }}></div>
              </div>
            </div>
          </div>

          {/* Right Column: AI Insights (4 cols) */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
            {/* Aesthetic Profile */}
            <div className="p-8 rounded-xl glassmorphism border-2 border-primary/40 relative overflow-hidden flex flex-col items-center justify-center text-center gap-4">
              <div className="absolute top-0 right-0 p-2">
                <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-1 rounded-full uppercase">
                  AI Analysis
                </span>
              </div>
              <div className="size-16 rounded-full iridescent-gradient flex items-center justify-center mb-2 shadow-2xl">
                <Sparkles className="w-8 h-8 text-background-dark" />
              </div>
              <div>
                <p className="text-slate-400 text-sm font-medium">Aesthetic Profile</p>
                <h4 className="text-3xl font-black italic tracking-tighter text-white capitalize">
                  {results?.aesthetic || "Dark Academia"}
                </h4>
              </div>
              <p className="text-xs text-slate-400 max-w-xs">
                Mood: Intellectual, Somber, Refined. Lighting matches peak trending visual styles for educational storytelling.
              </p>
            </div>

            {/* TikTok Caption */}
            <div className="glassmorphism p-6 rounded-xl flex flex-col gap-4 flex-1">
              <div className="flex items-center gap-2">
                <Hash className="w-5 h-5 text-primary" />
                <p className="font-bold text-sm uppercase tracking-widest">Generated TikTok Caption</p>
              </div>
              <div className="bg-black/40 p-5 rounded-lg border border-white/5 text-sm leading-relaxed italic text-slate-300 relative group">
                {results?.caption?.caption
                  ? `"${results.caption.caption}"`
                  : `"POV: You've finally mastered the dark academia aesthetic for your setup 🕯️📚 diving deep into the vibes today. Which look should I try next? #vibecheck #darkacademia #creator #aesthetic #cinematic"`}
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none"></div>
              </div>
              <button
                onClick={() => {
                  const text = results?.caption?.caption ? `${results.caption.caption}\n\n${results.caption.hashtags}` : "";
                  if (text) handleCopy(text);
                }}
                className="w-full bg-primary/10 hover:bg-primary/20 border border-primary/40 py-3 rounded-lg flex items-center justify-center gap-2 font-bold transition-all"
              >
                <Download className="w-4 h-4" />
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
            </div>
          </div>
        </div>

        {/* Director's Cut — Comparative Analysis */}
        {directorsCut && directorsCut.status !== "no_takes" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 200, damping: 20 }}
            className="mt-12"
          >
            <div className="glassmorphism rounded-xl overflow-hidden border-2 border-accent/30">
              {/* Header */}
              <div className="p-6 lg:p-8 bg-gradient-to-r from-accent/10 to-primary/10 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-full bg-accent/20 flex items-center justify-center">
                    <Scissors className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Director&apos;s Cut</h3>
                    <p className="text-sm text-slate-400">AI-powered comparative analysis across all takes</p>
                  </div>
                </div>
              </div>

              <div className="p-6 lg:p-8 space-y-6">
                {/* Verdict */}
                <div className="bg-black/30 rounded-lg p-5 border border-white/5">
                  <div className="flex items-start gap-3">
                    <Award className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm leading-relaxed text-slate-200">{directorsCut.verdict}</p>
                  </div>
                </div>

                {/* Per-Take Insights Grid */}
                {directorsCut.insights.length > 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {directorsCut.insights.map((insight) => (
                      <div
                        key={insight.take}
                        className={`rounded-lg p-4 border ${
                          insight.is_best ? "bg-primary/10 border-primary/30" : "bg-black/20 border-white/5"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                            Take {insight.take.toString().padStart(2, "0")}
                          </span>
                          {insight.is_best && (
                            <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                              BEST
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {insight.strengths.map((s) => (
                            <p key={s} className="text-xs text-green-400 flex items-center gap-1.5">
                              <span className="text-green-500">✓</span> {s}
                            </p>
                          ))}
                          {insight.weaknesses.map((w) => (
                            <p key={w} className="text-xs text-orange-400 flex items-center gap-1.5">
                              <span className="text-orange-500">⚠</span> {w}
                            </p>
                          ))}
                          {insight.strengths.length === 0 && insight.weaknesses.length === 0 && (
                            <p className="text-xs text-slate-500 italic">Moderate performance</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Next Take Advice */}
                {directorsCut.next_take_advice && (
                  <div className="bg-accent/5 rounded-lg p-5 border border-accent/20">
                    <div className="flex items-start gap-3">
                      <Target className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-accent mb-1">Next Take Advice</p>
                        <p className="text-sm leading-relaxed text-slate-300">{directorsCut.next_take_advice}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Footer Stats */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="glassmorphism p-4 rounded-xl">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Total Takes</p>
            <p className="text-xl font-bold">{results?.takes?.length ?? blobs.length}</p>
          </div>
          <div className="glassmorphism p-4 rounded-xl">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Recording Time</p>
            <p className="text-xl font-bold">{formatDuration(blobs.reduce((sum, b) => sum + b.duration, 0))}</p>
          </div>
          <div className="glassmorphism p-4 rounded-xl">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Best Take</p>
            <p className="text-xl font-bold text-primary">#{bestTakeData?.take_number?.toString().padStart(2, "0") ?? "01"}</p>
          </div>
          <div className="glassmorphism p-4 rounded-xl border-primary/40">
            <p className="text-[10px] text-primary uppercase font-bold tracking-widest mb-1">Top Score</p>
            <p className="text-xl font-bold text-white">{bestTakeData?.composite_score?.toFixed(1) ?? "—"}/10</p>
          </div>
        </div>
      </main>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}
