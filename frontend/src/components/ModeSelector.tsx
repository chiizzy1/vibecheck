import { motion } from "framer-motion";
import { Clapperboard, Sparkles, Flame } from "lucide-react";
import type { Mode } from "../App";

const MODES: { id: Mode; icon: React.ReactNode; label: string; desc: string; color: string }[] = [
  {
    id: "director",
    icon: <Clapperboard className="w-8 h-8" />,
    label: "Director Mode",
    desc: "Precise, professional feedback. Like having a real film director in your ear.",
    color: "from-primary/20 to-primary/5 border-primary/30 text-primary",
  },
  {
    id: "bestie",
    icon: <Sparkles className="w-8 h-8" />,
    label: "Bestie Mode",
    desc: "Your hype bestie who keeps it real. Warm, encouraging, and honest.",
    color: "from-accent/20 to-accent/5 border-accent/30 text-accent",
  },
  {
    id: "roast",
    icon: <Flame className="w-8 h-8" />,
    label: "Roast Mode",
    desc: "Unhinged Gen Z chaos roast. Real feedback wrapped in pure drama.",
    color: "from-orange-500/20 to-orange-500/5 border-orange-500/30 text-orange-500",
  },
];

interface Props {
  onSelect: (mode: Mode) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

export function ModeSelector({ onSelect }: Readonly<Props>) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-6 bg-background-dark text-slate-100">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center mb-16 space-y-4 text-center"
      >
        <div className="flex items-center gap-3 text-primary">
          <Clapperboard className="w-10 h-10" strokeWidth={1.5} />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tighter uppercase italic">VibeCheck</h1>
        </div>
        <p className="text-slate-400 font-medium tracking-wide max-w-md">
          Your cinematic AI director. Real-time feedback for perfect takes.
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl"
      >
        {MODES.map((m) => (
          <motion.button
            key={m.id}
            variants={itemVariants}
            whileHover={{ scale: 1.02, y: -8, boxShadow: "0 20px 40px rgba(0,0,0,0.15)" }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            onClick={() => onSelect(m.id)}
            className={`flex flex-col items-start p-8 text-left rounded-2xl glassmorphism border bg-gradient-to-br ${m.color}`}
          >
            <div className="mb-6 p-4 rounded-xl bg-background-dark/50 backdrop-blur-md shadow-inner">{m.icon}</div>
            <h2 className={`text-2xl font-bold mb-3 ${m.color.split(" ").pop()}`}>{m.label}</h2>
            <p className="text-slate-300 leading-relaxed font-medium">{m.desc}</p>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
