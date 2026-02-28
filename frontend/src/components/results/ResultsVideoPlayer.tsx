import { useState, useRef, useEffect } from "react";
import { Play, Film, Download } from "lucide-react";
import { motion } from "framer-motion";
import type { TakeBlob, TakeScore } from "../../types/session";

interface Props {
  activeTakeBlob: TakeBlob | null;
  bestTakeData: TakeScore | null;
  isLoading: boolean;
  formatDuration: (seconds: number) => string;
}

export function ResultsVideoPlayer({ activeTakeBlob, bestTakeData, isLoading, formatDuration }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const activeBlobKey = activeTakeBlob ? `${activeTakeBlob.takeNumber}-${activeTakeBlob.blob.size}` : null;

  useEffect(() => {
    if (!activeTakeBlob || !videoRef.current) return;

    const url = URL.createObjectURL(activeTakeBlob.blob);
    const vid = videoRef.current;
    vid.src = url;
    vid.load();
    vid.onloadeddata = () => {
      vid.currentTime = 0.001;
    };
    vid.onerror = () => console.error("[VC:playback] video element error:", vid.error);
    return () => URL.revokeObjectURL(url);
  }, [activeBlobKey, activeTakeBlob, isLoading]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          console.error("[VC:playback] play() rejected:", e);
          setIsPlaying(false);
        });
    }
  };

  const handleDownload = () => {
    if (!activeTakeBlob) return;
    const url = URL.createObjectURL(activeTakeBlob.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibecheck-take-${activeTakeBlob.takeNumber}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
      <div className="glassmorphism rounded-xl overflow-hidden relative aspect-video group shadow-2xl">
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent z-10"></div>
        {activeTakeBlob ? (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            preload="auto"
            onEnded={() => setIsPlaying(false)}
            onTimeUpdate={(e) => {
              const vid = e.currentTarget;
              if (vid.duration) {
                setCurrentTime(vid.currentTime);
                setDuration(vid.duration);
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
          className={`absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-300 ${
            isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"
          } cursor-pointer`}
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
              {currentTime > 0 || duration > 0
                ? `${formatDuration(currentTime)} / ${formatDuration(duration || activeTakeBlob?.duration || 0)}`
                : "00:00 / 00:00"}
            </span>
          </div>
          <p className="text-sm font-bold uppercase tracking-widest text-primary">
            {bestTakeData ? `Best Take Score: ${bestTakeData.composite_score.toFixed(1)}/10` : "Preview"}
          </p>
        </div>
      </div>

      {/* Download Best Take CTA */}
      <motion.button
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        onClick={handleDownload}
        disabled={!activeTakeBlob}
        className="w-full iridescent-gradient py-4 lg:py-5 rounded-xl text-background-dark font-black text-lg lg:text-xl uppercase tracking-tighter flex items-center justify-center gap-3 shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download className="w-5 h-5 lg:w-6 lg:h-6" />
        Download Best Take
      </motion.button>
    </div>
  );
}
