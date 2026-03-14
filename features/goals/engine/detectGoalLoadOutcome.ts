// features/goals/engine/detectGoalLoadOutcome.ts

export function detectGoalLoadOutcome({
  globalScore,
  phase,
}: {
  globalScore: number;
  phase: string;
}): "stable" | "overloaded" | "underutilized" {
  // Overload
  if (globalScore > 0.65) return "overloaded";

  // Underload
  if (globalScore < 0.25) return "underutilized";

  // Stable zone
  return "stable";
}
