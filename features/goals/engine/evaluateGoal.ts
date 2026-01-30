// features/goals/engine/evaluateGoal.ts

import { Goal } from "../models/Goal";
import { GoalStats } from "../models/GoalStats";
import { analyzeGoalPressure } from "./analyzeGoalPressure";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";

export async function evaluateGoal(goal: any) {
  // -----------------------------
  // 1️⃣ Load or init stats
  // -----------------------------
  let stats = await GoalStats.findOne({ goalId: goal._id });

  if (!stats) {
    stats = await GoalStats.create({
      goalId: goal._id,
      currentScore: 0,
      state: "on_track",
      momentum: "flat",
      bestScoreEver: 0,
      bestStreakEver: 0,
      currentStreak: 0,
      daysSinceProgress: 0,
    });
  }

  // -----------------------------
  // 2️⃣ Get latest life phase
  // -----------------------------
  const latestPhase = await PhaseHistory.findOne({
    userId: goal.userId,
  })
    .sort({ createdAt: -1 })
    .lean();

  const phaseExplanation = latestPhase
    ? {
        phase: latestPhase.phase,
        ...explainLifePhase(latestPhase),
      }
    : null;

  // -----------------------------
  // 3️⃣ Goal Pressure Analysis
  // -----------------------------
  const pressure = phaseExplanation
    ? analyzeGoalPressure({
        goal,
        stats,
        phase: phaseExplanation,
      })
    : null;

  // -----------------------------
  // 4️⃣ Return enriched result
  // -----------------------------
  return {
    ...goal,
    stats,
    pressure,
  };
}
