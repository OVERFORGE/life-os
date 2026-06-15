import { BehavioralProfile } from "@/server/db/models/BehavioralProfile";

/**
 * Analyzes overall behavioral regularity (stability).
 * 0 -> chaotic, 1 -> highly stable.
 * Takes the already-computed variances and confidence scores from individual analyzers.
 */
export async function analyzeBehaviorStability(
  wakeVariance: number,
  wakeConfidence: number,
  sleepVariance: number,
  sleepConfidence: number,
  workoutConsistencyScore: number,
  workoutConfidence: number,
  focusConfidence: number
) {
  let stabilitySum = 0;
  let stabilityFactors = 0;

  // 1. Wake Stability (Lower variance = higher stability)
  if (wakeConfidence > 0) {
    const wakeStability = Math.exp(-wakeVariance / (3600 * 2));
    stabilitySum += wakeStability;
    stabilityFactors++;
  }

  // 2. Sleep Stability
  if (sleepConfidence > 0) {
    const sleepStability = Math.exp(-sleepVariance / (3600 * 2));
    stabilitySum += sleepStability;
    stabilityFactors++;
  }

  // 3. Workout Routine Adherence
  if (workoutConfidence > 0) {
    stabilitySum += workoutConsistencyScore;
    stabilityFactors++;
  }

  // 4. Focus/Deep Work Regularity
  if (focusConfidence > 0) {
    stabilitySum += focusConfidence;
    stabilityFactors++;
  }

  // Future Architecture Placeholders:
  // - Circadian drift detection scoring (stability modifier if drift is detected vs random jumps).
  // - Data reliability scoring multiplier (e.g. if we detect batch-filled fake logs, lower overall confidence).

  const score = stabilityFactors > 0 ? Number((stabilitySum / stabilityFactors).toFixed(3)) : 0;
  
  // Confidence scales with how many stability factors we were actually able to measure
  const confidence = Number((stabilityFactors / 4).toFixed(3));

  return {
    score,
    confidence,
  };
}
