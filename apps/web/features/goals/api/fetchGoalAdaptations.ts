import { GoalAdaptationResponse } from "../types/GoalAdaptation";

export async function fetchGoalAdaptations(): Promise<GoalAdaptationResponse> {
  const res = await fetch("/api/insights/goal-adaptations", {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to load goal adaptations");
  }

  return res.json();
}