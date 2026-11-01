// features/tasks/engine/taskEngine.ts
// Deterministic CRUD + logic layer. NO LLM. All DB mutations go through here.

import mongoose from "mongoose";
import { Task } from "@/server/db/models/Task";
import { Goal } from "@/features/goals/models/Goal";
import { DailyLog } from "@/server/db/models/DailyLog";
import { getActiveDate, OutboxStorageService, OutboxEventDraft } from "@life-os/execution-kernel";

/* ─────────────────────────────────────────────────────────── */
/* Types                                                       */
/* ─────────────────────────────────────────────────────────── */

export type CreateTaskInput = {
  title: string;
  description?: string;
  dueDate: string;           // "YYYY-MM-DD" or relative: "today", "tomorrow"
  dueTime?: string;          // "HH:MM"
  priority?: "low" | "medium" | "high";
  recurring?: {
    type: "daily" | "weekly" | "custom";
    interval?: number;
    daysOfWeek?: number[];
  };
  goalId?: string;
  parentTaskId?: string;
  reminders?: string[];      // ISO date strings
  metadata?: {
    energyCost?: number;
    estimatedDuration?: number;
  };
};

/* ─────────────────────────────────────────────────────────── */
/* Date Helpers                                                */
/* ─────────────────────────────────────────────────────────── */

function resolveDate(raw: string, timezone?: string): string {
  const today = getActiveDate(timezone); // "YYYY-MM-DD"
  if (!raw) return today;

  const lower = raw.toLowerCase().trim();
  if (lower === "today") return today;

  if (lower === "tomorrow") {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  if (lower === "yesterday") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  // If it already looks like YYYY-MM-DD keep it
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  return today;
}

function nextOccurrence(recurring: any, afterDate: string): string {
  const base = new Date(afterDate);
  base.setDate(base.getDate() + 1);

  if (recurring.type === "daily") {
    return base.toISOString().slice(0, 10);
  }

  if (recurring.type === "custom") {
    const interval = recurring.interval || 1;
    base.setDate(base.getDate() + interval - 1);
    return base.toISOString().slice(0, 10);
  }

  if (recurring.type === "weekly") {
    const days: number[] = recurring.daysOfWeek || [1]; // default Monday
    // Find the next occurrence that matches one of the target weekdays
    for (let i = 0; i < 7; i++) {
      const candidate = new Date(base);
      candidate.setDate(base.getDate() + i);
      if (days.includes(candidate.getDay())) {
        return candidate.toISOString().slice(0, 10);
      }
    }
    return base.toISOString().slice(0, 10);
  }

  return base.toISOString().slice(0, 10);
}

/* ─────────────────────────────────────────────────────────── */
/* createTask                                                  */
/* ─────────────────────────────────────────────────────────── */

export async function createTask(
  userId: string,
  input: CreateTaskInput,
  timezone?: string,
  taskModel: any = Task,
  outboxService: OutboxStorageService = OutboxStorageService.getInstance()
) {
  const dueDate = resolveDate(input.dueDate, timezone);
  const taskId = new mongoose.Types.ObjectId();
  const createdAt = new Date();
  const clientMutationId = (input as any)?.clientMutationId || `mut_task_create_${taskId}_v1`;
  const diffHash = `diff_task_create_${taskId}_1`;

  const domainUpdates = {
    userId,
    title: input.title,
    description: input.description || "",
    dueDate,
    dueTime: input.dueTime || null,
    priority: input.priority || "medium",
    status: "pending",
    recurring: input.recurring || null,
    goalId: input.goalId || null,
    parentTaskId: input.parentTaskId || null,
    reminders: input.reminders || [],
    metadata: input.metadata || {},
  };

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.task.created",
    aggregateId: String(taskId),
    aggregateType: "task",
    aggregateVersion: 1,
    source: "web.tasks.create",
    payload: {
      taskId: String(taskId),
      userId: String(userId),
      title: input.title,
      dueDate,
      goalId: input.goalId ? String(input.goalId) : undefined,
      priority: input.priority || "medium",
    },
    occurredAt: createdAt,
  };

  await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: taskModel,
    aggregateId: String(taskId),
    clientMutationId,
    diffHash,
    expectedVersion: 0,
    fencingEpoch: 0,
    domainUpdates,
    eventDrafts: [eventDraft],
    isCreation: true,
  });

  const task = await taskModel.findById(taskId);
  return { success: true, task };
}

