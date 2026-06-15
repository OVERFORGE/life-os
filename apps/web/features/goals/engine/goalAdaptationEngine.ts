// features/goals/engine/goalAdaptationEngine.ts

export type GoalPressureStatus =
  | "aligned"
  | "strained"
  | "conflicting"
  | "toxic";

type PhaseType =
  | "burnout"
  | "recovery"
  | "slump"
  | "grind"
  | "balanced";

export type GoalAdaptationSuggestion = {
  goalId: string;

  type:
  | "reduce_cadence"
  | "pause_goal"
  | "delay_goal"
  | "reduce_intensity"
  | "increase_focus";

  reason: string;

  suggestedChange?: {
    field: string;
    from: any;
    to: any;
  };
};

type GoalAdaptationInput = {
  goals: any[];
  pressures: {
    goalId: string;
    pressureScore: number;
    status: GoalPressureStatus;
  }[];

  phase: PhaseType;

  globalLoad: {
    score: number;
    mode: "stable" | "underutilized" | "overloaded";
  };
};

/* ------------------------------------------------ */
/* Helper                                           */
/* ------------------------------------------------ */

function findPressure(
  pressures: GoalAdaptationInput["pressures"],
  goalId: string
) {
  return pressures.find((p) => p.goalId === goalId);
}

/* ------------------------------------------------ */
/* Main Engine                                      */
/* ------------------------------------------------ */

export function goalAdaptationEngine(
  input: GoalAdaptationInput
): GoalAdaptationSuggestion[] {
  const suggestions: GoalAdaptationSuggestion[] = [];

  const { goals, pressures, phase, globalLoad } = input;

  for (const goal of goals) {
    const pressure = findPressure(pressures, String(goal._id));

    if (!pressure) continue;

    /* ------------------------------------------------ */
    /* Toxic Goals                                      */
    /* ------------------------------------------------ */

    if (pressure.status === "toxic") {
      suggestions.push({
        goalId: String(goal._id),
        type: "pause_goal",
        reason:
          "Goal is creating unsustainable system pressure.",
      });

      continue;
    }

    /* ------------------------------------------------ */
    /* Conflicting Goals                                */
    /* ------------------------------------------------ */

    if (pressure.status === "conflicting") {
      if (goal.cadence === "daily") {
        suggestions.push({
          goalId: String(goal._id),
          type: "reduce_cadence",
          reason:
            "Daily cadence conflicts with current system capacity.",
          suggestedChange: {
            field: "cadence",
            from: "daily",
            to: "weekly",
          },
        });

        continue;
      }

      suggestions.push({
        goalId: String(goal._id),
        type: "delay_goal",
        reason:
          "Goal pressure conflicts with current life phase.",
      });

      continue;
    }

    /* ------------------------------------------------ */
    /* Strained Goals                                   */
    /* ------------------------------------------------ */

    if (pressure.status === "strained") {
      suggestions.push({
        goalId: String(goal._id),
        type: "reduce_intensity",
        reason:
          "Goal is slightly above sustainable load.",
      });
    }

    /* ------------------------------------------------ */
    /* Phase Specific Logic                             */
    /* ------------------------------------------------ */

    if (phase === "recovery" && goal.type === "performance") {
      suggestions.push({
        goalId: String(goal._id),
        type: "reduce_cadence",
        reason:
          "Performance goals should be reduced during recovery.",
      });
    }

    if (phase === "burnout") {
      suggestions.push({
        goalId: String(goal._id),
        type: "pause_goal",
        reason:
          "Burnout detected. Reduce commitments immediately.",
      });
    }

    /* ------------------------------------------------ */
    /* Underutilization                                 */
    /* ------------------------------------------------ */

    if (
      globalLoad.mode === "underutilized" &&
      pressure.status === "aligned"
    ) {
      suggestions.push({
        goalId: String(goal._id),
        type: "increase_focus",
        reason:
          "System has unused capacity. Increasing engagement may help.",
      });
    }
  }

  return suggestions;
}