import { RepairPlan, RepairDiagnostics, RepairOperation } from "./AdaptiveRepairEngine";
import { ExecutionGraph } from "./ExecutionGraph";

export interface RepairHistoryRecord {
  repairId: string;
  inputGraphVersion: number;
  outputGraphVersion: number;
  trigger: string;
  operations: RepairOperation[];
  diagnostics: RepairDiagnostics;
  timestamp: number;
}

/**
 * RepairHistory Subsystem
 * 
 * SOLE OWNER of immutable execution repair history and replay metadata.
 * Enables deterministic replay of historical graph states over time.
 * 
 * HARDENING TASK 2 (Phase 9.6):
 * - O(1) INDEXED LOOKUPS by GraphVersion, NodeId, and RepairTrigger.
 * - Automatic index updating on append.
 */
export class RepairHistory {
  private static instance: RepairHistory;
  private records: RepairHistoryRecord[] = [];

  // Deterministic O(1) Index Maps
  private nodeIndex: Map<string, RepairHistoryRecord[]> = new Map();
  private triggerIndex: Map<string, RepairHistoryRecord[]> = new Map();
  private versionIndex: Map<number, RepairHistoryRecord[]> = new Map();

  static getInstance(): RepairHistory {
    if (!RepairHistory.instance) {
      RepairHistory.instance = new RepairHistory();
    }
    return RepairHistory.instance;
  }

  addRecord(record: RepairHistoryRecord): void {
    this.records.push(record);

    // 1. Index by Input & Output Graph Version
    this.indexInsert(this.versionIndex, record.inputGraphVersion, record);
    this.indexInsert(this.versionIndex, record.outputGraphVersion, record);

    // 2. Index by Repair Trigger
    this.indexInsert(this.triggerIndex, record.trigger, record);

    // 3. Index by Target Node IDs
    for (const op of record.operations) {
      if (op.targetNodeId) {
        this.indexInsert(this.nodeIndex, op.targetNodeId, record);
      }
    }

    console.log(
      `📜 [REPAIR_HISTORY] Indexed repair ${record.repairId} (v${record.inputGraphVersion} -> v${record.outputGraphVersion}, ${record.operations.length} ops)`
    );
  }

  getAllRepairs(): RepairHistoryRecord[] {
    return [...this.records];
  }

  /** O(1) Lookup by Graph Version */
  getRepairsByGraphVersion(version: number): RepairHistoryRecord[] {
    return this.versionIndex.get(version) || [];
  }

  /** O(1) Lookup by Target Node ID */
  getRepairsByNode(nodeId: string): RepairHistoryRecord[] {
    return this.nodeIndex.get(nodeId) || [];
  }

  /** O(1) Lookup by Repair Trigger */
  getRepairsByTrigger(trigger: string): RepairHistoryRecord[] {
    return this.triggerIndex.get(trigger) || [];
  }

  private indexInsert<K>(map: Map<K, RepairHistoryRecord[]>, key: K, record: RepairHistoryRecord): void {
    if (!map.has(key)) {
      map.set(key, []);
    }
    const list = map.get(key)!;
    // Deduplicate in list if needed
    if (!list.some((r) => r.repairId === record.repairId)) {
      list.push(record);
    }
  }
}
