import { ExecutionGraphSnapshot, ExecutionEdge } from "../kernel/ExecutionGraph";
import { RepairHistoryRecord } from "../kernel/RepairHistory";
import { LoadedConversationState } from "../kernel/ConversationManager";
import { WorldSnapshot } from "../world/WorldSnapshot";

export interface KernelCheckpoint {
  checkpointId: string;
  graphVersion: number;
  createdAt: number;
  graphSnapshot: ExecutionGraphSnapshot;
  edges: ExecutionEdge[]; // Phase 9 Checkpoint Hardening — Lossless Topology Restoration
  repairHistory: RepairHistoryRecord[];
  conversationState: LoadedConversationState | null;
  worldSnapshot: WorldSnapshot | null;
  metadata: {
    deviceId: string;
    totalEventsReplayed: number;
  };
}
