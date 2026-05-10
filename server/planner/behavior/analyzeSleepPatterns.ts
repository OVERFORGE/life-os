import { DailyLog } from "@/server/db/models/DailyLog";
import { timeStringToMinutes, normalizeSleepMinutes, denormalizeSleepMinutes } from "../utils/timeToMinutes";
import { weightedAverageByRecency, calculateVariance, calculateConfidence } from "../utils/statistics";

export async function analyzeSleepPatterns(userId: string) {
  const logs = await DailyLog.find({ userId, "sleep.sleepTime": { $exists: true, $ne: null } })
    .select("date sleep.sleepTime")
    .lean();

  if (!logs || logs.length === 0) {
    return {
      averageMinutes: 1380, // Safe default: 11:00 PM
      variance: 0,
      confidence: 0,
    };
  }

  const rawValues: number[] = [];
  const logEntries: { minutes: number; date: Date }[] = [];

  for (const log of logs) {
    const minutes = timeStringToMinutes(log.sleep?.sleepTime);
    if (minutes !== null) {
      logEntries.push({ minutes, date: new Date(log.date) });
      rawValues.push(minutes);
    }
  }

  if (logEntries.length === 0) {
    return { averageMinutes: 1380, variance: 0, confidence: 0 };
  }

  // Normalize sleep times for crossover math (e.g., 1AM becomes 1440 + 60 = 1500)
  const normalizedRaw = normalizeSleepMinutes(rawValues);
  
  const dataPoints: { value: number; date: Date }[] = logEntries.map((entry, idx) => ({
    value: normalizedRaw[idx],
    date: entry.date,
  }));

  const normalizedAverage = Math.round(weightedAverageByRecency(dataPoints));
  const averageMinutes = denormalizeSleepMinutes(normalizedAverage);
  
  const variance = calculateVariance(normalizedRaw);
  
  // Acceptable variance: 60 minutes squared = 3600
  const confidence = calculateConfidence(variance, dataPoints.length, 3600);

  return {
    averageMinutes,
    variance,
    confidence,
  };
}
