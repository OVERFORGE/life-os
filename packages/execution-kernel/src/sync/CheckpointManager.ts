import { KernelCheckpoint } from "./KernelCheckpoint";
import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { RepairHistory } from "../kernel/RepairHistory";
import { LoadedConversationState } from "../kernel/ConversationManager";
import { WorldSnapshot } from "../world/WorldSnapshot";
import { DeviceIdentity } from "./DeviceIdentity";
import { generateId } from "../shared/ids";
import { createGraphVersion } from "../kernel/GraphVersion";

/**
 * CheckpointManager Subsystem
 * 
 * SOLE OWNER of kernel state checkpointing.
 * Allows loading a lossless snapshot + remaining events instead of replaying full event history.
 * 
 * LOSSLESS RESTORATION:
 * - ExecutionNodes
 * - ExecutionEdges
 * - GraphVersion metadata
 * - RepairHistory metadata
 */
export class CheckpointManager {
  private static instance: CheckpointManager;
  private currentCheckpoint: KernelCheckpoint | null = null;

  static getInstance(): CheckpointManager {
    if (!CheckpointManager.instance) {
      CheckpointManager.instance = new CheckpointManager();
    }
    return CheckpointManager.instance;
  }

  getCurrentCheckpoint(): KernelCheckpoint | null {
    return this.currentCheckpoint;
  }

  createCheckpoint(params: {
    graph: ExecutionGraph;
    conversationState?: LoadedConversationState | null;
    worldSnapshot?: WorldSnapshot | null;
    totalEventsReplayed?: number;
  }): KernelCheckpoint {
    const { graph, conversationState = null, worldSnapshot = null, totalEventsReplayed = 0 } = params;

    const deviceIdentity = DeviceIdentity.getInstance().getDeviceMetadata();
    const graphSnapshot = graph.createSnapshot();
    const edges = graph.getAllEdges(); // Capture structural dependency edges
    const repairHistory = RepairHistory.getInstance().getAllRepairs();

    const checkpoint: KernelCheckpoint = {
      checkpointId: generateId("chk"),
      graphVersion: graphSnapshot.graphVersion,
      createdAt: Date.now(),
      graphSnapshot,
      edges,
      repairHistory,
      conversationState: conversationState || null,
      worldSnapshot: worldSnapshot || null,
      metadata: {
        deviceId: deviceIdentity.deviceId,
        totalEventsReplayed,
      },
    };

    this.currentCheckpoint = checkpoint;
    console.log(
      `💾 [CHECKPOINT_MANAGER] Created Lossless KernelCheckpoint ${checkpoint.checkpointId} for Graph v${checkpoint.graphVersion} (${graphSnapshot.nodeCount} nodes, ${edges.length} edges).`
    );
    return checkpoint;
  }

  restoreGraphFromCheckpoint(checkpoint: KernelCheckpoint): ExecutionGraph {
    const graph = new ExecutionGraph();
    const snap = checkpoint.graphSnapshot;

    // 1. Restore GraphVersion Metadata Lineage
    const versionMeta =
      snap.versionMetadata ||
      createGraphVersion(snap.graphVersion, 0, checkpoint.checkpointId, checkpoint.createdAt);
    graph.setVersionMetadata(versionMeta);

    // 2. Restore ExecutionNodes (Ready + Completed + Blocked)
    const allNodes = [
      ...snap.readyNodes,
      ...snap.completedNodes,
      ...snap.blockedNodes.map((b) => b.node),
    ];
    const nodeSet = new Map<string, any>();
    for (const n of allNodes) {
      if (!nodeSet.has(n.id)) {
        nodeSet.set(n.id, n);
        graph.addNode(n);
      }
    }

    // 3. Restore ExecutionEdges (Structural Topology)
    const edges = checkpoint.edges || [];
    for (const edge of edges) {
      graph.addEdge(edge.fromNode, edge.toNode, edge.dependencyType);
    }

    // 4. Restore RepairHistory Metadata
    const repairHistoryStore = RepairHistory.getInstance();
    const existingRepairs = new Set(repairHistoryStore.getAllRepairs().map((r) => r.repairId));
    if (checkpoint.repairHistory) {
      for (const rec of checkpoint.repairHistory) {
        if (!existingRepairs.has(rec.repairId)) {
          repairHistoryStore.addRecord(rec);
          existingRepairs.add(rec.repairId);
        }
      }
    }

    console.log(
      `💾 [CHECKPOINT_MANAGER] Restored ExecutionGraph Losslessly from Checkpoint ${checkpoint.checkpointId} (v${snap.graphVersion}, ${nodeSet.size} nodes, ${edges.length} edges).`
    );
    return graph;
  }
}
