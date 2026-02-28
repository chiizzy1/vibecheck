import { useEffect } from "react";
import { useCallStateHooks } from "@stream-io/video-react-sdk";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  takeCount: number;
  isRecording: boolean;
  recordingTime: number;
  formatTime: (ms: number) => string;
}

export function VideoFeed({ videoRef, takeCount, isRecording, recordingTime, formatTime }: Props) {
  const { useLocalParticipant } = useCallStateHooks();
  const localParticipant = useLocalParticipant();

  useEffect(() => {
    if (!localParticipant?.videoStream || !videoRef.current) return;
    videoRef.current.srcObject = localParticipant.videoStream;
  }, [localParticipant?.videoStream, videoRef]);

  return (
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
        <div className="absolute top-6 right-6 z-20">
          <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-red-500/20 border border-red-500/40 backdrop-blur-md">
            <span className="size-3 rounded-full bg-red-600 animate-pulse-red shadow-[0_0_12px_rgba(239,68,68,0.8)]"></span>
            <span className="text-sm font-bold font-mono tracking-tighter text-red-500 uppercase">
              REC {formatTime(recordingTime)}
            </span>
          </div>
        </div>
      )}

      {/* Focus Brackets Overlay */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
        <div className="size-64 sm:size-80 md:size-96 border-2 border-primary/10 rounded-lg relative">
          <div className="absolute top-0 left-0 size-8 border-t-2 border-l-2 border-primary/50 rounded-tl-lg"></div>
          <div className="absolute top-0 right-0 size-8 border-t-2 border-r-2 border-primary/50 rounded-tr-lg"></div>
          <div className="absolute bottom-0 left-0 size-8 border-b-2 border-l-2 border-primary/50 rounded-bl-lg"></div>
          <div className="absolute bottom-0 right-0 size-8 border-b-2 border-r-2 border-primary/50 rounded-br-lg"></div>
        </div>
      </div>
    </div>
  );
}
