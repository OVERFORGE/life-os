// features/goals/engine/adaptGoalToSystemState.ts

import { analyzeGoalPressure } from "./analyzeGoalPressure";
import { GlobalGoalLoadReport } from "./analyzeGlobalGoalLoad";

export type GoalAdaptationV2 = {
  mode: "normal" | "maintenance" | "protective" | "paused";
  cadenceOverride?: "daily" | "weekly" | "flexible";
  intensityNote: string;
  rationale: string[];
};

export function adaptGoalToSystemState({
  goal,
  goalPressure,
  globalLoad,
  phase,
}: {
  goal: any;
  goalPressure: ReturnType<typeof analyzeGoalPressure>;
  globalLoad: GlobalGoalLoadReport;
  phase: { phase: string };
}): GoalAdaptationV2 {
  const rationale: string[] = [];

  // -----------------------------
  // 1️⃣ Global overrides (SYSTEM FIRST)
  // -----------------------------

  if (globalLoad.mode === "overloaded") {
    rationale.push(
      "System-wide goal load is over capacity.",
      "Preserving stability takes priority over progress."
    );

    return {
      mode: "paused",
      cadenceOverride: "flexible",
      intensityNote: "Temporarily pause progress-oriented demands.",
      rationale,
    };
  }

  if (globalLoad.mode === "protective") {
    rationale.push(
      "System is under sustained pressure.",
      "Goals must reduce intensity to prevent burnout."
    );

    return {
      mode: "protective",
      cadenceOverride: "flexible",
      intensityNote: "Stability first, progress second.",
      rationale,
    };
  }

  // -----------------------------
  // 2️⃣ Phase-specific adjustments
  // -----------------------------

  if (
    (phase.phase === "recovery" || phase.phase === "slump") &&
    goal.type === "performance"
  ) {
    rationale.push(
      "Performance goals conflict with current recovery-oriented phase."
    );

    return {
      mode: "maintenance",
      cadenceOverride: "flexible",
      intensityNote: "Maintain capability without pushing output.",
      rationale,
    };
  }

  // -----------------------------
  // 3️⃣ Local pressure fallback (v1-compatible)
  // -----------------------------

  if (goalPressure.status === "toxic") {
    rationale.push(
      "This goal alone is exerting excessive pressure."
    );

    return {
      mode: "paused",
      cadenceOverride: "weekly",
      intensityNote: "Goal is temporarily deprioritized.",
      rationale,
    };
  }

  if (goalPressure.status === "conflicting") {
    rationale.push(
      "Goal demands exceed current capacity."
    );

    return {
      mode: "maintenance",
      cadenceOverride: "flexible",
      intensityNote: "Reduce intensity and expectations.",
      rationale,
    };
  }

  // -----------------------------
  // 4️⃣ Default
  // -----------------------------

  return {
    mode: "normal",
    intensityNote: "Proceed as usual.",
    rationale: ["Goal is aligned with current system state."],
  };
}
