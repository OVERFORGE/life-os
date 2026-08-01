import { generateId } from "../shared/ids";
import { ExecutionGraph, ExecutionNode, ExecutionGraphSnapshot } from "./ExecutionGraph";
import { ExecutionOutcome } from "../reflection/ExecutionOutcome";

// ──────────────────────────────────────────────
// Phase 9 & 9.5 Repair Types & Interfaces
// ──────────────────────────────────────────────

export type RepairTrigger =
  | "TaskCompleted"
  | "TaskFailed"
  | "TaskSkipped"
  | "TaskDelayed"
  | "TaskCreated"
  | "TaskDeleted"
  | "GoalAccepted"
  | "GoalCancelled"
  | "DependencyAdded"
  | "DependencyRemoved"
  | "WorkflowInterrupted"
  | "ScheduleConflict"
  | "TimeAdvance"
  | "UserOverride";

export type RepairOpType =
  | "UnlockNode"
  | "BlockNode"
  | "DelayNode"
  | "AdvanceNode"
  | "RecalculatePriority"
  | "RecalculatePressure"
  | "RemoveDependency"
  | "AddDependency"
  | "RepairSchedule"
  | "CloseCascade"
  | "MarkBlocked"
  | "MarkReady";

export interface RepairOperation {
  id: string;
  type: RepairOpType;
  targetNodeId: string;
  targetTitle: string;
  details: string;
  previousState?: string;
  newState?: string;
}

export interface RepairPlan {
  id: string;
  inputGraphVersion: number;
  outputGraphVersion: number;
  trigger: RepairTrigger;
  operations: RepairOperation[];
  affectedNodeIds: string[];
  maxRepairDepth: number;
  totalOperations: number;
  estimatedCost: "Low" | "Medium" | "High";
  timestamp: number;
}

export interface RepairDiagnostics {
  repairReason: string;
  propagationChain: string[];
  repairedNodeIds: string[];
  unchangedNodeIds: string[];
  deadNodeIds: string[];
  orphanNodeIds: string[];
  stabilityScore: number; // 0 – 100
  warnings: string[];
}

export interface ProjectedNodeState {
  nodeId: string;
  currentStatus: string;
  futureStatus: string;
}

export interface AdaptiveRepairPlanningResult {
  plan: RepairPlan;
  diagnostics: RepairDiagnostics;
}

export interface RepairParams {
  graph: ExecutionGraph;
  outcomes?: ExecutionOutcome[];
  trigger?: RepairTrigger;
  timestamp?: number;
}

// ──────────────────────────────────────────────
// AdaptiveRepairEngine Subsystem (Pure Functional Planner)
// ──────────────────────────────────────────────

/**
 * AdaptiveRepairEngine
 * 
 * SOLE OWNER of deterministic graph repair planning.
 * Inspects execution outcomes and dependency topology to emit RepairOperations.
 * 
 * HARDENING TASK 1 (Phase 9.6):
 * - ZERO GRAPH MUTATION: Planning uses purely functional projected state mappings.
 * - Input ExecutionGraph is treated as strictly read-only.
 * - 100% deterministic, replayable, idempotent, order-preserving.
 */
export class AdaptiveRepairEngine {
  private static instance: AdaptiveRepairEngine;

  static getInstance(): AdaptiveRepairEngine {
    if (!AdaptiveRepairEngine.instance) {
      AdaptiveRepairEngine.instance = new AdaptiveRepairEngine();
    }
    return AdaptiveRepairEngine.instance;
  }

