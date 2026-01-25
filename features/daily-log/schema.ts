import { z } from "zod";

export const DailyLogSchema = z.object({
  mental: z.object({
    mood: z.number().min(1).max(10),
    energy: z.number().min(1).max(10),
    stress: z.number().min(1).max(10),
    anxiety: z.number().min(1).max(10),
    focus: z.number().min(1).max(10),
  }),

  sleep: z.object({
    hours: z.number().min(0).max(24),
    quality: z.number().min(1).max(10),
    sleepTime: z.string(),
    wakeTime: z.string(),
  }),

  physical: z.object({
    gym: z.boolean(),
    workoutType: z.string(),
    calories: z.number(),
    dietNote: z.string(),
    steps: z.number(),
    bodyFeeling: z.string(),
    painNote: z.string(),
  }),

  work: z.object({
    deepWorkHours: z.number(),
    coded: z.boolean(),
    executioners: z.boolean(),
    studied: z.boolean(),
    mainWork: z.string(),
  }),

  habits: z.object({
    gym: z.boolean(),
    reading: z.boolean(),
    meditation: z.boolean(),
    coding: z.boolean(),
    content: z.boolean(),
    learning: z.boolean(),
    noFap: z.boolean(),

    junkFood: z.object({
      had: z.boolean(),
      times: z.number(),
      what: z.string(),
    }),

    socialMediaOveruse: z.boolean(),
  }),

  planning: z.object({
    plannedTasks: z.number(),
    completedTasks: z.number(),
    reasonNotCompleted: z.string(),
  }),

  reflection: z.object({
    win: z.string(),
    mistake: z.string(),
    learned: z.string(),
    bothering: z.string(),
  }),

  emotions: z
    .object({
      bestMoment: z.string(),
      worstMoment: z.string(),
      stressTrigger: z.string(),
      happyMoment: z.string(),
    })
    .optional(),

  social: z
    .object({
      interactionLevel: z.enum(["none", "low", "good"]),
      talkedToFamily: z.boolean(),
      networked: z.boolean(),
    })
    .optional(),
}).partial();
