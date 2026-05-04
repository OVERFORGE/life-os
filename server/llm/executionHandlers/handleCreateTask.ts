// server/llm/executionHandlers/handleCreateTask.ts
import { createTask } from "@/features/tasks/engine/taskEngine";
import { User } from "@/server/db/models/User";
import { Goal } from "@/features/goals/models/Goal";
import { getActiveDate } from "@/server/automation/timeUtils";

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

  // Resolve reminder times to absolute ISO Date strings
  const reminders: string[] = [];
  const now = new Date();
  const dueDate = payload.dueDate && !/^today|tomorrow|yesterday$/i.test(payload.dueDate)
    ? payload.dueDate
    : getActiveDate(timezone);

  // Case A: relative offset (e.g. "in one hour" → reminderOffsetMinutes: 60)
  if (payload.reminderOffsetMinutes && !isNaN(Number(payload.reminderOffsetMinutes))) {
    const ms = Number(payload.reminderOffsetMinutes) * 60 * 1000;
    reminders.push(new Date(now.getTime() + ms).toISOString());
  }

  // Case B: explicit HH:MM times on the dueDate (e.g. reminderTimes: ["13:00", "15:30"])
  if (Array.isArray(payload.reminderTimes)) {
    for (const t of payload.reminderTimes) {
      const match = String(t).match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        const base = new Date(`${dueDate}T00:00:00`);
        base.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
        reminders.push(base.toISOString());
      }
    }
  }

  // Case C: already-resolved ISO strings passed directly
  if (Array.isArray(payload.reminders)) {
    for (const r of payload.reminders) {
      if (typeof r === 'string' && r.includes('T')) {
        reminders.push(r);
      }
    }
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
      reminders,
      metadata: {
        energyCost: payload.energyCost,
        estimatedDuration: payload.estimatedDuration,
      },
    },
    timezone
  );

  const reminderCount = reminders.length;
  return {
    type: "create_task",
    success: result.success,
    taskTitle: result.task?.title,
    dueDate: result.task?.dueDate,
    recurring: result.task?.recurring ? result.task.recurring.type : null,
    linkedGoal: goalId ? true : false,
    remindersSet: reminderCount,
  };
}