/* ─────────────────────────────────────────────────────────── */
/* updateTask                                                  */
/* ─────────────────────────────────────────────────────────── */

export async function updateTask(
  userId: string,
  taskId: string,
  updates: Partial<CreateTaskInput>,
  taskModel: any = Task,
  outboxService: OutboxStorageService = OutboxStorageService.getInstance()
) {
  const task = await taskModel.findOne({ _id: taskId, userId });
  if (!task) return { success: false, error: "Task not found" };

  const currentVersion = typeof task.version === "number" ? task.version : 0;
  const currentEpoch = typeof task.mutationEpoch === "number" ? task.mutationEpoch : 0;
  const nextVersion = currentVersion + 1;
  const clientMutationId = (updates as any)?.clientMutationId || `mut_task_update_${taskId}_v${nextVersion}`;
  const diffHash = `diff_task_update_${taskId}_${nextVersion}`;
  const updatedAt = new Date();

  const domainUpdates: Record<string, any> = {};
  if (updates.title !== undefined) domainUpdates.title = updates.title;
  if (updates.description !== undefined) domainUpdates.description = updates.description;
  if (updates.dueDate !== undefined) domainUpdates.dueDate = resolveDate(updates.dueDate);
  if (updates.dueTime !== undefined) domainUpdates.dueTime = updates.dueTime;
  if (updates.priority !== undefined) domainUpdates.priority = updates.priority;
  if (updates.recurring !== undefined) domainUpdates.recurring = updates.recurring;
  if (updates.goalId !== undefined) domainUpdates.goalId = updates.goalId;
  if (updates.metadata !== undefined) domainUpdates.metadata = { ...task.metadata, ...updates.metadata };
  if (updates.reminders !== undefined) domainUpdates.reminders = updates.reminders;

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.task.updated",
    aggregateId: String(taskId),
    aggregateType: "task",
    aggregateVersion: nextVersion,
    source: "web.tasks.update",
    payload: {
      taskId: String(taskId),
      userId: String(userId),
      changes: domainUpdates,
      updatedAt: updatedAt.toISOString(),
      title: domainUpdates.title || task.title,
      priority: domainUpdates.priority || task.priority,
      dueDate: domainUpdates.dueDate || task.dueDate,
    },
    occurredAt: updatedAt,
  };

  await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: taskModel,
    aggregateId: String(taskId),
    clientMutationId,
    diffHash,
    expectedVersion: currentVersion,
    fencingEpoch: currentEpoch,
    domainUpdates,
    eventDrafts: [eventDraft],
  });

  const updatedTask = await taskModel.findById(taskId);
  return { success: true, task: updatedTask };
}

/* ─────────────────────────────────────────────────────────── */
/* deleteTask                                                  */
/* ─────────────────────────────────────────────────────────── */