  /**
   * Plan deterministic graph repair operations without mutating the input graph AT ALL.
   */
  planRepair(params: RepairParams): AdaptiveRepairPlanningResult {
    const { graph, outcomes = [], trigger: explicitTrigger, timestamp = Date.now() } = params;

    const inputGraphVersion = graph.getGraphVersion();
    const outputGraphVersion = inputGraphVersion + 1;
    const trigger = explicitTrigger || this.resolveTriggerFromOutcomes(outcomes);

    // Projected State Mapping: NodeId -> Future Projected Status (zero graph mutation)
    const projectedStatusMap = new Map<string, string>();
    const getProjectedStatus = (nodeId: string): string => {
      return projectedStatusMap.get(nodeId) || graph.getNode(nodeId)?.status || "pending";
    };

    const operations: RepairOperation[] = [];
    const propagationChain: string[] = [];
    const affectedNodeIds = new Set<string>();

    let maxDepth = 0;

    console.log(`🛠️ [REPAIR_PLANNER] Functional planning for trigger: ${trigger} (v${inputGraphVersion} -> v${outputGraphVersion})`);

    // 1. Dependency Unlock Planning
    const unlockResult = this.planUnlocks(graph, outcomes, getProjectedStatus, projectedStatusMap);
    operations.push(...unlockResult.operations);
    unlockResult.affectedNodeIds.forEach((id) => affectedNodeIds.add(id));
    propagationChain.push(...unlockResult.propagationLog);
    if (unlockResult.depth > maxDepth) maxDepth = unlockResult.depth;

    // 2. Block Propagation Planning
    const blockResult = this.planBlockages(graph, outcomes, getProjectedStatus, projectedStatusMap);
    operations.push(...blockResult.operations);
    blockResult.affectedNodeIds.forEach((id) => affectedNodeIds.add(id));
    propagationChain.push(...blockResult.propagationLog);
    if (blockResult.depth > maxDepth) maxDepth = blockResult.depth;

    // 3. Diagnostics calculation over projected state
    const deadNodeIds = this.detectDeadNodes(graph, getProjectedStatus);
    const orphanNodeIds = this.detectOrphanNodes(graph, getProjectedStatus);
    const initialSnapshot = graph.createSnapshot();

    const stabilityScore = this.calculateStabilityScore(
      graph,
      initialSnapshot,
      deadNodeIds.length,
      orphanNodeIds.length,
      maxDepth,
      getProjectedStatus
    );

    const estimatedCost = this.estimateRepairCost(operations.length, maxDepth, affectedNodeIds.size);

    const plan: RepairPlan = {
      id: generateId("rep"),
      inputGraphVersion,
      outputGraphVersion,
      trigger,
      operations,
      affectedNodeIds: Array.from(affectedNodeIds),
      maxRepairDepth: maxDepth,
      totalOperations: operations.length,
      estimatedCost,
      timestamp,
    };

    const warnings: string[] = [...initialSnapshot.cycleDiagnostics];
    if (deadNodeIds.length > 0) {
      warnings.push(`Detected ${deadNodeIds.length} dead node(s) with unresolvable dependencies.`);
    }
    if (orphanNodeIds.length > 0) {
      warnings.push(`Detected ${orphanNodeIds.length} orphan node(s) with no parent or workflow context.`);
    }

    const allNodeIds = graph.getAllNodes().map((n) => n.id);
    const unchangedNodeIds = allNodeIds.filter((id) => !affectedNodeIds.has(id));

    const diagnostics: RepairDiagnostics = {
      repairReason: `Automated repair plan generated for ${trigger}`,
      propagationChain,
      repairedNodeIds: Array.from(affectedNodeIds),
      unchangedNodeIds,
      deadNodeIds,
      orphanNodeIds,
      stabilityScore,
      warnings,
    };

    return { plan, diagnostics };
  }

  // ── Pure Functional Planning Helpers ─────────────────────────────

  private planUnlocks(
    graph: ExecutionGraph,
    outcomes: ExecutionOutcome[],
    getProjectedStatus: (id: string) => string,
    projectedStatusMap: Map<string, string>
  ): { operations: RepairOperation[]; affectedNodeIds: string[]; propagationLog: string[]; depth: number } {
    const operations: RepairOperation[] = [];
    const affectedNodeIds: string[] = [];
    const propagationLog: string[] = [];

    const queue: { nodeId: string; depth: number }[] = [];
    const visited = new Set<string>();

    for (const outcome of outcomes) {
      const isComplete = outcome.type === "TaskCompleted" || outcome.result?.success === true;
      const targetId = outcome.payload?.taskId || outcome.payload?.id || outcome.result?.taskId;
      if (isComplete && targetId) {
        queue.push({ nodeId: targetId, depth: 1 });
        visited.add(targetId);
      }
    }

    for (const node of graph.getAllNodes()) {
      const status = getProjectedStatus(node.id);
      if ((status === "completed" || status === "skipped") && !visited.has(node.id)) {
        queue.push({ nodeId: node.id, depth: 1 });
        visited.add(node.id);
      }
    }

    let maxDepth = 0;

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      if (depth > maxDepth) maxDepth = depth;

      const dependents = graph.getDependents(nodeId);

      for (const dep of dependents) {
        const depStatus = getProjectedStatus(dep.id);
        if (depStatus === "completed" || depStatus === "skipped") continue;

        const dependencies = graph.getDependencies(dep.id);
        const allCompleted = dependencies.every((d) => {
          const s = getProjectedStatus(d.id);
          return s === "completed" || s === "skipped";
        });

        if (allCompleted && depStatus === "blocked") {
          projectedStatusMap.set(dep.id, "pending");

          operations.push({
            id: generateId("op"),
            type: "UnlockNode",
            targetNodeId: dep.id,
            targetTitle: dep.title,
            details: `Unlocked dependent node "${dep.title}" because all dependencies are satisfied.`,
            previousState: depStatus,
            newState: "pending",
          });

          operations.push({
            id: generateId("op"),
            type: "MarkReady",
            targetNodeId: dep.id,
            targetTitle: dep.title,
            details: `Node "${dep.title}" is now ready for execution.`,
            previousState: depStatus,
            newState: "pending",
          });

          affectedNodeIds.push(dep.id);
          propagationLog.push(`Unlock -> [${dep.entityType}] "${dep.title}" (${dep.id})`);

          if (!visited.has(dep.id)) {
            visited.add(dep.id);
            queue.push({ nodeId: dep.id, depth: depth + 1 });
          }
        }
      }
    }

