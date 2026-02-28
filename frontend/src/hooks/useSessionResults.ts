import useSWR from "swr";
import type { SessionResults, DirectorsCut } from "../types/session";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch data");
    return res.json();
  });

export function useSessionResults(callId: string | null) {
  // Fetch main results
  const {
    data: results,
    error: resultsError,
    isLoading: resultsLoading,
  } = useSWR<SessionResults>(callId ? `${API_URL}/session/results/${callId}` : null, fetcher);

  // Fetch director's cut in parallel
  const {
    data: directorsCut,
    error: directorsCutError,
    isLoading: directorsCutLoading,
  } = useSWR<DirectorsCut>(callId ? `${API_URL}/session/directors-cut/${callId}` : null, fetcher);

  return {
    results: results ?? null,
    directorsCut: directorsCut ?? null,
    isLoading: resultsLoading || directorsCutLoading,
    isError: !!resultsError || !!directorsCutError,
  };
}
