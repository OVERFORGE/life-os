import mongoose, { Schema, model, models } from "mongoose";
import { ARTIFACT_SCHEMA_VERSION } from "@/simulation/execution/contracts/artifactContracts";

/**
 * SimulationArtifact Mongoose Model — Phase 1.7 V2
 *
 * Collection: sim_artifacts
 * Append-only. Never updated. Never overwritten.
 * Each artifact document holds one heavyweight payload from a simulation step.
 */
const SimulationArtifactSchema = new Schema(
  {
    schemaVersion: { type: String, required: true, default: ARTIFACT_SCHEMA_VERSION },

    artifactId:    { type: String, required: true },
    runUid:        { type: String, required: true },
    stepNumber:    { type: Number, required: true },
    kind:          { type: String, required: true },
    payloadType:   { type: String, required: true },
    payloadVersion:{ type: String, required: true, default: "1" },
    payload:       { type: Schema.Types.Mixed, required: true },
    createdAtVirtualMinute: { type: Number, required: true },
  },
  {
    timestamps: true,
    collection: "sim_artifacts",
  }
);

SimulationArtifactSchema.index({ artifactId: 1 }, { unique: true });
SimulationArtifactSchema.index({ runUid: 1, stepNumber: 1 });
SimulationArtifactSchema.index({ runUid: 1, stepNumber: 1, kind: 1 });

export const SimulationArtifactModel =
  models.SimulationArtifact ||
  model("SimulationArtifact", SimulationArtifactSchema);
