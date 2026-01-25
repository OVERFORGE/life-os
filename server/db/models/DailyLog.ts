import { Schema, model, models } from "mongoose";

const DailyLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    date: { type: String, required: true }, 
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

      junkFood: {
        had: Boolean,
        times: Number,
        what: String,
      },

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

    emotions: {
      bestMoment: String,
      worstMoment: String,
      stressTrigger: String,
      happyMoment: String,
    },

    social: {
      interactionLevel: String,
      talkedToFamily: Boolean,
      networked: Boolean,
    },
  },
  { timestamps: true }
);

DailyLogSchema.index({ userId: 1, date: 1 }, { unique: true });

export const DailyLog = models.DailyLog || model("DailyLog", DailyLogSchema);
