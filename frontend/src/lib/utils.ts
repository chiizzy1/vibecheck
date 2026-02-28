/**
 * Formats milliseconds into an MM:SS string
 */
export function formatTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Formats seconds into an Mm Ss string
 */
export function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}
