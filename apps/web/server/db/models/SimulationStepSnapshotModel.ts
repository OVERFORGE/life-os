import mongoose, { Schema, model, models } from "mongoose";
import { STEP_SNAPSHOT_SCHEMA_VERSION } from "@/simulation/execution/contracts/snapshotContracts";
import { KernelFailureCategory } from "@/simulation/integration/contracts/kernelResultContracts";

/**
 * SimulationStepSnapshotModel Mongoose Model — Phase 1.7 V2
 *
 * Collection: sim_step_snapshots
 * Append-only. Never updated. Never overwritten.
 * Each document is a canonical state record for one simulation step.
 * Contains cross-references (artifact IDs) only — no embedded payloads.
 *
 * NOTE: This is separate from the legacy SimulationSnapshot collection.
 */
const SnapshotMetadataSchema = new Schema(
  {
    kernelVersion:   { type: String, required: true },
    pipelineVersion: { type: String, required: true },
    llmProvider:     { type: String, required: true },
    llmModel:        { type: String, required: true },
  },
  { _id: false }
);

const VALID_FAILURE_CATEGORIES = [null, ...Object.values(KernelFailureCategory)];

const SimulationStepSnapshotSchema = new Schema(
  {
    schemaVersion:            { type: String, required: true, default: STEP_SNAPSHOT_SCHEMA_VERSION },
    snapshotId:               { type: String, required: true },
    runUid:                   { type: String, required: true },
    stepNumber:               { type: Number, required: true },
    tick:                     { type: Number, required: true },
    virtualDay:               { type: Number, required: true },
    virtualMinute:            { type: Number, required: true },
    timestampVirtual:         { type: String, required: true },
    personaId:                { type: String, required: true },
    personaCode:              { type: String, required: true },
    decisionIntent:           { type: String, required: true },
    executionStatus:          { type: String, required: true, enum: ["SUCCESS", "FAILED", "PARTIAL", "SKIPPED", "ABORTED"] },
    kernelSuccess:            { type: Boolean, required: true },
    failureCategory:          { type: String, default: null, enum: VALID_FAILURE_CATEGORIES },
    executionDurationMs:      { type: Number, required: true, default: 0 },
    worldHash:                { type: String, default: null },
    diffHash:                 { type: String, default: null },
    previousSnapshotId:       { type: String, default: null },
    traceId:                  { type: String, required: true },
    promptArtifactId:         { type: String, required: true },
    llmResponseArtifactId:    { type: String, required: true },
    decisionArtifactId:       { type: String, required: true },
    virtualRequestArtifactId: { type: String, required: true },
    handleInputArtifactId:    { type: String, required: true },
    kernelResultArtifactId:   { type: String, required: true },
    worldBeforeArtifactId:    { type: String, default: null },
    worldAfterArtifactId:     { type: String, default: null },
    diagnosticsArtifactId:    { type: String, default: null },
    metadata:                 { type: SnapshotMetadataSchema, required: true },
  },

  {
    timestamps: true,
    collection: "sim_step_snapshots",
  }
);

SimulationStepSnapshotSchema.index({ snapshotId: 1 }, { unique: true });
SimulationStepSnapshotSchema.index({ runUid: 1, stepNumber: 1 }, { unique: true });
SimulationStepSnapshotSchema.index({ runUid: 1 });

export const SimulationStepSnapshotModel =
  models.SimulationStepSnapshot ||
  model("SimulationStepSnapshot", SimulationStepSnapshotSchema);