    return { operations, affectedNodeIds, propagationLog, depth: maxDepth };
  }

  private planBlockages(
    graph: ExecutionGraph,
    outcomes: ExecutionOutcome[],
    getProjectedStatus: (id: string) => string,
    projectedStatusMap: Map<string, string>
  ): { operations: RepairOperation[]; affectedNodeIds: string[]; propagationLog: string[]; depth: number } {
    const operations: RepairOperation[] = [];
    const affectedNodeIds: string[] = [];
    const propagationLog: string[] = [];

    const queue: { nodeId: string; depth: number }[] = [];
    const visited = new Set<string>();

    for (const outcome of outcomes) {
      const isFailed = outcome.result?.success === false;
      const targetId = outcome.payload?.taskId || outcome.payload?.id || outcome.result?.taskId;
      if (isFailed && targetId) {
        queue.push({ nodeId: targetId, depth: 1 });
        visited.add(targetId);
      }
    }

    let maxDepth = 0;

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      if (depth > maxDepth) maxDepth = depth;

      const dependents = graph.getDependents(nodeId);

      for (const dep of dependents) {
        const depStatus = getProjectedStatus(dep.id);
        if (depStatus === "completed" || depStatus === "skipped" || depStatus === "blocked") continue;

        projectedStatusMap.set(dep.id, "blocked");

        operations.push({
          id: generateId("op"),
          type: "BlockNode",
          targetNodeId: dep.id,
          targetTitle: dep.title,
          details: `Blocked node "${dep.title}" due to upstream failure/blockage of dependency ${nodeId}.`,
          previousState: depStatus,
          newState: "blocked",
        });

        operations.push({
          id: generateId("op"),
          type: "MarkBlocked",
          targetNodeId: dep.id,
          targetTitle: dep.title,
          details: `Node "${dep.title}" marked blocked in execution topology.`,
          previousState: depStatus,
          newState: "blocked",
        });

        affectedNodeIds.push(dep.id);
        propagationLog.push(`Block -> [${dep.entityType}] "${dep.title}" (${dep.id})`);

        if (!visited.has(dep.id)) {
          visited.add(dep.id);
          queue.push({ nodeId: dep.id, depth: depth + 1 });
        }
      }
    }

    return { operations, affectedNodeIds, propagationLog, depth: maxDepth };
  }

  private detectDeadNodes(graph: ExecutionGraph, getProjectedStatus: (id: string) => string): string[] {
    const dead: string[] = [];
    for (const node of graph.getAllNodes()) {
      const status = getProjectedStatus(node.id);
      if (status === "completed" || status === "skipped") continue;
      const deps = graph.getDependencies(node.id);
      if (deps.some((d) => getProjectedStatus(d.id) === "failed" || getProjectedStatus(d.id) === "cancelled")) {
        dead.push(node.id);
      }
    }
    return dead;
  }

  private detectOrphanNodes(graph: ExecutionGraph, getProjectedStatus: (id: string) => string): string[] {
    const orphans: string[] = [];
    for (const node of graph.getAllNodes()) {
      const status = getProjectedStatus(node.id);
      if (status !== "pending") continue;
      const deps = graph.getDependencies(node.id);
      const dependents = graph.getDependents(node.id);
      const hasGoal = Boolean(node.metadata?.goalId);
      if (deps.length === 0 && dependents.length === 0 && !hasGoal) {
        orphans.push(node.id);
      }
    }
    return orphans;
  }

  private calculateStabilityScore(
    graph: ExecutionGraph,
    snapshot: ExecutionGraphSnapshot,
    deadCount: number,
    orphanCount: number,
    maxDepth: number,
    getProjectedStatus: (id: string) => string
  ): number {
    const totalNodes = snapshot.nodeCount || 1;
    const blockedNodesCount = graph.getAllNodes().filter((n) => getProjectedStatus(n.id) === "blocked").length;
    const blockedRatio = blockedNodesCount / totalNodes;
    const cycleCount = snapshot.cycleDiagnostics.length;

    let score = 100;
    score -= Math.round(blockedRatio * 30);
    score -= orphanCount * 3;
    score -= deadCount * 10;
    score -= cycleCount * 25;
    score -= Math.min(15, maxDepth * 3);

    return Math.max(0, Math.min(100, score));
  }

  private estimateRepairCost(opCount: number, maxDepth: number, affectedCount: number): "Low" | "Medium" | "High" {
    if (opCount > 10 || maxDepth > 3 || affectedCount > 8) return "High";
    if (opCount > 3 || maxDepth > 1 || affectedCount > 3) return "Medium";
    return "Low";
  }

  private resolveTriggerFromOutcomes(outcomes: ExecutionOutcome[]): RepairTrigger {
    if (!outcomes.length) return "TimeAdvance";
    const hasFailed = outcomes.some((o) => o.result?.success === false);
    if (hasFailed) return "TaskFailed";
    const hasCompleted = outcomes.some((o) => o.type === "TaskCompleted" || o.result?.success === true);
    if (hasCompleted) return "TaskCompleted";
    return "UserOverride";
  }
}
