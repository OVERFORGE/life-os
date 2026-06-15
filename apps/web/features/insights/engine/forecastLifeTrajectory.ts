type Snapshot = {
  avgStress: number;
  avgEnergy: number;
  avgMood: number;
  avgSleep: number;
};

function slope(values: number[]) {
  if (values.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < values.length; i++) {
    sum += values[i] - values[i - 1];
  }
  return sum / (values.length - 1);
}

export function forecastLifeTrajectory(phases: any[]) {
  // Take last 5 phases or less
  const recent = phases.slice(-5);

  if (recent.length < 3) {
    return null;
  }

  const stressSeries = recent.map(p => p.snapshot?.avgStress ?? 0);
  const sleepSeries = recent.map(p => p.snapshot?.avgSleep ?? 0);
  const energySeries = recent.map(p => p.snapshot?.avgEnergy ?? 0);
  const moodSeries = recent.map(p => p.snapshot?.avgMood ?? 0);

  const stressSlope = slope(stressSeries);
  const sleepSlope = slope(sleepSeries);
  const energySlope = slope(energySeries);
  const moodSlope = slope(moodSeries);

  const current = recent[recent.length - 1].snapshot;

  // Normalize 0–1
  const stress = current.avgStress / 10;
  const sleep = current.avgSleep / 10;
  const energy = current.avgEnergy / 10;
  const mood = current.avgMood / 10;

  let predicted: string | null = null;
  let etaDays: number | null = null;
  let confidence = 0.0;

  // 🔥 Burnout trajectory
  if (stressSlope > 0.15 && sleepSlope < -0.1 && energySlope < -0.1) {
    predicted = "burnout";

    const stressToCritical = (8 - current.avgStress);
    const sleepToCritical = (current.avgSleep - 5);

    const daysByStress = stressSlope !== 0 ? stressToCritical / stressSlope : 999;
    const daysBySleep = sleepSlope !== 0 ? sleepToCritical / Math.abs(sleepSlope) : 999;

    etaDays = Math.max(3, Math.round(Math.min(daysByStress, daysBySleep)));

    confidence = Math.min(1, 0.6 + stressSlope);
  }

  // 🕳️ Slump trajectory
  else if (energySlope < -0.15 && moodSlope < -0.1) {
    predicted = "slump";

    const energyToLow = (energy * 10 - 3);
    const days = energySlope !== 0 ? energyToLow / Math.abs(energySlope) : 999;

    etaDays = Math.max(3, Math.round(days));
    confidence = Math.min(1, 0.5 + Math.abs(energySlope));
  }


  const uniquePhases = Array.from(new Set(recent.map(p => p.phase)));

  if (uniquePhases.length === 2 && recent.length >= 4) {
    return {
      predictedPhase: "instability_loop",
      etaDays: null,
      confidence: 0.7,
      trends: {
        stressSlope,
        sleepSlope,
        energySlope,
        moodSlope,
      },
      note: "You are oscillating between states without stabilizing."
    };
  }

  if (!predicted) return null;

  return {
    predictedPhase: predicted,
    etaDays,
    confidence,
    trends: {
      stressSlope,
      sleepSlope,
      energySlope,
      moodSlope,
    },
  };

}
