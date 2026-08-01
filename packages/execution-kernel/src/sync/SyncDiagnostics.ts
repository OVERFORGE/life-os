import { OfflineOperationQueue } from "./OfflineOperationQueue";
import { ConflictResolver } from "./ConflictResolver";
import { SessionRecoveryEngine } from "./SessionRecoveryEngine";
import { CheckpointManager } from "./CheckpointManager";

export interface SyncDiagnosticsMetrics {
  pendingQueueSize: number;
  lastSyncTime: number;
  currentGraphVersion: number;
  currentCheckpointId: string | null;
  conflictCount: number;
  failedRetries: number;
  recoveryCount: number;
  synchronizationLatencyMs: number;
}

/**
 * SyncDiagnostics Subsystem
 * 
 * SOLE OWNER of read-only sync telemetry and state metrics.
 */
export class SyncDiagnostics {
  private static instance: SyncDiagnostics;
  private lastSyncTime: number = 0;
  private failedRetries: number = 0;
  private synchronizationLatencyMs: number = 0;

  static getInstance(): SyncDiagnostics {
    if (!SyncDiagnostics.instance) {
      SyncDiagnostics.instance = new SyncDiagnostics();
    }
    return SyncDiagnostics.instance;
  }

  recordSync(latencyMs: number): void {
    this.lastSyncTime = Date.now();
    this.synchronizationLatencyMs = latencyMs;
  }

  incrementFailedRetries(): void {
    this.failedRetries++;
  }

  getMetrics(currentGraphVersion: number = 1): SyncDiagnosticsMetrics {
    const queue = OfflineOperationQueue.getInstance();
    const resolver = ConflictResolver.getInstance();
    const recovery = SessionRecoveryEngine.getInstance();
    const checkpoint = CheckpointManager.getInstance().getCurrentCheckpoint();

    return {
      pendingQueueSize: queue.getQueueLength(),
      lastSyncTime: this.lastSyncTime,
      currentGraphVersion,
      currentCheckpointId: checkpoint ? checkpoint.checkpointId : null,
      conflictCount: resolver.getConflictCount(),
      failedRetries: this.failedRetries,
      recoveryCount: recovery.getRecoveryCount(),
      synchronizationLatencyMs: this.synchronizationLatencyMs,
    };
  }
}
