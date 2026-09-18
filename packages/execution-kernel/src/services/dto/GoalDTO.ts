export interface GoalPressureDTO {
  goalId: string;
  goalTitle: string;
  pressureScore: number;
  trend: "rising" | "stable" | "falling";
  factors: string[];
  explanation: string;
}

export interface GoalDTO {
  schemaVersion: 1;
  id: string;
  title: string;
  category?: string;
  pressure: GoalPressureDTO;
  progressPercentage?: number | null;
  status?: "active" | "completed" | "at_risk" | "paused" | string;
}
