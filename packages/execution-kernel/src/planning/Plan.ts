import { generateId } from "../shared/ids";

/**
 * Executor-Agnostic Intended Action
 * Describes WHAT should happen without coupling to raw legacy handler string names.
 */
export interface IntendedAction {
  domain: string;                      // E.g. 'tasks', 'health', 'goals', 'habits'
  action: string;                      // E.g. 'create', 'complete', 'log', 'update', 'delete'
  parameters: Record<string, any>;     // Extracted action parameters
}

export interface Plan {
  planId: string;
  understandingId: string;
  actions: IntendedAction[];
  notes?: string;
}

export function createPlan(
  understandingId: string,
  actions: IntendedAction[] = [],
  notes?: string
): Plan {
  return {
    planId: generateId("plan"),
    understandingId,
    actions,
    notes,
  };
}
