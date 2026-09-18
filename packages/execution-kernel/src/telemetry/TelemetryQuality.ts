/**
 * Telemetry Quality Model & Assessor
 *
 * Assesses the quality, coverage, completeness, and freshness of ingested telemetry.
 * Attached to TelemetryPayload for downstream engine confidence attenuation.
 * 100% Deterministic — uses supplied reference timestamps instead of system clock Date.now().
 *
 * Phase D Calibration (D-12 & D-13):
 *
 * D-12: Skipped-day penalty is now capped.
 *   OLD: penalty += missingLogsCount × 0.05  (unbounded — can reach 0.70 at 14 missing days)
 *   NEW: penalty += min(0.30, missingLogsCount × 0.04)  (capped at 0.30, preserves gradient)
 *
 * D-13: Stale and sparse confidence attenuation replaced with multiplicative factor model.
 *   OLD: additive penalties (isStale → +0.20, isSparse → +0.25) applied independently.
 *        Combined effect when both: 0.45 penalty — double-punishes correlated conditions.
 *   NEW: independent multiplicative retention factors applied to baseQuality.
 *        stalenessFactor = isStale  ? 0.80 : 1.0
 *        sparsityFactor  = isSparse ? 0.75 : 1.0
 *        Combined effect when both: baseQuality × 0.80 × 0.75 = 60% of base (not 55%)
 *        Monotonic, no double-punishment, no step-function discontinuity.
 */

export interface TelemetryQualityDefects {
  missingLogsCount: number;
  hasSkippedDays:   boolean;
  isStale:          boolean; // True if freshnessDays > 2
  isSparse:         boolean; // True if coverage < 0.50
}

export interface TelemetryQuality {
  coverage:          number; // 0.0 - 1.0 (Logged days vs. required window length)
  completeness:      number; // 0.0 - 1.0 (Logged fields vs. total fields)
  freshnessDays:     number; // Days since latest DailyLog entry relative to reference timestamp
  consistencyScore:  number; // Variance stability across evaluation window
  overallConfidence: number; // Attenuated quality score after defect penalties
  defects:           TelemetryQualityDefects;
}

// D-13: Multiplicative retention constants — independently calibrated
const STALENESS_RETENTION = 0.80; // Stale telemetry retains 80% of quality confidence
const SPARSITY_RETENTION  = 0.75; // Sparse telemetry retains 75% of quality confidence
const MIN_CONFIDENCE      = 0.10; // Absolute floor

/**
 * Calculates TelemetryQuality deterministically using a reference timestamp.
 */
export function calculateTelemetryQuality(
  logDates: Date[],
  requiredWindowDays: number = 14,
  fieldCompletenessRatio: number = 0.90,
  referenceTimestamp?: number
): TelemetryQuality {
  const loggedCount = logDates.length;
  const coverage    = Math.min(1.0, Math.max(0.0, loggedCount / requiredWindowDays));

  // Determine reference time deterministically
  const refTime = referenceTimestamp
    ? referenceTimestamp
    : logDates.length > 0
    ? Math.max(...logDates.map((d) => d.getTime()))
    : 1785096398950; // Replay fallback timestamp

  // Freshness calculation
  let freshnessDays = 0;
  if (logDates.length > 0) {
    const latestDateMs = Math.max(...logDates.map((d) => d.getTime()));
    const diffTime     = Math.abs(refTime - latestDateMs);
    freshnessDays      = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  const missingLogsCount = Math.max(0, requiredWindowDays - loggedCount);
  const isStale          = freshnessDays > 2;
  const isSparse         = coverage < 0.50;
  const hasSkippedDays   = missingLogsCount > 0;

  // D-12: Capped skipped-day penalty (was: missingLogsCount × 0.05, unbounded)
  // NEW:  min(0.30, missingLogsCount × 0.04) — preserves gradient, caps at 0.30
  const skippedPenalty = Math.min(0.30, missingLogsCount * 0.04);

  // D-13: Multiplicative stale/sparse confidence attenuation (was: additive penalties)
  // Each factor is applied independently to base quality — no double-punishment.
  const stalenessFactor = isStale  ? STALENESS_RETENTION : 1.0;
  const sparsityFactor  = isSparse ? SPARSITY_RETENTION  : 1.0;

  const baseQuality        = Math.min(coverage, fieldCompletenessRatio);
  const attenuatedQuality  = baseQuality * stalenessFactor * sparsityFactor;
  const overallConfidence  = Math.min(1.0, Math.max(MIN_CONFIDENCE, attenuatedQuality - skippedPenalty));

  // ConsistencyScore: inverse of total attenuation for diagnostic purposes
  const totalAttenuation = (1.0 - stalenessFactor) + (1.0 - sparsityFactor) + skippedPenalty / 2;
  const consistencyScore = Number((1.0 - Math.min(1.0, totalAttenuation / 2)).toFixed(2));

  return Object.freeze({
    coverage:          Number(coverage.toFixed(2)),
    completeness:      Number(fieldCompletenessRatio.toFixed(2)),
    freshnessDays,
    consistencyScore,
    overallConfidence: Number(overallConfidence.toFixed(2)),
    defects: {
      missingLogsCount,
      hasSkippedDays,
      isStale,
      isSparse,
    },
  });
}
