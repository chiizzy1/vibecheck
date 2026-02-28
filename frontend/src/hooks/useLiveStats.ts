import useSWR from "swr";
import type { LiveStats } from "../types/session";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch live stats");
    return res.json();
  });

export function useLiveStats(callId: string | null) {
  const { data, error, isLoading } = useSWR<LiveStats>(callId ? `${API_URL}/session/live/${callId}` : null, fetcher, {
    refreshInterval: 2000, // Poll every 2 seconds
    revalidateOnFocus: true,
    errorRetryCount: 3,
  });

  return {
    liveStats: data ?? {
      eye_contact_pct: 0,
      energy_score: 0,
      smile_count: 0,
      aesthetic: "",
      takes: 0,
    },
    isLoading,
    isError: !!error,
  };
}
