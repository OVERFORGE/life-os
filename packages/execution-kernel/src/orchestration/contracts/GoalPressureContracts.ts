/**
 * Goal Pressure V3 Integration Contract
 * 
 * Invariant 21: Future Goal Pressure V3 can plug in without rewriting Supervisor.
 */

export interface GoalPressureInputs {
  goalId: string;
  activeWorkload: number;
  taskCount: number;
  blockedCount: number;
  criticalPathPressure: number;
  deadlineUrgency: number;
  estimatedDurationTotal: number;
  goalPriority: number;
  energyCostTotal: number;
  recoveryImpactScore: number;
}

export interface GoalPressureEstimate {
  goalId: string;
  goalTitle: string;
  pressureScore: number; // 0 - 100
  confidence: number;    // 0.0 - 1.0
  trend: "rising" | "stable" | "falling";
  factors: string[];
  explanation: string;
  projection: {
    urgencyLevel: "critical" | "high" | "moderate" | "low";
    recommendedAction?: string;
  };
}

export interface IGoalPressureEngine {
  calculatePressure(inputs: GoalPressureInputs[]): Promise<GoalPressureEstimate[]>;
}
