import { z } from "zod";

export const DailyLogSchema = z.object({
  mental: z
    .object({
      mood: z.number().optional(),
      energy: z.number().optional(),
      stress: z.number().optional(),
    })
    .optional(),

  sleep: z
    .object({
      hours: z.number().optional(),
      sleepTime: z.string().optional(),
      wakeTime: z.string().optional(),
    })
    .optional(),

  work: z
    .object({
      deepWorkHours: z.number().optional(),
      coded: z.boolean().optional(),
      executioners: z.boolean().optional(),
      studied: z.boolean().optional(),
      mainWork: z.string().optional(),
    })
    .optional(),

  physical: z
    .object({
      gym: z.boolean().optional(),
      steps: z.number().optional(),
      calories: z.number().optional(),
      meals: z.number().optional(),
      dietNote: z.string().optional(),
      painNote: z.string().optional(),
    })
    .optional(),

  habits: z
    .object({
      junkFood: z
        .object({
          had: z.boolean().optional(),
          times: z.number().optional(),
          what: z.string().optional(),
        })
        .optional(),
    })
    .optional(),

  planning: z.object({
    plannedTasks: z.number().optional(),
    completedTasks: z.number().optional(),
    reasonNotCompleted: z.string().optional(),
  }),

  reflection: z.object({
    win: z.string().optional(),
    mistake: z.string().optional(),
    learned: z.string().optional(),
    bothering: z.string().optional(),
  }),
});
