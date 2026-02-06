// server/db/models/DailyLog.ts

import mongoose, { Schema, model, models } from "mongoose";

/**
 * DailyLog
 *
 * Existing structure stays
 * We only add `signals` map for dynamic user-defined signals.
 */

const DailyLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },

    date: { type: String, required: true }, // yyyy-mm-dd

    mental: {
      mood: Number,
      energy: Number,
      stress: Number,
      anxiety: Number,
      focus: Number,
    },

    sleep: {
      hours: Number,
      quality: Number,
      sleepTime: String,
      wakeTime: String,
    },

    physical: {
      gym: Boolean,
      workoutType: String,
      calories: Number,
      meals: Number,
      dietNote: String,
      steps: Number,
      bodyFeeling: String,
      painNote: String,
    },

    work: {
      deepWorkHours: Number,
      coded: Boolean,
      executioners: Boolean,
      studied: Boolean,
      mainWork: String,
    },

    habits: {
      gym: Boolean,
      reading: Boolean,
      meditation: Boolean,
      coding: Boolean,
      content: Boolean,
      learning: Boolean,
      noFap: Boolean,
      socialMediaOveruse: Boolean,
    },

    planning: {
      plannedTasks: Number,
      completedTasks: Number,
      reasonNotCompleted: String,
    },

    reflection: {
      win: String,
      mistake: String,
      learned: String,
      bothering: String,
    },

    /**
     * ✅ NEW: Dynamic Signals
     *
     * Example:
     * signals: {
     *   water: 2.7,
     *   sunlight: 30,
     *   protein: 120
     * }
     */
    signals: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

DailyLogSchema.index({ userId: 1, date: 1 }, { unique: true });

export const DailyLog =
  models.DailyLog || model("DailyLog", DailyLogSchema);