export async function deleteTask(
  userId: string,
  taskId: string,
  taskModel: any = Task,
  outboxService: OutboxStorageService = OutboxStorageService.getInstance()
) {
  const task = await taskModel.findOne({ _id: taskId, userId });
  if (!task) return { success: false, error: "Task not found" };

  const currentVersion = typeof task.version === "number" ? task.version : 0;
  const currentEpoch = typeof task.mutationEpoch === "number" ? task.mutationEpoch : 0;
  const nextVersion = currentVersion + 1;
  const clientMutationId = `mut_task_delete_${taskId}_v${nextVersion}`;
  const diffHash = `diff_task_delete_${taskId}_${nextVersion}`;
  const deletedAt = new Date();

  // Also soft-archive all subtasks with canonical outbox persistence
  if (taskModel.find) {
    const subtasks = await taskModel.find({ parentTaskId: taskId, userId, status: { $ne: "archived" } });
    for (const sub of subtasks) {
      const subVersion = typeof sub.version === "number" ? sub.version : 0;
      const subNextVersion = subVersion + 1;
      const subEventDraft: OutboxEventDraft = {
        userId: String(userId),
        category: "DOMAIN_EVENT",
        type: "domain.task.deleted",
        aggregateId: String(sub._id),
        aggregateType: "task",
        aggregateVersion: subNextVersion,
        source: "web.tasks.delete.cascade",
        payload: {
          taskId: String(sub._id),
          parentTaskId: String(taskId),
          userId: String(userId),
          deletedAt: deletedAt.toISOString(),
        },
        occurredAt: deletedAt,
      };

      await outboxService.persistWithStandaloneFencing({
        userId: String(userId),
        aggregateModel: taskModel,
        aggregateId: String(sub._id),
        clientMutationId: `mut_subtask_del_${sub._id}_v${subNextVersion}`,
        diffHash: `diff_subtask_del_${sub._id}_${subNextVersion}`,
        expectedVersion: subVersion,
        fencingEpoch: sub.mutationEpoch || 0,
        domainUpdates: {
          status: "archived",
          archivedAt: deletedAt,
        },
        eventDrafts: [subEventDraft],
        isDeletion: true,
      });
    }
  }

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.task.deleted",
    aggregateId: String(taskId),
    aggregateType: "task",
    aggregateVersion: nextVersion,
    source: "web.tasks.delete",
    payload: {
      taskId: String(taskId),
      userId: String(userId),
      deletedAt: deletedAt.toISOString(),
    },
    occurredAt: deletedAt,
  };

  await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: taskModel,
    aggregateId: String(taskId),
    clientMutationId,
    diffHash,
    expectedVersion: currentVersion,
    fencingEpoch: currentEpoch,
    domainUpdates: {},
    eventDrafts: [eventDraft],
    isDeletion: true,
  });

  return { success: true };
}

/* ─────────────────────────────────────────────────────────── */
/* completeTask                                                */
/* ─────────────────────────────────────────────────────────── */

