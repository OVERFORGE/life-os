export type GoalAdaptationSuggestion = {
  goalId: string;
  type:
    | "reduce_cadence"
    | "reduce_intensity"
    | "pause_goal"
    | "delay_goal";
  reason: string;
};

export type GoalAdaptationResponse = {
  ok: boolean;
  suggestions: GoalAdaptationSuggestion[];
};