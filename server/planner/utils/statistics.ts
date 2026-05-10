/**
 * Calculates standard variance of an array of numbers.
 */
export function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculates standard deviation (square root of variance).
 */
export function calculateStandardDeviation(values: number[]): number {
  return Math.sqrt(calculateVariance(values));
}

/**
 * Maps variance to a strict 0-1 confidence score.
 * Lower variance = higher confidence.
 * Also considers number of data points (more points = higher baseline confidence).
 * 
 * FUTURE ARCHITECTURE PLACEHOLDER: Sigmoid / Logistic Curve
 * Currently, we use exponential decay for simplicity in V1.
 * As the behavioral model matures, this should migrate to a true logistic/sigmoid 
 * confidence curve to better handle variance plateaus and avoid steep drop-offs.
 * The signature of this utility function is structured to allow that seamless swap later.
 * 
 * @param variance The calculated variance
 * @param n Number of data points
 * @param acceptableVariance The variance at which confidence drops to ~50%
 */
export function calculateConfidence(variance: number, n: number, acceptableVariance: number): number {
  if (n < 3) return 0; // Not enough data
  
  // Base confidence based on sample size (caps at 1 for n >= 30)
  const sampleSizeMultiplier = Math.min(1, n / 30);
  
  // Variance confidence (exponential decay)
  const varianceConfidence = Math.exp(-variance / (acceptableVariance * 2));
  
  return Number((varianceConfidence * sampleSizeMultiplier).toFixed(3));
}

/**
 * Calculates a weighted average emphasizing recency.
 * Weights:
 * - Last 30 days: 0.7
 * - 31-90 days: 0.2
 * - >90 days: 0.1
 */
export function weightedAverageByRecency(data: { value: number; date: Date | string }[]): number {
  if (data.length === 0) return 0;

  let recentSum = 0;
  let recentCount = 0;
  let midSum = 0;
  let midCount = 0;
  let oldSum = 0;
  let oldCount = 0;

  const now = new Date().getTime();
  const DAY_MS = 1000 * 60 * 60 * 24;

  for (const item of data) {
    const itemTime = new Date(item.date).getTime();
    if (isNaN(itemTime)) continue;

    const daysOld = (now - itemTime) / DAY_MS;

    if (daysOld <= 30) {
      recentSum += item.value;
      recentCount++;
    } else if (daysOld <= 90) {
      midSum += item.value;
      midCount++;
    } else {
      oldSum += item.value;
      oldCount++;
    }
  }

  // If we only have data in one or two buckets, we must redistribute the weights so they sum to 1.
  let recentWeight = recentCount > 0 ? 0.7 : 0;
  let midWeight = midCount > 0 ? 0.2 : 0;
  let oldWeight = oldCount > 0 ? 0.1 : 0;

  const totalWeight = recentWeight + midWeight + oldWeight;
  if (totalWeight === 0) return 0;

  recentWeight /= totalWeight;
  midWeight /= totalWeight;
  oldWeight /= totalWeight;

  const recentAvg = recentCount > 0 ? recentSum / recentCount : 0;
  const midAvg = midCount > 0 ? midSum / midCount : 0;
  const oldAvg = oldCount > 0 ? oldSum / oldCount : 0;

  return (recentAvg * recentWeight) + (midAvg * midWeight) + (oldAvg * oldWeight);
}

/**
 * Returns a temporal decay multiplier (0–1) for a data point N days old.
 *
 * - Days  0–14 → weight near 1.0 (dominant)
 * - Days 15–60 → moderate weight
 * - Days 60–90 → weak weight
 * - Days 90+   → very weak (near 0)
 *
 * Uses an exponential decay curve with a half-life of ~30 days.
 */
export function applyTemporalDecay(daysOld: number): number {
  const HALF_LIFE = 30; // Days for weight to drop to ~50%
  return Math.exp((-Math.LN2 / HALF_LIFE) * Math.max(0, daysOld));
}

/**
 * Clamps a value strictly between min and max.
 * Prevents NaN, Infinity, and out-of-range scores.
 */
export function clamp(value: number, min = 0, max = 1): number {
  if (!isFinite(value) || isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamps a minute value to the valid 0–1439 range.
 */
export function clampMinutes(minutes: number): number {
  return clamp(Math.round(minutes), 0, 1439);
}
