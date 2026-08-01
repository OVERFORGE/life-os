import { SyncStateMachine } from "./SyncStateMachine";
import { OfflineOperationQueue, QueuedOperation } from "./OfflineOperationQueue";
import { ConflictResolver } from "./ConflictResolver";
import { SyncJournal } from "./SyncJournal";
import { ReplicationManager } from "./ReplicationManager";
import { DeviceIdentity } from "./DeviceIdentity";
import { SyncDiagnostics } from "./SyncDiagnostics";
import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { RepairPlan } from "../kernel/AdaptiveRepairEngine";

export interface SyncProcessResult {
  processedCount: number;
  conflictsResolved: number;
  syncedGraphVersion: number;
}

/**
 * SyncEngine Subsystem
 * 
 * SOLE OWNER of orchestrating multi-device synchronization.
 * Pure transportation engine: does NOT execute business logic or AI reasoning.
 */
export class SyncEngine {
  private static instance: SyncEngine;

  static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine();
    }
    return SyncEngine.instance;
  }

  /**
   * Queue a local kernel operation for synchronization.
   */
  queueOperation(operationType: string, payload: any): void {
    const queue = OfflineOperationQueue.getInstance();
    const identity = DeviceIdentity.getInstance();

    const metadata = identity.createSyncEventMetadata();
    queue.enqueue({
      id: metadata.eventId,
      operationType,
      payload,
      metadata,
      maxRetries: 3,
    });
  }

  /**
   * Process all queued offline operations deterministically against the target ExecutionGraph.
   */
  async processSync(graph: ExecutionGraph): Promise<SyncProcessResult> {
    const stateMachine = SyncStateMachine.getInstance();
    const queue = OfflineOperationQueue.getInstance();
    const resolver = ConflictResolver.getInstance();
    const journal = SyncJournal.getInstance();
    const diagnostics = SyncDiagnostics.getInstance();
    const startTime = Date.now();

    let processedCount = 0;
    let conflictsResolved = 0;

    stateMachine.transitionTo("Uploading");

    while (queue.getQueueLength() > 0) {
      const op = queue.dequeue();
      if (!op) break;

      stateMachine.transitionTo("WaitingForAck");

      // 1. Conflict Resolution Policy Check
      const resolution = resolver.resolve(op, graph.getGraphVersion());

      if (resolution.action === "RejectDuplicate" || resolution.action === "IgnoreAlreadyApplied") {
        conflictsResolved++;
        journal.append({
          eventId: op.metadata.eventId,
          graphVersion: graph.getGraphVersion(),
          repairId: op.payload?.repairId || "none",
          timestamp: op.metadata.timestamp,
          deviceId: op.metadata.deviceId,
          sessionId: op.metadata.sessionId,
          operationType: op.operationType,
          status: "Rejected",
          payload: { reason: resolution.reason },
        });
        continue;
      }

      stateMachine.transitionTo("Applying");

      const targetOp = resolution.rebasedOperation || op;

      // 2. Append cleanly to SyncJournal
      journal.append({
        eventId: targetOp.metadata.eventId,
        graphVersion: graph.getGraphVersion(),
        repairId: targetOp.payload?.repairId || "none",
        timestamp: targetOp.metadata.timestamp,
        deviceId: targetOp.metadata.deviceId,
        sessionId: targetOp.metadata.sessionId,
        operationType: targetOp.operationType,
        status: "Applied",
        payload: targetOp.payload,
      });

      processedCount++;
    }

    stateMachine.transitionTo("Completed");
    stateMachine.transitionTo("Idle");

    const latency = Date.now() - startTime;
    diagnostics.recordSync(latency);

    console.log(
      `🌐 [SYNC_ENGINE] Processed ${processedCount} operation(s), resolved ${conflictsResolved} conflict(s). Synced Graph: v${graph.getGraphVersion()}`
    );

    return {
      processedCount,
      conflictsResolved,
      syncedGraphVersion: graph.getGraphVersion(),
    };
  }
}
