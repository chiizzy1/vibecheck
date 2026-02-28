import { motion } from "framer-motion";
import { Scissors, Award, Target } from "lucide-react";
import type { DirectorsCut } from "../../types/session";

interface Props {
  directorsCut: DirectorsCut | null;
}

export function DirectorsCutAnalysis({ directorsCut }: Props) {
  if (!directorsCut || directorsCut.status === "no_takes") return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, type: "spring", stiffness: 200, damping: 20 }}
      className="mt-12"
    >
      <div className="glassmorphism rounded-xl overflow-hidden border-2 border-accent/30">
        {/* Header */}
        <div className="p-6 lg:p-8 bg-linear-to-r from-accent/10 to-primary/10 border-b border-white/5">
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
                      <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full">BEST</span>
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
  );
}
