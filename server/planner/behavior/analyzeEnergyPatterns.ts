import { DailyLog } from "@/server/db/models/DailyLog";
import { weightedAverageByRecency } from "../utils/statistics";

export async function analyzeEnergyPatterns(userId: string) {
  // Fetch logs sorted chronologically to allow "day before" analysis
  const logs = await DailyLog.find({ userId })
    .select("date mental sleep work physical")
    .sort({ date: 1 })
    .lean();

  if (!logs || logs.length < 2) {
    return {
      averageSleepBeforeLowEnergy: null,
      averageDeepWorkBeforeLowEnergy: null,
      averageWorkoutLoadBeforeLowEnergy: null,
      averageStressBeforeLowEnergy: null,
      confidence: 0,
    };
  }

  const sleepData: { value: number; date: Date }[] = [];
  const workData: { value: number; date: Date }[] = [];
  const workoutData: { value: number; date: Date }[] = [];
  const stressData: { value: number; date: Date }[] = [];

  for (let i = 1; i < logs.length; i++) {
    const todayLog = logs[i];
    const prevLog = logs[i - 1];

    // Define "Low Energy" as a score <= 4 (assuming 1-10 scale)
    if (todayLog.mental?.energy !== undefined && todayLog.mental.energy <= 4) {
      const d = new Date(todayLog.date);
      if (isNaN(d.getTime())) continue;

      // 1. Sleep before low energy (use yesterday's sleep hours)
      if (prevLog.sleep?.hours !== undefined) {
        sleepData.push({ value: prevLog.sleep.hours, date: d });
      }

      // 2. Deep work before low energy (use yesterday's deep work load)
      if (prevLog.work?.deepWorkHours !== undefined) {
        workData.push({ value: prevLog.work.deepWorkHours, date: d });
      }

      // 3. Workout load before low energy (calories or generic weight)
      // Since we don't have direct workout session data here easily, use physical.gym boolean as 1 or 0, or calories
      let workoutLoad = 0;
      if (prevLog.physical?.gym) workoutLoad += 1;
      if (prevLog.physical?.calories) workoutLoad += prevLog.physical.calories / 1000; // rough normalization
      workoutData.push({ value: workoutLoad, date: d });

      // 4. Stress level (stress from yesterday leading into today's low energy)
      if (prevLog.mental?.stress !== undefined) {
        stressData.push({ value: prevLog.mental.stress, date: d });
      }
    }
  }

  if (sleepData.length === 0) {
    return {
      averageSleepBeforeLowEnergy: null,
      averageDeepWorkBeforeLowEnergy: null,
      averageWorkoutLoadBeforeLowEnergy: null,
      averageStressBeforeLowEnergy: null,
      confidence: 0,
    };
  }

  const averageSleepBeforeLowEnergy = Number(weightedAverageByRecency(sleepData).toFixed(2));
  const averageDeepWorkBeforeLowEnergy = workData.length > 0 ? Number(weightedAverageByRecency(workData).toFixed(2)) : null;
  const averageWorkoutLoadBeforeLowEnergy = workoutData.length > 0 ? Number(weightedAverageByRecency(workoutData).toFixed(2)) : null;
  const averageStressBeforeLowEnergy = stressData.length > 0 ? Number(weightedAverageByRecency(stressData).toFixed(2)) : null;

  // Confidence scales with how many low energy events we've captured to build this correlation
  const confidence = Math.min(1, sleepData.length / 10);

  return {
    averageSleepBeforeLowEnergy,
    averageDeepWorkBeforeLowEnergy,
    averageWorkoutLoadBeforeLowEnergy,
    averageStressBeforeLowEnergy,
    confidence: Number(confidence.toFixed(3)),
  };
}
