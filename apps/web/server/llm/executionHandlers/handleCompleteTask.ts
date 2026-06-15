// server/llm/executionHandlers/handleCompleteTask.ts
import { findTaskByTitleSafe, completeTask, skipTask, skipAllForToday } from "@/features/tasks/engine/taskEngine";
import { updateGoalStats } from "@/features/goals/engine/updateGoalStats";
import { Task } from "@/server/db/models/Task";
import { User } from "@/server/db/models/User";
import { getActiveDate } from "@/server/automation/timeUtils";
import { logExecution } from "@/server/llm/debugLogger";

export async function handleCompleteTask(payload: any, userId: string) {
  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  // Handle "skip all" bulk action
  if (payload.skipAll) {
    const result = await skipAllForToday(userId, timezone);
    logExecution("skip_all_tasks", result.success, `skipped ${result.skippedCount}`);
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
    logExecution("reschedule_overdue", true, `rescheduled ${count}`);
    return { type: "complete_task", success: true, action: "reschedule_overdue", rescheduledCount: count };
  }

  // Find by taskId (from UI) — always safe, use directly
  let taskId = payload.taskId;

  // Find by natural-language title — use safe matcher
  if (!taskId && payload.title) {
    const matchResult = await findTaskByTitleSafe(userId, payload.title);

    if (matchResult.status === "not_found") {
      logExecution("complete_task", false, `no match for "${payload.title}"`);
      return {
        type: "complete_task",
        success: false,
        error: `No pending task found matching "${payload.title}". It may already be completed or doesn't exist.`,
        ai_instruction: `Tell the user you couldn't find any task matching "${payload.title}". Do NOT say it was completed.`,
      };
    }

    if (matchResult.status === "ambiguous") {
      logExecution("complete_task", false, `ambiguous match — ${matchResult.candidates.length} candidates`);
      return {
        type: "complete_task",
        success: false,
        ambiguous: true,
        candidates: matchResult.candidates,
        error: "Multiple tasks match that description",
        ai_instruction: `Tell the user you found multiple tasks that could match: ${matchResult.candidates.map(c => `"${c}"`).join(", ")}. Ask them to clarify which one they mean.`,
      };
    }

    taskId = String(matchResult.match._id);
  }

  if (!taskId) {
    return {
      type: "complete_task",
      success: false,
      error: "No task identifier provided",
      ai_instruction: "Tell the user you need a more specific task name to mark it as complete.",
    };
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

  logExecution("complete_task", result.success, (result as any).task?.title);
  return {
    type: "complete_task",
    success: result.success,
    action,
    taskTitle: (result as any).task?.title,
    error: (result as any).error,
    ai_instruction: result.success
      ? undefined
      : `Tell the user the task completion failed: ${(result as any).error}. Do NOT say it was completed.`,
  };
}

