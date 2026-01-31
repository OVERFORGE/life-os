type GoalPressureWeights = {
  cadence: number;
  energy: number;
  stress: number;
  phaseMismatch: number;
};

function clamp(n: number, min = 0.05, max = 0.6) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function updateGoalLoadWeightsFromFeedback({
  outcome,
  currentWeights,
}: {
  outcome: "stable" | "overloaded" | "underutilized";
  currentWeights: GoalPressureWeights;
}): {
  changed: boolean;
  nextWeights: GoalPressureWeights;
  reason: string;
} {
  let next = { ...currentWeights };
  let changed = false;
  let reason = "";

  if (outcome === "overloaded") {
    next.cadence *= 1.05;
    next.stress *= 1.05;
    changed = true;
    reason = "System overloaded → increased cadence & stress sensitivity";
  }

  if (outcome === "underutilized") {
    next.energy *= 0.95;
    next.phaseMismatch *= 0.95;
    changed = true;
    reason = "System underutilized → relaxed energy & phase mismatch impact";
  }

  if (outcome === "stable") {
    return {
      changed: false,
      nextWeights: currentWeights,
      reason: "System stable → no goal load adjustment",
    };
  }

  return {
    changed,
    nextWeights: {
      cadence: clamp(next.cadence),
      energy: clamp(next.energy),
      stress: clamp(next.stress),
      phaseMismatch: clamp(next.phaseMismatch),
    },
    reason,
  };
}
