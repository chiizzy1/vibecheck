import { Video, Scissors, X } from "lucide-react";

interface Props {
  isRecording: boolean;
  startTake: () => void;
  cutTake: () => void;
  onEndSession: () => void;
}

export function SessionControls({ isRecording, startTake, cutTake, onEndSession }: Props) {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-4 glassmorphism rounded-2xl shadow-2xl min-w-[350px] z-50">
      <button
        onClick={onEndSession}
        className="size-14 rounded-full glassmorphism flex items-center justify-center hover:bg-white/20 transition-all group shrink-0 cursor-pointer"
      >
        <X className="w-6 h-6 group-active:scale-90 transition-transform" />
      </button>

      <div className="h-8 w-px bg-white/10 mx-2"></div>

      <button
        onClick={startTake}
        className={`flex-1 h-14 rounded-xl flex items-center justify-center gap-3 shadow-lg transition-transform active:scale-95 cursor-pointer ${
          isRecording
            ? "bg-white/10 text-white font-medium"
            : "bg-linear-to-r from-primary to-accent text-black font-bold uppercase tracking-widest hover:scale-[1.02] shadow-primary/20"
        }`}
      >
        <Video className={isRecording ? "w-5 h-5" : "w-6 h-6 fill-black"} />
        {isRecording ? "Restart Take" : "New Take"}
      </button>

      <div className="h-8 w-px bg-white/10 mx-2"></div>

      <button
        onClick={cutTake}
        disabled={!isRecording}
        className={`flex items-center justify-center gap-2 px-6 h-14 rounded-xl glassmorphism border border-white/10 transition-all font-bold uppercase tracking-widest text-sm
            ${isRecording ? "hover:bg-white/20 hover:text-white cursor-pointer" : "opacity-30 cursor-not-allowed"}
          `}
      >
        <Scissors className="w-5 h-5" />
        Cut
      </button>
    </div>
  );
}
