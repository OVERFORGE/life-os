/**
 * TemporalWindow — Canonical interval abstraction for the LifeOS planner.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * INTERVAL SEMANTICS: HALF-OPEN  [startMinute, endMinute)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * startMinute: inclusive  (0–1439)
 * endMinute:   exclusive  (1–1440)
 *
 * Only endMinute may equal 1440 — representing "end of day / midnight".
 *
 * Examples:
 *   [60, 120)  = 01:00 → 02:00, duration = 60 min
 *   [0, 1440)  = full day (00:00 → midnight)
 *   [1380,1440)= 23:00 → midnight (non-wrapped, uses 1440 sentinel)
 *   [1380, 60) = 23:00 → 01:00 (midnight-crossing, wrapsMidnight=true)
 *
 * HALF-OPEN CONSEQUENCE:
 *   [60,120) and [120,180) are ADJACENT, NOT overlapping.
 *   minuteInWindow(120, [60,120)) === false  ← "120 is not in [60,120)"
 *
 * WHY HALF-OPEN:
 *   - Duration = endMinute − startMinute (no +1 confusion)
 *   - Adjacency: windowA.endMinute === windowB.startMinute
 *   - Packing: adjacent blocks tile perfectly with no gaps or double-counting
 *   - Compatible with interval trees and scheduler sweep algorithms
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MIDNIGHT-CROSSING WINDOWS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * wrapsMidnight === true  iff  endMinute < startMinute (using [0,1439] space)
 *   e.g. [1380, 60) = [23:00, 01:00)
 *
 * Internally, wrapped windows are split into two sub-windows via
 * splitWrappedWindow() before any interval algebra is applied.
 * This is the ONLY place midnight-crossing logic lives.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FUTURE TODOs
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TODO(interval-tree): When constraints scale beyond ~50 per day, replace the
 *   O(n²) overlap loop in analyzeAvailabilityWindows with an interval tree.
 *   All operations here already produce the structures needed.
 *
 * TODO(multi-day): Extend to OrchestratorHorizonWindow { dayOffset: number; window: TemporalWindow }
 *   for multi-day planning, rolling replanning, and recurrence expansion.
 *   IMPORTANT: A TemporalWindow can represent an overnight span via wrapsMidnight, but it
 *   CANNOT represent a deadline on a DIFFERENT calendar day. Example: a task due at 09:00
 *   tomorrow is NOT [1440+540). It requires dayOffset=1 + minuteWithinDay=540.
 *   See: server/planner/types/PlannerSemantics.ts → PlannerDeadlineBoundary
 *
 * TODO(stochastic-scheduling): Add probabilistic width ± σ around startMinute
 *   and endMinute for confidence-weighted schedule packing.
 *
 * TODO(realtime-replanning): Add invalidation tokens so cached interval trees
 *   can be rebuilt incrementally on constraint change.
 *
 * TODO(DST): Add ianaTimezone field so UTC↔local conversions stay attached
 *   to the window rather than being re-derived everywhere.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Half-open interval [startMinute, endMinute) in local day-minutes. */
export interface TemporalWindow {
  /** Inclusive start, 0–1439. */
  startMinute: number;
  /** Exclusive end, 1–1440. */
  endMinute: number;
  /** True when endMinute < startMinute in [0,1439] space (crosses midnight). */
  wrapsMidnight: boolean;
  /** Always derived: never stored externally. Negative is impossible. */
  durationMinutes: number;
}

export interface TemporalOverlapResult {
  overlapMinutes: number;
  overlaps: boolean;
}

// ── Constructors ──────────────────────────────────────────────────────────────

/**
 * Creates a validated TemporalWindow. Throws on invalid input.
 *
 * endMinute = 1440 is valid and means "exactly midnight / end of day".
 * Wrapped windows (endMinute < startMinute in 0–1439 space) are supported.
 */
export function createTemporalWindow(startMinute: number, endMinute: number): TemporalWindow {
  if (!Number.isFinite(startMinute) || startMinute < 0 || startMinute > 1439) {
    throw new RangeError(`TemporalWindow: startMinute must be 0–1439, got ${startMinute}`);
  }
  if (!Number.isFinite(endMinute) || endMinute < 1 || endMinute > 1440) {
    throw new RangeError(`TemporalWindow: endMinute must be 1–1440, got ${endMinute}`);
  }
  if (startMinute === endMinute) {
    throw new RangeError(`TemporalWindow: zero-duration window [${startMinute},${endMinute}) is not allowed`);
  }

  const wrapsMidnight = endMinute < startMinute;
  const durationMinutes = wrapsMidnight
    ? (1440 - startMinute) + endMinute
    : endMinute - startMinute;

  return { startMinute, endMinute, wrapsMidnight, durationMinutes };
}

