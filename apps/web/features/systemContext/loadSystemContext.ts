import { loadGoalSystemState } from "@/features/goals/utils/loadGoalSystemState";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";
import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";

type RecentSignals = {
  avgSleep: number | null;
  avgStress: number | null;
  avgMood: number | null;
  avgDeepWork: number | null;
};

export type SystemContext = {
  phase: {
    phase: string;
    explanation?: string;
  };

  goals: any[];

  pressures: {
    goalId: string;
    pressureScore: number;
    status: string;
  }[];

  globalLoad: {
    score: number;
    mode: "stable" | "underutilized" | "overloaded";
  } | null;

  recentSignals: RecentSignals;

  activeSignals?: {
    key: string;
    label: string;
    inputType: string;
  }[];
};

function average(arr: number[]) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export async function loadSystemContext(
  userId: string
): Promise<SystemContext> {
  await connectDB();

  /* -------------------------------- */
  /* Goals + Pressures + Global Load  */
  /* -------------------------------- */

  const goalState = await loadGoalSystemState(userId);

  /* -------------------------------- */
  /* Phase                            */
  /* -------------------------------- */

  const phaseDoc = await PhaseHistory.findOne({
    userId,
    endDate: null,
  }).lean();

  const phaseExplanation = phaseDoc
    ? explainLifePhase(phaseDoc)
    : null;

  const phase = phaseDoc?.phase ?? "balanced";

  /* -------------------------------- */
  /* Recent Logs (last 7 days)        */
  /* -------------------------------- */

  const logs = await DailyLog.find({ userId })
    .sort({ date: -1 })
    .limit(7)
    .lean();

  const sleepValues: number[] = [];
  const stressValues: number[] = [];
  const moodValues: number[] = [];
  const deepWorkValues: number[] = [];

  for (const log of logs) {
    if (log.sleep?.hours) sleepValues.push(log.sleep.hours);
    if (log.mental?.stress) stressValues.push(log.mental.stress);
    if (log.mental?.mood) moodValues.push(log.mental.mood);
    if (log.work?.deepWorkHours)
      deepWorkValues.push(log.work.deepWorkHours);
  }

  const recentSignals: RecentSignals = {
    avgSleep: average(sleepValues),
    avgStress: average(stressValues),
    avgMood: average(moodValues),
    avgDeepWork: average(deepWorkValues),
  };

  /* -------------------------------- */
  /* Final Context                    */
  /* -------------------------------- */

  return {
    phase: {
      phase,
      explanation: phaseExplanation?.summary,
    },

    goals: goalState.goals,

    pressures: goalState.pressures,

    globalLoad: goalState.globalLoad
      ? goalState.globalLoad.global
      : null,

    recentSignals,
    activeSignals: (await import("@/features/signals/models/LifeSignal").then(m => m.LifeSignal.find({ userId, enabled: true }).lean())).map((s: any) => ({
      key: s.key,
      label: s.label,
      inputType: s.inputType
    }))
  };
}