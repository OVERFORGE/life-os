/**
 * Simulation Prompts Module Architecture (Phase 1.1 Foundation)
 * Contains system prompts, persona prompts, prompt builders, structured output schemas, and prompt versioning.
 */

export interface IPromptTemplate {
  id: string;
  version: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchemaName: string;
}

export interface IPromptBuilderOptions {
  personaCode: string;
  currentStep: number;
  environmentContext: Record<string, unknown>;
}

export const PROMPT_VERSIONS = {
  PERSONA_DECISION_V1: "v1.0.0-persona-decision",
  OPPORTUNITY_EVAL_V1: "v1.0.0-opportunity-eval",
  REFLECTIONS_V1: "v1.0.0-reflection-generator",
} as const;

export function buildSimulationPromptPlaceholder(
  templateId: string,
  options: IPromptBuilderOptions
): string {
  return `[PROMPT_PLACEHOLDER: ${templateId} | Persona: ${options.personaCode} | Step: ${options.currentStep}]`;
}
