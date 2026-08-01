import { ConfidenceTier } from "./BehaviorPattern";

export type LearningSignalType =
  | "PreferMorning"
  | "AvoidLateMeetings"
  | "ReduceConsecutiveDeepWork"
  | "IncreaseBreakFrequency"
  | "ProtectGymTime"
  | "PrioritizeTopPressureTask";

export interface LearningSignal {
  signalId: string;
  type: LearningSignalType;
  title: string;
  message: string;
  confidence: ConfidenceTier;
  confidenceScore: number;
  evidenceCount: number;
  sourcePatternId: string;
  createdAt: number;
}
