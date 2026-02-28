import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ModeSelector } from "./components/ModeSelector";
import { TopicInput } from "./components/TopicInput";
import { VibeSession } from "./components/VibeSession";
import { ResultsScreen } from "./components/ResultsScreen";
import type { TakeBlob } from "./components/ResultsScreen";
import "./App.css";

export type Mode = "director" | "bestie" | "roast";

type Screen = "mode" | "topic" | "session" | "results";

interface SessionEndData {
  callId: string;
  blobs: TakeBlob[];
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("mode");
  const [mode, setMode] = useState<Mode>("director");
  const [topic, setTopic] = useState<string>("");
  const [sessionEnd, setSessionEnd] = useState<SessionEndData | null>(null);

  const handleModeSelect = (m: Mode) => {
    setMode(m);
    setScreen("topic");
  };

  const handleTopicStart = (t: string) => {
    setTopic(t);
    setScreen("session");
  };

  const handleSessionEnd = (callId: string, blobs: TakeBlob[]) => {
    setSessionEnd({ callId, blobs });
    setScreen("results");
  };

  const handleReset = () => {
    setScreen("mode");
    setSessionEnd(null);
    setTopic("");
  };

  return (
    <div className="flex w-full h-[100dvh] overflow-hidden bg-background-dark text-slate-100 font-display">
      <AnimatePresence mode="wait">
        {screen === "mode" && (
          <motion.div
            key="mode"
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.45, bounce: 0 }}
            className="w-full h-full flex"
          >
            <ModeSelector onSelect={handleModeSelect} />
          </motion.div>
        )}

        {screen === "topic" && (
          <motion.div
            key="topic"
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.45, bounce: 0 }}
            className="w-full h-full flex"
          >
            <TopicInput mode={mode} onStart={handleTopicStart} onBack={() => setScreen("mode")} />
          </motion.div>
        )}

        {screen === "session" && (
          <motion.div
            key="session"
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.45, bounce: 0 }}
            className="w-full h-full flex"
          >
            <VibeSession mode={mode} topic={topic} onReset={handleReset} onSessionEnd={handleSessionEnd} />
          </motion.div>
        )}

        {screen === "results" && sessionEnd && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.45, bounce: 0 }}
            className="w-full h-full flex"
          >
            <ResultsScreen callId={sessionEnd.callId} blobs={sessionEnd.blobs} onReset={handleReset} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
