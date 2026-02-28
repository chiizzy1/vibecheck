import { ChevronDown, Eye, Scissors, CheckCircle2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import type { LiveStats } from "../../types/session";

interface Props {
  isNotesOpen: boolean;
  setIsNotesOpen: (open: boolean) => void;
  liveStats: LiveStats;
  takeCount: number;
  log: { id: string; text: string; time: number }[];
}

export function DirectorSidebar({ isNotesOpen, setIsNotesOpen, liveStats, takeCount, log }: Props) {
  return (
    <>
      {isNotesOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsNotesOpen(false)} />
      )}

      <aside
        className={`absolute lg:relative inset-x-0 bottom-0 z-50 h-[85vh] lg:h-auto lg:w-[30%] flex flex-col gap-4 md:gap-6 overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] lg:transition-none lg:translate-y-0 bg-background-dark/95 lg:bg-transparent backdrop-blur-3xl lg:backdrop-blur-none p-4 lg:p-0 border-t border-glass-border lg:border-none rounded-t-4xl lg:rounded-none shadow-[0_-20px_50px_rgba(0,0,0,0.5)] lg:shadow-none ${
          isNotesOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Mobile Drag Handle */}
        <div
          className="w-full flex justify-center lg:hidden shrink-0 pt-2 pb-1 cursor-pointer"
          onClick={() => setIsNotesOpen(false)}
        >
          <div className="w-12 h-1.5 bg-white/20 rounded-full" />
        </div>

        {/* Director's Notes Box */}
        <div className="flex-1 glassmorphism rounded-xl border border-glass-border flex flex-col overflow-hidden relative">
          <button
            className="lg:hidden absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 z-10 cursor-pointer"
            onClick={() => setIsNotesOpen(false)}
          >
            <ChevronDown className="w-5 h-5" />
          </button>

          <div className="p-4 md:p-6 border-b border-glass-border flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-xl font-bold">Director&apos;s Notes</h3>
              <p className="text-xs text-primary font-bold uppercase tracking-widest mt-1">AI Analyst Live</p>
            </div>
            {/* Eye Contact Donut Micro-Chart */}
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
                            className={`text-xl leading-snug font-medium ${isRecent ? "text-slate-100" : "text-slate-200"} ${
                              isAction ? "italic" : ""
                            }`}
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
    </>
  );
}
