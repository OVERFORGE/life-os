// features/goals/engine/analyzeGlobalGoalLoad.ts

import { GoalPressureReport } from "./analyzeGoalPressure";

/* ============================== */
/* Helpers                        */
/* ============================== */

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/* ============================== */
/* Global Load Analyzer (V2)      */
/* ============================== */

/**
 * This function takes already-computed goal pressures
 * and produces a system-wide global load summary.
 *
 * ✅ No DB logic
 * ✅ No duplicate scoring
 * ✅ Learning-ready output
 */
export type GlobalGoalLoadReport = ReturnType<typeof analyzeGlobalGoalLoad>;

export function analyzeGlobalGoalLoad(
  pressures: GoalPressureReport[]
) {
  /* ---------------- Empty Case ---------------- */

  if (!pressures.length) {
    return {
      global: {
        score: 0,
        mode: "underutilized" as const,
        distribution: {
          aligned: 0,
          strained: 0,
          conflicting: 0,
          toxic: 0,
        },
      },
      topDrivers: [],
    };
  }

  /* ---------------- Distribution ---------------- */

  const distribution = {
    aligned: 0,
    strained: 0,
    conflicting: 0,
    toxic: 0,
  };

  let total = 0;

  for (const g of pressures) {
    distribution[g.status]++;
    total += g.pressureScore;
  }

  /* ---------------- Global Score ---------------- */

  const avgScore = clamp01(total / pressures.length);

  /* ---------------- Mode Detection ---------------- */

  let mode: "stable" | "underutilized" | "overloaded" =
    "stable";

  if (avgScore > 0.68) mode = "overloaded";
  else if (avgScore < 0.22) mode = "underutilized";

  /* ---------------- Top Drivers ---------------- */

  const topDrivers = [...pressures]
    .sort((a, b) => b.pressureScore - a.pressureScore)
    .slice(0, 3)
    .map((g) => ({
      goalId: g.goalId,
      score: g.pressureScore,
      status: g.status,
      mainReason: g.reasons?.[0] || "High pressure goal",
    }));

  /* ---------------- Return ---------------- */

  return {
    global: {
      score: avgScore,
      mode,
      distribution,
    },
    topDrivers,
  };
}
