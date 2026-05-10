import { Task } from "@/server/db/models/Task";
import { DailyLog } from "@/server/db/models/DailyLog";
import { User } from "@/server/db/models/User";
import { weightedAverageByRecency } from "../utils/statistics";
import { getLocalDateString } from "../utils/dateHelpers";

export async function analyzeFocusPatterns(userId: string) {
  // Fetch timezone for date math
  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  // Find completed tasks with a timestamp
  const tasks = await Task.find({ userId, status: "completed", completedAt: { $ne: null } })
    .select("completedAt metadata")
    .lean();

  if (!tasks || tasks.length === 0) {
    return [];
  }

  // Create 24 rolling 2-hour windows (shifted by 1 hour)
  // Window i is from hour i to hour i+2 (wrapping around at 24)
  const windows = Array.from({ length: 24 }, (_, i) => ({
    startMinute: i * 60,
    endMinute: ((i + 2) % 24) * 60 === 0 && i !== 22 ? 1440 : ((i + 2) % 24) * 60,
    rawScores: [] as { value: number; date: Date }[],
  }));

  // Group tasks by their day to batch fetch daily logs
  const tasksByDateStr: Record<string, typeof tasks> = {};
  for (const task of tasks) {
    const d = new Date(task.completedAt);
    if (isNaN(d.getTime())) continue;
    
    // Timezone-safe local date string
    const dateStr = getLocalDateString(d, timezone);
    if (!tasksByDateStr[dateStr]) tasksByDateStr[dateStr] = [];
    tasksByDateStr[dateStr].push(task);
  }

  const dateStrs = Object.keys(tasksByDateStr);
  const logs = await DailyLog.find({ userId, date: { $in: dateStrs } })
    .select("date work mental")
    .lean();

  const logsByDate = new Map<string, any>();
  for (const log of logs) {
    logsByDate.set(log.date, log);
  }

  for (const [dateStr, dayTasks] of Object.entries(tasksByDateStr)) {
    const log = logsByDate.get(dateStr);
    
    // Evaluate daily cognitive multipliers based on Priority Order:
    // 1. deepWorkHours 2. explicit focus scores 3. coding sessions 4. study sessions 5. task completion
    let dayMultiplier = 1;
    if (log) {
      if (log.work?.deepWorkHours) dayMultiplier += log.work.deepWorkHours * 2;
      if (log.mental?.focus) dayMultiplier += (log.mental.focus / 10); // assuming focus is 1-10
      if (log.work?.coded) dayMultiplier += 1.5;
      if (log.work?.studied) dayMultiplier += 1.5;
    }

    for (const task of dayTasks) {
      const d = new Date(task.completedAt);
      const minutes = d.getHours() * 60 + d.getMinutes();

      // Task inherent value
      let taskValue = 1;
      if (task.metadata?.estimatedDuration) {
        taskValue += Math.min(task.metadata.estimatedDuration / 30, 4); // Up to +4 for a 2hr task
      }
      if (task.metadata?.energyCost) {
        taskValue += (task.metadata.energyCost / 10);
      }

      const finalScore = taskValue * dayMultiplier;

      // Add to all overlapping rolling windows
      for (let i = 0; i < 24; i++) {
        const start = windows[i].startMinute;
        let end = windows[i].endMinute;
        
        let overlaps = false;
        if (end > start) {
          overlaps = minutes >= start && minutes < end;
        } else {
          // Midnight wrap (e.g. 23:00 to 01:00) -> start: 1380, end: 60
          overlaps = minutes >= start || minutes < end;
        }

        if (overlaps) {
          // Calculate proximity weighting
          // Window is 120 minutes long. Center is at start + 60.
          // Distance from center determines weight. Max distance is 60 minutes.
          let centerMinute = start + 60;
          if (end <= start) {
            // Midnight crossover case (e.g., 23:00 to 01:00)
            centerMinute = (start + 60) % 1440;
          }
          
          let dist = Math.abs(minutes - centerMinute);
          if (end <= start && dist > 720) {
            // Handle crossover distance correctly (shortest path around midnight)
            dist = 1440 - dist;
          }

          // Weight mapping: center (dist=0) -> 1.0, edge (dist=60) -> 0.3
          // Linear interpolation: w = 1.0 - (dist / 60) * 0.7
          const proximityWeight = Math.max(0.3, 1.0 - (dist / 60) * 0.7);

          windows[i].rawScores.push({ value: finalScore * proximityWeight, date: d });
        }
      }
    }
  }

  // Calculate weighted average score for each window
  const scoredWindows = windows.map((w) => {
    const finalScore = weightedAverageByRecency(w.rawScores);
    
    // Confidence is based on number of signals in this window
    const sampleSize = w.rawScores.length;
    const confidence = Math.min(1, sampleSize / 15); // Cap at 15 tasks for max confidence

    return {
      startMinute: w.startMinute,
      endMinute: w.endMinute,
      score: Number(finalScore.toFixed(3)),
      confidence: Number(confidence.toFixed(3)),
    };
  });

  // Filter out windows with no score, sort by highest score
  const peakWindows = scoredWindows
    .filter((w) => w.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // Return top 3 peak focus windows

  return peakWindows;
}
