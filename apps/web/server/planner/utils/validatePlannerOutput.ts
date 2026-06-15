/**
 * Planner Output Validation Layer
 *
 * INTERVAL SEMANTICS: Half-open [startMinute, endMinute)
 *   startMinute: 0–1439 (inclusive)
 *   endMinute:   1–1440 (exclusive; 1440 = "until midnight")
 *
 * PHILOSOPHY (FIX 15):
 *   Never hard-throw. Return structured errors + warnings.
 *   Orchestrators log and persist partial-safe profiles.
 *   Temporal consistency violations are warnings, not errors.
 */

import { calculateTemporalOverlap, tryCreateTemporalWindow, subtractTemporalWindows } from "./TemporalWindow";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Primitive Guards ──────────────────────────────────────────────────────────

export function isSafeNumber(v: unknown, field: string): string | null {
  if (typeof v !== "number" || !isFinite(v) || isNaN(v)) return `${field}: not a finite number (got ${v})`;
  return null;
}

export function isClamped(v: number, min: number, max: number, field: string): string | null {
  if (v < min || v > max) return `${field}: out of range [${min}, ${max}] (got ${v})`;
  return null;
}

// ── Domain Validators — Half-Open Semantics ───────────────────────────────────

/**
 * Validates a half-open interval [startMinute, endMinute).
 * startMinute: 0–1439
 * endMinute:   1–1440 (1440 is the only value exceeding 1439, meaning "until midnight")
 */
export function validateMinuteRange(start: number, end: number, label: string): string[] {
  const errors: string[] = [];

  const startNumErr = isSafeNumber(start, `${label}.startMinute`);
  if (startNumErr) { errors.push(startNumErr); }
  else {
    const startRangeErr = isClamped(start, 0, 1439, `${label}.startMinute`);
    if (startRangeErr) errors.push(startRangeErr);
  }

  const endNumErr = isSafeNumber(end, `${label}.endMinute`);
  if (endNumErr) { errors.push(endNumErr); }
  else {
    // endMinute may be 1–1440 (half-open: 1440 is sentinel for midnight)
    if (end < 1 || end > 1440) {
      errors.push(`${label}.endMinute: must be 1–1440 (half-open), got ${end}`);
    }
    // Negative duration: start >= end for non-wrapped windows
    if (!errors.length && end <= start && end !== 1440) {
      // Check if it's a valid wrapped window
      if (end >= start) {
        errors.push(`${label}: zero or negative duration [${start},${end}) — use 1440 for midnight or a wrapped window`);
      }
    }
  }

  return errors;
}

export function validateConfidence(v: number, field: string): string[] {
  const numErr = isSafeNumber(v, field);
  if (numErr) return [numErr];
  const rangeErr = isClamped(v, 0, 1, field);
  return rangeErr ? [rangeErr] : [];
}

export function validateDaysOfWeek(days: unknown, field: string): string[] {
  if (!Array.isArray(days)) return [`${field}: must be an array`];
  const bad = (days as any[]).filter(d => typeof d !== "number" || d < 0 || d > 6);
  return bad.length > 0 ? [`${field}: invalid day values [${bad.join(",")}]`] : [];
}

export function validateChronotype(type: unknown, field: string): string[] {
  const allowed = ["morning", "night", "balanced", "unknown"];
  return allowed.includes(type as string)
    ? []
    : [`${field}: invalid chronotype "${type}". Must be: ${allowed.join(", ")}`];
}

// ── Compound Window Validators ────────────────────────────────────────────────

export function validateAvailabilityWindow(w: any, idx: number): string[] {
  const label = `availabilityWindows[${idx}]`;
  return [
    ...validateMinuteRange(w.startMinute, w.endMinute, label),
    ...validateConfidence(w.score,      `${label}.score`),
    ...validateConfidence(w.confidence, `${label}.confidence`),
    ...validateDaysOfWeek(w.daysOfWeek, `${label}.daysOfWeek`),
  ];
}