export async function completeTask(
  userId: string,
  taskId: string,
  timezone?: string,
  taskModel: any = Task,
  outboxService: OutboxStorageService = OutboxStorageService.getInstance()
) {
  const task = await taskModel.findOne({ _id: taskId, userId });
  if (!task) return { success: false, error: "Task not found" };

  const recurringSeriesId = task.recurringParentId || task._id;
  const nextDate = task.recurring ? nextOccurrence(task.recurring, task.dueDate) : null;

  // If already completed: check if recurring successor exists or needs healing
  if (task.status === "completed") {
    if (task.recurring && nextDate) {
      const existingSuccessor = await taskModel.findOne({
        userId,
        recurringParentId: recurringSeriesId,
        dueDate: nextDate,
      });
      if (existingSuccessor) {
        return { success: true, task, successor: existingSuccessor, deduplicated: true };
      }
      // Successor missing from prior crash -> heal below
    } else {
      return { success: true, task };
    }
  }

  const completedAt = new Date();
  const currentVersion = typeof task.version === "number" ? task.version : 0;
  const currentEpoch = typeof task.mutationEpoch === "number" ? task.mutationEpoch : 0;
  const nextVersion = currentVersion + 1;
  const clientMutationId = `mut_task_complete_${taskId}_v${nextVersion}`;
  const diffHash = `diff_task_complete_${taskId}_${nextVersion}`;

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.task.completed",
    aggregateId: String(taskId),
    aggregateType: "task",
    aggregateVersion: nextVersion,
    source: "web.tasks.complete",
    payload: {
      taskId: String(taskId),
      userId: String(userId),
      completedAt: completedAt.toISOString(),
      goalId: task.goalId ? String(task.goalId) : undefined,
      title: task.title,
    },
    occurredAt: completedAt,
  };

  const isModeA = await outboxService.supportsTransactions();

  if (isModeA && task.recurring && nextDate) {
    // Mode A: Atomic Multi-Document Transaction
    const succId = new mongoose.Types.ObjectId();
    const succEventDraft: OutboxEventDraft = {
      userId: String(userId),
      category: "DOMAIN_EVENT",
      type: "domain.task.created",
      aggregateId: String(succId),
      aggregateType: "task",
      aggregateVersion: 1,
      source: "web.tasks.complete.recur",
      payload: {
        taskId: String(succId),
        userId: String(userId),
        title: task.title,
        dueDate: nextDate,
        goalId: task.goalId ? String(task.goalId) : undefined,
        priority: task.priority || "medium",
        recurringParentId: String(recurringSeriesId),
      },
      occurredAt: completedAt,
    };

    let successorDoc: any = null;

    await outboxService.persistWithTransaction({
      userId: String(userId),
      aggregateModel: taskModel,
      aggregateId: String(taskId),
      clientMutationId,
      diffHash,
      expectedVersion: currentVersion,
      domainMutation: async (session) => {
        const updated = await taskModel.findOneAndUpdate(
          { _id: taskId, version: currentVersion },
          {
            $set: { status: "completed", completedAt, version: nextVersion },
          },
          { new: true, session }
        );

        const created = await taskModel.create(
          [
            {
              _id: succId,
              userId,
              title: task.title,
              description: task.description,
              dueDate: nextDate,
              dueTime: task.dueTime,
              priority: task.priority,
              status: "pending",
              recurring: task.recurring,
              goalId: task.goalId,
              reminders: task.reminders,
              metadata: task.metadata,
              recurringParentId: recurringSeriesId,
              version: 1,
              mutationEpoch: 0,
              recentMutationReceipts: [],
            },
          ],
          { session }
        );
        successorDoc = created[0];
        return { updatedDoc: updated, newVersion: nextVersion };
      },
      eventDrafts: [eventDraft, succEventDraft],
    });

    const updatedParent = await taskModel.findById(taskId);
    return { success: true, task: updatedParent || task, successor: successorDoc };
  }

  // Mode B (or non-recurring Mode A):
  if (task.status !== "completed") {
    await outboxService.persistWithStandaloneFencing({
      userId: String(userId),
      aggregateModel: taskModel,
      aggregateId: String(taskId),
      clientMutationId,
      diffHash,
      expectedVersion: currentVersion,
      fencingEpoch: currentEpoch,
      domainUpdates: {
        status: "completed",
        completedAt,
      },
      eventDrafts: [eventDraft],
    });
  }

  const updatedParent = await taskModel.findById(taskId);

  // Auto-spawn next recurring instance (Mode B staged recovery)
  let successor: any = null;
  if (task.recurring && nextDate) {
    try {
      const succId = new mongoose.Types.ObjectId();
      const succClientMutationId = `mut_task_recur_${recurringSeriesId}_${nextDate}`;
      const succDiffHash = `diff_task_recur_${recurringSeriesId}_${nextDate}`;

      const succEventDraft: OutboxEventDraft = {
        userId: String(userId),
        category: "DOMAIN_EVENT",
        type: "domain.task.created",
        aggregateId: String(succId),
        aggregateType: "task",
        aggregateVersion: 1,
        source: "web.tasks.complete.recur",
        payload: {
          taskId: String(succId),
          userId: String(userId),
          title: task.title,
          dueDate: nextDate,
          goalId: task.goalId ? String(task.goalId) : undefined,
          priority: task.priority || "medium",
          recurringParentId: String(recurringSeriesId),
        },
        occurredAt: completedAt,
      };

      await outboxService.persistWithStandaloneFencing({
        userId: String(userId),
        aggregateModel: taskModel,
        aggregateId: String(succId),
        clientMutationId: succClientMutationId,
        diffHash: succDiffHash,
        expectedVersion: 0,
        fencingEpoch: 0,
        domainUpdates: {
          userId,
          title: task.title,
          description: task.description,
          dueDate: nextDate,
          dueTime: task.dueTime,
          priority: task.priority,
          status: "pending",
          recurring: task.recurring,
          goalId: task.goalId,
          reminders: task.reminders,
          metadata: task.metadata,
          recurringParentId: recurringSeriesId,
        },
        eventDrafts: [succEventDraft],
        isCreation: true,
      });

      successor = await taskModel.findById(succId);
    } catch (err: any) {
      if (err.code === 11000 || (err.name === "MongoServerError" && err.code === 11000)) {
        // Unique partial index detected concurrent insert or retry
        successor = await taskModel.findOne({
          userId,
          recurringParentId: recurringSeriesId,
          dueDate: nextDate,
        });
        return { success: true, task: updatedParent || task, successor, deduplicated: true };
      }

      // Explicit partial failure reporting
      return {
        success: false,
        status: "SUCCESSOR_CREATION_FAILED",
        parentCompleted: true,
        error: "Parent task completed but recurring successor creation failed. Retry completeTask to heal.",
        task: updatedParent || task,
      };
    }
  }

  return { success: true, task: updatedParent || task, successor };
}

