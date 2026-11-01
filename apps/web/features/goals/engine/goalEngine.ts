/**
 * apps/web/features/goals/engine/goalEngine.ts
 *
 * Canonical Goal Engine for LifeOS.
 * Centralizes all Goal lifecycle mutations: create, update, complete, and soft-delete.
 * Guarantees that every mutation flows through OutboxStorageService with:
 * - Monotonic aggregate versioning
 * - Fencing epoch verification
 * - Durable L1/L2 receipts
 * - Canonical outbox events
 */

import mongoose from "mongoose";
import { Goal } from "../models/Goal";
import {
  OutboxStorageService,
  OutboxEventDraft,
  ConcurrencyConflictError,
} from "@life-os/execution-kernel";

export interface CreateGoalInput {
  title: string;
  description?: string;
  nature?: "finite_deliverable" | "habitual_cadence";
  type?: "identity" | "performance" | "maintenance";
  cadence?: "daily" | "weekly" | "flexible";
  definitionOfDone?: string;
  targetCompletionDate?: Date | string;
  milestones?: Array<{
    milestoneId: string;
    title: string;
    completed?: boolean;
    completedAt?: Date;
    linkedTaskId?: string;
    order?: number;
  }>;
  deliverableProgressPercent?: number;
  signals?: Array<{
    key: string;
    weight?: number;
    direction?: "higher_better" | "lower_better";
  }>;
  rules?: {
    minActiveDaysPerWeek?: number;
    graceDaysPerWeek?: number;
  };
  confirmedAt?: Date;
  status?: "active" | "proposed" | "archived" | "completed";
}

export interface GoalEngineOptions {
  clientMutationId?: string;
  outboxService?: OutboxStorageService;
  goalModel?: any;
  reason?: string;
}

/* ─────────────────────────────────────────────────────────── */
/* createGoal                                                  */
/* ─────────────────────────────────────────────────────────── */

export async function createGoal(
  userId: string,
  input: CreateGoalInput,
  options?: GoalEngineOptions
) {
  const goalModel = options?.goalModel || Goal;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();

  const goalId = new mongoose.Types.ObjectId();
  const createdAt = new Date();
  const clientMutationId = options?.clientMutationId || `mut_goal_create_${goalId}_v1`;
  const diffHash = `diff_goal_create_${goalId}_1`;

  const domainUpdates: Record<string, any> = {
    userId: String(userId),
    title: input.title?.trim(),
    description: input.description || "",
    nature: input.nature || "habitual_cadence",
    type: input.type || "performance",
    cadence: input.cadence || "daily",
    status: input.status || "active",
    definitionOfDone: input.definitionOfDone || "",
    targetCompletionDate: input.targetCompletionDate ? new Date(input.targetCompletionDate) : undefined,
    milestones: input.milestones || [],
    deliverableProgressPercent: input.deliverableProgressPercent || 0,
    signals: input.signals || [],
    rules: input.rules || { minActiveDaysPerWeek: 3, graceDaysPerWeek: 2 },
    confirmedAt: input.confirmedAt || createdAt,
  };

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.goal.created",
    aggregateId: String(goalId),
    aggregateType: "goal",
    aggregateVersion: 1,
    source: "web.goals.create",
    payload: {
      goalId: String(goalId),
      userId: String(userId),
      title: domainUpdates.title,
      nature: domainUpdates.nature,
      targetDate: domainUpdates.targetCompletionDate?.toISOString(),
      createdAt: createdAt.toISOString(),
    },
    occurredAt: createdAt,
  };

  const commitResult = await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: goalModel,
    aggregateId: String(goalId),
    clientMutationId,
    diffHash,
    expectedVersion: 0,
    fencingEpoch: 0,
    domainUpdates,
    eventDrafts: [eventDraft],
    isCreation: true,
  });

  const goal = await goalModel.findById(goalId);
  return { success: true, goal, newVersion: 1, events: commitResult.events, receipt: commitResult.receipt };
}

