/**
 * Snapshot Contracts — Phase 1.7 V2
 *
 * SimulationStepSnapshot is the canonical state record for a single simulation step.
 * It is a pure state document — no payloads, no traces, no journals embedded.
 * All heavyweight content is referenced via artifact IDs.
 */

import { KernelFailureCategory } from "../../integration/contracts/kernelResultContracts";

export const STEP_SNAPSHOT_SCHEMA_VERSION = "1.0.0" as const;

export type ExecutionStatus = "SUCCESS" | "FAILED" | "PARTIAL" | "SKIPPED" | "ABORTED";

/**
 * Canonical immutable simulation step snapshot.
 *
 * - snapshotId is deterministic: `SNAP_{runUid}_{stepNumber}`
 * - Append-only: never updated, never overwritten.
 * - Contains ONLY state and cross-references — no embedded payloads.
 * - All artifact IDs reference documents in sim_artifacts collection.
 */
export interface SimulationStepSnapshot {
  /** Schema version for future migration */
  schemaVersion: typeof STEP_SNAPSHOT_SCHEMA_VERSION;

  /** Deterministic ID: SNAP_{runUid}_{stepNumber} */
  snapshotId: string;

  /** Parent run UID — for independent reconstruction */
  runUid: string;

  /** Monotonic step counter within the run */
  stepNumber: number;

  /** Simulation clock tick at this step */
  tick: number;

  virtualDay: number;
  virtualMinute: number;

  /** Human-readable: "Day 1 • 09:00" */
  timestampVirtual: string;

  personaId: string;
  personaCode: string;

  /** Quick-access summary fields (avoid loading artifacts for list views) */
  decisionIntent: string;

  /** Canonical execution status */
  executionStatus: ExecutionStatus;
  /** Kept for backward compatibility */
  kernelSuccess: boolean;
  /** Duplicated for quick indexing/reporting without loading KernelResult artifact */
  failureCategory: KernelFailureCategory | string | null;
  /** Total step execution duration in ms (mirrors trace duration) */
  executionDurationMs: number;

  /** Cryptographic hashes for replay verification */
  worldHash?: string;
  diffHash?: string;
  previousSnapshotId?: string | null;

  /** Cross-reference to the execution trace document */
  traceId: string;

  /** Cross-references to sim_artifacts — NO embedded payloads */
  promptArtifactId: string;
  llmResponseArtifactId: string;
  decisionArtifactId: string;
  virtualRequestArtifactId: string;
  handleInputArtifactId: string;
  kernelResultArtifactId: string;
  worldBeforeArtifactId: string | null;
  worldAfterArtifactId: string | null;
  diagnosticsArtifactId: string | null;

  /** Kernel and pipeline version metadata */
  metadata: {
    kernelVersion: string;
    pipelineVersion: string;
    llmProvider: string;
    llmModel: string;
  };
}