/** Non-throwing variant — returns null for invalid inputs. */
export function tryCreateTemporalWindow(startMinute: number, endMinute: number): TemporalWindow | null {
  try { return createTemporalWindow(startMinute, endMinute); }
  catch { return null; }
}

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Normalizes a window so that non-wrapping windows spanning the full post-midnight
 * region use the 1440 sentinel rather than a small endMinute.
 *
 * Input:  [1380, 60)  → could be represented as [1380,1440) + [0,60) (split)
 *         OR left as a wrapped window for single-object storage.
 * Output: Returns the window unchanged — normalization is done by splitWrappedWindow.
 *
 * Use this to canonicalize before DB storage: strip fields, re-derive durationMinutes.
 */
export function normalizeTemporalWindow(w: TemporalWindow): TemporalWindow {
  return createTemporalWindow(w.startMinute, w.endMinute);
}

// ── Decomposition ─────────────────────────────────────────────────────────────

/**
 * Decomposes a midnight-crossing window into two contiguous sub-windows.
 *
 * [1380, 60)  →  [[1380, 1440),  [0, 60)]
 *
 * For non-wrapping windows, returns a single-element array.
 *
 * ALL interval algebra internally calls this first.
 */
export function splitWrappedWindow(w: TemporalWindow): [TemporalWindow] | [TemporalWindow, TemporalWindow] {
  if (!w.wrapsMidnight) return [w];
  return [
    createTemporalWindow(w.startMinute, 1440),
    createTemporalWindow(0, w.endMinute),
  ];
}

// ── Predicates ────────────────────────────────────────────────────────────────

/**
 * Returns true if `minute` falls within the half-open window [start, end).
 * 1440 is treated as minute 0 of the next day (exclusive sentinel).
 */
export function minuteInWindow(minute: number, w: TemporalWindow): boolean {
  if (minute < 0 || minute > 1439) return false;
  if (w.wrapsMidnight) {
    return minute >= w.startMinute || minute < w.endMinute;
  }
  // endMinute=1440 means "up to midnight" — minute 0..1439 all check < 1440
  return minute >= w.startMinute && minute < w.endMinute;
}

/**
 * Returns true if any part of the two windows overlaps.
 * Half-open: [60,120) and [120,180) do NOT intersect.
 */
export function temporalWindowsIntersect(a: TemporalWindow, b: TemporalWindow): boolean {
  return calculateTemporalOverlap(a, b).overlaps;
}

/**
 * Returns true if `outer` fully contains `inner`.
 * i.e. every minute in `inner` is also in `outer`.
 */
export function temporalWindowContains(outer: TemporalWindow, inner: TemporalWindow): boolean {
  const overlap = calculateTemporalOverlap(outer, inner);
  return overlap.overlapMinutes >= inner.durationMinutes;
}

/**
 * Returns true if windowA and windowB are EXACTLY adjacent (no gap, no overlap).
 * Half-open adjacency: a.endMinute === b.startMinute OR b.endMinute === a.startMinute.
 * Also handles midnight: [1380,1440) adjacent to [0,60).
 */
export function temporalWindowAdjacent(a: TemporalWindow, b: TemporalWindow): boolean {
  const aList = splitWrappedWindow(a);
  const bList = splitWrappedWindow(b);

  for (const as of aList) {
    for (const bs of bList) {
      if (as.endMinute === bs.startMinute) return true;
      if (bs.endMinute === as.startMinute) return true;
      // Midnight boundary: endMinute=1440 is adjacent to startMinute=0
      if (as.endMinute === 1440 && bs.startMinute === 0) return true;
      if (bs.endMinute === 1440 && as.startMinute === 0) return true;
    }
  }
  return false;
}

// ── Core Algebra ──────────────────────────────────────────────────────────────

/**
 * Calculates the overlap between two half-open windows.
 * The single canonical implementation — all other overlap logic delegates here.
 *
 * Handles midnight-crossing by decomposing via splitWrappedWindow first.
 */
export function calculateTemporalOverlap(a: TemporalWindow, b: TemporalWindow): TemporalOverlapResult {
  const aSubs = splitWrappedWindow(a);
  const bSubs = splitWrappedWindow(b);

  let total = 0;
  for (const as of aSubs) {
    for (const bs of bSubs) {
      // Half-open overlap: max(0, min(end_a, end_b) - max(start_a, start_b))
      const overlapStart = Math.max(as.startMinute, bs.startMinute);
      const overlapEnd   = Math.min(as.endMinute,   bs.endMinute);
      if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
    }
  }

  return { overlapMinutes: total, overlaps: total > 0 };
}

