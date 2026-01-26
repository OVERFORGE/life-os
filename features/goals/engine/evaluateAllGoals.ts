import { Goal } from "../models/Goal";
import { evaluateGoal } from "./evaluateGoal";

export async function evaluateAllGoals(userId: string) {
  const goals = await Goal.find({ userId });

  for (const goal of goals) {
    await evaluateGoal(goal, userId);
  }
}
