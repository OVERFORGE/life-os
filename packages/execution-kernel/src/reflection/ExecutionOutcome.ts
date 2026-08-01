import { generateId } from "../shared/ids";

export type ExecutionOutcomeType =
  | "TaskCompleted"
  | "MealLogged"
  | "GoalCreated"
  | "WorkoutLogged"
  | "WeightUpdated"
  | "GeneralRecorded";

export interface ExecutionOutcome {
  outcomeId: string;
  type: ExecutionOutcomeType;
  payload: Record<string, any>;
  result: Record<string, any>;
  timestamp: number;
}

export function createExecutionOutcome(
  type: ExecutionOutcomeType,
  payload: Record<string, any> = {},
  result: Record<string, any> = {}
): ExecutionOutcome {
  return {
    outcomeId: generateId("outc"),
    type,
    payload,
    result,
    timestamp: Date.now(),
  };
}

/**
 * Maps raw legacy executor result objects into domain-level ExecutionOutcomes.
 */
export function mapLegacyResultToOutcome(legacyResult: any): ExecutionOutcome {
  const typeStr = (legacyResult.type || "").toLowerCase();

  let outcomeType: ExecutionOutcomeType = "GeneralRecorded";
  if (typeStr.includes("complete_task") || typeStr.includes("finish_task")) {
    outcomeType = "TaskCompleted";
  } else if (typeStr.includes("log_meal")) {
    outcomeType = "MealLogged";
  } else if (typeStr.includes("propose_goal") || typeStr.includes("confirm_goal") || typeStr.includes("create_goal")) {
    outcomeType = "GoalCreated";
  } else if (typeStr.includes("log_workout")) {
    outcomeType = "WorkoutLogged";
  } else if (typeStr.includes("update_weight")) {
    outcomeType = "WeightUpdated";
  }

  return createExecutionOutcome(outcomeType, legacyResult.payload || {}, legacyResult.result || legacyResult);
}
