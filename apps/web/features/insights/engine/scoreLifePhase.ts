type Metrics = {
  avgMood: number;
  avgEnergy: number;
  avgStress: number;
  avgSleep: number;
  avgDeepWork: number;
};

function clamp(x: number) {
  return Math.max(0, Math.min(1, x));
}

function norm(x: number, min: number, max: number) {
  return clamp((x - min) / (max - min));
}

export function scoreLifePhase(m: Metrics) {
  const mood = norm(m.avgMood, 1, 10);
  const energy = norm(m.avgEnergy, 1, 10);
  const stress = norm(m.avgStress, 1, 10);
  const sleep = norm(m.avgSleep, 4, 9);
  const work = norm(m.avgDeepWork, 0, 8);

  const load = clamp(stress * 0.6 + work * 0.4);
  const recovery = clamp(sleep * 0.5 + energy * 0.5);
  const stability = clamp((mood + energy + sleep) / 3);

  const burnout =
    0.45 * load +
    0.35 * (1 - recovery) +
    0.2 * stress;

  const slump =
    0.45 * (1 - mood) +
    0.35 * (1 - energy) +
    0.2 * (1 - work);

  const grind =
    0.5 * work +
    0.3 * load +
    0.2 * (1 - sleep);

  const recoveryPhase =
    0.5 * recovery +
    0.3 * (1 - work) +
    0.2 * (1 - stress);

  const balanced =
    0.4 * stability +
    0.3 * (1 - load) +
    0.3 * recovery;

  const drifting =
    0.4 * (1 - stability) +
    0.3 * (1 - work) +
    0.3 * (1 - mood);

  const scores = {
    burnout: clamp(burnout),
    slump: clamp(slump),
    grind: clamp(grind),
    recovery: clamp(recoveryPhase),
    balanced: clamp(balanced),
    drifting: clamp(drifting),
  };

  let best = "balanced";
  let bestScore = 0;

  for (const k in scores) {
    const v = scores[k as keyof typeof scores];
    if (v > bestScore) {
      bestScore = v;
      best = k;
    }
  }

  return {
    phase: best,
    scores,
    confidence: clamp(bestScore),
    system: {
      load,
      recovery,
      stability,
    },
  };
}
