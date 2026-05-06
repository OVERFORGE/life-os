import { calculateEstimated1RM } from "./calculateEstimated1RM";

export type OverloadGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F' | 'N/A';

export interface ProgressionResult {
  estimated1RM: number;
  progressionDelta: number; // 1RM delta percentage
  overloadValid: boolean;
  overloadGrade: OverloadGrade;
  fatigueRisk: boolean;
}

export function detectProgression(
  currentWeight: number,
  currentReps: number,
  previousWeight: number,
  previousReps: number,
  targetReps: number
): ProgressionResult {
  const current1RM = calculateEstimated1RM(currentWeight, currentReps);
  
  if (!previousWeight || !previousReps) {
    return {
      estimated1RM: current1RM,
      progressionDelta: 0,
      overloadValid: true,
      overloadGrade: 'N/A',
      fatigueRisk: false
    };
  }

  const prev1RM = calculateEstimated1RM(previousWeight, previousReps);
  const delta = prev1RM > 0 ? ((current1RM - prev1RM) / prev1RM) * 100 : 0;
  
  const minimumValidReps = targetReps * 0.7;
  const overloadValid = currentReps >= minimumValidReps;
  const fatigueRisk = currentReps < minimumValidReps && currentWeight <= previousWeight;

  let grade: OverloadGrade = 'C';

  if (currentWeight > previousWeight) {
    if (currentReps >= previousReps) grade = 'S';
    else if (currentReps >= minimumValidReps) grade = 'A';
    else grade = 'F'; // Weight went up but reps collapsed entirely
  } else if (currentWeight === previousWeight) {
    if (currentReps > previousReps) grade = 'B';
    else if (currentReps === previousReps) grade = 'C';
    else grade = 'D'; // Reps dropped at same weight
  } else {
    // Weight went down
    if (currentReps > previousReps) grade = 'D'; // Deloading but hitting more reps
    else grade = 'F'; // Weight and reps dropped
  }

  return {
    estimated1RM: current1RM,
    progressionDelta: Number(delta.toFixed(2)),
    overloadValid,
    overloadGrade: grade,
    fatigueRisk
  };
}
