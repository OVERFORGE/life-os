/**
 * Epistemic Categories for LifeOS Cognitive Orchestration
 * 
 * Invariant 16: Facts and probabilistic estimates remain epistemically separate.
 * Invariant 1: Agents never own authoritative truth.
 */

export type EpistemicCategory =
  | "Fact"          // Authoritative truth from DB / Kernel (e.g., Task dueDate is "2026-09-15")
  | "Observation"   // Recorded historical telemetry (e.g., User postponed 4 tasks this week)
  | "Estimate"      // Probabilistic inference with required confidence score (e.g., Stress score = 8/10, conf: 0.78)
  | "Hypothesis"    // Working theory explaining execution breakdown (e.g., Fatigue debt is causing afternoon delay)
  | "Proposal"      // Candidate action proposed by specialist agent (e.g., Move Task A to Wednesday)
  | "Decision"      // Action approved by Supervisor for execution (e.g., Accepted proposal to reschedule Task A)
  | "KernelResult"  // Concrete execution outcome returned by Kernel (e.g., Task A dueDate updated)
  | "Verification"; // Post-execution check against hard invariants (e.g., No cycles, no deadline violation)

export interface BaseEpistemicRecord<T = any> {
  id: string;
  category: EpistemicCategory;
  source: "Supervisor" | "Productivity" | "Health" | "Wellness" | "Kernel" | "User";
  timestamp: number;
  payload: T;
  causalityRef?: string;
}

export interface FactRecord<T = any> extends BaseEpistemicRecord<T> {
  category: "Fact";
  provenance: "MongoDB" | "WorldModelV2" | "ExecutionGraph";
}

export interface ObservationRecord<T = any> extends BaseEpistemicRecord<T> {
  category: "Observation";
  observedAt: number;
}

export interface EstimateRecord<T = any> extends BaseEpistemicRecord<T> {
  category: "Estimate";
  confidence: number; // 0.0 - 1.0 (Strictly required for probabilistic estimates)
  evidenceSources: string[];
}

export interface HypothesisRecord<T = any> extends BaseEpistemicRecord<T> {
  category: "Hypothesis";
  confidence: number; // 0.0 - 1.0
  falsificationCriteria?: string[];
}

export interface ProposalRecord<T = any> extends BaseEpistemicRecord<T> {
  category: "Proposal";
  domain: "productivity" | "health" | "wellness";
  rationale: string;
  estimatedImpact: "positive" | "neutral" | "negative";
}

export interface DecisionRecord<T = any> extends BaseEpistemicRecord<T> {
  category: "Decision";
  proposalId: string;
  approved: boolean;
  resolutionReason: string;
  appliedPolicyTier: number; // 1 to 6
}

export interface KernelResultRecord<T = any> extends BaseEpistemicRecord<T> {
  category: "KernelResult";
  decisionId: string;
  success: boolean;
  idempotencyKey: string;
  executionStatus: "SUCCEEDED" | "FAILED" | "COMPENSATED";
}

export interface VerificationRecord<T = any> extends BaseEpistemicRecord<T> {
  category: "Verification";
  allHardInvariantsPassed: boolean;
  failedInvariants: string[];
  diagnosticObservations: string[];
}

export type EpistemicRecord =
  | FactRecord
  | ObservationRecord
  | EstimateRecord
  | HypothesisRecord
  | ProposalRecord
  | DecisionRecord
  | KernelResultRecord
  | VerificationRecord;
