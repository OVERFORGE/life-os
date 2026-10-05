// server/llm/executionHandlers/handleCreateTask.ts
import { createTask } from "@/features/tasks/engine/taskEngine";
import { User } from "@/server/db/models/User";
import { Goal } from "@/features/goals/models/Goal";
import { getActiveDate, parseLocalToUTC } from "../../automation/timeUtils";

// Helper to locally resolve dates for reminders
function resolveDateForReminders(raw: string, timezone?: string): string {
  const today = getActiveDate(timezone);
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return today; // Fallback for hallucinations like "this Sunday"
}

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
  const dueDate = resolveDateForReminders(payload.dueDate, timezone);

  // Case A: relative offset (e.g. "in one hour" → reminderOffsetMinutes: 60, "in 2 mins" → 2)
  if (payload.reminderOffsetMinutes && !isNaN(Number(payload.reminderOffsetMinutes))) {
    const ms = Number(payload.reminderOffsetMinutes) * 60 * 1000;
    const targetDate = new Date(now.getTime() + ms);
    reminders.push(targetDate.toISOString());
    if (!payload.dueTime) {
      payload.dueTime = targetDate.toLocaleTimeString("en-GB", {
        timeZone: timezone || "UTC",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  // Case B: explicit HH:MM times on the dueDate (e.g. reminderTimes: ["13:00", "15:30"])
  if (Array.isArray(payload.reminderTimes)) {
    for (const t of payload.reminderTimes) {
      const match = String(t).match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        const base = parseLocalToUTC(dueDate, `${match[1].padStart(2, '0')}:${match[2]}`, timezone);
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

  // Case D: If dueTime is specified and reminders is still empty, automatically add due timestamp as reminder!
  if (reminders.length === 0 && payload.dueTime) {
    const match = String(payload.dueTime).match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const base = parseLocalToUTC(dueDate, `${match[1].padStart(2, '0')}:${match[2]}`, timezone);
      reminders.push(base.toISOString());
    }
  }

  // Deduplicate and filter out stale reminders if future reminders are present
  const uniqueReminders = Array.from(new Set(reminders));
  const futureReminders = uniqueReminders.filter((r) => new Date(r).getTime() > now.getTime() - 60000);
  const finalReminders = futureReminders.length > 0 ? futureReminders : uniqueReminders;

  // If dueTime was not set, but we have valid reminders, derive local dueTime from the first reminder
  if (!payload.dueTime && finalReminders.length > 0) {
    const firstRem = new Date(finalReminders[0]);
    if (!isNaN(firstRem.getTime())) {
      payload.dueTime = firstRem.toLocaleTimeString("en-GB", {
        timeZone: timezone || "UTC",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
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
      reminders: finalReminders,
      metadata: {
        energyCost: payload.energyCost,
        estimatedDuration: payload.estimatedDuration,
      },
    },
    timezone
  );

  const reminderCount = finalReminders.length;
  return {
    type: "create_task",
    success: result.success,
    taskId: result.task?._id ? String(result.task._id) : undefined,
    task: result.task,
    taskTitle: result.task?.title,
    dueDate: result.task?.dueDate,
    recurring: result.task?.recurring ? result.task.recurring.type : null,
    linkedGoal: goalId ? true : false,
    remindersSet: reminderCount,
  };
}
