// server/llm/executionHandlers/handleCompleteTask.ts
import { findTaskByTitle, completeTask, skipTask, skipAllForToday } from "@/features/tasks/engine/taskEngine";
import { updateGoalStats } from "@/features/goals/engine/updateGoalStats";
import { Task } from "@/server/db/models/Task";
import { User } from "@/server/db/models/User";
import { getActiveDate } from "@/server/automation/timeUtils";

export async function handleCompleteTask(payload: any, userId: string) {
  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  // Handle "skip all" bulk action
  if (payload.skipAll) {
    const result = await skipAllForToday(userId, timezone);
    return { type: "complete_task", action: "skip_all", ...result };
  }

  // Handle "reschedule missed" action
  if (payload.rescheduleOverdue) {
    const today = getActiveDate(timezone);
    const overdue = await Task.find({ userId, status: "pending", dueDate: { $lt: today } });
    let count = 0;
    for (const t of overdue) {
      t.dueDate = today;
      await t.save();
      count++;
    }
    return { type: "complete_task", success: true, action: "reschedule_overdue", rescheduledCount: count };
  }

  // Find by taskId or by natural language title
  let taskId = payload.taskId;

  if (!taskId && payload.title) {
    const found = await findTaskByTitle(userId, payload.title);
    if (found) taskId = String(found._id);
  }

  if (!taskId) {
    return { type: "complete_task", success: false, error: "Could not find matching task" };
  }

  const action = payload.action || "complete";

  let result;
  if (action === "skip") {
    result = await skipTask(userId, taskId);
  } else {
    result = await completeTask(userId, taskId, timezone);
    if (result.success && (result.task as any)?.goalId) {
      await updateGoalStats(userId).catch(() => {});
    }
  }

  return {
    type: "complete_task",
    success: result.success,
    action,
    taskTitle: (result as any).task?.title,
    error: (result as any).error,
  };
}
