export interface WorldDTO {
  schemaVersion: 1;
  version: number;
  timestamp: number;
  lifeState: {
    state: string;
    confidence: number;
    explanation: string;
    evidence: string[];
  };
  goalPressures: {
    goalId: string;
    goalTitle: string;
    pressureScore: number;
    trend: string;
    explanation: string;
  }[];
  projectStates: {
    projectId: string;
    projectTitle: string;
    status: string;
    completionPercentage: number;
    riskLevel: string;
    dependencyHealth: string;
  }[];
  relationshipSummaries: {
    personName: string;
    role: string;
    importance: number;
    interactionFrequency: string;
    executionInfluence: string;
    summaryText: string;
  }[];
  trends: {
    metricName: string;
    trend: string;
    changeDescription: string;
  }[];
  predictions: {
    type: string;
    title: string;
    predictionText: string;
    confidence: number;
  }[];
  insights: string[];
  suggestions: string[];
}
