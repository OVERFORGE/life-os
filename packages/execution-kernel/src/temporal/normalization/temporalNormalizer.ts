/**
 * temporalNormalizer.ts
 * 
 * Deterministic Temporal Normalizer & Interval Engine.
 * 
 * Architectural Invariant (Guardrail 3):
 * The deterministic temporal normalizer MUST NOT become a hidden natural-language parser.
 * It performs deterministic:
 * - Timezone conversion
 * - Minute-of-day arithmetic (0 - 1439)
 * - Duration arithmetic
 * - Midnight-crossing calculations
 * - Overlap & collision checking
 * - Validation of already-structured temporal values
 * 
 * ZERO regex intent classification. ZERO heuristic word scoring.
 */

import { parseLocalToUTC } from "../../automation/timeUtils";
import { TemporalInterval } from "../contracts/TemporalContracts";

export interface RawStructuredTemporalInput {
  dateOnly?: string;              // YYYY-MM-DD
  startMinute?: number;           // 0 - 1439
  endMinute?: number;             // 0 - 1439 (or > 1440)
  startTime?: string;             // HH:MM (24-hour format)
  endTime?: string;               // HH:MM (24-hour format)
  durationMinutes?: number;       // integer >= 0
  timezone?: string;              // IANA timezone, defaults to UTC
}

export interface TemporalValidationResult {
  valid: boolean;
  interval?: TemporalInterval;
  error?: string;
}

/**
 * Converts a 24-hour "HH:MM" string to minutes from midnight (0 - 1439)
 */
export function timeStringToMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(":");
  if (parts.length !== 2) {
    throw new Error(`[INVALID_TIME_FORMAT]: Expected HH:MM, got "${timeStr}"`);
  }
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`[INVALID_TIME_VALUES]: Hours must be 0-23, minutes 0-59. Got "${timeStr}"`);
  }
  return hours * 60 + minutes;
}

/**
 * Converts minutes from midnight (0 - 1439) to "HH:MM" 24-hour string
 */
export function minutesToTimeString(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Normalizes and validates a structured temporal interval deterministically
 */
export function normalizeTemporalInterval(
  input: RawStructuredTemporalInput,
  defaultDateOnly?: string
): TemporalValidationResult {
  const tz = input.timezone || "UTC";
  const dateOnly = (input.dateOnly || defaultDateOnly || "").trim();

  // 1. Validate dateOnly format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return { valid: false, error: `[INVALID_DATE_FORMAT]: Expected YYYY-MM-DD, got "${dateOnly}"` };
  }

  // 2. Resolve startMinute
  let startMinute = input.startMinute;
  if (startMinute === undefined && input.startTime) {
    try {
      startMinute = timeStringToMinutes(input.startTime);
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }

  if (startMinute === undefined) {
    return { valid: false, error: "[MISSING_START_TIME]: startMinute or startTime must be provided" };
  }

  if (startMinute < 0 || startMinute >= 1440) {
    return { valid: false, error: `[OUT_OF_BOUNDS_START_MINUTE]: Must be between 0 and 1439, got ${startMinute}` };
  }

  // 3. Resolve endMinute & durationMinutes
  let endMinute = input.endMinute;
  if (endMinute === undefined && input.endTime) {
    try {
      endMinute = timeStringToMinutes(input.endTime);
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }

  let durationMinutes = input.durationMinutes;

  if (endMinute !== undefined && durationMinutes !== undefined) {
    // Both provided: verify arithmetic consistency
    let computedDuration = endMinute - startMinute;
    if (computedDuration < 0) {
      // Midnight crossing: e.g. 23:00 (1380) to 01:00 (60) => 1500 - 1380 = 120
      computedDuration += 1440;
      endMinute += 1440;
    }
    if (computedDuration !== durationMinutes) {
      return {
        valid: false,
        error: `[INTERVAL_ARITHMETIC_MISMATCH]: endMinute (${endMinute}) - startMinute (${startMinute}) != durationMinutes (${durationMinutes})`,
      };
    }
  } else if (endMinute !== undefined) {
    // endMinute provided, compute duration
    if (endMinute < startMinute) {
      // Midnight crossing
      endMinute += 1440;
    }
    durationMinutes = endMinute - startMinute;
  } else if (durationMinutes !== undefined) {
    // durationMinutes provided, compute endMinute
    if (durationMinutes < 0) {
      return { valid: false, error: `[NEGATIVE_DURATION]: durationMinutes cannot be negative, got ${durationMinutes}` };
    }
    endMinute = startMinute + durationMinutes;
  } else {
    // Default fallback: 60 minutes default work session if unspecified
    durationMinutes = 60;
    endMinute = startMinute + 60;
  }

  const isMidnightCrossing = endMinute >= 1440;

  // 4. Construct UTC ISO strings taking into account timezone
  const startLocalTimeStr = minutesToTimeString(startMinute);
  const startIsoUtc = parseLocalToUTC(dateOnly, startLocalTimeStr, tz).toISOString();

  let endIsoUtc: string;
  if (isMidnightCrossing) {
    // Advance date by 1 day for the end timestamp
    const nextDay = new Date(`${dateOnly}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + Math.floor(endMinute / 1440));
    const nextDateStr = nextDay.toISOString().split("T")[0];
    const endLocalTimeStr = minutesToTimeString(endMinute % 1440);
    endIsoUtc = parseLocalToUTC(nextDateStr, endLocalTimeStr, tz).toISOString();
  } else {
    const endLocalTimeStr = minutesToTimeString(endMinute);
    endIsoUtc = parseLocalToUTC(dateOnly, endLocalTimeStr, tz).toISOString();
  }

  const interval: TemporalInterval = {
    dateOnly,
    startMinute,
    endMinute,
    durationMinutes,
    startIsoUtc,
    endIsoUtc,
    timezone: tz,
    isMidnightCrossing,
  };

  return { valid: true, interval };
}

/**
 * Checks whether two temporal intervals on the same date overlap
 */
export function doIntervalsOverlap(a: TemporalInterval, b: TemporalInterval): boolean {
  if (a.dateOnly !== b.dateOnly) {
    // Different dates: check if one crosses midnight into the other
    if (a.isMidnightCrossing) {
      // a extends into tomorrow
      const nextDate = new Date(`${a.dateOnly}T12:00:00Z`);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      const nextDateStr = nextDate.toISOString().split("T")[0];
      if (nextDateStr === b.dateOnly) {
        const aOverhang = a.endMinute - 1440;
        return b.startMinute < aOverhang;
      }
    }
    if (b.isMidnightCrossing) {
      const nextDate = new Date(`${b.dateOnly}T12:00:00Z`);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      const nextDateStr = nextDate.toISOString().split("T")[0];
      if (nextDateStr === a.dateOnly) {
        const bOverhang = b.endMinute - 1440;
        return a.startMinute < bOverhang;
      }
    }
    return false;
  }

  // Same date: standard interval intersection test: max(start) < min(end)
  return Math.max(a.startMinute, b.startMinute) < Math.min(a.endMinute, b.endMinute);
}
