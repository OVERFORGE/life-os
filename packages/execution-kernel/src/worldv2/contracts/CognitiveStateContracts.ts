/**
 * CognitiveStateContracts.ts
 * Authoritative contracts for Passive Cognitive & Mental State Estimation (Phase 3).
 * Strictly typed, zero any, probabilistic evidence model with explicit provenance.
 */

import { IEvidenceProvenance } from "../../telemetry/contracts/ObservationEventContracts";

export interface ITemporalValidity {
  validFrom: number;
  validUntil: number; // TTL timestamp (e.g. valid for 4 hours)
  freshnessTimestamp: number;
}

export interface CognitiveDimension {
  estimate: number;   // 0.0 to 1.0 (Model Output, strictly bounded)
  confidence: number; // 0.0 to 1.0 (Epistemic Metadata)
  evidenceBundle: IEvidenceProvenance[];
  primaryFactors: string[];
}

export type CognitiveProvenanceType = "PASSIVE_INFERENCE" | "USER_MICRO_CHECKIN" | "HYBRID";

export interface CognitiveStateEstimate {
  userId: string;
  timestamp: number;
  stress: CognitiveDimension;
  energy: CognitiveDimension;
  cognitiveLoad: CognitiveDimension;
  focusReadiness: CognitiveDimension;
  provenance: CognitiveProvenanceType;
  temporalValidity: ITemporalValidity;
  requiresMicroCheckin: boolean; // True if key confidence < 0.70 and within budget
  checkinPrompt?: string;
  disclaimer: "Operational readiness estimate only; not a medical assessment.";
}

export interface UserMicroCheckinInput {
  userId: string;
  timestamp: number;
  perceivedEnergy?: number; // 0.0 to 1.0
  perceivedStress?: number; // 0.0 to 1.0
  note?: string;
}

export interface MicroCheckinEvaluationResult {
  shouldTrigger: boolean;
  reason?: string;
  prompt?: string;
  options?: Array<{ label: string; value: number }>;
}
