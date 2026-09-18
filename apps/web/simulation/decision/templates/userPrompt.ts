export function buildUserPromptSection(personaFormatted: string, runtimeFormatted: string): string {
  return [
    `=== PERSONA PROFILE ===`,
    personaFormatted,
    ``,
    `=== SIMULATION RUNTIME CONTEXT ===`,
    runtimeFormatted,
    ``,
    `=== DECISION INSTRUCTIONS ===`,
    `Determine the optimal next action intent for this persona based on their profile and current virtual time.`,
  ].join("\n");
}

export const OUTPUT_SCHEMA_SECTION = `=== REQUIRED OUTPUT JSON SCHEMA ===
{
  "intent": "WORK_ON_TASK | REST_AND_RECOVER | COMMUNICATE | ADJUST_PLAN | TAKE_BREAK | EXERCISE | IDLE",
  "target": "string (target object or self)",
  "parameters": { ... key-value parameters ... },
  "reasoning": "string (explanation of intent choice)",
  "confidence": 0.95 (number between 0.0 and 1.0)
}`;
