// features/goals/engine/evaluateAllGoals.ts

import { Goal } from "../models/Goal";
import { evaluateGoal } from "./evaluateGoal";

export async function evaluateAllGoals(userId: string) {
  const goals = await Goal.find({ userId }).lean();

  const evaluated = [];

  for (const goal of goals) {
    const enriched = await evaluateGoal(goal);
    evaluated.push(enriched);
  }

  return evaluated;
}
