export interface LearningDTO {
  schemaVersion: 1;
  behavioralProfile: {
    workHours: { startHour: number; endHour: number };
    sleepWindow: { startHour: number; endHour: number };
    taskCompletionRate: number;
    executionConsistency: number;
    preferredRoutineOrder: string[];
  };
  patterns: {
    patternId: string;
    type: string;
    title: string;
    description: string;
    confidence: string;
    confidenceScore: number;
    evidenceCount: number;
    lastObserved: number;
  }[];
  activeSignals: {
    signalId: string;
    type: string;
    title: string;
    message: string;
    confidence: string;
  }[];
}
