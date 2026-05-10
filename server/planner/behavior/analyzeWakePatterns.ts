import { DailyLog } from "@/server/db/models/DailyLog";
import { timeStringToMinutes } from "../utils/timeToMinutes";
import { weightedAverageByRecency, calculateVariance, calculateConfidence } from "../utils/statistics";

export async function analyzeWakePatterns(userId: string) {
  const logs = await DailyLog.find({ userId, "sleep.wakeTime": { $exists: true, $ne: null } })
    .select("date sleep.wakeTime")
    .lean();

  if (!logs || logs.length === 0) {
    return {
      averageMinutes: 480, // Safe default: 8:00 AM
      variance: 0,
      confidence: 0,
    };
  }

  const dataPoints: { value: number; date: Date }[] = [];
  const rawValues: number[] = [];

  for (const log of logs) {
    const minutes = timeStringToMinutes(log.sleep?.wakeTime);
    if (minutes !== null) {
      dataPoints.push({
        value: minutes,
        date: new Date(log.date),
      });
      rawValues.push(minutes);
    }
  }

  if (dataPoints.length === 0) {
    return { averageMinutes: 480, variance: 0, confidence: 0 };
  }

  const averageMinutes = Math.round(weightedAverageByRecency(dataPoints));
  const variance = calculateVariance(rawValues);
  
  // Acceptable variance: 60 minutes squared = 3600
  const confidence = calculateConfidence(variance, dataPoints.length, 3600);

  return {
    averageMinutes,
    variance,
    confidence,
  };
}
