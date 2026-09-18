import { z } from "zod";
import { PROMPT_VERSION, DECISION_SCHEMA_VERSION, DECISION_ENGINE_VERSION, DECISION_VALIDATOR_VERSION } from "../constants";

export const DecisionIntentEnum = z.enum([
  "WORK_ON_TASK",
  "REST_AND_RECOVER",
  "COMMUNICATE",
  "ADJUST_PLAN",
  "TAKE_BREAK",
  "EXERCISE",
  "IDLE",
]);

export type DecisionIntent = z.infer<typeof DecisionIntentEnum>;

/** Schema for LLM raw response (model outputs intent, target, parameters, reasoning, confidence) */
export const LLMOutputSchema = z.object({
  intent: DecisionIntentEnum,
  target: z.string().default("self"),
  parameters: z.record(z.string(), z.unknown()).default({}),
  reasoning: z.string().min(1, "Reasoning is required"),
  confidence: z.number().min(0.0).max(1.0),
});

export type LLMOutputDTO = z.infer<typeof LLMOutputSchema>;

/** Metadata schema for decision trace */
export const DecisionMetadataSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  promptVersion: z.string().default(PROMPT_VERSION),
  schemaVersion: z.string().default(DECISION_SCHEMA_VERSION),
  engineVersion: z.string().default(DECISION_ENGINE_VERSION),
  validatorVersion: z.string().default(DECISION_VALIDATOR_VERSION),
  promptHash: z.string().min(1),
});

export type DecisionMetadataDTO = z.infer<typeof DecisionMetadataSchema>;

/** Complete engine-owned DecisionDTO with engine-generated decisionId */
export const DecisionSchema = z.object({
  decisionId: z.string().min(1, "Engine-generated decisionId is required"),
  intent: DecisionIntentEnum,
  target: z.string().default("self"),
  parameters: z.record(z.string(), z.unknown()).default({}),
  reasoning: z.string().min(1),
  confidence: z.number().min(0.0).max(1.0),
  metadata: DecisionMetadataSchema,
});

export type DecisionDTO = z.infer<typeof DecisionSchema>;
