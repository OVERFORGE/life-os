import mongoose, { Schema, model, models } from "mongoose";

const SimulationEventSchema = new Schema(
  {
    runId: {
      type: Schema.Types.ObjectId,
      ref: "SimulationRun",
      required: true,
      index: true,
    },
    step: { type: Number, required: true },
    
    eventType: {
      type: String,
      enum: [
        "action_executed",
        "state_changed",
        "external_trigger",
        "chaos_injected",
        "assertion_evaluated",
      ],
      required: true,
    },
    
    payload: { type: Schema.Types.Mixed, default: {} },
    result: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

SimulationEventSchema.index({ runId: 1, step: 1 });

export const SimulationEvent =
  models.SimulationEvent || model("SimulationEvent", SimulationEventSchema);
