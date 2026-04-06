export type GoalAdaptationSuggestion = {
  goalId: string;
  type:
  | "reduce_cadence"
  | "reduce_intensity"
  | "pause_goal"
  | "delay_goal";
  reason: string;
  suggestedChange?: {
    field: string;
    from: any;
    to: any;
  };
};

export type GoalAdaptationResponse = {
  ok: boolean;
  suggestions: GoalAdaptationSuggestion[];
};