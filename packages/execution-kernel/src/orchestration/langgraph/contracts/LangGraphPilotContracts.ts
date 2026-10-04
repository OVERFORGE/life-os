/**
 * LangGraph Pilot Contracts (Phase 10)
 * 
 * Formal definitions for the controlled LangGraph pilot and head-to-head benchmark.
 * Constitutional Rule 7: LangGraph is an experiment, not the brain.
 * It belongs strictly to the Intelligence tier and never owns truth or executes side effects directly.
 */

import { ActionProposal } from "../../contracts/ActionProposalContracts";

export interface IDeliberativePlanResult {
  executionId: string;
  userId: string;
  proposedActionSequence: ActionProposal[];
  synthesisRationale: string;
  interruptedForHITL: boolean;
  checkpointId?: string;
  recursionLimitHit?: boolean;
  cycleDetected?: boolean;
  metrics: {
    stepCount: number;
    durationMs: number;
    memoryDeltaMb: number;
    tokenCount?: number;
  };
}

export interface IBenchmarkMetrics {
  framework: "NATIVE_REACT" | "LANGGRAPH";
  requestCount: number;
  avgDurationMs: number;
  p95DurationMs: number;
  avgMemoryDeltaMb: number;
  planValidityRate: number;      // 0.0 - 1.0 (Topological correctness)
  determinismRate: number;       // 0.0 - 1.0 (Consistency across runs)
  hitlResumptionSuccessRate: number;
  recursionSafetyPassRate: number;
}

export type PilotDecisionOutcome =
  | "OUTCOME_A_REJECT_KEEP_NATIVE"
  | "OUTCOME_B_ADOPT_LIMITED_DELIBERATIVE"
  | "OUTCOME_C_ADOPT_BROADER";

export interface IPilotEvaluationReport {
  evaluatedAt: number;
  benchmarkRuns: number;
  nativeMetrics: IBenchmarkMetrics;
  langgraphMetrics: IBenchmarkMetrics;
  decisionOutcome: PilotDecisionOutcome;
  rationale: string;
  tenDimensionalScores: Record<string, { native: number; langgraph: number; winner: "NATIVE" | "LANGGRAPH" | "TIE" }>;
}