/* ─────────────────────────────────────────────────────────── */
/* updateGoal                                                  */
/* ─────────────────────────────────────────────────────────── */

export async function updateGoal(
  userId: string,
  goalId: string,
  updates: Partial<CreateGoalInput>,
  expectedVersion?: number,
  options?: GoalEngineOptions
) {
  const goalModel = options?.goalModel || Goal;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();

  const goal = await goalModel.findOne({ _id: goalId, userId });
  if (!goal) {
    return { success: false, error: "Goal not found", statusCode: 404 };
  }

  if (goal.status === "archived") {
    return { success: false, error: "Cannot modify an archived goal", statusCode: 400 };
  }

  const currentVersion = typeof goal.version === "number" ? goal.version : 0;
  const currentEpoch = typeof goal.mutationEpoch === "number" ? goal.mutationEpoch : 0;

  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    return {
      success: false,
      error: `Version conflict: aggregate version is ${currentVersion}, expected ${expectedVersion}`,
      code: "AGGREGATE_CONFLICT",
      statusCode: 409,
    };
  }

  const nextVersion = currentVersion + 1;
  const clientMutationId = options?.clientMutationId || `mut_goal_update_${goalId}_v${nextVersion}`;
  const diffHash = `diff_goal_update_${goalId}_${nextVersion}`;
  const updatedAt = new Date();

  const domainUpdates: Record<string, any> = {};
  if (updates.title !== undefined) domainUpdates.title = updates.title.trim();
  if (updates.description !== undefined) domainUpdates.description = updates.description;
  if (updates.nature !== undefined) domainUpdates.nature = updates.nature;
  if (updates.type !== undefined) domainUpdates.type = updates.type;
  if (updates.cadence !== undefined) domainUpdates.cadence = updates.cadence;
  if (updates.status !== undefined) domainUpdates.status = updates.status;
  if (updates.definitionOfDone !== undefined) domainUpdates.definitionOfDone = updates.definitionOfDone;
  if (updates.targetCompletionDate !== undefined) {
    domainUpdates.targetCompletionDate = updates.targetCompletionDate ? new Date(updates.targetCompletionDate) : null;
  }
  if (updates.milestones !== undefined) domainUpdates.milestones = updates.milestones;
  if (updates.deliverableProgressPercent !== undefined) {
    domainUpdates.deliverableProgressPercent = updates.deliverableProgressPercent;
  }
  if (updates.signals !== undefined) domainUpdates.signals = updates.signals;
  if (updates.rules !== undefined) domainUpdates.rules = { ...goal.rules, ...updates.rules };

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.goal.updated",
    aggregateId: String(goalId),
    aggregateType: "goal",
    aggregateVersion: nextVersion,
    source: "web.goals.update",
    payload: {
      goalId: String(goalId),
      userId: String(userId),
      changes: domainUpdates,
      updatedAt: updatedAt.toISOString(),
      title: domainUpdates.title || goal.title,
    },
    occurredAt: updatedAt,
  };

  const commitResult = await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: goalModel,
    aggregateId: String(goalId),
    clientMutationId,
    diffHash,
    expectedVersion: currentVersion,
    fencingEpoch: currentEpoch,
    domainUpdates,
    eventDrafts: [eventDraft],
  });

  const updatedGoal = await goalModel.findById(goalId);
  return { success: true, goal: updatedGoal, newVersion: nextVersion, events: commitResult.events, receipt: commitResult.receipt };
}

/* ─────────────────────────────────────────────────────────── */
/* completeGoal                                                */
/* ─────────────────────────────────────────────────────────── */

