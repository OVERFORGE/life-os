import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { CheckpointManager } from "./CheckpointManager";
import { OfflineOperationQueue } from "./OfflineOperationQueue";
import { DeviceIdentity } from "./DeviceIdentity";

export interface RecoveredSessionState {
  graph: ExecutionGraph;
  graphVersion: number;
  pendingOperationsCount: number;
  recoveredAt: number;
  sessionId: string;
}

/**
 * SessionRecoveryEngine Subsystem
 * 
 * SOLE OWNER of crash recovery and state continuation.
 * Ensures kernel state, graph version, queued operations, and conversation state survive crashes and reconnects cleanly.
 */
export class SessionRecoveryEngine {
  private static instance: SessionRecoveryEngine;
  private recoveryCount: number = 0;

  static getInstance(): SessionRecoveryEngine {
    if (!SessionRecoveryEngine.instance) {
      SessionRecoveryEngine.instance = new SessionRecoveryEngine();
    }
    return SessionRecoveryEngine.instance;
  }

  getRecoveryCount(): number {
    return this.recoveryCount;
  }

  async recoverSession(userId: string): Promise<RecoveredSessionState> {
    console.log(`🩹 [SESSION_RECOVERY] Recovering session for user ${userId}...`);

    const checkpointManager = CheckpointManager.getInstance();
    const offlineQueue = OfflineOperationQueue.getInstance();
    const deviceIdentity = DeviceIdentity.getInstance();

    // 1. Renew session identifier for fresh recovery session
    const sessionId = deviceIdentity.renewSession();

    // 2. Check for latest checkpoint
    const checkpoint = checkpointManager.getCurrentCheckpoint();
    let graph: ExecutionGraph;

    if (checkpoint) {
      graph = checkpointManager.restoreGraphFromCheckpoint(checkpoint);
    } else {
      graph = await ExecutionGraph.buildFromDatabase(userId);
    }

    const pendingCount = offlineQueue.getQueueLength();
    this.recoveryCount++;

    console.log(`✅ [SESSION_RECOVERY] Session recovered cleanly. Graph Version: v${graph.getGraphVersion()}, Pending Ops: ${pendingCount}`);

    return {
      graph,
      graphVersion: graph.getGraphVersion(),
      pendingOperationsCount: pendingCount,
      recoveredAt: Date.now(),
      sessionId,
    };
  }
}
