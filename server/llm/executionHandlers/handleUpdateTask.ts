// server/llm/executionHandlers/handleUpdateTask.ts
import { findTaskByTitle, updateTask } from "@/features/tasks/engine/taskEngine";
import { Task } from "@/server/db/models/Task";
import { User } from "@/server/db/models/User";
import { getActiveDate } from "@/server/automation/timeUtils";

export async function handleUpdateTask(payload: any, userId: string) {
  let taskId = payload.taskId;

  if (!taskId && payload.title) {
    const found = await findTaskByTitle(userId, payload.title);
    if (found) taskId = String(found._id);
  }

  if (!taskId) {
    return { type: "update_task", success: false, error: "Could not find matching task to update" };
  }

  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  const { taskId: _id, title: _t, reminderOffsetMinutes, reminderTimes, ...updates } = payload;

  // Resolve new reminder times if provided
  const resolvedReminders: string[] = [];
  const now = new Date();
  const newDueDate = updates.dueDate && !/^today|tomorrow|yesterday$/i.test(updates.dueDate)
    ? updates.dueDate
    : updates.dueDate ? getActiveDate(timezone) : null;

  if (reminderOffsetMinutes && !isNaN(Number(reminderOffsetMinutes))) {
    const ms = Number(reminderOffsetMinutes) * 60 * 1000;
    resolvedReminders.push(new Date(now.getTime() + ms).toISOString());
  }

  if (Array.isArray(reminderTimes) && reminderTimes.length > 0) {
    const baseDate = newDueDate || getActiveDate(timezone);
    for (const t of reminderTimes) {
      const match = String(t).match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        const base = new Date(`${baseDate}T00:00:00`);
        base.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
        resolvedReminders.push(base.toISOString());
      }
    }
  }

  // If a new dueDate is being set and no explicit new reminders, shift existing reminders proportionally
  if (newDueDate && resolvedReminders.length === 0) {
    const existingTask = await Task.findOne({ _id: taskId, userId }).lean();
    if (existingTask && (existingTask as any).reminders?.length > 0) {
      const oldDueDateObj = new Date((existingTask as any).dueDate + 'T00:00:00');
      const newDueDateObj = new Date(newDueDate + 'T00:00:00');
      const dayShift = newDueDateObj.getTime() - oldDueDateObj.getTime();

      for (const r of (existingTask as any).reminders) {
        const shifted = new Date(new Date(r).getTime() + dayShift);
        resolvedReminders.push(shifted.toISOString());
      }
    }
  }

  if (resolvedReminders.length > 0) {
    updates.reminders = resolvedReminders;
  }

  const result = await updateTask(userId, taskId, updates);

  return {
    type: "update_task",
    success: result.success,
    taskTitle: (result as any).task?.title,
    error: (result as any).error,
  };
}
