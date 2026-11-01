/**
 * packages/execution-kernel/src/dispatch/executionHandlers/handleUpdateGoal.ts
 *
 * Execution handler for updating goals in the execution kernel.
 * Delegates to canonical goalEngine.updateGoal with version fencing and outbox events.
 */

import { goalEngine, GoalEngineOptions } from "@/features/goals/engine/goalEngine";

export async function handleUpdateGoal(
  payload: any,
  userId: string,
  options?: GoalEngineOptions
) {
  const goalId = payload.goalId || payload.id || payload._id;
  if (!goalId) {
    return { type: "update_goal", success: false, error: "Goal ID is required for update" };
  }

  const {
    goalId: _gId,
    id: _id,
    _id: ___id,
    expectedVersion,
    clientMutationId,
    ...updates
  } = payload;

  try {
    const result = await goalEngine.updateGoal(
      userId,
      String(goalId),
      updates,
      typeof expectedVersion === "number" ? expectedVersion : undefined,
      { clientMutationId, ...options }
    );

    if (!result.success) {
      return {
        type: "update_goal",
        success: false,
        error: result.error,
        code: result.code,
      };
    }

    return {
      type: "update_goal",
      success: true,
      goalId: String(goalId),
      goal: result.goal,
      newVersion: result.newVersion,
    };
  } catch (err: any) {
    return { type: "update_goal", success: false, error: err.message || String(err) };
  }
}
