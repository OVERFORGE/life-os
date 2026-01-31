function clamp(n: number, min = 0.5, max = 1.5) {
  return Math.max(min, Math.min(max, n));
}

export function updateGoalPressureFromFeedback({
  pressureScore,
  phaseDidImprove,
  weights,
}: {
  pressureScore: number;
  phaseDidImprove: boolean;
  weights: {
    cadence: number;
    energy: number;
    stress: number;
    phaseMismatch: number;
  };
}) {
  if (phaseDidImprove) return weights;

  const next = { ...weights };

  if (pressureScore > 0.6) {
    next.cadence *= 0.95;
    next.energy *= 0.95;
  }

  return {
    cadence: clamp(next.cadence),
    energy: clamp(next.energy),
    stress: clamp(next.stress),
    phaseMismatch: clamp(next.phaseMismatch),
  };
}
