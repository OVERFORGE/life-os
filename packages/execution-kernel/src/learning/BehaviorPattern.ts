export type PatternType =
  | "PreferredWorkWindow"
  | "PreferredRoutine"
  | "CommonDelayReason"
  | "FrequentlySkippedTask"
  | "HighFocusPeriod"
  | "RecoveryPattern"
  | "ExecutionRhythm";

export type ConfidenceTier = "Low" | "Moderate" | "High" | "Stable";

export interface BehaviorPattern {
  patternId: string;
  type: PatternType;
  title: string;
  description: string;
  confidence: ConfidenceTier;
  confidenceScore: number; // 0.0 to 1.0
  evidenceCount: number;
  firstObserved: number;
  lastObserved: number;
  evidenceDetails: string[];
  metadata?: Record<string, any>;
}
