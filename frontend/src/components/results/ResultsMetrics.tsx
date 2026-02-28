import { useEffect } from "react";
import { Sparkles, Hash, Download, Zap } from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import type { TakeScore, SessionResults } from "../../types/session";

function AnimatedCounter({ value, decimal = 0 }: { value: number; decimal?: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => v.toFixed(decimal));

  useEffect(() => {
    const controls = animate(count, value, { duration: 1.5, ease: "easeOut" });
    return controls.stop;
  }, [value, count]);

  return <motion.span>{rounded}</motion.span>;
}

interface Props {
  bestTakeData: TakeScore | null;
  results: SessionResults | null;
  copied: boolean;
  onCopy: (text: string) => void;
}

export function ResultsMetrics({ bestTakeData, results, copied, onCopy }: Props) {
  return (
    <>
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
                strokeDashoffset={364 - (364 * (bestTakeData?.eye_contact_pct ?? 0)) / 100}
                strokeWidth="8"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black">
                <AnimatedCounter value={bestTakeData?.eye_contact_pct ?? 0} />%
              </span>
            </div>
          </div>
          <p className="text-sm text-primary">
            {(bestTakeData?.eye_contact_pct ?? 0) >= 70
              ? "High engagement detected throughout the take."
              : (bestTakeData?.eye_contact_pct ?? 0) >= 40
                ? "Moderate eye contact — try looking at the lens more."
                : "Low eye contact — focus on the camera lens."}
          </p>
        </div>

        {/* Energy Score Bar Chart */}
        <div className="glassmorphism p-6 rounded-xl flex flex-col gap-4">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Energy Score</p>
              <h3 className="text-3xl font-black text-accent">
                <AnimatedCounter value={bestTakeData?.energy_score ?? 0} decimal={1} />
                <span className="text-sm text-slate-500">/10</span>
              </h3>
            </div>
            <Zap className="w-6 h-6 text-accent" />
          </div>
          <div className="flex items-end gap-1.5 h-20">
            {(() => {
              const score = bestTakeData?.energy_score ?? 0;
              const pct = Math.min(score * 10, 100);
              const bars = [0.3, 0.5, 0.7, 1.0, 0.85, 0.6, 0.35];
              return bars.map((mult, i) => {
                const h = Math.max(pct * mult, 4);
                const peak = i === 3;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-sm ${
                      peak ? "bg-accent shadow-[0_0_10px_#f20db4]" : `bg-accent/${Math.round(mult * 100)}`
                    }`}
                    style={{ height: `${h}%` }}
                  />
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Right Column: AI Insights (4 cols) */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
        {/* Aesthetic Profile */}
        <div className="p-8 rounded-xl glassmorphism border-2 border-primary/40 relative overflow-hidden flex flex-col items-center justify-center text-center gap-4">
          <div className="absolute top-0 right-0 p-2">
            <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-1 rounded-full uppercase">AI Analysis</span>
          </div>
          <div className="size-16 rounded-full iridescent-gradient flex items-center justify-center mb-2 shadow-2xl">
            <Sparkles className="w-8 h-8 text-background-dark" />
          </div>
          <div>
            <p className="text-slate-400 text-sm font-medium">Aesthetic Profile</p>
            <h4 className="text-3xl font-black italic tracking-tighter text-white capitalize">
              {results?.aesthetic || "Analyzing…"}
            </h4>
          </div>
          <p className="text-xs text-slate-400 max-w-xs">
            {results?.aesthetic
              ? `Your aesthetic profile was detected as "${results.aesthetic}". This influences caption style and mood analysis.`
              : "No aesthetic profile was detected for this session."}
          </p>
        </div>

        {/* TikTok Caption */}
        <div className="glassmorphism p-6 rounded-xl flex flex-col gap-4 flex-1">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-primary" />
            <p className="font-bold text-sm uppercase tracking-widest">Generated TikTok Caption</p>
          </div>
          <div className="bg-black/40 p-5 rounded-lg border border-white/5 text-sm leading-relaxed italic text-slate-300 relative group">
            {results?.caption?.caption ? `"${results.caption.caption}"` : "No caption generated for this session."}
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none"></div>
          </div>
          <button
            onClick={() => {
              const text = results?.caption?.caption ? `${results.caption.caption}\n\n${results.caption.hashtags}` : "";
              if (text) onCopy(text);
            }}
            className="w-full bg-primary/10 hover:bg-primary/20 border border-primary/40 py-3 rounded-lg flex items-center justify-center gap-2 font-bold transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {copied ? "Copied!" : "Copy to Clipboard"}
          </button>
        </div>
      </div>
    </>
  );
}
