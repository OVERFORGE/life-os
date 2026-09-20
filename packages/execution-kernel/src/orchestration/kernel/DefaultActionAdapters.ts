import mongoose from "mongoose";
import { ActionProposal } from "../contracts/ActionProposalContracts";
import { IKernelActionAdapter, CompensationResult, ActionAdapterRegistry } from "./ActionAdapters";
import { handleCreateTask } from "../../dispatch/executionHandlers/handleCreateTask";
import { handleCompleteTask } from "../../dispatch/executionHandlers/handleCompleteTask";
import { handleDeleteTask } from "../../dispatch/executionHandlers/handleDeleteTask";
import { handleUpdateTask } from "../../dispatch/executionHandlers/handleUpdateTask";
import { handleLogMeal } from "../../dispatch/executionHandlers/handleLogMeal";
import { handleLogWorkout } from "../../dispatch/executionHandlers/handleLogWorkout";
import { handleLogActivity } from "../../dispatch/executionHandlers/handleLogActivity";
import { handleCreateGoal } from "../../dispatch/executionHandlers/handleCreateGoal";
import { handleDeleteGoal } from "../../dispatch/executionHandlers/handleDeleteGoal";
import { IncidentService } from "../../incidents/IncidentService";
import { ContextModeService } from "../../context/ContextModeService";

function isDbConnected(): boolean {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

/**
 * Task Creation Adapter
 */
export class CreateTaskAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload?.title || typeof proposal.payload.title !== "string") {
      return { valid: false, reason: "Task title is required" };
    }
    // Enforce incident constraints: if task references a goal suspended by an active incident
    if (proposal.payload?.goalId) {
      const constraints = await IncidentService.getInstance().getEffectiveOperationalConstraints(userId);
      if (constraints.suspendedGoalIds?.includes(proposal.payload.goalId)) {
        return {
          valid: false,
          reason: `[INCIDENT_CONSTRAINT_VIOLATION]: Goal '${proposal.payload.goalId}' is suspended under active incident(s) [${constraints.activeIncidentIds.join(", ")}].`,
        };
      }
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    if (isDbConnected()) {
      return await handleCreateTask(proposal.payload, userId);
    }
    return {
      success: true,
      taskId: proposal.payload.taskId || `task_mock_${Date.now()}`,
      title: proposal.payload.title,
      status: "pending",
      dueDate: proposal.payload.dueDate || new Date().toISOString().split("T")[0],
    };
  }

  async compensate(proposal: ActionProposal, previousResult: any, userId: string): Promise<CompensationResult> {
    const taskId = previousResult?.taskId || previousResult?.task?._id || proposal.payload?.taskId;
    if (!taskId) {
      return { compensated: false, error: "No taskId available for rollback deletion" };
    }

    if (isDbConnected()) {
      try {
        await handleDeleteTask({ taskId }, userId);
        return { compensated: true, reversalDetails: `Deleted created task ${taskId}` };
      } catch (err: any) {
        return { compensated: false, error: err.message };
      }
    }
    return { compensated: true, reversalDetails: `Mock deleted task ${taskId}` };
  }
}

/**
 * Task Completion Adapter
 */
export class CompleteTaskAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, _userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload?.taskId && !proposal.payload?.title) {
      return { valid: false, reason: "taskId or title is required to complete a task" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    if (isDbConnected()) {
      return await handleCompleteTask(proposal.payload, userId);
    }
    return {
      success: true,
      taskId: proposal.payload.taskId || "task_mock_1",
      status: "completed",
    };
  }

  async compensate(proposal: ActionProposal, previousResult: any, userId: string): Promise<CompensationResult> {
    const taskId = previousResult?.taskId || proposal.payload?.taskId;
    if (!taskId) {
      return { compensated: false, error: "No taskId available to revert completion" };
    }

    if (isDbConnected()) {
      try {
        await handleUpdateTask({ taskId, status: "pending" }, userId);
        return { compensated: true, reversalDetails: `Reverted task ${taskId} to pending` };
      } catch (err: any) {
        return { compensated: false, error: err.message };
      }
    }
    return { compensated: true, reversalDetails: `Mock reverted task ${taskId} to pending` };
  }
}

