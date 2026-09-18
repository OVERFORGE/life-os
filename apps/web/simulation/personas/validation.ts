import { z } from "zod";

// Helper for numeric range 0-100
const traitNumber = z.number().min(0).max(100).default(50);
const stateNumber = z.number().min(0).max(100).default(50);

export const createPersonaSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(64, "Code too long")
    .regex(/^[A-Z0-9_-]+$/i, "Code must contain only letters, numbers, hyphens, or underscores"),
  name: z.string().min(1, "Name is required").max(128, "Name too long"),
  description: z.string().optional().default(""),

  // Blueprint / Template tracking
  templateId: z.string().optional().nullable().default(null),
  templateVersion: z.string().optional().default("1.0.0"),
  isTemplate: z.boolean().optional().default(false),

  archetype: z.string().optional().default("CUSTOM"),

  // Explicit sub-objects
  identity: z
    .object({
      ageRange: z.string().optional().default("25–34"),
      occupation: z.string().optional().default("SOFTWARE_ENGINEER"),
      education: z.string().optional().default("BACHELORS"),
      relationshipStatus: z.string().optional().default("SINGLE"),
      livingSituation: z.string().optional().default("SOLO_APARTMENT"),
      incomeRange: z.string().optional().default("$50k - $100k"),
    })
    .optional()
    .default({
      ageRange: "25–34",
      occupation: "SOFTWARE_ENGINEER",
      education: "BACHELORS",
      relationshipStatus: "SINGLE",
      livingSituation: "SOLO_APARTMENT",
      incomeRange: "$50k - $100k",
    }),

  traits: z.record(z.string(), traitNumber).optional().default({}),
  initialState: z.record(z.string(), stateNumber).optional().default({}),
  lifestyle: z.record(z.string(), z.string()).optional().default({}),
  motivation: z.record(z.string(), z.string()).optional().default({}),

  capabilities: z.record(z.string(), z.boolean()).optional().default({}),
  memoryProfile: z.record(z.string(), z.unknown()).optional().default({}),
  supportedScenarioTypes: z.array(z.string()).optional().default([]),

  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  behaviorPolicy: z.record(z.string(), z.unknown()).optional().default({}),

  promptVersion: z.string().optional().default("v1.0.0"),
  personaVersion: z.string().optional().default("1.0.0"),
  schemaVersion: z.string().optional().default("1.0.0"),

  tags: z.array(z.string()).optional().default([]),
});

export const updatePersonaSchema = createPersonaSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreatePersonaInput = z.infer<typeof createPersonaSchema>;
export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>;
