/**
 * @deprecated Legacy Action Extractor
 * All semantic action extraction has been migrated to SemanticInterpreter and the Intelligence Layer.
 * In accordance with LifeOS Principle: "The kernel provides truth. Agents provide intelligence."
 */

export type ExtractedAction = {
  type:
    | "log_activity" | "propose_goal" | "confirm_goal" | "update_goal" | "delete_goal"
    | "update_weight" | "log_meal" | "log_workout"
    | "propose_diet_mode" | "confirm_diet_mode"
    | "create_task" | "update_task" | "complete_task" | "delete_task";
  payload: any;
};

export async function extractActions(
  _input: string,
  _intent: string,
  _activeGoalsList: string = "",
  _existingSignalsList: string = "",
  _history: string = "",
  _model?: string,
  _mode: string = "general",
  _timezone?: string
): Promise<ExtractedAction[]> {
  return [];
}
