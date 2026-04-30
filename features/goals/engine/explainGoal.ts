import { DailyLog } from "@/server/db/models/DailyLog";

function getValueByPath(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

export async function explainGoal(goal: any, userId: string) {
  const logs = await DailyLog.find({ userId })
    .sort({ date: -1 })
    .limit(14)
    .lean();

  const signals = goal.signals.map((s: any) => {
    let activeDays = 0;
    const values: number[] = [];

    for (const log of logs) {
      // First check dynamic signals map (which lean() converts to a standard object), then fallback to root path
      const dynamicSignalValue = log.signals ? log.signals[s.key] : undefined;
      const v = dynamicSignalValue !== undefined ? dynamicSignalValue : getValueByPath(log, s.key);

      if (typeof v === "boolean") {
        if (v) activeDays++;
        values.push(v ? 1 : 0);
      } else if (typeof v === "number") {
        if (v > 0) activeDays++;
        values.push(v);
      } else {
        values.push(0);
      }
    }

    return {
      key: s.key,
      weight: s.weight,
      activeDays,
      values: values.reverse(), // oldest → newest
    };
  });

  // --- Task Completions Integration ---
  if (logs.length > 0) {
    const { Task } = await import("@/server/db/models/Task");
    const oldestDate = logs[logs.length - 1].date; // logs are sorted desc, so last is oldest
    
    // Fetch all completed tasks for this goal since the oldest log date
    const tasks = await Task.find({
      userId,
      goalId: goal._id,
      status: "completed",
      completedAt: { $gte: new Date(oldestDate) }
    }).lean();

    const taskValues: number[] = [];
    let taskActiveDays = 0;

    // We process the logs in normal order (newest to oldest) to match how we built the other signals,
    // then reverse the values array at the end.
    for (const log of logs) {
      const count = tasks.filter((t: any) => 
        t.completedAt && new Date(t.completedAt).toISOString().startsWith(log.date)
      ).length;
      
      if (count > 0) taskActiveDays++;
      taskValues.push(count);
    }

    // Only inject the signal if they actually have tasks linked to this goal, OR if we want it to always exist.
    // If we always inject it, the totalWeight increases, meaning goals *require* tasks to reach 100%.
    // If we only inject it when `taskActiveDays > 0` or if tasks exist, it's safer.
    // However, if the user linked tasks, we assume they want them to count.
    const hasLinkedTasks = await Task.exists({ userId, goalId: goal._id });
    if (hasLinkedTasks) {
      signals.push({
        key: "system.tasks_completed",
        weight: 1, // Base weight for completing tasks
        activeDays: taskActiveDays,
        values: taskValues.reverse(),
      });
    }
  }

  return {
    last14Days: logs.map((l) => l.date).reverse(),
    signals,
  };
}
