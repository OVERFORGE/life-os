import mongoose, { Schema, model, models } from "mongoose";

const SimulationSnapshotSchema = new Schema(
  {
    runId: {
      type: Schema.Types.ObjectId,
      ref: "SimulationRun",
      required: true,
      index: true,
    },
    step: { type: Number, required: true, index: true },
    timestamp: { type: Date, default: Date.now },
    
    // Captured state dictionary
    state: { type: Schema.Types.Mixed, required: true },
    
    // Hash for determinism auditing
    hash: { type: String, default: "" },
    snapshotHash: { type: String, required: true, index: true },
    
    // Target kernel version at snapshot creation
    kernelVersion: { type: String, default: "v2.4.0-deterministic" },
  },
  { timestamps: true }
);

SimulationSnapshotSchema.index({ runId: 1, step: 1 }, { unique: true });

export const SimulationSnapshot =
  models.SimulationSnapshot || model("SimulationSnapshot", SimulationSnapshotSchema);
