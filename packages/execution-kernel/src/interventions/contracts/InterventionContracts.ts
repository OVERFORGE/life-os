/**
 * InterventionContracts.ts
 * Authoritative contracts for Closed-Loop Intervention & Outcome Learning (Phase 7).
 * Strictly typed, zero any, Artifact F attribution model.
 */

export type AttributionCategory =
  | "EFFECTIVE"
  | "LIKELY_EFFECTIVE"
  | "UNCERTAIN"
  | "INEFFECTIVE"
  | "ADVERSE"
  | "NOT_MEASURABLE";

export interface IMeasurementWindow {
  measurementAt: number;
  observedDelta?: number;
  confoundersDetected?: string[];
  attributionConfidence?: number;
  evaluatedStatus?: AttributionCategory;
  measuredAt?: number;
}

export type InterventionTargetMetric =
  | "task_completion_rate"
  | "stress_reduction"
  | "focus_duration";

export interface IInterventionRecord {
  interventionId: string;
  userId: string;
  triggerType: "PROACTIVE_ENGINE" | "AVEN_CONVERSATION" | "SCHEDULED_DAEMON";
  crossDomainTensionId?: string;
  stateBefore: {
    lifeState: string;
    cognitiveLoad: number;
    goalPressure: number;
  };
  proposedAction: {
    capabilityURN: string;
    parameters: Record<string, unknown>;
  };
  expectedOutcome: {
    targetMetric: InterventionTargetMetric;
    expectedDelta: number;
  };
  executedAt: number;
  windows: {
    t4h: IMeasurementWindow;
    t24h: IMeasurementWindow;
  };
  learningImplicationRecorded: boolean;
  userFeedback?: "THUMBS_UP" | "THUMBS_DOWN" | "NEUTRAL";
}

export interface CreateInterventionInput {
  userId: string;
  triggerType: "PROACTIVE_ENGINE" | "AVEN_CONVERSATION" | "SCHEDULED_DAEMON";
  crossDomainTensionId?: string;
  stateBefore: {
    lifeState: string;
    cognitiveLoad: number;
    goalPressure: number;
  };
  proposedAction: {
    capabilityURN: string;
    parameters: Record<string, unknown>;
  };
  expectedOutcome: {
    targetMetric: InterventionTargetMetric;
    expectedDelta: number;
  };
  executedAt?: number;
}

export interface VerificationBatchResult {
  t4hEvaluatedCount: number;
  t24hEvaluatedCount: number;
  effectiveCount: number;
  ineffectiveCount: number;
  adverseCount: number;
  durationMs: number;
}
