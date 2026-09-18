export interface DashboardDTO {
  schemaVersion: 1;
  lifeState: {
    state: string;
    confidence: number;
    explanation: string;
    evidence: string[];
  };
  goalLoad: {
    totalGoals: number;
    highPressureGoalsCount: number;
    globalLoadScore: number;
    mode: "stable" | "underutilized" | "overloaded";
  };
  topPressureGoals: {
    goalId: string;
    goalTitle: string;
    pressureScore: number;
    trend: "rising" | "stable" | "falling";
    explanation: string;
  }[];
  executionPressureNodes: {
    nodeId: string;
    title: string;
    score: number;
    factors: string[];
  }[];
  activeSignals: {
    type: string;
    title: string;
    message: string;
    confidence: string;
  }[];
  systemInsights: string[];
  timestamp: number;
}
