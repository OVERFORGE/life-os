import { Schema, model, models } from "mongoose";

const PhaseHistorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    phase: { type: String, required: true },

    startDate: { type: String, required: true },
    endDate: { type: String }, 

    reason: { type: String },

    snapshot: {
      avgMood: Number,
      avgEnergy: Number,
      avgStress: Number,
      avgSleep: Number,
      workIntensity: Number,
      consistency: Number,
    },
  },
  { timestamps: true }
);

export const PhaseHistory =
  models.PhaseHistory || model("PhaseHistory", PhaseHistorySchema);
