/**
 * SEMANTIC REGEX FIXTURE (NEGATIVE TEST)
 * Contains prohibited semantic intent matching and state guessing regexes
 * that MUST be detected and flagged under LifeOS V2.3.0 Rule 9.
 */

// FORBIDDEN: Semantic natural language action intent classification
export const FORBIDDEN_ACTION_INTENT_REGEX = /(create|update|delete|cancel)\s+(task|goal|session)/i;

// FORBIDDEN: Natural language state / outcome guessing
export const FORBIDDEN_STATE_GUESSING_REGEX = /(done|finished|completed|closed)/i;

// FORBIDDEN: Natural language priority / urgency heuristic
export const FORBIDDEN_PRIORITY_GUESSING_REGEX = /(urgent|critical|high priority|asap)/i;

export function classifyIntentFromProse(message: string): string | null {
  if (FORBIDDEN_ACTION_INTENT_REGEX.test(message)) {
    return "MUTATION_INTENT";
  }
  if (FORBIDDEN_STATE_GUESSING_REGEX.test(message)) {
    return "COMPLETION_INTENT";
  }
  return null;
}

