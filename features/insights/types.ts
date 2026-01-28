
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

export type Phase =
  | "grind"
  | "burnout"
  | "recovery"
  | "slump"
  | "balanced"
  | "drifting";

export type PhaseShape =
  | "plateau"
  | "wobble"
  | "overextension"
  | "recovery_arc"
  | "crash"
  | "unknown";

export type ShapedPhaseSegment = {
  from: string;
  to: string;
  phases: Phase[];
  shape: PhaseShape;
  explanation: string;
};




export type LifeDirection = "up" | "down" | "flat" | "chaotic";

export type LifeEra = {
  id: string;
  from: string;
  to: string | null;

  phases: {
    phase: Phase;
    startDate: string;
    endDate: string | null;
    durationDays: number;
    confidence: number;
    snapshot?: any;
  }[];

  dominantPhase: Phase;

  direction: LifeDirection;
  volatility: number;   // 0 → 1
  stability: number;    // 0 → 1
  confidence: number;   // 0 → 1

  summaryVector: {
    avgMood: number;
    avgEnergy: number;
    avgStress: number;
    avgSleep: number;
    avgDeepWork: number;
  };
};