/**
 * Returns the minimum distance in minutes between two non-overlapping windows.
 * Returns 0 if windows overlap or are adjacent.
 *
 * CIRCULAR TOPOLOGY (Section 2):
 * Time-of-day is a circle of 1440 minutes. The distance between two windows
 * on this circle is the shorter of the two arc gaps.
 *
 * Example:
 *   [1320,1380) and [60,120)  →  linear gap = 60+1200 = impossible
 *   circular gap going backwards: 1320-120 = 1200 → clockwise: 1440-1200 = 240
 *   → circularDistance = min(1200, 240) = 240
 *
 *   [1380,1440) and [0,60)   →  adjacent, distance = 0
 */
export function distanceBetweenTemporalWindows(a: TemporalWindow, b: TemporalWindow): number {
  if (temporalWindowsIntersect(a, b) || temporalWindowAdjacent(a, b)) return 0;

  const aSubs = splitWrappedWindow(a);
  const bSubs = splitWrappedWindow(b);

  let minDist = Infinity;
  for (const as of aSubs) {
    for (const bs of bSubs) {
      // Linear and wrapped gaps
      const d1 = bs.startMinute - as.endMinute;               // b after a (linear)
      const d2 = as.startMinute - bs.endMinute;               // a after b (linear)
      const d3 = (1440 - as.endMinute) + bs.startMinute;      // a ends, wraps to b
      const d4 = (1440 - bs.endMinute) + as.startMinute;      // b ends, wraps to a
      
      if (d1 >= 0) minDist = Math.min(minDist, d1);
      if (d2 >= 0) minDist = Math.min(minDist, d2);
      if (d3 >= 0) minDist = Math.min(minDist, d3);
      if (d4 >= 0) minDist = Math.min(minDist, d4);
    }
  }

  return minDist === Infinity ? 0 : minDist;
}

/**
 * Merges two windows into the smallest contiguous window containing both.
 * Only valid when windows overlap or are adjacent; throws otherwise.
 *
 * TOPOLOGY-SAFE (Section 1):
 * The naive linear approach (min(startA, startB) to max(endA, endB)) breaks for
 * wrapped windows because it cannot represent cross-midnight spans correctly.
 *
 * Strategy:
 *   1. Collect all sub-intervals from both windows (via splitWrappedWindow).
 *   2. Sort sub-intervals by startMinute.
 *   3. Greedily merge contiguous/overlapping segments on the linear number line.
 *   4. If the result spans midnight, reconstruct as a wrapped window.
 *   5. If the result is a single contiguous span, return it directly.
 *
 * Invariant: The returned window satisfies temporalWindowContains(result, a)
 *            and temporalWindowContains(result, b).
 */
export function mergeTemporalWindows(a: TemporalWindow, b: TemporalWindow): TemporalWindow {
  if (!temporalWindowsIntersect(a, b) && !temporalWindowAdjacent(a, b)) {
    throw new Error(
      `mergeTemporalWindows: [${formatTemporalWindow(a)}] and [${formatTemporalWindow(b)}] are not adjacent or overlapping`
    );
  }

  // Step 1: collect all sub-intervals as [start, end] pairs on the linear line
  const subs: Array<[number, number]> = [
    ...splitWrappedWindow(a).map(w => [w.startMinute, w.endMinute] as [number, number]),
    ...splitWrappedWindow(b).map(w => [w.startMinute, w.endMinute] as [number, number]),
  ];

  // Step 2: sort by start
  subs.sort((x, y) => x[0] - y[0]);

  // Step 3: greedily merge overlapping/adjacent segments
  const merged: Array<[number, number]> = [subs[0]];
  for (let i = 1; i < subs.length; i++) {
    const last = merged[merged.length - 1];
    const cur  = subs[i];
    if (cur[0] <= last[1]) {
      // Overlapping or adjacent — extend
      last[1] = Math.max(last[1], cur[1]);
    } else {
      merged.push(cur);
    }
  }

  if (merged.length === 1) {
    // Single contiguous span — return directly
    return createTemporalWindow(merged[0][0], merged[0][1]);
  }

  if (merged.length === 2) {
    // Two separate spans — can only represent as a wrapped window if they
    // span midnight: one ends at 1440, the other starts at 0.
    const [left, right] = merged;
    if (right[1] === 1440 && left[0] === 0) {
      // Reconstruct as wrapped: [right[0], ...wraps... left[1])
      // i.e. startMinute = right[0], endMinute = left[1]
      return createTemporalWindow(right[0], left[1]);
    }
    // Two non-midnight-adjacent spans — this should not happen if inputs are
    // adjacent/overlapping. Return the bounding span as best-effort.
    return createTemporalWindow(merged[0][0], merged[merged.length - 1][1]);
  }

  // >2 segments: return bounding span (edge case: full-day wrap)
  return createTemporalWindow(merged[0][0], merged[merged.length - 1][1]);
}

