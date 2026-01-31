type Sensitivity = {
  sleepImpact: number;
  stressImpact: number;
  energyImpact: number;
  moodImpact: number;
};

function clamp(n: number, min = 0.5, max = 2) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(min, Math.min(max, n));
}

export function updatePhaseSensitivityFromFeedback({
  previousPhase,
  currentPhase,
  delta,
  currentSensitivity,
}: {
  previousPhase: string;
  currentPhase: string;
  delta: {
    sleep?: number;
    stress?: number;
    energy?: number;
    mood?: number;
  };
  currentSensitivity: Sensitivity;
}): Sensitivity {
  const next = { ...currentSensitivity };

  const stalled =
    previousPhase === currentPhase ||
    (previousPhase === "slump" && currentPhase === "burnout") ||
    (previousPhase === "recovery" && currentPhase === "slump");

  if (!stalled) return currentSensitivity;

  if (delta.sleep && delta.sleep > 0.3) next.sleepImpact *= 0.95;
  if (delta.energy && delta.energy > 0.3) next.energyImpact *= 0.95;
  if (delta.mood && delta.mood > 0.3) next.moodImpact *= 0.95;
  if (delta.stress && delta.stress > 0.3) next.stressImpact *= 1.05;

  return {
    sleepImpact: clamp(next.sleepImpact),
    stressImpact: clamp(next.stressImpact),
    energyImpact: clamp(next.energyImpact),
    moodImpact: clamp(next.moodImpact),
  };
}
