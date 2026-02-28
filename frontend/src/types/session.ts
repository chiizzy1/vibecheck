import type { Mode } from "../App";

export interface TakeBlob {
  takeNumber: number;
  blob: Blob;
  duration: number;
}

export interface TakeScore {
  take_number: number;
  eye_contact_pct: number;
  energy_score: number;
  smile_count: number;
  duration_seconds: number;
  composite_score: number;
}

export interface SessionResults {
  topic: string;
  mode: Mode;
  takes: TakeScore[];
  aesthetic: string;
  caption: { caption: string; hashtags: string; tip: string } | null;
}

export interface TakeInsight {
  take: number;
  score: number;
  strengths: string[];
  weaknesses: string[];
  is_best: boolean;
}

export interface DirectorsCut {
  status: string;
  total_takes?: number;
  insights: TakeInsight[];
  verdict: string;
  next_take_advice?: string;
  best_take?: number;
  highlight_reel?: {
    best_eye_contact: { take: number; value: number };
    best_energy: { take: number; value: number };
    most_smiles: { take: number; value: number };
  };
}

export interface LiveStats {
  eye_contact_pct: number;
  energy_score: number;
  smile_count: number;
  aesthetic: string;
  takes: number;
}
