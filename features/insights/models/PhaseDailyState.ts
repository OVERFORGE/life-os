import { Schema, model, models } from "mongoose";

const PhaseDailyStateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    date: { type: String, required: true }, // yyyy-mm-dd

    candidatePhase: { type: String, required: true },
    confidence: { type: Number, required: true },
  },
  { timestamps: true }
);

PhaseDailyStateSchema.index({ userId: 1, date: 1 }, { unique: true });

export const PhaseDailyState =
  models.PhaseDailyState || model("PhaseDailyState", PhaseDailyStateSchema);
