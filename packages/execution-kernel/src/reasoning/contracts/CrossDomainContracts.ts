/**
 * CrossDomainContracts.ts
 * Authoritative contracts for Cross-Domain Intelligence & Causal State Reasoning (Phase 6).
 * Strictly typed, zero any, epistemic distinction between correlation and causal evidence.
 */

import { ITemporalValidity } from "../../worldv2/contracts/CognitiveStateContracts";

export type EpistemicLink =
  | "CORRELATION"
  | "ASSOCIATION"
  | "EVIDENCE_SUPPORTED_HYPOTHESIS"
  | "CAUSAL_EVIDENCE";

export type LifeDomain =
  | "health"
  | "productivity"
  | "cognition"
  | "calendar"
  | "goals"
  | "relationships";

export interface CrossDomainFactor {
  domain: LifeDomain;
  metric: string;
  observedValue: number | string | boolean;
  baselineValue: number | string | boolean;
  epistemicStatus: EpistemicLink;
}

export interface CrossDomainInsight {
  insightId: string; // Deterministic: insight-{type}-{timestamp}
  title: string;
  description: string;
  contributingFactors: CrossDomainFactor[];
  tensionScore: number; // 0.0 to 1.0 (Composite multi-domain pressure)
  causalConfidence: number; // 0.0 to 1.0 (Model output)
  recommendedActionURN?: string;
  proposedParameters?: Record<string, unknown>;
  temporalValidity: ITemporalValidity;
}

export interface CrossDomainEvaluationInput {
  userId: string;
  currentTime?: number;
  sleepHours?: number;
  sleepQuality?: number;
  scheduleDensity?: number;
  calendarFragmentation?: number;
  deepWorkHours?: number;
  taskVelocity?: number;
  goalPressureScore?: number;
  trainingStrainScore?: number;
  cognitiveLoadEstimate?: number;
  stressEstimate?: number;
  energyEstimate?: number;
  activeCommitmentsCount?: number;
}