/**
 * Subtracts window `b` from window `a`, returning the remaining interval(s).
 *
 * Returns an empty array if `b` fully covers `a`.
 * Returns a one-element array for partial overlap.
 * Returns a two-element array if `b` cuts `a` in the middle.
 *
 * All returned windows maintain half-open semantics.
 */
export function subtractTemporalWindows(a: TemporalWindow, b: TemporalWindow): TemporalWindow[] {
  // Work on flat sub-windows (midnight-safe)
  const aSubs = splitWrappedWindow(a);
  const bSubs = splitWrappedWindow(b);

  const results: TemporalWindow[] = [];

  for (const as of aSubs) {
    // Collect remaining pieces after subtracting all b-sub-windows from this a-sub
    let pieces: Array<[number, number]> = [[as.startMinute, as.endMinute]];

    for (const bs of bSubs) {
      const next: Array<[number, number]> = [];
      for (const [ps, pe] of pieces) {
        const overlapS = Math.max(ps, bs.startMinute);
        const overlapE = Math.min(pe, bs.endMinute);
        if (overlapS >= overlapE) {
          // No overlap — keep piece unchanged
          next.push([ps, pe]);
        } else {
          // Left remainder
          if (ps < overlapS) next.push([ps, overlapS]);
          // Right remainder
          if (overlapE < pe) next.push([overlapE, pe]);
        }
      }
      pieces = next;
    }

    for (const [s, e] of pieces) {
      const w = tryCreateTemporalWindow(s, e);
      if (w) results.push(w);
    }
  }

  return results;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** Returns "HH:MM" string from minute value (1440 → "24:00" for display). */
function minutesToDisplay(m: number): string {
  const h = Math.floor(m / 60) % 25;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Human-readable representation: "[09:00, 17:00)  8h" */
export function formatTemporalWindow(w: TemporalWindow): string {
  const h = Math.floor(w.durationMinutes / 60);
  const m = w.durationMinutes % 60;
  const dur = h > 0 ? (m > 0 ? `${h}h${m}m` : `${h}h`) : `${m}m`;
  return `[${minutesToDisplay(w.startMinute)}, ${minutesToDisplay(w.endMinute)})  ${dur}`;
}

// ── Conversion Helpers ────────────────────────────────────────────────────────

/**
 * Converts a "HH:MM" string to local minutes (0–1439).
 * Returns null if parsing fails.
 */
export function timeStringToMinutes(time: string): number | null {
  if (!time || typeof time !== "string") return null;
  const parts = time.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Converts a Date to local minutes using an optional IANA timezone.
 * Falls back to UTC if no timezone is provided.
 */
export function dateToLocalMinutes(date: Date, ianaTimezone?: string): number {
  if (ianaTimezone) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: ianaTimezone,
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      const parts = formatter.formatToParts(date);
      const h = parseInt(parts.find(p => p.type === "hour")?.value   ?? "0", 10);
      const m = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
      return h * 60 + m;
    } catch { /* fall through */ }
  }
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

/** Formats local minutes (0–1440) as "HH:MM". */
export function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60) % 25;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Domain Helpers ────────────────────────────────────────────────────────────

/**
 * createSleepWakeWindow — canonical sleep window constructor (Section 3).
 *
 * Builds the correct TemporalWindow for a sleep period given average sleep and
 * wake minute-of-day values. Handles midnight-crossing internally so no
 * analyzer needs to duplicate this arithmetic.
 *
 * TOPOLOGY RULE:
 *   If wakeMinute > sleepMinute  → sleep does NOT cross midnight  → [sleep, wake)
 *   If wakeMinute < sleepMinute  → sleep crosses midnight         → wrapped [sleep, wake)
 *   If wakeMinute === sleepMinute → degenerate / unknown → returns null
 *
 * Examples:
 *   sleep=1380 (23:00), wake=420  (07:00) → [1380, 420)  wrapsMidnight=true
 *   sleep=0    (00:00), wake=480  (08:00) → [0, 480)     wrapsMidnight=false
 *   sleep=1380 (23:00), wake=1440 (24:00) → [1380, 1440) wrapsMidnight=false
 *
 * @param sleepMinute  minute-of-day when sleep begins, 0–1439
 * @param wakeMinute   minute-of-day when wake occurs,  1–1440
 * @returns TemporalWindow or null if inputs are invalid/degenerate
 */
export function createSleepWakeWindow(
  sleepMinute: number,
  wakeMinute: number
): TemporalWindow | null {
  if (!Number.isFinite(sleepMinute) || !Number.isFinite(wakeMinute)) return null;
  if (sleepMinute === wakeMinute) return null; // degenerate
  // Clamp to valid domain
  if (sleepMinute < 0 || sleepMinute > 1439) return null;
  if (wakeMinute  < 1 || wakeMinute  > 1440) return null;
  return tryCreateTemporalWindow(sleepMinute, wakeMinute);
}
