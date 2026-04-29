// features/tasks/engine/taskEngine.ts
// Deterministic CRUD + logic layer. NO LLM. All DB mutations go through here.

import { Task } from "@/server/db/models/Task";
import { Goal } from "@/features/goals/models/Goal";
import { DailyLog } from "@/server/db/models/DailyLog";
import { getActiveDate } from "@/server/automation/timeUtils";

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

export async function createTask(userId: string, input: CreateTaskInput, timezone?: string) {
  const dueDate = resolveDate(input.dueDate, timezone);

  const task = await Task.create({
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
  });

  return { success: true, task };
}

/* ─────────────────────────────────────────────────────────── */
/* updateTask                                                  */
/* ─────────────────────────────────────────────────────────── */

export async function updateTask(userId: string, taskId: string, updates: Partial<CreateTaskInput>) {
  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) return { success: false, error: "Task not found" };

  // Apply allowed updates
  if (updates.title !== undefined) task.title = updates.title;
  if (updates.description !== undefined) task.description = updates.description;
  if (updates.dueDate !== undefined) task.dueDate = resolveDate(updates.dueDate);
  if (updates.dueTime !== undefined) task.dueTime = updates.dueTime;
  if (updates.priority !== undefined) task.priority = updates.priority;
  if (updates.recurring !== undefined) task.recurring = updates.recurring;
  if (updates.goalId !== undefined) task.goalId = updates.goalId;
  if (updates.metadata !== undefined) task.metadata = { ...task.metadata, ...updates.metadata };
  if (updates.reminders !== undefined) task.reminders = updates.reminders;

  await task.save();
  return { success: true, task };
}

/* ─────────────────────────────────────────────────────────── */
/* deleteTask                                                  */
/* ─────────────────────────────────────────────────────────── */

export async function deleteTask(userId: string, taskId: string) {
  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) return { success: false, error: "Task not found" };

  // Also delete all subtasks
  await Task.deleteMany({ parentTaskId: taskId, userId });
  await task.deleteOne();

  return { success: true };
}

/* ─────────────────────────────────────────────────────────── */
/* completeTask                                                */
/* ─────────────────────────────────────────────────────────── */

export async function completeTask(userId: string, taskId: string, timezone?: string) {
  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) return { success: false, error: "Task not found" };

  task.status = "completed";
  task.completedAt = new Date();
  await task.save();

  // ── Goal Signal Contribution ──────────────────────────────────────────────
  // If the task is linked to a goal, find the first signal on that goal
  // and add +1 to it in today's DailyLog.signals map.
  if (task.goalId) {
    try {
      const goal = await Goal.findById(task.goalId).lean();
      if (goal && goal.signals?.length > 0) {
        const signalKey = goal.signals[0].key;
        const today = getActiveDate(timezone);

        let log = await DailyLog.findOne({ userId, date: today });
        if (!log) {
          log = new DailyLog({ userId, date: today, signals: new Map() });
        }

        const existing = log.signals?.get(signalKey) ?? 0;
        if (!log.signals) log.signals = new Map();
        log.signals.set(signalKey, existing + 1);
        log.markModified("signals");
        await log.save();
      }
    } catch (e) {
      console.warn("[taskEngine] Goal signal update failed:", e);
    }
  }

  // ── Auto-spawn next recurring instance ───────────────────────────────────
  if (task.recurring) {
    const nextDate = nextOccurrence(task.recurring, task.dueDate);
    await Task.create({
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
      recurringParentId: task.recurringParentId || task._id,
    });
  }

  return { success: true, task };
}

/* ─────────────────────────────────────────────────────────── */
/* uncompleteTask                                              */
/* ─────────────────────────────────────────────────────────── */

export async function uncompleteTask(userId: string, taskId: string, timezone?: string) {
  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) return { success: false, error: "Task not found" };

  if (task.status !== "completed") return { success: true, task };

  task.status = "pending";
  task.completedAt = null;
  await task.save();

  // ── Revert Goal Signal Contribution ─────────────────────────────────────────
  if (task.goalId) {
    try {
      const goal = await Goal.findById(task.goalId).lean();
      if (goal && goal.signals?.length > 0) {
        const signalKey = goal.signals[0].key;
        const today = getActiveDate(timezone);

        const log = await DailyLog.findOne({ userId, date: today });
        if (log && log.signals && log.signals.has(signalKey)) {
          const existing = log.signals.get(signalKey) || 0;
          if (existing > 0) {
            log.signals.set(signalKey, existing - 1);
            log.markModified("signals");
            await log.save();
          }
        }
      }
    } catch (e) {
      console.warn("[taskEngine] Goal signal revert failed:", e);
    }
  }

  // We do not delete the auto-spawned recurring instance as it could have been modified by the user.
  return { success: true, task };
}

/* ─────────────────────────────────────────────────────────── */
/* skipTask                                                    */
/* ─────────────────────────────────────────────────────────── */

export async function skipTask(userId: string, taskId: string) {
  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) return { success: false, error: "Task not found" };

  task.status = "skipped";
  await task.save();
  return { success: true, task };
}

/* ─────────────────────────────────────────────────────────── */
/* skipAllForToday                                             */
/* ─────────────────────────────────────────────────────────── */

export async function skipAllForToday(userId: string, timezone?: string) {
  const today = getActiveDate(timezone);
  const result = await Task.updateMany(
    { userId, dueDate: today, status: "pending" },
    { $set: { status: "skipped" } }
  );
  return { success: true, skippedCount: result.modifiedCount };
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

export async function rescheduleOverdue(userId: string, timezone?: string) {
  const today = getActiveDate(timezone);
  const overdue = await Task.find({ userId, dueDate: { $lt: today }, status: "pending" });

  let count = 0;
  for (const task of overdue) {
    task.dueDate = today;
    await task.save();
    count++;
  }

  return { success: true, rescheduledCount: count };
}

/* ─────────────────────────────────────────────────────────── */
/* fuzzy find task by title (for AI natural language deletion) */
/* ─────────────────────────────────────────────────────────── */

export async function findTaskByTitle(userId: string, titleHint: string) {
  const all = await Task.find({ userId, status: "pending" }).lean();
  const lower = titleHint.toLowerCase();

  // 1. Exact match
  let match = all.find((t) => t.title.toLowerCase() === lower);
  if (match) return match;

  // 2. Substring match
  match = all.find((t) => t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase()));
  if (match) return match;

  // 3. Token overlap match (best effort)
  const hintWords = lower.split(/\s+/).filter(w => w.length > 2);
  if (hintWords.length === 0) return null;

  let bestMatch = null;
  let maxOverlap = 0;

  for (const t of all) {
    const titleWords = t.title.toLowerCase().split(/\s+/);
    let overlap = 0;
    for (const hw of hintWords) {
      if (titleWords.some((tw: string) => tw.includes(hw) || hw.includes(tw))) {
        overlap++;
      }
    }
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestMatch = t;
    }
  }

  // If at least one meaningful word overlaps, consider it a match
  if (maxOverlap > 0) return bestMatch;
  return null;
}
