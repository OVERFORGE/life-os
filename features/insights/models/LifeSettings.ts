import { Schema, model, models } from "mongoose";

const LifeSettingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true },

    // Baselines (learned)
    baselines: {
      sleep: Number,
      mood: Number,
      stress: Number,
      energy: Number,
      deepWork: Number,
    },

    // Thresholds (user-tunable)
    thresholds: {
        burnout: {
            sleepBelow: Number,
            stressAbove: Number,
            workAbove: Number,
        },
        grind: {
            workAbove: Number,
            sleepBelow: Number,
        },
        recovery: {
            sleepAbove: Number,
            workBelow: Number,
        },
        slump: {
            moodBelow: Number,
            workBelow: Number,
        },
        drifting: {
            workBand: Number,
            sleepBand: Number,
            moodBand: Number,
        },
    },

  },
  { timestamps: true }
);

export const LifeSettings =
  models.LifeSettings || model("LifeSettings", LifeSettingsSchema);
