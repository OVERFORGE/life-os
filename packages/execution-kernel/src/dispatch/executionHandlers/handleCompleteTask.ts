import mongoose from "mongoose";
import { findTaskByTitleSafe, completeTask, skipTask, skipAllForToday, rescheduleOverdue } from "@/features/tasks/engine/taskEngine";
import { updateGoalStats } from "@/features/goals/engine/updateGoalStats";
import { Task } from "@/server/db/models/Task";
import { User } from "@/server/db/models/User";
import { getActiveDate } from "../../automation/timeUtils";
import { logExecution } from "../../shared/debugLogger";

export async function handleCompleteTask(
  payload: any,
  userId: string,
  deps?: { taskModel?: any; outboxService?: any }
) {
  let timezone: string | undefined;
  try {
    if (mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId).select("settings").lean();
      timezone = (user as any)?.settings?.timezone;
    }
  } catch {
    // Fallback if db is not connected or mock environment
  }

  // Handle "skip all" bulk action
  if (payload.skipAll) {
    const result = await skipAllForToday(userId, timezone, deps?.taskModel, deps?.outboxService);
    logExecution("skip_all_tasks", result.success, `skipped ${result.skippedCount}`);
    return { type: "complete_task", action: "skip_all", ...result };
  }

  // Handle "reschedule missed" action
  if (payload.rescheduleOverdue) {
    const result = await rescheduleOverdue(userId, timezone, deps?.taskModel, deps?.outboxService);
    logExecution("reschedule_overdue", result.success, `rescheduled ${result.rescheduledCount}`);
    return { type: "complete_task", action: "reschedule_overdue", ...result };
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
    result = await skipTask(userId, taskId, deps?.taskModel, deps?.outboxService);
  } else {
    result = await completeTask(userId, taskId, timezone, deps?.taskModel, deps?.outboxService);
    if ((result.success || (result as any).parentCompleted) && (result.task as any)?.goalId) {
      await updateGoalStats(userId).catch(() => {});
    }
  }

  const isPartialSuccess = !(result as any).success && (result as any).parentCompleted;
  logExecution("complete_task", result.success || isPartialSuccess, (result as any).task?.title);
  return {
    type: "complete_task",
    success: result.success,
    parentCompleted: (result as any).parentCompleted || result.success,
    action,
    taskTitle: (result as any).task?.title,
    error: (result as any).error,
    status: (result as any).status,
    ai_instruction: result.success
      ? undefined
      : isPartialSuccess
      ? `The task "${(result as any).task?.title || taskId}" was successfully completed, but scheduling the next recurring occurrence encountered a temporary issue that will be retried automatically. Confirm completion of this task to the user.`
      : `Tell the user the task completion failed: ${(result as any).error}. Do NOT say it was completed.`,
  };
}

