/**
 * Mental State Bayesian Fusion Integration Contract
 * 
 * Invariant 16: Facts and probabilistic estimates remain epistemically separate.
 * Invariant 22: Future Mental State inference can plug in without rewriting Supervisor.
 */

export type MentalEvidenceCategory =
  | "passive_sleep"
  | "linguistic_sentiment"
  | "postponement_velocity"
  | "schedule_density"
  | "session_behavior"
  | "morning_activation"
  | "acute_life_event"
  | "explicit_user_input"
  | "circadian_anomaly"
  | "multivariate_fusion";

export interface MentalStateEvidence {
  category: MentalEvidenceCategory;
  source: string;
  timestamp: number;
  rawSignal: Record<string, any>;
  confidence: number; // 0.0 - 1.0 (strict evidence provenance)
  decayHalflifeHours?: number; // For acute life events and transient shocks
}

export interface MentalStateEstimate {
  stateLabel: string; // e.g., "Recovery", "Flow", "Fatigued", "Stable"
  confidence: number; // 0.0 - 1.0
  dimensions: {
    energy: number;   // 1 - 10
    focus: number;    // 1 - 10
    mood: number;     // 1 - 10
    stress: number;   // 1 - 10
    anxiety: number;  // 1 - 10
  };
  evidenceProvenance: MentalStateEvidence[];
  projection: {
    cognitiveCapacityScore: number; // 0.0 - 1.0 (normalized for Productivity projection)
    recommendedMaxFocusHours: number;
    restDayRecommended: boolean;
  };
}

export interface IMentalStateInferenceEngine {
  inferState(evidence: MentalStateEvidence[]): Promise<MentalStateEstimate>;
}