export async function completeGoal(
  userId: string,
  goalId: string,
  expectedVersion?: number,
  options?: GoalEngineOptions
) {
  const goalModel = options?.goalModel || Goal;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();

  const goal = await goalModel.findOne({ _id: goalId, userId });
  if (!goal) {
    return { success: false, error: "Goal not found", statusCode: 404 };
  }

  if (goal.status === "completed") {
    return { success: true, goal, newVersion: goal.version };
  }

  const currentVersion = typeof goal.version === "number" ? goal.version : 0;
  const currentEpoch = typeof goal.mutationEpoch === "number" ? goal.mutationEpoch : 0;

  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    return {
      success: false,
      error: `Version conflict: aggregate version is ${currentVersion}, expected ${expectedVersion}`,
      code: "AGGREGATE_CONFLICT",
      statusCode: 409,
    };
  }

  const nextVersion = currentVersion + 1;
  const clientMutationId = options?.clientMutationId || `mut_goal_complete_${goalId}_v${nextVersion}`;
  const diffHash = `diff_goal_complete_${goalId}_${nextVersion}`;
  const completedAt = new Date();

  const domainUpdates = {
    status: "completed",
    deliverableProgressPercent: 100,
  };

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.goal.completed",
    aggregateId: String(goalId),
    aggregateType: "goal",
    aggregateVersion: nextVersion,
    source: "web.goals.complete",
    payload: {
      goalId: String(goalId),
      userId: String(userId),
      completedAt: completedAt.toISOString(),
      finalProgress: 100,
    },
    occurredAt: completedAt,
  };

  const commitResult = await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: goalModel,
    aggregateId: String(goalId),
    clientMutationId,
    diffHash,
    expectedVersion: currentVersion,
    fencingEpoch: currentEpoch,
    domainUpdates,
    eventDrafts: [eventDraft],
  });

  const updatedGoal = await goalModel.findById(goalId);
  return { success: true, goal: updatedGoal, newVersion: nextVersion, events: commitResult.events, receipt: commitResult.receipt };
}

/* ─────────────────────────────────────────────────────────── */
/* deleteGoal (Soft Archival)                                  */
/* ─────────────────────────────────────────────────────────── */

export async function deleteGoal(
  userId: string,
  goalId: string,
  expectedVersion?: number,
  options?: GoalEngineOptions
) {
  const goalModel = options?.goalModel || Goal;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();

  const goal = await goalModel.findOne({ _id: goalId, userId });
  if (!goal) {
    return { success: false, error: "Goal not found", statusCode: 404 };
  }

  if (goal.status === "archived") {
    return { success: true, goal, newVersion: goal.version };
  }

  const currentVersion = typeof goal.version === "number" ? goal.version : 0;
  const currentEpoch = typeof goal.mutationEpoch === "number" ? goal.mutationEpoch : 0;

  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    return {
      success: false,
      error: `Version conflict: aggregate version is ${currentVersion}, expected ${expectedVersion}`,
      code: "AGGREGATE_CONFLICT",
      statusCode: 409,
    };
  }

  const nextVersion = currentVersion + 1;
  const clientMutationId = options?.clientMutationId || `mut_goal_delete_${goalId}_v${nextVersion}`;
  const diffHash = `diff_goal_delete_${goalId}_${nextVersion}`;
  const archivedAt = new Date();
  const reason = options?.reason || "User deleted goal";

  const domainUpdates = {
    status: "archived",
    archivedAt,
    remediationReason: reason,
  };

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.goal.deleted",
    aggregateId: String(goalId),
    aggregateType: "goal",
    aggregateVersion: nextVersion,
    source: "web.goals.delete",
    payload: {
      goalId: String(goalId),
      userId: String(userId),
      archivedAt: archivedAt.toISOString(),
      reason,
    },
    occurredAt: archivedAt,
  };

  const commitResult = await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: goalModel,
    aggregateId: String(goalId),
    clientMutationId,
    diffHash,
    expectedVersion: currentVersion,
    fencingEpoch: currentEpoch,
    domainUpdates,
    eventDrafts: [eventDraft],
  });

  const updatedGoal = await goalModel.findById(goalId);
  return { success: true, goal: updatedGoal, newVersion: nextVersion, events: commitResult.events, receipt: commitResult.receipt };
}

export const goalEngine = {
  createGoal,
  updateGoal,
  completeGoal,
  deleteGoal,
};