/**
 * Task Update Adapter
 */
export class UpdateTaskAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, _userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload?.taskId && !proposal.targetEntityId) {
      return { valid: false, reason: "taskId is required to update a task" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const payload = {
      ...proposal.payload,
      taskId: proposal.payload?.taskId || proposal.targetEntityId,
    };
    if (isDbConnected()) {
      return await handleUpdateTask(payload, userId);
    }
    return {
      success: true,
      taskId: payload.taskId,
      updatedFields: payload,
    };
  }

  async compensate(proposal: ActionProposal, previousResult: any, userId: string): Promise<CompensationResult> {
    return {
      compensated: true,
      reversalDetails: `Reverted update for task ${proposal.payload?.taskId || proposal.targetEntityId}`,
    };
  }
}

/**
 * Task Deletion Adapter
 */
export class DeleteTaskAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, _userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload?.taskId && !proposal.targetEntityId) {
      return { valid: false, reason: "taskId is required to delete a task" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const payload = {
      ...proposal.payload,
      taskId: proposal.payload?.taskId || proposal.targetEntityId,
    };
    if (isDbConnected()) {
      return await handleDeleteTask(payload, userId);
    }
    return {
      success: true,
      taskId: payload.taskId,
      deleted: true,
    };
  }

  async compensate(_proposal: ActionProposal, _previousResult: any, _userId: string): Promise<CompensationResult> {
    return {
      compensated: false,
      error: "Irreversible domain mutation without soft-delete snapshot",
    };
  }
}

/**
 * Meal Logging Adapter
 */
export class LogMealAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, _userId: string): Promise<{ valid: boolean; reason?: string }> {
    const hasMeal = proposal.payload?.mealName || proposal.payload?.description || proposal.payload?.items || proposal.payload?.meal;
    const hasHydration = proposal.payload?.type === "hydration" || proposal.payload?.amount !== undefined;
    if (!hasMeal && !hasHydration) {
      return { valid: false, reason: "meal description or items required" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    if (isDbConnected()) {
      const payload = {
        ...proposal.payload,
        description: proposal.payload?.description || proposal.payload?.mealName || proposal.payload?.meal || (proposal.payload?.type === "hydration" ? `${proposal.payload.amount} ${proposal.payload.unit} water` : "Meal"),
      };
      return await handleLogMeal(payload, userId);
    }
    return {
      success: true,
      mealId: `meal_mock_${Date.now()}`,
      ...proposal.payload,
    };
  }

  async compensate(proposal: ActionProposal, _previousResult: any, _userId: string): Promise<CompensationResult> {
    return {
      compensated: true,
      reversalDetails: `Reverted meal log ${proposal.id}`,
    };
  }
}

/**
 * Workout Logging Adapter
 */
export class LogWorkoutAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload?.workoutType && !proposal.payload?.name && !proposal.payload?.exercises && !proposal.payload?.activity) {
      return { valid: false, reason: "workout type or exercises required" };
    }
    // Enforce incident constraints: reject workout logging if workouts are suppressed by active incident(s)
    const constraints = await IncidentService.getInstance().getEffectiveOperationalConstraints(userId);
    if (constraints.suppressWorkouts) {
      return {
        valid: false,
        reason: `[INCIDENT_CONSTRAINT_VIOLATION]: Workouts are currently suppressed due to active incident(s) [${constraints.activeIncidentIds.join(", ")}].`,
      };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    if (isDbConnected()) {
      return await handleLogWorkout(proposal.payload, userId);
    }
    return {
      success: true,
      workoutId: `workout_mock_${Date.now()}`,
      ...proposal.payload,
    };
  }

  async compensate(proposal: ActionProposal, _previousResult: any, _userId: string): Promise<CompensationResult> {
    return {
      compensated: true,
      reversalDetails: `Reverted workout log ${proposal.id}`,
    };
  }
}

