export function stabilizeSensitivity(
  sensitivity: any,
  lastChangedAt: Date
) {
  const days =
    (Date.now() - new Date(lastChangedAt).getTime()) /
    (1000 * 60 * 60 * 24);

  if (days < 7) return sensitivity;

  return {
    sleepImpact: sensitivity.sleepImpact * 0.99,
    stressImpact: sensitivity.stressImpact * 0.99,
    energyImpact: sensitivity.energyImpact * 0.99,
    moodImpact: sensitivity.moodImpact * 0.99,
  };
}
