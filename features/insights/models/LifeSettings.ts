// features/insights/models/LifeSettings.ts

import { Schema, model, models } from "mongoose";

/* ---------------- Phase Sensitivity (Phase Detection) ---------------- */

const PhaseSensitivitySchema = new Schema(
  {
    sleepImpact: { type: Number, default: 1 },
    stressImpact: { type: Number, default: 1 },
    energyImpact: { type: Number, default: 1 },
    moodImpact: { type: Number, default: 1 },
  },
  { _id: false }
);

/* ---------------- Goal Pressure Weights ---------------- */

const GoalPressureWeightsSchema = new Schema(
  {
    cadence: { type: Number, default: 0.25 },
    energy: { type: Number, default: 0.25 },
    stress: { type: Number, default: 0.25 },
    phaseMismatch: { type: Number, default: 0.25 },
  },
  { _id: false }
);

/* ---------------- Phase Learning History ---------------- */

const PhaseLearningHistorySchema = new Schema(
  {
    date: String,
    before: PhaseSensitivitySchema,
    after: PhaseSensitivitySchema,
    reason: String,
  },
  { _id: false }
);

/* ---------------- Goal Load Learning History (NEW V2) ---------------- */

const GoalLoadHistorySchema = new Schema(
  {
    date: String,

    outcome: String,
    confidence: Number,

    before: {
      cadence: Number,
      energy: Number,
      stress: Number,
      phaseMismatch: Number,
    },

    after: {
      cadence: Number,
      energy: Number,
      stress: Number,
      phaseMismatch: Number,
    },

    reason: String,
  },
  { _id: false }
);

/* ---------------- Life Settings Main Schema ---------------- */

const LifeSettingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true },

    /* -------- Baselines -------- */

    baselines: {
      sleep: Number,
      mood: Number,
      stress: Number,
      energy: Number,
      deepWork: Number,
    },

    /* -------- Learned Phase Sensitivity -------- */

    learnedSensitivity: {
      type: PhaseSensitivitySchema,
      default: () => ({
        sleepImpact: 1,
        stressImpact: 1,
        energyImpact: 1,
        moodImpact: 1,
      }),
    },

    /* -------- Learned Goal Pressure Weights -------- */

    goalPressureWeights: {
      type: GoalPressureWeightsSchema,
      default: () => ({
        cadence: 0.25,
        energy: 0.25,
        stress: 0.25,
        phaseMismatch: 0.25,
      }),
    },

    /* -------- Phase Learning History -------- */

    sensitivityHistory: {
      type: [PhaseLearningHistorySchema],
      default: [],
    },

    /* -------- Goal Load Learning History (NEW) -------- */

    goalLoadHistory: {
      type: [GoalLoadHistorySchema],
      default: [],
    },
  },
  { timestamps: true }
);

export const LifeSettings =
  models.LifeSettings || model("LifeSettings", LifeSettingsSchema);
