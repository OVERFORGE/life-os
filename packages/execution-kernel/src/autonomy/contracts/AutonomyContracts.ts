/**
 * Autonomy Contracts (Phase 15)
 * 
 * Defines schemas for controlled Level 5 autonomous execution,
 * compensation contracts, user autonomy grants, and audit records.
 * 
 * CONSTITUTIONAL INVARIANT:
 * "Confidence is epistemic information, not execution authorization."
 * Only LOW risk, REVERSIBLE_EXACT capabilities with exact compensation
 * contracts may EVER execute under Level 5.
 */

export interface ICompensationContract {
  capabilityURN: string;
  parameters: Record<string, unknown>;
  expectedReversionEffect: string;
}

export interface IAutonomousExecutionRecord {
  executionId: string;
  userId: string;
  capabilityURN: string;
  parameters: Record<string, unknown>;
  riskClass: "LOW"; // Strictly LOW risk
  reversibility: "REVERSIBLE_EXACT";
  externalSideEffectClass: "NONE" | "REVERSIBLE_EXTERNAL";
  providerGuarantee: "ATOMIC" | "IDEMPOTENT_RETRY";
  policyRuleId: string;
  epistemicConfidence: number; // Epistemic metadata only; NOT an authorization gate
  rationale: string;
  compensationAction: ICompensationContract;
  executedAt: number;
  undoneAt?: number;
  userFeedback?: "APPROVED" | "REVERSED";
  stateSnapshotBefore?: Record<string, unknown>;
}

export interface IUserAutonomyGrant {
  userId: string;
  maxAutonomyLevel: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  allowedCapabilities: string[]; // Specific whitelisted URNs enabled for L5
  retentionWindowMs: number;     // Policy default: 24h (86,400,000 ms)
  updatedAt: number;
}
