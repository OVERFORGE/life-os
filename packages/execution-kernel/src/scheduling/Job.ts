import { generateId } from "../shared/ids";
import { IntendedAction } from "../planning/Plan";

/**
 * Job Model
 * 
 * Immutable, in-memory representation of an executable unit of work.
 * 
 * ARCHITECTURAL NOTE:
 * The `priority` field is currently reserved for future scheduling policies
 * (e.g., priority queue ordering, preemptive dispatching).
 */
export interface Job {
  jobId: string;
  domain: string;
  action: string;
  payload: Record<string, any>;
  priority: "low" | "medium" | "high";
  scheduledFor: number;
  createdAt: number;
}

export function createJobFromAction(
  intendedAction: IntendedAction,
  scheduledFor: number = Date.now(),
  priority: "low" | "medium" | "high" = "medium"
): Job {
  const now = Date.now();
  return {
    jobId: generateId("job"),
    domain: intendedAction.domain,
    action: intendedAction.action,
    payload: intendedAction.parameters,
    priority,
    scheduledFor,
    createdAt: now,
  };
}
