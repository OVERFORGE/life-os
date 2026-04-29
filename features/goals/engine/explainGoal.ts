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

  return {
    last14Days: logs.map((l) => l.date).reverse(),
    signals,
  };
}
