/**
 * Execution Trace Contracts — Phase 1.7 V2
 *
 * ExecutionTrace is the execution record for a single simulation step.
 * Stages reference artifact IDs only — NO embedded payloads.
 * Independently reconstructable: contains runUid + stepNumber directly.
 */

import { KernelFailureDetail } from "../../integration/contracts/kernelResultContracts";

export const EXECUTION_TRACE_SCHEMA_VERSION = "1.0.0" as const;

export type ExecutionStageStatus = "SUCCESS" | "FAILED" | "SKIPPED";

/**
 * Canonical ordered stage names for every simulation step.
 */
export type ExecutionStageName =
  | "RUNTIME_SNAPSHOT_LOADED"
  | "PERSONA_LOADED"
  | "PROMPT_BUILT"
  | "LLM_REQUEST"
  | "DECISION_PARSED"
  | "VIRTUAL_USER_REQUEST_BUILT"
  | "KERNEL_ADAPTER"
  | "KERNEL_INVOCATION"
  | "RUNTIME_ADVANCED"
  | "SNAPSHOT_PERSISTED";

/**
 * A single execution stage record.
 *
 * - inputArtifactId / outputArtifactId reference sim_artifacts documents.
 * - No payload is embedded here.
 * - startedAt / finishedAt enable latency waterfall visualization.
 */
export interface ExecutionStage {
  /** 1-based ordering within this trace */
  order: number;
  name: ExecutionStageName;
  status: ExecutionStageStatus;

  /** References to sim_artifacts (null for stages with no associated artifact) */
  inputArtifactId: string | null;
  outputArtifactId: string | null;

  /** Wall-clock timestamps in ms (for latency analysis) */
  startedAt: number;
  finishedAt: number;
  durationMs: number;

  notes?: string;
  failure?: KernelFailureDetail | Record<string, unknown>;
}


/**
 * Operational metrics describing only the observability recording pipeline itself.
 * NOT execution metrics — belongs only to SimulationExecutionTrace.
 */
export interface RecorderMetrics {
  artifactCount: number;
  repositoryWrites: number;
  transactionDurationMs: number;
  persistDurationMs: number;
  postHookDurationMs: number;
}

/**
 * Canonical immutable execution trace.
 *
 * - traceId is deterministic: `TRC_{runUid}_{stepNumber}`
 * - Append-only: never updated, never overwritten.
 * - Contains runUid + stepNumber for independent reconstruction.
 */
export interface SimulationExecutionTrace {
  /** Schema version for future migration */
  schemaVersion: typeof EXECUTION_TRACE_SCHEMA_VERSION;

  /** Deterministic ID: TRC_{runUid}_{stepNumber} */
  traceId: string;

  /** Parent run UID */
  runUid: string;

  /** Parent step number */
  stepNumber: number;

  /** Virtual clock minute when step execution began */
  startedAtVirtualMinute: number;

  /** Virtual clock minute when step execution completed */
  finishedAtVirtualMinute: number;

  /** Ordered execution stage records */
  stages: ExecutionStage[];

  summary: {
    success: boolean;
    totalDurationMs: number;
    kernelInvoked: boolean;
    decisionGenerated: boolean;
    snapshotPersisted: boolean;
  };

  /** Operational recording performance metrics (belong ONLY to trace) */
  recorderMetrics?: RecorderMetrics;
}

