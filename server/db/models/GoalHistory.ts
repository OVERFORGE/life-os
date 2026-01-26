import { Schema, model, models } from "mongoose";

const GoalHistorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    goalId: { type: Schema.Types.ObjectId, ref: "Goal", required: true },

    date: { type: String, required: true }, // YYYY-MM-DD
    score: { type: Number, required: true },
    state: { type: String, required: true },
  },
  { timestamps: true }
);

GoalHistorySchema.index({ goalId: 1, date: 1 }, { unique: true });

export const GoalHistory =
  models.GoalHistory || model("GoalHistory", GoalHistorySchema);
