import mongoose from "mongoose";

const GoalStatsSchema = new mongoose.Schema(
  {
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      unique: true,
    },

    currentScore: Number,

    nature: {
      type: String,
      enum: ["finite_deliverable", "habitual_cadence"],
      default: "habitual_cadence",
    },

    deliverableProgressPercent: {
      type: Number,
      min: 0,
      max: 100,
    },
    completedMilestonesCount: { type: Number, default: 0 },
    totalMilestonesCount: { type: Number, default: 0 },
    completedTasksCount: { type: Number, default: 0 },
    totalTasksCount: { type: Number, default: 0 },

    state: {
      type: String,
      enum: ["on_track", "slow", "drifting", "stalled", "recovering", "completed"],
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
