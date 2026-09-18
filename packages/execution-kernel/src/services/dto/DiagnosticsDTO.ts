export interface DiagnosticsDTO {
  schemaVersion: 1;
  snapshotId: string;
  timestamp: number;
  health: {
    status: "Healthy" | "Warning" | "Critical";
    score: number;
    evidence: string[];
  };
  performance: {
    totalDurationMs: number;
    subsystemLatencies: {
      subsystem: string;
      avgLatencyMs: number;
      p95LatencyMs: number;
      executionCount: number;
    }[];
    budgetViolations: string[];
  };
  metrics: {
    totalRequests: number;
    totalRepairs: number;
    totalPredictions: number;
    avgStabilityScore: number;
    avgContextSize: number;
  };
  warnings: string[];
}