export function validateRecurringConstraint(c: any, idx: number): string[] {
  const label = `recurringConstraints[${idx}]`;
  return [
    ...validateMinuteRange(c.startMinute, c.endMinute, label),
    ...validateConfidence(c.confidence,         `${label}.confidence`),
    ...validateConfidence(c.stabilityScore,     `${label}.stabilityScore`),
    ...validateConfidence(c.constraintStrength, `${label}.constraintStrength`),
    ...validateDaysOfWeek(c.daysOfWeek, `${label}.daysOfWeek`),
    ...(typeof c.temporalSpreadDays === "number" && c.temporalSpreadDays < 0
      ? [`${label}.temporalSpreadDays: cannot be negative`] : []),
  ];
}

export function validateRecoveryWindow(r: any, idx: number): string[] {
  const label = `recoveryWindows[${idx}]`;
  const errors = [
    ...validateMinuteRange(r.startMinute, r.endMinute, label),
    ...validateConfidence(r.confidence,      `${label}.confidence`),
    ...validateConfidence(r.recoveryPenalty, `${label}.recoveryPenalty`),
  ];
  if (r.recoveryPenalty > 0.5) errors.push(`${label}.recoveryPenalty: exceeds hard cap of 0.5 (got ${r.recoveryPenalty})`);
  if (typeof r.lagMinutes === "number" && r.lagMinutes < 0) errors.push(`${label}.lagMinutes: cannot be negative`);
  return errors;
}

// ── FIX 12 + Section 7: Temporal Consistency ─────────────────────────────────

export function validateTemporalConsistency(profile: any): string[] {
  const warnings: string[] = [];

  const constraints = (profile.recurringConstraints ?? []) as any[];
  const avail       = (profile.availabilityWindows  ?? []) as any[];
  const recovery    = (profile.recoveryWindows       ?? []) as any[];

  // 1. Overlapping high-strength constraints on same day
  for (let i = 0; i < constraints.length; i++) {
    for (let j = i + 1; j < constraints.length; j++) {
      const a = constraints[i]; const b = constraints[j];
      const sharedDays = (a.daysOfWeek ?? []).filter((d: number) => (b.daysOfWeek ?? []).includes(d));
      if (!sharedDays.length) continue;
      const wa = tryCreateTemporalWindow(a.startMinute, a.endMinute);
      const wb = tryCreateTemporalWindow(b.startMinute, b.endMinute);
      if (!wa || !wb) continue;
      const { overlapMinutes } = calculateTemporalOverlap(wa, wb);
      if (overlapMinutes > 30) {
        const bothHigh = a.constraintStrength > 0.7 && b.constraintStrength > 0.7;
        warnings.push(
          `TEMPORAL_${bothHigh ? "CONFLICT" : "OVERLAP"}: constraints[${i}] and [${j}] ` +
          `overlap ${overlapMinutes}min on days [${sharedDays}]`
        );
      }
    }
  }

  // 2. Recovery windows overlapping sleep
  const wakeMin  = profile.behavioralProfile?.wakeWindow?.averageMinutes  ?? null;
  const sleepMin = profile.behavioralProfile?.sleepWindow?.averageMinutes ?? null;
  if (wakeMin !== null && sleepMin !== null) {
    const sleepW = tryCreateTemporalWindow(sleepMin, wakeMin < sleepMin ? wakeMin + 1440 : wakeMin);
    for (const [idx, r] of recovery.entries()) {
      const rw = tryCreateTemporalWindow(r.startMinute, r.endMinute);
      if (!sleepW || !rw) continue;
      const { overlapMinutes } = calculateTemporalOverlap(sleepW, rw);
      if (overlapMinutes > 30) {
        warnings.push(`TEMPORAL_IMPOSSIBLE: recoveryWindows[${idx}] overlaps sleep window by ${overlapMinutes}min`);
      }
    }
  }

  // 3. Duplicate availability windows (by normalized key)
  const seenKeys = new Set<string>();
  for (let i = 0; i < avail.length; i++) {
    const w = avail[i];
    const key = `${(w.daysOfWeek ?? []).slice().sort().join(",")}_${w.startMinute}_${w.endMinute}`;
    if (seenKeys.has(key)) warnings.push(`TEMPORAL_DUPLICATE: availabilityWindows[${i}] duplicates window (${key})`);
    else seenKeys.add(key);
  }

  // 4. High-score availability inside high-strength constraints (contradiction)
  for (const [wi, w] of avail.entries()) {
    if (w.score < 0.8) continue;
    const ww = tryCreateTemporalWindow(w.startMinute, w.endMinute);
    if (!ww) continue;
    for (const [ci, c] of constraints.entries()) {
      if (c.constraintStrength < 0.7) continue;
      const sharedDays = (w.daysOfWeek ?? []).filter((d: number) => (c.daysOfWeek ?? []).includes(d));
      if (!sharedDays.length) continue;
      const wc = tryCreateTemporalWindow(c.startMinute, c.endMinute);
      if (!wc) continue;
      const { overlapMinutes } = calculateTemporalOverlap(ww, wc);
      if (overlapMinutes > 20) {
        warnings.push(
          `TEMPORAL_CONTRADICTION: availabilityWindows[${wi}] score=${w.score} ` +
          `overlaps high-strength constraint[${ci}] by ${overlapMinutes}min`
        );
      }
    }
  }

  // 5. Invalid 1440 usage: only endMinute may be 1440
  for (const [idx, w] of avail.entries()) {
    if (w.startMinute === 1440) warnings.push(`INVALID_1440: availabilityWindows[${idx}].startMinute = 1440 is not allowed`);
  }

  return warnings;
}

