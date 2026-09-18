import mongoose, { Schema, model, models } from "mongoose";
import { EXECUTION_TRACE_SCHEMA_VERSION } from "@/simulation/execution/contracts/executionTraceContracts";

/**
 * SimulationExecutionTraceModel Mongoose Model — Phase 1.7 V2
 *
 * Collection: sim_execution_traces
 * Append-only. Never updated. Never overwritten.
 * Each document holds the execution stage sequence for one simulation step.
 * Stages reference artifact IDs only — no embedded payloads.
 */
const ExecutionStageSchema = new Schema(
  {
    order:              { type: Number, required: true },
    name:               { type: String, required: true },
    status:             { type: String, required: true, enum: ["SUCCESS", "FAILED", "SKIPPED"] },
    inputArtifactId:    { type: String, default: null },
    outputArtifactId:   { type: String, default: null },
    startedAt:          { type: Number, required: true },
    finishedAt:         { type: Number, required: true },
    durationMs:         { type: Number, required: true },
    notes:              { type: String, default: undefined },
    failure:            { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false }
);

const TraceSummarySchema = new Schema(
  {
    success:            { type: Boolean, required: true },
    totalDurationMs:    { type: Number, required: true },
    kernelInvoked:      { type: Boolean, required: true },
    decisionGenerated:  { type: Boolean, required: true },
    snapshotPersisted:  { type: Boolean, required: true },
  },
  { _id: false }
);

const RecorderMetricsSchema = new Schema(
  {
    artifactCount:         { type: Number, required: true },
    repositoryWrites:      { type: Number, required: true },
    transactionDurationMs: { type: Number, required: true },
    persistDurationMs:     { type: Number, required: true },
    postHookDurationMs:    { type: Number, required: true },
  },
  { _id: false }
);

const SimulationExecutionTraceSchema = new Schema(
  {
    schemaVersion:            { type: String, required: true, default: EXECUTION_TRACE_SCHEMA_VERSION },
    traceId:                  { type: String, required: true },
    runUid:                   { type: String, required: true },
    stepNumber:               { type: Number, required: true },
    startedAtVirtualMinute:   { type: Number, required: true },
    finishedAtVirtualMinute:  { type: Number, required: true },
    stages:                   { type: [ExecutionStageSchema], required: true },
    summary:                  { type: TraceSummarySchema, required: true },
    recorderMetrics:          { type: RecorderMetricsSchema, required: false },
  },

  {
    timestamps: true,
    collection: "sim_execution_traces",
  }
);

SimulationExecutionTraceSchema.index({ traceId: 1 }, { unique: true });
SimulationExecutionTraceSchema.index({ runUid: 1, stepNumber: 1 }, { unique: true });

export const SimulationExecutionTraceModel =
  models.SimulationExecutionTrace ||
  model("SimulationExecutionTrace", SimulationExecutionTraceSchema);
