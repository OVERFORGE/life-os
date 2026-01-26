export type PhaseType =
  | "grind"
  | "burnout"
  | "recovery"
  | "slump"
  | "balanced";

export type PhaseResult = {
  phase: PhaseType;
  confidence: number; // 0..1
  metrics: {
    avgSleep: number;
    avgMood: number;
    avgStress: number;
    avgDeepWork: number;
    gymDays: number;
  };
};