/* ─────────────────────────────────────────────────────────── */
/* uncompleteTask                                              */
/* ─────────────────────────────────────────────────────────── */

export async function uncompleteTask(
  userId: string,
  taskId: string,
  timezone?: string,
  taskModel: any = Task,
  outboxService: OutboxStorageService = OutboxStorageService.getInstance()
) {
  const task = await taskModel.findOne({ _id: taskId, userId });
  if (!task) return { success: false, error: "Task not found" };

  if (task.status !== "completed") return { success: true, task };

  const currentVersion = typeof task.version === "number" ? task.version : 0;
  const currentEpoch = typeof task.mutationEpoch === "number" ? task.mutationEpoch : 0;
  const nextVersion = currentVersion + 1;
  const clientMutationId = `mut_task_uncomplete_${taskId}_v${nextVersion}`;
  const diffHash = `diff_task_uncomplete_${taskId}_${nextVersion}`;
  const updatedAt = new Date();

  const domainUpdates = {
    status: "pending",
    completedAt: null,
  };

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.task.updated",
    aggregateId: String(taskId),
    aggregateType: "task",
    aggregateVersion: nextVersion,
    source: "web.tasks.uncomplete",
    payload: {
      taskId: String(taskId),
      userId: String(userId),
      status: "pending",
      previousStatus: "completed",
      updatedAt: updatedAt.toISOString(),
    },
    occurredAt: updatedAt,
  };

  await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: taskModel,
    aggregateId: String(taskId),
    clientMutationId,
    diffHash,
    expectedVersion: currentVersion,
    fencingEpoch: currentEpoch,
    domainUpdates,
    eventDrafts: [eventDraft],
  });

  const updatedTask = await taskModel.findById(taskId);
  return { success: true, task: updatedTask || task, newVersion: nextVersion };
}

/* ─────────────────────────────────────────────────────────── */
/* skipTask                                                    */
/* ─────────────────────────────────────────────────────────── */

