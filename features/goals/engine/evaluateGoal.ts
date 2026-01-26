import { GoalStats } from "../models/GoalStats";
import { DailyLog } from "@/server/db/models/DailyLog";
import { GoalHistory } from "@/server/db/models/GoalHistory";

function getValueByPath(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}
function getToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
export async function evaluateGoal(goal: any, userId: string) {
  const logs = await DailyLog.find({ userId })
    .sort({ date: -1 })
    .limit(14)
    .lean();

  if (!logs.length) return;

  let score = 0;
  let maxScore = 0;
  let activeDays = 0;

  for (const signal of goal.signals) {
    maxScore += signal.weight * logs.length;

    for (const log of logs) {
      const val = getValueByPath(log, signal.key);

      if (val) {
        score += signal.weight;
        activeDays++;
      }
    }
  }

  const progressScore = Math.min(
    100,
    Math.round((score / (maxScore || 1)) * 100)
  );

  // Determine state
  let state = "slow";

  if (activeDays === 0) state = "stalled";
  else if (progressScore > 70) state = "on_track";
  else if (progressScore < 30) state = "drifting";

  await GoalStats.findOneAndUpdate(
    { goalId: goal._id },
    {
      goalId: goal._id,
      currentScore: progressScore,
      state,
      lastEvaluatedAt: new Date(),
    },
    { upsert: true }
  );
  const today = getToday();

  await GoalHistory.updateOne(
    {
      goalId: goal._id,
      userId,
      date: today,
    },
    {
      $set: {
        score: progressScore,
        state,
      },
    },
    { upsert: true }
  );
  
}

  