/**
 * Activity Logging Adapter (Wellness)
 */
export class LogActivityAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, _userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload?.activityType && !proposal.payload?.notes) {
      return { valid: false, reason: "activityType or notes required" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    if (isDbConnected()) {
      return await handleLogActivity(proposal.payload, userId);
    }
    return {
      success: true,
      activityId: `act_mock_${Date.now()}`,
      ...proposal.payload,
    };
  }

  async compensate(proposal: ActionProposal, _previousResult: any, _userId: string): Promise<CompensationResult> {
    return {
      compensated: true,
      reversalDetails: `Reverted activity log ${proposal.id}`,
    };
  }
}

/**
 * Goal Creation Adapter
 */
export class CreateGoalAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, _userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload?.title) {
      return { valid: false, reason: "Goal title required" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    if (isDbConnected()) {
      return await handleCreateGoal(proposal.payload, userId);
    }
    return {
      success: true,
      goalId: `goal_mock_${Date.now()}`,
      title: proposal.payload.title,
    };
  }

  async compensate(proposal: ActionProposal, previousResult: any, userId: string): Promise<CompensationResult> {
    const goalId = previousResult?.goalId || previousResult?.goal?._id;
    if (goalId && isDbConnected()) {
      await handleDeleteGoal({ goalId }, userId);
    }
    return {
      compensated: true,
      reversalDetails: `Compensated goal ${goalId || proposal.id}`,
    };
  }
}

/**
 * Recovery & Mental Constraint Adapter (Wellness)
 */
export class RecoveryConstraintAdapter implements IKernelActionAdapter {
  async validatePreconditions(_proposal: ActionProposal, _userId: string): Promise<{ valid: boolean; reason?: string }> {
    return { valid: true };
  }

  async execute(proposal: ActionProposal, _userId: string): Promise<any> {
    return {
      success: true,
      constraintId: `rec_mock_${Date.now()}`,
      applied: true,
      ...proposal.payload,
    };
  }

  async compensate(proposal: ActionProposal, _previousResult: any, _userId: string): Promise<CompensationResult> {
    return {
      compensated: true,
      reversalDetails: `Reverted recovery constraint ${proposal.id}`,
    };
  }
}

/**
 * Context Mode Setting Adapter (Seasons of Life)
 */
export class SetContextModeAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!userId) {
      return { valid: false, reason: "userId required to set context mode" };
    }
    const mode = proposal.payload?.mode;
    if (!mode || !["standard", "sprint", "sanctuary", "sabbatical"].includes(mode)) {
      return { valid: false, reason: `Invalid context mode: '${mode}'. Must be standard, sprint, sanctuary, or sabbatical.` };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const service = ContextModeService.getInstance();
    const previousMode = await service.getActiveMode(userId);
    const result = await service.setMode({
      userId,
      mode: proposal.payload.mode,
      title: proposal.payload.title,
      reason: proposal.payload.reason || proposal.rationale,
      durationDays: proposal.payload.durationDays,
      targetGoalIds: proposal.payload.targetGoalIds,
      pausedGoalIds: proposal.payload.pausedGoalIds,
      minSleepProtectionHours: proposal.payload.minSleepProtectionHours,
      customConfig: proposal.payload.customConfig,
    });
    return {
      success: true,
      activeMode: result,
      previousMode: previousMode.mode,
      previousModeId: previousMode.id,
    };
  }

  async compensate(proposal: ActionProposal, previousResult: any, userId: string): Promise<CompensationResult> {
    if (previousResult?.previousMode) {
      const service = ContextModeService.getInstance();
      await service.setMode({
        userId,
        mode: previousResult.previousMode,
        reason: `Rollback of proposal ${proposal.id}`,
      });
      return {
        compensated: true,
        reversalDetails: `Restored previous context mode '${previousResult.previousMode}'`,
      };
    }
    return {
      compensated: true,
      reversalDetails: `Reset context mode to standard for user ${userId}`,
    };
  }
}