export async function skipTask(
  userId: string,
  taskId: string,
  taskModel: any = Task,
  outboxService: OutboxStorageService = OutboxStorageService.getInstance()
) {
  const task = await taskModel.findOne({ _id: taskId, userId });
  if (!task) return { success: false, error: "Task not found" };

  if (task.status === "skipped") return { success: true, task };

  const currentVersion = typeof task.version === "number" ? task.version : 0;
  const currentEpoch = typeof task.mutationEpoch === "number" ? task.mutationEpoch : 0;
  const nextVersion = currentVersion + 1;
  const clientMutationId = `mut_task_skip_${taskId}_v${nextVersion}`;
  const diffHash = `diff_task_skip_${taskId}_${nextVersion}`;
  const updatedAt = new Date();

  const domainUpdates = {
    status: "skipped",
  };

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.task.updated",
    aggregateId: String(taskId),
    aggregateType: "task",
    aggregateVersion: nextVersion,
    source: "web.tasks.skip",
    payload: {
      taskId: String(taskId),
      userId: String(userId),
      status: "skipped",
      previousStatus: task.status,
      updatedAt: updatedAt.toISOString(),
    },
    occurredAt: updatedAt,
  };

  await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: taskModel,
    aggregateId: String(taskId),
    clientMutationId,
    diffHash,
    expectedVersion: currentVersion,
    fencingEpoch: currentEpoch,
    domainUpdates,
    eventDrafts: [eventDraft],
  });

  const updatedTask = await taskModel.findById(taskId);
  return { success: true, task: updatedTask || task, newVersion: nextVersion };
}

/* ─────────────────────────────────────────────────────────── */
/* skipAllForToday                                             */
/* ─────────────────────────────────────────────────────────── */

export async function skipAllForToday(
  userId: string,
  timezone?: string,
  taskModel: any = Task,
  outboxService: OutboxStorageService = OutboxStorageService.getInstance()
) {
  const today = getActiveDate(timezone);
  const pendingTasks = await taskModel.find({ userId, dueDate: today, status: "pending" });

  let count = 0;
  for (const task of pendingTasks) {
    const res = await skipTask(userId, String(task._id), taskModel, outboxService);
    if (res.success) {
      count++;
    }
  }
  return { success: true, skippedCount: count };
}

/* ─────────────────────────────────────────────────────────── */
/* getTasksForDate                                             */
/* ─────────────────────────────────────────────────────────── */

export async function getTasksForDate(userId: string, date: string) {
  return Task.find({ userId, dueDate: date }).sort({ priority: -1, dueTime: 1 }).lean();
}

/* ─────────────────────────────────────────────────────────── */
/* getOverdueTasks                                             */
/* ─────────────────────────────────────────────────────────── */

export async function getOverdueTasks(userId: string, timezone?: string) {
  const today = getActiveDate(timezone);
  return Task.find({ userId, dueDate: { $lt: today }, status: "pending" })
    .sort({ dueDate: 1 })
    .lean();
}

/* ─────────────────────────────────────────────────────────── */
/* getUpcomingTasks                                            */
/* ─────────────────────────────────────────────────────────── */

export async function getUpcomingTasks(userId: string, timezone?: string, days = 7) {
  const today = getActiveDate(timezone);
  const future = new Date(today);
  future.setDate(future.getDate() + days);
  const futureStr = future.toISOString().slice(0, 10);

  return Task.find({
    userId,
    dueDate: { $gt: today, $lte: futureStr },
    status: "pending",
  })
    .sort({ dueDate: 1, dueTime: 1 })
    .lean();
}

/* ─────────────────────────────────────────────────────────── */
/* rescheduleOverdue                                           */
/* ─────────────────────────────────────────────────────────── */

