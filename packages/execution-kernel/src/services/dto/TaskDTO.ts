export interface TaskDTO {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "skipped" | "blocked" | "failed" | string;
  priority: number | string;
  entityType: string;
  dueDate?: number;
  scheduledTime?: number;
  estimatedDurationMinutes?: number;
  isReady?: boolean;
  isBlocked?: boolean;
  blockReason?: string;
}

export interface ExecutionGraphDTO {
  schemaVersion: 1;
  graphVersion: number;
  nodeCount: number;
  edgeCount: number;
  blockageRatio: number;
  readyTasks: TaskDTO[];
  blockedTasks: TaskDTO[];
  criticalPathTasks: TaskDTO[];
  parallelExecutionWaves: string[][];
  cycleDiagnostics: string[];
}
