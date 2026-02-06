// features/signals/engine/computeSignalScore.ts

/**
 * Normalize a signal value against its target.
 *
 * Example:
 * water = 2.5L, target = 3L → score = 0.83
 */

export function computeSignalScore({
  value,
  target,
  direction,
}: {
  value: number;
  target: number | null;
  direction: "higher_better" | "lower_better";
}) {
  if (target == null) return 0;

  let score = value / target;

  if (direction === "lower_better") {
    score = target / Math.max(value, 0.0001);
  }

  // Clamp 0–1.5 then normalize
  score = Math.max(0, Math.min(score, 1.5));

  return Math.min(1, score);
}
