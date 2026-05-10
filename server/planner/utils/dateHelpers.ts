/**
 * Timezone-safe date utilities for the Behavioral Memory Extraction layer.
 * 
 * Future architecture note:
 * Behavior analysis should ALWAYS use user-local temporal behavior, 
 * not server UTC assumptions. Future planner correctness depends on this.
 */

import { getActiveDate } from "../../automation/timeUtils";

/**
 * Returns the local date string (YYYY-MM-DD) for a given Date object in the user's timezone.
 * NEVER use toISOString().slice(0, 10) directly on user behavioral data without ensuring the timezone.
 */
export function getLocalDateString(date: Date, timezone: string | undefined): string {
  const tz = timezone || "UTC";
  // toLocaleDateString with "en-CA" formats as YYYY-MM-DD
  return date.toLocaleDateString("en-CA", { timeZone: tz });
}

/**
 * Normalizes a Javascript Date to local midnight in the given timezone.
 * Returns a new Date object representing midnight in that local timezone.
 */
export function normalizeLocalDate(date: Date, timezone: string | undefined): Date {
  const localDateStr = getLocalDateString(date, timezone);
  return new Date(`${localDateStr}T00:00:00`);
}

/**
 * Buckets a date into a safe identifier (like a month or week bucket) 
 * respecting the user's timezone.
 */
export function safeDateBucket(date: Date, bucketType: "month" | "week", timezone: string | undefined): string {
  const tz = timezone || "UTC";
  if (bucketType === "month") {
    // Returns YYYY-MM
    return date.toLocaleDateString("en-CA", { timeZone: tz }).slice(0, 7);
  }
  
  // Week bucket fallback
  return getLocalDateString(date, timezone);
}
