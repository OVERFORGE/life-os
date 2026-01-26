import mongoose from "mongoose";

const GoalStatsSchema = new mongoose.Schema(
  {
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      unique: true,
    },

    currentScore: Number,

    state: {
      type: String,
      enum: ["on_track", "slow", "drifting", "stalled", "recovering"],
    },

    momentum: {
      type: String,
      enum: ["up", "down", "flat"],
    },

    bestScoreEver: Number,
    bestStreakEver: Number,

    currentStreak: Number,
    daysSinceProgress: Number,

    lastEvaluatedAt: Date,
  },
  { timestamps: true }
);

export const GoalStats =
  mongoose.models.GoalStats || mongoose.model("GoalStats", GoalStatsSchema);
