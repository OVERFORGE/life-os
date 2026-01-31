import { Schema, model, models } from "mongoose";

/* ---------------- Sensitivity (Phase Detection) ---------------- */

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

/* ---------------- Learning History ---------------- */

const SensitivityHistorySchema = new Schema(
  {
    date: String,
    before: PhaseSensitivitySchema,
    after: PhaseSensitivitySchema,
    reason: String,
  },
  { _id: false }
);

/* ---------------- Life Settings ---------------- */

const LifeSettingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true },

    baselines: {
      sleep: Number,
      mood: Number,
      stress: Number,
      energy: Number,
      deepWork: Number,
    },

    learnedSensitivity: {
      type: PhaseSensitivitySchema,
      default: () => ({
        sleepImpact: 1,
        stressImpact: 1,
        energyImpact: 1,
        moodImpact: 1,
      }),
    },

    goalPressureWeights: {
      type: GoalPressureWeightsSchema,
      default: () => ({
        cadence: 0.25,
        energy: 0.25,
        stress: 0.25,
        phaseMismatch: 0.25,
      }),
    },

    sensitivityHistory: {
      type: [SensitivityHistorySchema],
      default: [],
    },
  },
  { timestamps: true }
);

export const LifeSettings =
  models.LifeSettings || model("LifeSettings", LifeSettingsSchema);
