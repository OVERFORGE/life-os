export type SubsystemName =
  | "Conversation"
  | "Reasoner"
  | "Planner"
  | "Scheduler"
  | "Dispatcher"
  | "Reflection"
  | "AdaptiveRepair"
  | "LearningEngine"
  | "WorldModelV2"
  | "HistoricalRetrieval"
  | "ContextCollector"
  | "TokenBudgetManager"
  | "ContextBuilder"
  | "ResponseGenerator";

export interface SubsystemDiagnostic {
  subsystem: SubsystemName;
  startTimestamp: number;
  endTimestamp: number;
  durationMs: number;
  success: boolean;
  warnings: string[];
  diagnosticMessages: string[];
  metadata?: Record<string, any>;
}

export interface TraceSpan {
  stage: SubsystemName;
  timestamp: number;
  durationMs: number;
  inputSummary: string;
  outputSummary: string;
  diagnosticMessages: string[];
  warnings: string[];
}

export type HealthStatus = "Healthy" | "Warning" | "Critical";

export interface HealthSummary {
  status: HealthStatus;
  score: number; // 0 - 100
  evidence: string[];
  warnings: string[];
}

export interface PerformanceMetricSummary {
  subsystem: SubsystemName;
  minLatencyMs: number;
  maxLatencyMs: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  executionCount: number;
  lastExecutionMs: number;
}

export interface PerformanceSummary {
  totalDurationMs: number;
  subsystemMetrics: PerformanceMetricSummary[];
  budgetViolations: string[];
}

export interface MetricSummary {
  totalRequests: number;
  totalRepairs: number;
  totalPredictions: number;
  totalWorldSnapshots: number;
  avgStabilityScore: number;
  avgContextSize: number;
  avgGraphNodeCount: number;
  avgLearningConfidence: number;
  checkpointCount: number;
  replayCount: number;
}

export interface ResourceUsage {
  memoryHeapUsedBytes: number;
  memoryHeapTotalBytes: number;
  cpuUserTimeMs?: number;
}

export interface DiagnosticSnapshot {
  snapshotId: string;
  requestId: string;
  timestamp: number;
  kernelVersion: string;
  healthSummary: HealthSummary;
  performanceSummary: PerformanceSummary;
  metricSummary: MetricSummary;
  warnings: string[];
  executionTrace: TraceSpan[];
  subsystemDiagnostics: SubsystemDiagnostic[];
  resourceUsage: ResourceUsage;
}
