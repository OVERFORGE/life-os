import { GoalStats } from "../models/GoalStats";
import { analyzeGoalPressure } from "./analyzeGoalPressure";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { LifeSettings } from "@/features/insights/models/LifeSettings";

export async function evaluateGoal(goal: any) {

  /* ----------------------------- */
  /* 1️⃣ Load / Init Stats         */
  /* ----------------------------- */

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

  /* ----------------------------- */
  /* 2️⃣ Load Phase                */
  /* ----------------------------- */

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

  /* ----------------------------- */
  /* 3️⃣ Load Weights              */
  /* ----------------------------- */

  const settings = await LifeSettings.findOne({
    userId: goal.userId,
  }).lean();

  const weights =
    settings?.goalPressureWeights ?? {
      cadence: 0.25,
      energy: 0.25,
      stress: 0.25,
      phaseMismatch: 0.25,
    };

  /* ----------------------------- */
  /* 4️⃣ Pressure Analysis         */
  /* ----------------------------- */

  const pressure = phaseExplanation
    ? analyzeGoalPressure({
        goal,
        stats,
        phase: phaseExplanation,
        weights,
      })
    : null;

  /* ----------------------------- */
  /* 5️⃣ Return Enriched Goal      */
  /* ----------------------------- */

  return {
    ...goal,
    stats,
    pressure,
  };
}