export async function rescheduleOverdue(
  userId: string,
  timezone?: string,
  taskModel: any = Task,
  outboxService: OutboxStorageService = OutboxStorageService.getInstance()
) {
  const today = getActiveDate(timezone);
  const overdue = await taskModel.find({ userId, dueDate: { $lt: today }, status: "pending" });

  let count = 0;
  for (const task of overdue) {
    const currentVersion = typeof task.version === "number" ? task.version : 0;
    const currentEpoch = typeof task.mutationEpoch === "number" ? task.mutationEpoch : 0;
    const nextVersion = currentVersion + 1;
    const clientMutationId = `mut_task_resched_${task._id}_v${nextVersion}`;
    const diffHash = `diff_task_resched_${task._id}_${nextVersion}`;
    const updatedAt = new Date();

    const domainUpdates = {
      dueDate: today,
    };

    const eventDraft: OutboxEventDraft = {
      userId: String(userId),
      category: "DOMAIN_EVENT",
      type: "domain.task.updated",
      aggregateId: String(task._id),
      aggregateType: "task",
      aggregateVersion: nextVersion,
      source: "web.tasks.reschedule_overdue",
      payload: {
        taskId: String(task._id),
        userId: String(userId),
        dueDate: today,
        previousDueDate: task.dueDate,
        reason: "overdue_reschedule",
        updatedAt: updatedAt.toISOString(),
      },
      occurredAt: updatedAt,
    };

    await outboxService.persistWithStandaloneFencing({
      userId: String(userId),
      aggregateModel: taskModel,
      aggregateId: String(task._id),
      clientMutationId,
      diffHash,
      expectedVersion: currentVersion,
      fencingEpoch: currentEpoch,
      domainUpdates,
      eventDrafts: [eventDraft],
    });
    count++;
  }

  return { success: true, rescheduledCount: count };
}

/* ─────────────────────────────────────────────────────────── */
/* findTaskByTitle — fuzzy match, returns best single match   */
/* ─────────────────────────────────────────────────────────── */

export async function findTaskByTitle(userId: string, titleHint: string) {
  const result = await findTaskByTitleSafe(userId, titleHint);
  return result.status === "found" ? result.match : null;
}

/* ─────────────────────────────────────────────────────────── */
/* findTaskByTitleSafe — returns structured result with        */
/* ambiguity detection for safe AI execution                  */
/* ─────────────────────────────────────────────────────────── */

export type TaskMatchResult =
  | { status: "found";     match: any }
  | { status: "ambiguous"; candidates: string[] }
  | { status: "not_found" };

export async function findTaskByTitleSafe(
  userId: string,
  titleHint: string
): Promise<TaskMatchResult> {
  const all = await Task.find({ userId, status: "pending" }).lean();
  const lower = titleHint.toLowerCase();

  // 1. Exact match — unambiguous, return immediately
  const exactMatches = all.filter(t => t.title.toLowerCase() === lower);
  if (exactMatches.length === 1) return { status: "found", match: exactMatches[0] };
  if (exactMatches.length > 1) {
    return { status: "ambiguous", candidates: exactMatches.map(t => t.title) };
  }

  // 2. Substring match
  const substringMatches = all.filter(
    t => t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase())
  );
  if (substringMatches.length === 1) return { status: "found", match: substringMatches[0] };
  if (substringMatches.length > 1) {
    return { status: "ambiguous", candidates: substringMatches.map(t => t.title) };
  }

  // 3. Token overlap — scored matching
  const hintWords = lower.split(/\s+/).filter(w => w.length > 2);
  if (hintWords.length === 0) return { status: "not_found" };

  const scored = all.map(t => {
    const titleWords = t.title.toLowerCase().split(/\s+/);
    let overlap = 0;
    for (const hw of hintWords) {
      if (titleWords.some((tw: string) => tw.includes(hw) || hw.includes(tw))) overlap++;
    }
    return { task: t, overlap, ratio: overlap / hintWords.length };
  });

  // Only consider matches with at least 40% word overlap (prevents bad guesses)
  const MINIMUM_RATIO = 0.4;
  const strong = scored.filter(s => s.ratio >= MINIMUM_RATIO).sort((a, b) => b.overlap - a.overlap);

  if (strong.length === 0) return { status: "not_found" };

  // If top score is clearly dominant (>= 2x the next best), return it
  if (strong.length === 1 || strong[0].overlap > strong[1].overlap) {
    return { status: "found", match: strong[0].task };
  }

  // Multiple equally-strong candidates — ask for clarification
  return {
    status: "ambiguous",
    candidates: strong.slice(0, 3).map(s => s.task.title),
  };
}