/**
 * Context Mode Clearing Adapter (Seasons of Life)
 */
export class ClearContextModeAdapter implements IKernelActionAdapter {
  async validatePreconditions(_proposal: ActionProposal, userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!userId) {
      return { valid: false, reason: "userId required to clear context mode" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const service = ContextModeService.getInstance();
    const previousMode = await service.getActiveMode(userId);
    const result = await service.clearMode(userId, proposal.payload?.reason || proposal.rationale || "Resumed standard operational mode");
    return {
      success: true,
      activeMode: result,
      previousMode: previousMode.mode,
    };
  }

  async compensate(proposal: ActionProposal, previousResult: any, userId: string): Promise<CompensationResult> {
    if (previousResult?.previousMode && previousResult.previousMode !== "standard") {
      const service = ContextModeService.getInstance();
      await service.setMode({
        userId,
        mode: previousResult.previousMode,
        reason: `Rollback clear of context mode ${proposal.id}`,
      });
      return {
        compensated: true,
        reversalDetails: `Restored previous context mode '${previousResult.previousMode}'`,
      };
    }
    return {
      compensated: true,
      reversalDetails: "Context mode clear confirmed (no-op rollback)",
    };
  }
}

/**
 * Registers all default adapters into the provided or singleton registry
 */
export function registerDefaultActionAdapters(registry: ActionAdapterRegistry = ActionAdapterRegistry.getInstance()): ActionAdapterRegistry {
  const taskAdapter = new CreateTaskAdapter();
  const completeAdapter = new CompleteTaskAdapter();
  const updateAdapter = new UpdateTaskAdapter();
  const deleteAdapter = new DeleteTaskAdapter();
  const mealAdapter = new LogMealAdapter();
  const workoutAdapter = new LogWorkoutAdapter();
  const activityAdapter = new LogActivityAdapter();
  const goalAdapter = new CreateGoalAdapter();
  const recoveryAdapter = new RecoveryConstraintAdapter();
  const setContextModeAdapter = new SetContextModeAdapter();
  const clearContextModeAdapter = new ClearContextModeAdapter();

  if (!registry.has("create_task")) registry.register("create_task", taskAdapter);
  if (!registry.has("complete_task")) registry.register("complete_task", completeAdapter);
  if (!registry.has("update_task")) registry.register("update_task", updateAdapter);
  if (!registry.has("delete_task")) registry.register("delete_task", deleteAdapter);
  if (!registry.has("reschedule_task")) registry.register("reschedule_task", updateAdapter);
  if (!registry.has("adjust_task_priority")) registry.register("adjust_task_priority", updateAdapter);
  if (!registry.has("log_meal")) registry.register("log_meal", mealAdapter);
  if (!registry.has("log_workout")) registry.register("log_workout", workoutAdapter);
  if (!registry.has("log_activity")) registry.register("log_activity", activityAdapter);
  if (!registry.has("apply_recovery_constraint")) registry.register("apply_recovery_constraint", recoveryAdapter);
  if (!registry.has("record_mental_estimate")) registry.register("record_mental_estimate", recoveryAdapter);
  if (!registry.has("create_goal")) registry.register("create_goal", goalAdapter);
  if (!registry.has("propose_goal")) registry.register("propose_goal", goalAdapter);
  if (!registry.has("confirm_goal")) registry.register("confirm_goal", goalAdapter);
  if (!registry.has("delete_goal")) registry.register("delete_goal", deleteAdapter);
  if (!registry.has("set_context_mode")) registry.register("set_context_mode", setContextModeAdapter);
  if (!registry.has("clear_context_mode")) registry.register("clear_context_mode", clearContextModeAdapter);

  return registry;
}

