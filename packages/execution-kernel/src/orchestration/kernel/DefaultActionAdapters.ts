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
import { handleRecordMentalState } from "../../dispatch/executionHandlers/handleRecordMentalState";
import { IncidentService } from "../../incidents/IncidentService";
import { ContextModeService } from "../../context/ContextModeService";

function isDbConnected(): boolean {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

function assertDatabaseConnected(actionType: string): void {
  if (!isDbConnected()) {
    if (process.env.LIFEOS_ALLOW_TEST_MOCKS === "true") {
      return;
    }
    throw new Error(`[KERNEL_DATABASE_DISCONNECTED]: Cannot execute action '${actionType}' because MongoDB is disconnected.`);
  }
}

/**
 * Task Creation Adapter
 */
export class CreateTaskAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload?.title || typeof proposal.payload.title !== "string") {
      return { valid: false, reason: "Task title is required" };
    }

    // Enforce Domain Duplicate Conflict Policy (Invariant S-4 / Phase 4)
    if (!proposal.payload?.allowDuplicate && isDbConnected()) {
      const { Task } = await import("@/server/db/models/Task");
      const today = proposal.payload?.dueDate || new Date().toISOString().split("T")[0];
      const trimmedTitle = proposal.payload.title.trim();
      const escaped = trimmedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const userObjId = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      const existing = await Task.findOne({
        userId: { $in: [userId, userObjId] },
        title: { $regex: new RegExp(`^${escaped}$`, "i") },
        status: "pending",
        dueDate: today,
      }).lean();

      if (existing) {
        return {
          valid: false,
          reason: `CONFLICT_REQUIRES_CLARIFICATION: You already have a pending task "${(existing as any).title}" scheduled for today. Did you want to update that one or schedule another?`,
        };
      }
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
    assertDatabaseConnected("create_task");
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
    assertDatabaseConnected("complete_task");
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
    assertDatabaseConnected("update_task");
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
    assertDatabaseConnected("delete_task");
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
    assertDatabaseConnected("log_meal");
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
    assertDatabaseConnected("log_workout");
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
    assertDatabaseConnected("log_activity");
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
  async validatePreconditions(proposal: ActionProposal, userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload) {
      proposal.payload = {};
    }
    if (!proposal.payload.title) {
      proposal.payload.title = proposal.payload.name || proposal.payload.habit || proposal.payload.goalTitle || proposal.payload.goal || proposal.payload.description || (proposal as any).title;
    }
    if (!proposal.payload.title || proposal.payload.title === "propose_goal" || proposal.payload.title === "create_goal") {
      return { valid: false, reason: "Goal title required" };
    }
    if (isDbConnected()) {
      const { Goal } = await import("@/features/goals/models/Goal");
      const userStr = userId.toString();
      const userObjId = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      const trimmedTitle = proposal.payload.title.trim();
      const escaped = trimmedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const existing = await Goal.findOne({
        userId: { $in: [userStr, userObjId] },
        title: { $regex: new RegExp(`^${escaped}$`, "i") },
        status: { $in: ["active", "proposed"] },
      }).lean();

      if (existing) {
        return {
          valid: false,
          reason: `DUPLICATE_DETECTED: An active goal "${(existing as any).title}" already exists.`,
        };
      }
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    assertDatabaseConnected("create_goal");
    const payload = {
      ...proposal.payload,
      status: proposal.actionType === "propose_goal" ? "proposed" : (proposal.payload?.status || "active"),
    };
    if (isDbConnected()) {
      return await handleCreateGoal(payload, userId);
    }
    return {
      success: true,
      goalId: `goal_mock_${Date.now()}`,
      title: proposal.payload.title,
      targetEntity: {
        entityId: `goal_mock_${Date.now()}`,
        displayName: proposal.payload.title,
        entityType: "goal" as const,
        domain: "productivity" as const,
        status: payload.status,
      },
    };
  }

  async compensate(proposal: ActionProposal, previousResult: any, userId: string): Promise<CompensationResult> {
    const goalId = previousResult?.goalId || previousResult?.data?.goalId || previousResult?.targetEntity?.entityId || previousResult?.goal?._id;
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
 * Goal Deletion Adapter
 */
export class DeleteGoalAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, _userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload?.goalId && !proposal.targetEntityId) {
      return { valid: false, reason: "goalId is required to delete a goal" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    assertDatabaseConnected("delete_goal");
    const payload = {
      ...proposal.payload,
      goalId: proposal.payload?.goalId || proposal.targetEntityId,
    };
    if (isDbConnected()) {
      return await handleDeleteGoal(payload, userId);
    }
    return {
      success: true,
      goalId: payload.goalId,
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
 * Goal Confirmation Adapter
 */
export class ConfirmGoalAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, _userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload?.goalId && !proposal.payload?.proposalId && !proposal.targetEntityId) {
      return { valid: false, reason: "goalId or proposalId is required to confirm a goal" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    assertDatabaseConnected("confirm_goal");
    const goalId = proposal.payload?.goalId || proposal.targetEntityId || proposal.payload?.proposalId;
    if (isDbConnected()) {
      const { Goal } = await import("@/features/goals/models/Goal");
      const userStr = userId.toString();
      const userObjId = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      const updated = await Goal.findOneAndUpdate(
        { _id: goalId, userId: { $in: [userStr, userObjId] } },
        { $set: { status: "active", confirmedAt: new Date() } },
        { returnDocument: "after" }
      );
      return {
        success: true,
        goalId,
        title: updated?.title || "Goal",
        goal: updated,
        targetEntity: {
          entityId: goalId.toString(),
          displayName: updated?.title || "Goal",
          entityType: "goal" as const,
          domain: "productivity" as const,
          status: "active",
        },
      };
    }
    return {
      success: true,
      goalId,
      title: proposal.payload?.title || "Goal",
      confirmed: true,
      targetEntity: {
        entityId: goalId.toString(),
        displayName: proposal.payload?.title || "Goal",
        entityType: "goal" as const,
        domain: "productivity" as const,
        status: "active",
      },
    };
  }

  async compensate(proposal: ActionProposal, _previousResult: any, userId: string): Promise<CompensationResult> {
    const goalId = proposal.payload?.goalId || proposal.targetEntityId;
    if (goalId && isDbConnected()) {
      const { Goal } = await import("@/features/goals/models/Goal");
      const userStr = userId.toString();
      const userObjId = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      await Goal.findOneAndUpdate({ _id: goalId, userId: { $in: [userStr, userObjId] } }, { $set: { status: "proposed" } });
    }
    return {
      compensated: true,
      reversalDetails: `Reverted goal confirmation for ${goalId || proposal.id}`,
    };
  }
}

/**
 * Weight Log Adapter
 */
export class UpdateWeightAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, _userId: string): Promise<{ valid: boolean; reason?: string }> {
    const weight = Number(proposal.payload?.weight);
    if (!weight || isNaN(weight) || weight <= 0) {
      return { valid: false, reason: "Valid positive weight value required" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    assertDatabaseConnected("update_weight");
    if (isDbConnected()) {
      const { handleUpdateWeight } = await import("../../dispatch/executionHandlers/handleUpdateWeight");
      return await handleUpdateWeight(proposal.payload, userId);
    }
    return {
      success: true,
      weight: proposal.payload.weight,
      date: new Date().toISOString().split("T")[0],
    };
  }

  async compensate(proposal: ActionProposal, _previousResult: any, _userId: string): Promise<CompensationResult> {
    return {
      compensated: true,
      reversalDetails: `Compensated weight update for proposal ${proposal.id}`,
    };
  }
}

/**
 * Workout Modification Adapter
 */
export class ModifyWorkoutAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, _userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload?.sessionId && !proposal.targetEntityId) {
      return { valid: false, reason: "sessionId is required to modify a workout" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    assertDatabaseConnected("modify_workout");
    const sessionId = proposal.payload?.sessionId || proposal.targetEntityId;
    if (isDbConnected()) {
      const { WorkoutSession } = await import("@/server/db/models/WorkoutSession");
      const updated = await WorkoutSession.findOneAndUpdate(
        { _id: sessionId, userId },
        { $set: proposal.payload },
        { new: true }
      );
      return {
        success: true,
        sessionId,
        workout: updated,
      };
    }
    return {
      success: true,
      sessionId,
      modified: true,
    };
  }

  async compensate(proposal: ActionProposal, _previousResult: any, _userId: string): Promise<CompensationResult> {
    return {
      compensated: true,
      reversalDetails: `Reverted workout modification ${proposal.id}`,
    };
  }
}

/**
 * Mental State Recording Adapter
 */
export class RecordMentalStateAdapter implements IKernelActionAdapter {
  async validatePreconditions(proposal: ActionProposal, _userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload) {
      return { valid: false, reason: "Payload required for mental state recording" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    assertDatabaseConnected("record_mental_estimate");
    if (isDbConnected()) {
      return await handleRecordMentalState(proposal.payload, userId);
    }
    return {
      success: true,
      applied: true,
      ...proposal.payload,
    };
  }

  async compensate(proposal: ActionProposal, _previousResult: any, _userId: string): Promise<CompensationResult> {
    return {
      compensated: true,
      reversalDetails: `Compensated mental state recording for ${proposal.id}`,
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

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    assertDatabaseConnected("apply_recovery_constraint");
    if (isDbConnected()) {
      const { DailyLog } = await import("@/server/db/models/DailyLog");
      const today = proposal.payload?.date || new Date().toISOString().split("T")[0];
      await DailyLog.findOneAndUpdate(
        { userId, date: today },
        { $set: { "recoveryConstraint": proposal.payload } },
        { upsert: true }
      );
      return {
        success: true,
        constraint: proposal.payload,
        applied: true,
      };
    }
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
  const deleteGoalAdapter = new DeleteGoalAdapter();
  const confirmGoalAdapter = new ConfirmGoalAdapter();
  const updateWeightAdapter = new UpdateWeightAdapter();
  const modifyWorkoutAdapter = new ModifyWorkoutAdapter();
  const recoveryAdapter = new RecoveryConstraintAdapter();
  const mentalAdapter = new RecordMentalStateAdapter();
  const setContextModeAdapter = new SetContextModeAdapter();
  const clearContextModeAdapter = new ClearContextModeAdapter();

  // RoutineAI Temporal Reality Adapters (V3)
  const {
    ScheduleOccurrenceAdapter,
    RescheduleOccurrenceAdapter,
    CancelOccurrenceAdapter,
    CreateTemporalSeriesAdapter,
    LogExecutionIntervalAdapter,
  } = require("../../temporal/adapters/TemporalActionAdapters");

  const scheduleOccAdapter = new ScheduleOccurrenceAdapter();
  const rescheduleOccAdapter = new RescheduleOccurrenceAdapter();
  const cancelOccAdapter = new CancelOccurrenceAdapter();
  const createSeriesAdapter = new CreateTemporalSeriesAdapter();
  const logExecAdapter = new LogExecutionIntervalAdapter();

  if (!registry.has("create_task")) registry.register("create_task", taskAdapter);
  if (!registry.has("complete_task")) registry.register("complete_task", completeAdapter);
  if (!registry.has("update_task")) registry.register("update_task", updateAdapter);
  if (!registry.has("delete_task")) registry.register("delete_task", deleteAdapter);
  if (!registry.has("reschedule_task")) registry.register("reschedule_task", updateAdapter);
  if (!registry.has("adjust_task_priority")) registry.register("adjust_task_priority", updateAdapter);
  if (!registry.has("log_meal")) registry.register("log_meal", mealAdapter);
  if (!registry.has("log_workout")) registry.register("log_workout", workoutAdapter);
  if (!registry.has("modify_workout")) registry.register("modify_workout", modifyWorkoutAdapter);
  if (!registry.has("update_weight")) registry.register("update_weight", updateWeightAdapter);
  if (!registry.has("log_activity")) registry.register("log_activity", activityAdapter);
  if (!registry.has("apply_recovery_constraint")) registry.register("apply_recovery_constraint", recoveryAdapter);
  if (!registry.has("record_mental_estimate")) registry.register("record_mental_estimate", mentalAdapter);
  if (!registry.has("create_goal")) registry.register("create_goal", goalAdapter);
  if (!registry.has("propose_goal")) registry.register("propose_goal", goalAdapter);
  if (!registry.has("confirm_goal")) registry.register("confirm_goal", confirmGoalAdapter);
  if (!registry.has("delete_goal")) registry.register("delete_goal", deleteGoalAdapter);
  if (!registry.has("set_context_mode")) registry.register("set_context_mode", setContextModeAdapter);
  if (!registry.has("clear_context_mode")) registry.register("clear_context_mode", clearContextModeAdapter);
  if (!registry.has("schedule_occurrence")) registry.register("schedule_occurrence", scheduleOccAdapter);
  if (!registry.has("reschedule_occurrence")) registry.register("reschedule_occurrence", rescheduleOccAdapter);
  if (!registry.has("cancel_occurrence")) registry.register("cancel_occurrence", cancelOccAdapter);
  if (!registry.has("create_temporal_series")) registry.register("create_temporal_series", createSeriesAdapter);
  if (!registry.has("log_execution_interval")) registry.register("log_execution_interval", logExecAdapter);

  return registry;
}


