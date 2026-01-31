export function detectGoalLoadOutcome({
  globalScore,
  phase,
}: {
  globalScore: number;
  phase: string;
}): "stable" | "overloaded" | "underutilized" {
  if (globalScore > 0.6) {
    return "overloaded";
  }

  if (globalScore < 0.25 && phase === "recovery") {
    return "underutilized";
  }

  return "stable";
}
