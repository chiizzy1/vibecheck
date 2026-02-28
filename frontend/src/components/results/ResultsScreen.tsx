import { useState } from "react";
import { ArrowLeft, Clapperboard } from "lucide-react";
import { motion } from "framer-motion";

import { useSessionResults } from "../../hooks/useSessionResults";
import { formatDuration } from "../../lib/utils";

import { ResultsVideoPlayer } from "./ResultsVideoPlayer";
import { ResultsMetrics } from "./ResultsMetrics";
import { DirectorsCutAnalysis } from "./DirectorsCutAnalysis";

export interface TakeBlob {
  takeNumber: number;
  blob: Blob;
  duration: number; // in seconds
}

interface Props {
  mode: string;
  topic: string;
  callId: string;
  blobs: TakeBlob[];
  onReset: () => void;
}

export function ResultsScreen({ callId, blobs, onReset }: Readonly<Props>) {
  const { results, directorsCut, isLoading } = useSessionResults(callId);
  const [copied, setCopied] = useState(false);

  // Let React Compiler handle memoization
  const bestTakeData = results?.takes?.length
    ? results.takes.reduce((a, b) => (a.composite_score >= b.composite_score ? a : b))
    : null;

  const activeTakeBlob =
    (bestTakeData ? blobs.find((b) => b.takeNumber === bestTakeData.take_number) : undefined) ?? blobs[0] ?? null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isLoading) {
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
          <ResultsVideoPlayer
            activeTakeBlob={activeTakeBlob}
            bestTakeData={bestTakeData}
            isLoading={isLoading}
            formatDuration={formatDuration}
          />

          <ResultsMetrics bestTakeData={bestTakeData} results={results} copied={copied} onCopy={handleCopy} />
        </div>

        {/* Director's Cut — Comparative Analysis */}
        <DirectorsCutAnalysis directorsCut={directorsCut} />

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