// ── Full Profile Validators ───────────────────────────────────────────────────

export function validateConstraintProfile(profile: any): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  (profile.availabilityWindows  ?? []).forEach((w: any, i: number) => errors.push(...validateAvailabilityWindow(w, i)));
  (profile.recurringConstraints ?? []).forEach((c: any, i: number) => errors.push(...validateRecurringConstraint(c, i)));
  (profile.recoveryWindows      ?? []).forEach((r: any, i: number) => errors.push(...validateRecoveryWindow(r, i)));

  if (profile.commutePatterns?.confidence != null) {
    errors.push(...validateConfidence(profile.commutePatterns.confidence, "commutePatterns.confidence"));
    if (profile.commutePatterns.confidence > 0.4) {
      warnings.push("commutePatterns.confidence exceeds 0.4 hard cap — commute inference cannot be high-certainty");
    }
  }

  warnings.push(...validateTemporalConsistency(profile));
  return { valid: errors.length === 0, errors, warnings };
}

export function validateBehavioralProfile(profile: any): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  errors.push(...validateConfidence(profile.behaviorStabilityScore ?? 0, "behaviorStabilityScore"));

  if (profile.wakeWindow)  errors.push(...validateConfidence(profile.wakeWindow.confidence,  "wakeWindow.confidence"));
  if (profile.sleepWindow) errors.push(...validateConfidence(profile.sleepWindow.confidence, "sleepWindow.confidence"));

  if (profile.chronotype?.type) {
    errors.push(...validateChronotype(profile.chronotype.type, "chronotype.type"));
    errors.push(...validateConfidence(profile.chronotype.confidence ?? 0, "chronotype.confidence"));
    if ((profile.chronotype.confidence ?? 0) > 0.45) {
      warnings.push("chronotype.confidence > 0.45 cap — per-day focus windows not yet available");
    }
  }

  (profile.peakFocusWindows ?? []).forEach((w: any, i: number) => {
    errors.push(...validateMinuteRange(w.startMinute, w.endMinute, `peakFocusWindows[${i}]`));
    errors.push(...validateConfidence(w.confidence, `peakFocusWindows[${i}].confidence`));
    errors.push(...validateConfidence(w.score,      `peakFocusWindows[${i}].score`));
  });

  return { valid: errors.length === 0, errors, warnings };
}
