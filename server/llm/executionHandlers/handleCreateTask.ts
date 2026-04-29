// server/llm/executionHandlers/handleCreateTask.ts
import { createTask } from "@/features/tasks/engine/taskEngine";
import { User } from "@/server/db/models/User";
import { Goal } from "@/features/goals/models/Goal";

export async function handleCreateTask(payload: any, userId: string) {
  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  // If goalTitle was passed instead of goalId, resolve it
  let goalId = payload.goalId ?? null;
  if (!goalId && payload.goalTitle) {
    const lower = payload.goalTitle.toLowerCase();
    const goals = await Goal.find({ userId }).select("_id title").lean();
    const match = goals.find(
      (g) =>
        g.title.toLowerCase() === lower ||
        g.title.toLowerCase().includes(lower) ||
        lower.includes(g.title.toLowerCase())
    );
    if (match) goalId = String(match._id);
  }

  const result = await createTask(
    userId,
    {
      title: payload.title,
      description: payload.description,
      dueDate: payload.dueDate || "today",
      dueTime: payload.dueTime,
      priority: payload.priority || "medium",
      recurring: payload.recurring || null,
      goalId,
      reminders: payload.reminders || [],
      metadata: {
        energyCost: payload.energyCost,
        estimatedDuration: payload.estimatedDuration,
      },
    },
    timezone
  );

  return {
    type: "create_task",
    success: result.success,
    taskTitle: result.task?.title,
    dueDate: result.task?.dueDate,
    recurring: result.task?.recurring ? result.task.recurring.type : null,
    linkedGoal: goalId ? true : false,
  };
}
