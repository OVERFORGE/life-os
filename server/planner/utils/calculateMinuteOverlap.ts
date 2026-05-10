/**
 * @deprecated
 * calculateMinuteOverlap is a legacy compatibility shim.
 *
 * All new code MUST use:
 *   import { calculateTemporalOverlap, tryCreateTemporalWindow } from "./TemporalWindow";
 *
 * This shim is preserved ONLY to avoid breaking callers that still pass raw minute tuples.
 * It will be removed after all analyzers are migrated to TemporalWindow.
 *
 * Migration checklist:
 *   [x] analyzeAvailabilityWindows.ts
 *   [x] analyzeRecoveryWindows.ts
 *   [x] validatePlannerOutput.ts
 *   [ ] Any future analyzer — use TemporalWindow directly
 */

import { calculateTemporalOverlap, tryCreateTemporalWindow } from "./TemporalWindow";

/**
 * @deprecated Use calculateTemporalOverlap(windowA, windowB) instead.
 *
 * Calculates the overlap in minutes between two intervals, with
 * midnight-crossover support. Uses half-open [s,e) semantics internally.
 *
 * Note: This shim treats endMinute=1439 as "just before midnight".
 * For true "until midnight" intervals, callers should use endMinute=1440.
 */
export function calculateMinuteOverlap(
  startA: number, endA: number,
  startB: number, endB: number
): number {
  // Convert legacy closed-style tuples to half-open TemporalWindows.
  // We add +1 to endMinute to convert from the old "inclusive" style,
  // but only if endMinute < 1440 (don't overshoot).
  const wA = tryCreateTemporalWindow(startA, Math.min(endA + 1, 1440));
  const wB = tryCreateTemporalWindow(startB, Math.min(endB + 1, 1440));
  if (!wA || !wB) return 0;
  return calculateTemporalOverlap(wA, wB).overlapMinutes;
}

/**
 * @deprecated Use minuteInWindow(minute, window) from TemporalWindow instead.
 */
export function minuteIsInWindow(minute: number, start: number, end: number): boolean {
  const w = tryCreateTemporalWindow(start, Math.min(end + 1, 1440));
  if (!w) return false;
  // Legacy behavior: inclusive end
  return minute >= start && (end >= start ? minute <= end : minute >= start || minute <= end);
}
