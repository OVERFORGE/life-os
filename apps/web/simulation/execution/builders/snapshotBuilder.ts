/**
 * SnapshotBuilder — Phase 1.7 V2
 *
 * Pure function that constructs a SimulationStepSnapshot from immutable IDs.
 * No I/O, no side effects, no embedded payloads.
 */

import {
  SimulationStepSnapshot,
  ExecutionStatus,
  STEP_SNAPSHOT_SCHEMA_VERSION,
} from "../contracts/snapshotContracts";
import { KernelFailureCategory } from "../../integration/contracts/kernelResultContracts";
import { formatTimestamp } from "../../engine/clock";

export interface BuildSnapshotParams {
  runUid: string;
  stepNumber: number;
  tick: number;
  virtualDay: number;
  virtualMinute: number;
  personaId: string;
  personaCode: string;
  decisionIntent: string;
  executionStatus?: ExecutionStatus;
  kernelSuccess: boolean;
  failureCategory?: KernelFailureCategory | string | null;
  executionDurationMs?: number;
  traceId: string;
  promptArtifactId: string;
  llmResponseArtifactId: string;
  decisionArtifactId: string;
  virtualRequestArtifactId: string;
  handleInputArtifactId: string;
  kernelResultArtifactId: string;
  worldBeforeArtifactId: string | null;
  worldAfterArtifactId: string | null;
  diagnosticsArtifactId: string | null;
  worldHash?: string;
  diffHash?: string;
  previousSnapshotId?: string | null;
  metadata: {
    kernelVersion: string;
    pipelineVersion: string;
    llmProvider: string;
    llmModel: string;
  };
}

export function buildSnapshotId(runUid: string, stepNumber: number): string {
  return `SNAP_${runUid}_${stepNumber}`;
}

/**
 * Builds a canonical, immutable SimulationStepSnapshot.
 * Contains state + cross-references only. No embedded payload data.
 */
export function buildSnapshot(params: BuildSnapshotParams): SimulationStepSnapshot {
  const executionStatus: ExecutionStatus = params.executionStatus ?? (params.kernelSuccess ? "SUCCESS" : "FAILED");

  return {
    schemaVersion: STEP_SNAPSHOT_SCHEMA_VERSION,
    snapshotId: buildSnapshotId(params.runUid, params.stepNumber),
    runUid: params.runUid,
    stepNumber: params.stepNumber,
    tick: params.tick,
    virtualDay: params.virtualDay,
    virtualMinute: params.virtualMinute,
    timestampVirtual: formatTimestamp(params.virtualDay, params.virtualMinute),
    personaId: params.personaId,
    personaCode: params.personaCode,
    decisionIntent: params.decisionIntent,
    executionStatus,
    kernelSuccess: params.kernelSuccess,
    failureCategory: params.failureCategory ?? null,
    executionDurationMs: params.executionDurationMs ?? 0,
    worldHash: params.worldHash,
    diffHash: params.diffHash,
    previousSnapshotId: params.previousSnapshotId ?? null,
    traceId: params.traceId,
    promptArtifactId: params.promptArtifactId,
    llmResponseArtifactId: params.llmResponseArtifactId,
    decisionArtifactId: params.decisionArtifactId,
    virtualRequestArtifactId: params.virtualRequestArtifactId,
    handleInputArtifactId: params.handleInputArtifactId,
    kernelResultArtifactId: params.kernelResultArtifactId,
    worldBeforeArtifactId: params.worldBeforeArtifactId,
    worldAfterArtifactId: params.worldAfterArtifactId,
    diagnosticsArtifactId: params.diagnosticsArtifactId,
    metadata: params.metadata,
  };
}

