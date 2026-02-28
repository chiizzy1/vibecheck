import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Clapperboard, Sparkles, Flame, SkipForward } from "lucide-react";
import type { Mode } from "../App";

interface Props {
  mode: Mode;
  onStart: (topic: string) => void;
  onBack: () => void;
}

const MODE_CONFIG: Record<Mode, { icon: React.ReactNode; label: string; color: string; border: string }> = {
  director: {
    icon: <Clapperboard className="w-4 h-4" />,
    label: "Director Mode",
    color: "text-primary shadow-primary/20 bg-primary/10",
    border: "focus:border-primary",
  },
  bestie: {
    icon: <Sparkles className="w-4 h-4" />,
    label: "Bestie Mode",
    color: "text-accent shadow-accent/20 bg-accent/10",
    border: "focus:border-accent",
  },
  roast: {
    icon: <Flame className="w-4 h-4" />,
    label: "Roast Mode",
    color: "text-orange-500 shadow-orange-500/20 bg-orange-500/10",
    border: "focus:border-orange-500",
  },
};

const PLACEHOLDERS: Record<Mode, string> = {
  director: "e.g. '30-second storytime about missing my flight. High energy.'",
  bestie: "e.g. 'GRWM for a night out — going for clean girl vibes. Casual.'",
  roast: "e.g. 'I tried the viral pilates morning routine. Be ruthless.'",
};

export function TopicInput({ mode, onStart, onBack }: Readonly<Props>) {
  const [topic, setTopic] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const config = MODE_CONFIG[mode];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleStart = () => {
    const t = topic.trim() || "general content";
    localStorage.setItem("vibecheck_topic", t);
    onStart(t);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleStart();
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full h-full p-6 bg-background-dark text-slate-100 items-center justify-center relative">
      <motion.button
        whileHover={{ x: -4 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        onClick={onBack}
        className="absolute top-8 left-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </motion.button>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-2xl flex flex-col items-center"
      >
        <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 ${config.color} shadow-lg mb-8`}>
          {config.icon}
          <span className="text-xs font-bold uppercase tracking-widest">{config.label}</span>
        </div>

        <h2 className="text-4xl font-bold mb-4 text-center">What are you filming today?</h2>
        <p className="text-slate-400 text-center mb-10 max-w-lg font-medium leading-relaxed">
          Give your AI Director context so the real-time coaching is perfectly tailored to your vision.
        </p>

        <div className="w-full relative group">
          <textarea
            ref={inputRef}
            className={`w-full bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-xl text-white placeholder-slate-600 focus:outline-none transition-colors duration-300 resize-none ${config.border}`}
            placeholder={PLACEHOLDERS[mode]}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={handleKey}
            maxLength={200}
            rows={4}
          />
          <div className="absolute bottom-4 right-6 text-xs font-bold font-mono text-slate-500">{topic.length}/200</div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6 mt-10 w-full justify-center">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            onClick={handleStart}
            className={`flex items-center gap-3 px-10 py-4 rounded-xl font-bold uppercase tracking-widest text-sm transition-all shadow-xl ${
              topic.trim()
                ? "bg-gradient-to-r from-primary to-accent text-white shadow-primary/20 block cursor-pointer"
                : "glassmorphism opacity-50 text-slate-300"
            }`}
          >
            Let's Go <ArrowRight className="w-5 h-5" />
          </motion.button>

          <motion.button
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            onClick={handleStart}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-white transition-colors font-medium cursor-pointer"
          >
            <SkipForward className="w-4 h-4" /> Skip context
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
