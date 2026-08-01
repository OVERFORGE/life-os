import { generateId } from "../shared/ids";

export type SuggestionPriority = "low" | "medium" | "high";

/**
 * Suggestion Model
 * 
 * Represents a passive, informational recommendation produced by the Proactive Engine
 * strictly to be surfaced to the user. Suggestions NEVER influence reasoning, intent,
 * planning, scheduling, or execution.
 */
export interface Suggestion {
  suggestionId: string;
  type: string;
  title: string;
  message: string;
  priority: SuggestionPriority;
  timestamp: number;
}

export function createSuggestion(
  type: string,
  title: string,
  message: string,
  priority: SuggestionPriority = "medium"
): Suggestion {
  return {
    suggestionId: generateId("sugg"),
    type,
    title,
    message,
    priority,
    timestamp: Date.now(),
  };
}
