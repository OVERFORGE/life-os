/**
 * GoalStatsModel.ts
 * 
 * Derived projection document for Goal Intelligence.
 * Unified canonical model for GoalStats across the entire repository.
 * Supports constituent version tracking and projectionRevision CAS tokens.
 */

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGoalStatsDoc extends Document {
  goalId: string;
  userId: string;
  nature: "finite_deliverable" | "habitual_cadence";
  currentScore: number;
  deliverableProgressPercent: number;
  completedMilestonesCount: number;
  totalMilestonesCount: number;
  completedTasksCount: number;
  totalTasksCount: number;
  state: "on_track" | "slow" | "drifting" | "stalled" | "recovering" | "completed";
  momentum: "up" | "down" | "flat";
  bestScoreEver: number;
  bestStreakEver: number;
  currentStreak: number;
  daysSinceProgress: number;
  derivedFromVersions: {
    goalVersion: number;
    taskVersions: Record<string, number>;
  };
  projectionRevision: number;
  derivedFromCausalSequence?: number;
  lastEventId?: string;
  lastAppliedAt?: Date;
  lastEvaluatedAt?: Date;
  status?: string;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GoalStatsSchema = new Schema<IGoalStatsDoc>(
  {
    goalId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    nature: {
      type: String,
      enum: ["finite_deliverable", "habitual_cadence"],
      default: "habitual_cadence",
    },
    currentScore: {
      type: Number,
      default: 0,
    },
    deliverableProgressPercent: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    completedMilestonesCount: {
      type: Number,
      required: true,
      default: 0,
    },
    totalMilestonesCount: {
      type: Number,
      required: true,
      default: 0,
    },
    completedTasksCount: {
      type: Number,
      required: true,
      default: 0,
    },
    totalTasksCount: {
      type: Number,
      default: 0,
    },
    state: {
      type: String,
      enum: ["on_track", "slow", "drifting", "stalled", "recovering", "completed"],
      default: "on_track",
    },
    momentum: {
      type: String,
      enum: ["up", "down", "flat"],
      default: "flat",
    },
    bestScoreEver: {
      type: Number,
      default: 0,
    },
    bestStreakEver: {
      type: Number,
      default: 0,
    },
    currentStreak: {
      type: Number,
      default: 0,
    },
    daysSinceProgress: {
      type: Number,
      default: 0,
    },
    derivedFromVersions: {
      goalVersion: { type: Number, default: 0 },
      taskVersions: { type: Map, of: Number, default: () => new Map() },
    },
    projectionRevision: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    derivedFromCausalSequence: {
      type: Number,
      default: 0,
      index: true,
    },
    lastEventId: {
      type: String,
      default: "",
    },
    lastAppliedAt: {
      type: Date,
      default: Date.now,
    },
    lastEvaluatedAt: {
      type: Date,
    },
    status: {
      type: String,
      default: "active",
    },
    archivedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

GoalStatsSchema.index({ userId: 1 });
GoalStatsSchema.index({ goalId: 1, projectionRevision: 1 });
GoalStatsSchema.index({ goalId: 1, derivedFromCausalSequence: 1 });

export const GoalStatsModel: Model<IGoalStatsDoc> =
  mongoose.models.GoalStats ||
  mongoose.model<IGoalStatsDoc>("GoalStats", GoalStatsSchema);

// Backwards-compatible export
export const GoalStats = GoalStatsModel;
