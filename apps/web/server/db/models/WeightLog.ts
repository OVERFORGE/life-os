import { Schema, model, models } from "mongoose";

const WeightLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    weight: { type: Number, required: true }, // Stored in KGs by default 
    date: { type: String, required: true }, // YYYY-MM-DD local active date
    deletedAt: { type: Date, default: null },

    // Optimistic Concurrency & Outbox Fencing
    version: { type: Number, default: 0 },
    mutationEpoch: { type: Number, default: 0 },
    recentMutationReceipts: { type: [Object], default: [] },
  },
  { timestamps: true }
);

// Compound index to ensure 1 log max per day per user
WeightLogSchema.index({ userId: 1, date: 1 }, { unique: true });

export const WeightLog = models.WeightLog || model("WeightLog", WeightLogSchema);
