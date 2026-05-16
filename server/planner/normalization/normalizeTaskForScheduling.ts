import { SchedulableTask, RawTaskForScheduling } from "../types/SchedulingTypes";

/**
 * Normalizes a 1-5 priority scale into a 0.2-1.0 mathematical range.
 */
export function normalizePriority(priority: number): number {
  return Math.max(0.2, Math.min(1.0, priority * 0.2));
}

/**
 * Converts a raw DB Task object into a normalized SchedulableTask for the placement engine.
 * Ensures deterministic fallbacks for missing planner properties.
 */
export function normalizeTaskForScheduling(rawTask: RawTaskForScheduling): SchedulableTask {
  // TODO(ml-duration): Replace hardcoded fallback with ML-based duration estimation
  // based on historical completions of similar tasks.
  const estimatedDurationMinutes = Math.max(
    5, // Absolute minimum task length
    rawTask.metadata?.estimatedDuration ?? 30
  );

  // REFINEMENT 1: Better minimumChunkSize fallback
  // Do not artificially inflate microtasks (5-10m) to 15m.
  const minimumChunkSize = rawTask.metadata?.minimumChunkSize 
    ?? Math.min(estimatedDurationMinutes, 15);

  // TODO(nlp-classification): Infer deep work requirement and cognitive load 
  // from task title/description using NLP classification.

  // Validate raw priority before normalization.
  // Rejects corrupted, non-finite, or out-of-domain values silently — uses safe default 2.
  const safePriority =
    typeof rawTask.priority === "number" &&
    Number.isFinite(rawTask.priority) &&
    rawTask.priority >= 1 &&
    rawTask.priority <= 5
      ? rawTask.priority
      : 2;

  const requiresDeepWork = rawTask.metadata?.requiresDeepWork 
    ?? (estimatedDurationMinutes >= 60 || safePriority >= 4);

  const cognitiveLoad = rawTask.metadata?.cognitiveLoad 
    ?? (requiresDeepWork ? 0.8 : 0.4);

  const urgency = rawTask.metadata?.urgency 
    ?? (rawTask.dueDate ? calculateUrgency(rawTask.dueDate) : 0.5);

  const priorityScore = normalizePriority(safePriority);

  const baseFlexibility = requiresDeepWork ? 0.65 : 0.85;
  const deadlinePenalty = urgency * 0.25;
  const temporalFlexibility = Math.max(0, Math.min(1.0, baseFlexibility - deadlinePenalty));

  return {
    unitType: "task",
    // Deterministic fallback — 'unsaved-task' avoids runtime nondeterminism from Date.now().
    // Ensures replay-safe, cache-safe, and reproducible planner normalization.
    id: rawTask._id?.toString() ?? rawTask.id ?? "unsaved-task",
    title: rawTask.title || "Untitled Task",
    estimatedDurationMinutes,
    priority: safePriority,
    urgency,
    requiresDeepWork,
    cognitiveLoad,
    minimumChunkSize,
    // NOTE: hardDeadlineMinute is NOT set here because converting an absolute wall-clock dueDate
    // to a planner-relative minute requires the planning day's start epoch — context not available
    // at normalization time. Callers that have day context (e.g. daily schedule builders) MUST
    // resolve `dueDate` → `hardDeadlineMinute` before passing this unit to the planner engine.
    // hardDeadline (Date) is NEVER propagated into SchedulableUnit; it stops at this boundary.
    hardDeadlineMinute: undefined,
    splittable: rawTask.metadata?.splittable ?? true,
    taskType: rawTask.category || "general",
    priorityScore,
    temporalFlexibility,
    hardConstraints: rawTask.metadata?.hardConstraints ?? [],
    softConstraints: rawTask.metadata?.softConstraints ?? [],
  };
}

/**
 * Computes a basic 0-1 urgency score based on proximity to deadline.
 */
function calculateUrgency(dueDate: string | Date): number {
  const due = new Date(dueDate).getTime();
  const now = new Date().getTime();
  if (isNaN(due)) return 0.5;

  const hoursRemaining = (due - now) / (1000 * 60 * 60);
  
  if (hoursRemaining <= 0) return 1.0; // Overdue
  if (hoursRemaining <= 24) return 0.9;
  if (hoursRemaining <= 48) return 0.7;
  if (hoursRemaining <= 168) return 0.4; // 1 week
  return 0.1;
}
