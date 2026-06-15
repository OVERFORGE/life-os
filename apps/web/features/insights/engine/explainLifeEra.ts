import { LifeEra } from "../types";

export type EraExplanation = {
  scores: {
    growth: number;
    decline: number;
    stress: number;
    stability: number;
    chaos: number;
    drift: number;
    recovery: number;
    risk: number;
  };

  causes: string[];
  changes: string[];
  signals: string[];
  risks: string[];
  leverage: string[];
  summary: string;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function explainLifeEra(
  era: LifeEra,
  prevEra: LifeEra | null
): EraExplanation {
  const causes: string[] = [];
  const changes: string[] = [];
  const signals: string[] = [];
  const risks: string[] = [];
  const leverage: string[] = [];

  const cur = era.summaryVector;
  const prev = prevEra?.summaryVector;

  // ----------------------------
  // 1️⃣ Compute core scores
  // ----------------------------

  const growth =
    clamp01((era.direction === "up" ? 0.6 : 0) + (cur.avgEnergy - 5) / 5);

  const decline =
    clamp01((era.direction === "down" ? 0.6 : 0) + (5 - cur.avgEnergy) / 5);

  const stress = clamp01(cur.avgStress / 10);

  const stability = clamp01(era.stability);

  const chaos = clamp01(era.volatility);

  const drift = clamp01(
    era.dominantPhase === "balanced" && era.direction === "flat" ? 0.7 : 0.2
  );

  const recovery = clamp01(
    era.dominantPhase === "recovery" ? 0.8 : (cur.avgSleep - 6) / 4
  );

  const risk = clamp01(
    stress * 0.4 + chaos * 0.4 + decline * 0.3 - stability * 0.3
  );

  const scores = {
    growth,
    decline,
    stress,
    stability,
    chaos,
    drift,
    recovery,
    risk,
  };

  // ----------------------------
  // 2️⃣ Causes (why this started)
  // ----------------------------
  if (!prevEra) {
    causes.push("This is the first detected life chapter in the system.");
  } else {
    if (cur.avgStress - prev!.avgStress > 0.7) {
      causes.push("Stress increased significantly compared to the previous era.");
    }
    if (cur.avgEnergy - prev!.avgEnergy < -0.7) {
      causes.push("Energy dropped compared to the previous era.");
    }
    if (cur.avgMood - prev!.avgMood < -0.7) {
      causes.push("Mood declined compared to the previous era.");
    }
    if (cur.avgSleep - prev!.avgSleep < -0.7) {
      causes.push("Sleep quality reduced compared to the previous era.");
    }
  }

  // ----------------------------
  // 3️⃣ Changes (what is different)
  // ----------------------------
  if (prev) {
    if (Math.abs(cur.avgMood - prev.avgMood) > 0.6) {
      changes.push(
        `Average mood changed from ${prev.avgMood.toFixed(1)} to ${cur.avgMood.toFixed(1)}.`
      );
    }
    if (Math.abs(cur.avgEnergy - prev.avgEnergy) > 0.6) {
      changes.push(
        `Average energy changed from ${prev.avgEnergy.toFixed(1)} to ${cur.avgEnergy.toFixed(1)}.`
      );
    }
    if (Math.abs(cur.avgStress - prev.avgStress) > 0.6) {
      changes.push(
        `Average stress changed from ${prev.avgStress.toFixed(1)} to ${cur.avgStress.toFixed(1)}.`
      );
    }
    if (Math.abs(cur.avgSleep - prev.avgSleep) > 0.6) {
      changes.push(
        `Average sleep changed from ${prev.avgSleep.toFixed(1)} to ${cur.avgSleep.toFixed(1)}.`
      );
    }
  }

  // ----------------------------
  // 4️⃣ Signals (what defines this era)
  // ----------------------------
  if (scores.growth > 0.6) signals.push("Strong growth momentum.");
  if (scores.decline > 0.6) signals.push("Clear downward trajectory.");
  if (scores.stress > 0.6) signals.push("High stress load.");
  if (scores.stability > 0.7) signals.push("High internal stability.");
  if (scores.chaos > 0.6) signals.push("High volatility and inconsistency.");
  if (scores.drift > 0.6) signals.push("Stable but directionless period.");
  if (scores.recovery > 0.6) signals.push("Strong recovery and regeneration signals.");

  signals.push(`Dominant phase: ${era.dominantPhase}.`);

  // ----------------------------
  // 5️⃣ Risks
  // ----------------------------
  if (scores.risk > 0.7) {
    risks.push("High risk of burnout, collapse, or long-term damage.");
  }
  if (scores.stress > 0.7 && scores.stability < 0.4) {
    risks.push("Stress combined with instability can cause sudden breakdown.");
  }
  if (scores.decline > 0.6) {
    risks.push("Negative trajectory may compound if not corrected.");
  }
  if (scores.drift > 0.6) {
    risks.push("Time and effort may be wasted without strategic direction.");
  }

  // ----------------------------
  // 6️⃣ Leverage (highest ROI actions)
  // ----------------------------
  if (scores.stress > 0.6) {
    leverage.push("Reduce load and protect recovery capacity.");
  }
  if (scores.drift > 0.6) {
    leverage.push("Introduce clear goals and tighter structure.");
  }
  if (scores.chaos > 0.6) {
    leverage.push("Simplify schedule and reduce context switching.");
  }
  if (scores.growth > 0.6) {
    leverage.push("Stabilize and systematize what is currently working.");
  }
  if (scores.decline > 0.6) {
    leverage.push("Focus on restoring energy, mood, and baseline habits first.");
  }

  // ----------------------------
  // 7️⃣ Summary (human-readable state)
  // ----------------------------
  let summary = "This is a transitional and mixed period.";

  if (scores.growth > 0.7 && scores.stability > 0.6) {
    summary = "This era represents a strong and stable growth phase.";
  } else if (scores.decline > 0.7 && scores.stress > 0.6) {
    summary = "This era reflects a high-pressure decline with elevated risk.";
  } else if (scores.drift > 0.6) {
    summary = "This era is stable on the surface but lacks clear direction.";
  } else if (scores.recovery > 0.6) {
    summary = "This era is focused on recovery and rebuilding capacity.";
  } else if (scores.chaos > 0.7) {
    summary = "This era is marked by instability and unpredictable fluctuations.";
  }

  return {
    scores,
    causes,
    changes,
    signals,
    risks,
    leverage,
    summary,
  };
}
