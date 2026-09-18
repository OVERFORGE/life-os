/**
 * ExecutionTraceBuilder — Phase 1.7 V2
 *
 * Stateful builder for a single SimulationExecutionTrace.
 * Used within one step execution — instantiated fresh per step.
 * No I/O, no side effects, no imports from persistence layer.
 *
 * Each stage records artifact ID refs (not payloads) and wall-clock timestamps.
 */

import {
  SimulationExecutionTrace,
  ExecutionStage,
  ExecutionStageName,
  ExecutionStageStatus,
  RecorderMetrics,
  EXECUTION_TRACE_SCHEMA_VERSION,
} from "../contracts/executionTraceContracts";

import { KernelFailureDetail } from "../../integration/contracts/kernelResultContracts";

export function buildTraceId(runUid: string, stepNumber: number): string {
  return `TRC_${runUid}_${stepNumber}`;
}

export interface RecordStageOptions {
  inputArtifactId?: string | null;
  outputArtifactId?: string | null;
  notes?: string;
  failure?: KernelFailureDetail | Record<string, unknown>;
}

export class ExecutionTraceBuilder {
  private stages: ExecutionStage[] = [];
  private stepStartWallMs: number;
  private recorderMetrics?: RecorderMetrics;

  constructor(
    private readonly runUid: string,
    private readonly stepNumber: number,
    private readonly startedAtVirtualMinute: number
  ) {
    this.stepStartWallMs = Date.now();
  }

  /** Set operational metrics for the recorder pipeline itself */
  public setRecorderMetrics(metrics: RecorderMetrics): void {
    this.recorderMetrics = metrics;
  }

  /**
   * Record a completed execution stage.
   * Timestamps are captured at call time — caller should call this immediately after the stage completes.
   */
  recordStage(
    name: ExecutionStageName,
    status: ExecutionStageStatus,
    startedAt: number,
    opts: RecordStageOptions = {}
  ): void {
    const finishedAt = Date.now();
    this.stages.push({
      order: this.stages.length + 1,
      name,
      status,
      inputArtifactId: opts.inputArtifactId ?? null,
      outputArtifactId: opts.outputArtifactId ?? null,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      notes: opts.notes,
      ...(opts.failure ? { failure: opts.failure } : {}),
    });
  }

  /**
   * Builds and returns the immutable SimulationExecutionTrace.
   * Call this after all stages have been recorded.
   */
  build(finishedAtVirtualMinute: number): SimulationExecutionTrace {
    const totalDurationMs = Date.now() - this.stepStartWallMs;
    const kernelInvoked = this.stages.some((s) => s.name === "KERNEL_INVOCATION");
    const decisionGenerated = this.stages.some((s) => s.name === "DECISION_PARSED" && s.status === "SUCCESS");
    const snapshotPersisted = this.stages.some((s) => s.name === "SNAPSHOT_PERSISTED" && s.status === "SUCCESS");
    const anyFailed = this.stages.some((s) => s.status === "FAILED");

    return {
      schemaVersion: EXECUTION_TRACE_SCHEMA_VERSION,
      traceId: buildTraceId(this.runUid, this.stepNumber),
      runUid: this.runUid,
      stepNumber: this.stepNumber,
      startedAtVirtualMinute: this.startedAtVirtualMinute,
      finishedAtVirtualMinute,
      stages: [...this.stages],
      summary: {
        success: !anyFailed,
        totalDurationMs,
        kernelInvoked,
        decisionGenerated,
        snapshotPersisted,
      },
      ...(this.recorderMetrics ? { recorderMetrics: this.recorderMetrics } : {}),
    };
  }
}

