import { Task } from "@/server/db/models/Task";
import { GoalProposal } from "@/server/db/models/GoalProposal";
import { GraphVersion, createGraphVersion } from "./GraphVersion";

// ──────────────────────────────────────────────
// Graph Types & Interfaces
// ──────────────────────────────────────────────

export type DependencyType = "requires" | "blocks" | "parent" | "child" | "related";

export interface ExecutionNode {
  id: string;
  entityType: "task" | "goal" | "project" | "habit" | "workflow" | string;
  title: string;
  status: "pending" | "completed" | "in_progress" | "blocked" | "skipped" | string;
  priority: number; // 1 = low, 2 = medium, 3 = high, 4 = urgent
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface ExecutionEdge {
  fromNode: string; // node that has the dependency
  toNode: string;   // target node depended upon
  dependencyType: DependencyType;
}

export interface ExecutionPressure {
  nodeId: string;
  score: number;
  contributingFactors: string[];
}

export interface BlockedNodeInfo {
  node: ExecutionNode;
  blockingNodeIds: string[];
  reason: string;
}

export interface ExecutionGraphSnapshot {
  graphVersion: number;
  versionMetadata: GraphVersion; // Phase 9.6 Metadata
  nodeCount: number;
  edgeCount: number;
  readyNodes: ExecutionNode[];
  blockedNodes: BlockedNodeInfo[];
  completedNodes: ExecutionNode[];
  criticalPath: ExecutionNode[];
  executionPressure: ExecutionPressure[];
  cycleDiagnostics: string[];
  parallelExecutionGroups: ExecutionNode[][];
}

// ──────────────────────────────────────────────
// ExecutionGraph Subsystem
// ──────────────────────────────────────────────

/**
 * ExecutionGraph
 * 
 * SOLE OWNER of execution topology.
 * Models directed dependency graphs across tasks, goals, habits, and workflows.
 */
export class ExecutionGraph {
  private versionInfo: GraphVersion = createGraphVersion(1, 0, "root", Date.now());
  private nodes: Map<string, ExecutionNode> = new Map();
  private edges: ExecutionEdge[] = [];
  private outgoing: Map<string, ExecutionEdge[]> = new Map();
  private incoming: Map<string, ExecutionEdge[]> = new Map();

  getGraphVersion(): number {
    return this.versionInfo.version;
  }

  getVersionMetadata(): GraphVersion {
    return { ...this.versionInfo };
  }

  setVersionMetadata(v: GraphVersion): void {
    this.versionInfo = { ...v };
  }

  incrementVersion(repairId: string = "system", timestamp: number = Date.now()): GraphVersion {
    const parentVersion = this.versionInfo.version;
    const nextVersion = parentVersion + 1;
    this.versionInfo = createGraphVersion(nextVersion, parentVersion, repairId, timestamp);
    return this.versionInfo;
  }

  /** Deep clone of the graph for atomic transaction isolation */
  clone(): ExecutionGraph {
    const copy = new ExecutionGraph();
    copy.versionInfo = { ...this.versionInfo };

    for (const node of this.nodes.values()) {
      copy.addNode({
        ...node,
        createdAt: new Date(node.createdAt),
        updatedAt: new Date(node.updatedAt),
        metadata: node.metadata ? { ...node.metadata } : undefined,
      });
    }

    for (const edge of this.edges) {
      copy.addEdge(edge.fromNode, edge.toNode, edge.dependencyType);
    }

    return copy;
  }

  static async buildFromDatabase(userId: string): Promise<ExecutionGraph> {
    const graph = new ExecutionGraph();

    try {
      // 1. Fetch all user tasks
      const tasks = await Task.find({ userId }).lean();
      for (const t of tasks as any[]) {
        const priorityNum =
          t.priority === "high" ? 3 : t.priority === "medium" ? 2 : 1;

        graph.addNode({
          id: t._id.toString(),
          entityType: "task",
          title: t.title || "Untitled Task",
          status: t.status || "pending",
          priority: priorityNum,
          createdAt: new Date(t.createdAt || Date.now()),
          updatedAt: new Date(t.updatedAt || Date.now()),
          metadata: {
            dueDate: t.dueDate,
            goalId: t.goalId ? t.goalId.toString() : null,
          },
        });
      }

      // Add task parent/child dependency edges
      for (const t of tasks as any[]) {
        const taskId = t._id.toString();

        if (t.parentTaskId) {
          const parentId = t.parentTaskId.toString();
          if (graph.getNode(parentId)) {
            graph.addEdge(taskId, parentId, "child");
            graph.addEdge(parentId, taskId, "parent");
          }
        }

        if (t.goalId) {
          const goalIdStr = t.goalId.toString();
          if (graph.getNode(goalIdStr)) {
            graph.addEdge(taskId, goalIdStr, "child");
          }
        }
      }

      // 2. Fetch all user goals
      const goals = await GoalProposal.find({ userId }).lean();
      for (const g of goals as any[]) {
        graph.addNode({
          id: g._id.toString(),
          entityType: "goal",
          title: g.title || "Untitled Goal",
          status: g.status === "accepted" ? "in_progress" : g.status || "pending",
          priority: 3,
          createdAt: new Date(g.createdAt || Date.now()),
          updatedAt: new Date(g.updatedAt || Date.now()),
        });
      }
    } catch (err) {
      console.error("Error constructing ExecutionGraph from database:", err);
    }

    return graph;
  }

  // ── Node & Edge Management ───────────────────────────────────────

  addNode(node: ExecutionNode): void {
    this.nodes.set(node.id, node);
    if (!this.outgoing.has(node.id)) this.outgoing.set(node.id, []);
    if (!this.incoming.has(node.id)) this.incoming.set(node.id, []);
  }

  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    this.outgoing.delete(nodeId);
    this.incoming.delete(nodeId);
    this.edges = this.edges.filter((e) => e.fromNode !== nodeId && e.toNode !== nodeId);
  }

  addEdge(fromNode: string, toNode: string, dependencyType: DependencyType): void {
    if (!this.nodes.has(fromNode) || !this.nodes.has(toNode)) return;

    const exists = this.edges.some(
      (e) => e.fromNode === fromNode && e.toNode === toNode && e.dependencyType === dependencyType
    );
    if (exists) return;

    const edge: ExecutionEdge = { fromNode, toNode, dependencyType };
    this.edges.push(edge);

    this.outgoing.get(fromNode)?.push(edge);
    this.incoming.get(toNode)?.push(edge);
  }

  removeEdge(fromNode: string, toNode: string): void {
    this.edges = this.edges.filter((e) => !(e.fromNode === fromNode && e.toNode === toNode));
    if (this.outgoing.has(fromNode)) {
      this.outgoing.set(
        fromNode,
        (this.outgoing.get(fromNode) || []).filter((e) => e.toNode !== toNode)
      );
    }
    if (this.incoming.has(toNode)) {
      this.incoming.set(
        toNode,
        (this.incoming.get(toNode) || []).filter((e) => e.fromNode !== fromNode)
      );
    }
  }

  getNode(nodeId: string): ExecutionNode | undefined {
    return this.nodes.get(nodeId);
  }

  getAllNodes(): ExecutionNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): ExecutionEdge[] {
    return [...this.edges];
  }

  getDependencies(nodeId: string): ExecutionNode[] {
    const edges = this.outgoing.get(nodeId) || [];
    return edges
      .filter((e) => e.dependencyType === "requires" || e.dependencyType === "parent")
      .map((e) => this.nodes.get(e.toNode))
      .filter((n): n is ExecutionNode => Boolean(n));
  }

  getDependents(nodeId: string): ExecutionNode[] {
    const edges = this.incoming.get(nodeId) || [];
    return edges
      .filter((e) => e.dependencyType === "requires" || e.dependencyType === "child" || e.dependencyType === "blocks")
      .map((e) => this.nodes.get(e.fromNode))
      .filter((n): n is ExecutionNode => Boolean(n));
  }

  // ── Deterministic Graph Analysis ─────────────────────────────────

  getBlockedNodes(): BlockedNodeInfo[] {
    const blocked: BlockedNodeInfo[] = [];

    for (const node of this.nodes.values()) {
      if (node.status === "completed" || node.status === "skipped") continue;

      const outgoingEdges = this.outgoing.get(node.id) || [];
      const blockingNodeIds: string[] = [];

      for (const edge of outgoingEdges) {
        if (edge.dependencyType === "requires" || edge.dependencyType === "parent") {
          const target = this.nodes.get(edge.toNode);
          if (target && target.status !== "completed" && target.status !== "skipped") {
            blockingNodeIds.push(target.id);
          }
        }
      }

      const incomingEdges = this.incoming.get(node.id) || [];
      for (const edge of incomingEdges) {
        if (edge.dependencyType === "blocks") {
          const blocker = this.nodes.get(edge.fromNode);
          if (blocker && blocker.status !== "completed" && blocker.status !== "skipped") {
            blockingNodeIds.push(blocker.id);
          }
        }
      }

      if (blockingNodeIds.length > 0) {
        const blockingTitles = blockingNodeIds
          .map((id) => this.nodes.get(id)?.title)
          .filter(Boolean)
          .join(", ");

        blocked.push({
          node,
          blockingNodeIds,
          reason: `Blocked by incomplete dependency: [${blockingTitles}]`,
        });
      }
    }

    return blocked;
  }

  getReadyNodes(): ExecutionNode[] {
    const blockedIds = new Set(this.getBlockedNodes().map((b) => b.node.id));

    return Array.from(this.nodes.values()).filter(
      (node) =>
        node.status !== "completed" &&
        node.status !== "skipped" &&
        !blockedIds.has(node.id)
    );
  }

  getRootNodes(): ExecutionNode[] {
    return Array.from(this.nodes.values()).filter((n) => {
      const inc = this.incoming.get(n.id) || [];
      return inc.length === 0;
    });
  }

  getLeafNodes(): ExecutionNode[] {
    return Array.from(this.nodes.values()).filter((n) => {
      const out = this.outgoing.get(n.id) || [];
      return out.length === 0;
    });
  }

  detectCycles(): string[] {
    const diagnostics: string[] = [];
    const inDegree = new Map<string, number>();

    for (const [id] of this.nodes) {
      inDegree.set(id, 0);
    }

    for (const edge of this.edges) {
      if (edge.dependencyType === "requires" || edge.dependencyType === "parent") {
        inDegree.set(edge.fromNode, (inDegree.get(edge.fromNode) || 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    let processedCount = 0;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      processedCount++;

      const edges = this.outgoing.get(curr) || [];
      for (const e of edges) {
        if (e.dependencyType === "requires" || e.dependencyType === "parent") {
          const targetDeg = (inDegree.get(e.toNode) || 1) - 1;
          inDegree.set(e.toNode, targetDeg);
          if (targetDeg === 0) queue.push(e.toNode);
        }
      }
    }

    if (processedCount < this.nodes.size) {
      const cyclicNodes = Array.from(inDegree.entries())
        .filter(([, deg]) => deg > 0)
        .map(([id]) => this.nodes.get(id)?.title || id);

      diagnostics.push(`Dependency cycle detected involving nodes: [${cyclicNodes.join(", ")}]`);
    }

    return diagnostics;
  }

  getCriticalPath(): ExecutionNode[] {
    const incompleteNodes = Array.from(this.nodes.values()).filter(
      (n) => n.status !== "completed" && n.status !== "skipped"
    );
    if (!incompleteNodes.length) return [];

    const memo = new Map<string, ExecutionNode[]>();

    const getLongestPathFrom = (nodeId: string): ExecutionNode[] => {
      if (memo.has(nodeId)) return memo.get(nodeId)!;

      const node = this.nodes.get(nodeId);
      if (!node || node.status === "completed" || node.status === "skipped") {
        return [];
      }

      const dependents = this.getDependents(nodeId);
      let longestSubPath: ExecutionNode[] = [];

      for (const dep of dependents) {
        const subPath = getLongestPathFrom(dep.id);
        if (subPath.length > longestSubPath.length) {
          longestSubPath = subPath;
        }
      }

      const path = [node, ...longestSubPath];
      memo.set(nodeId, path);
      return path;
    };

    let longestPath: ExecutionNode[] = [];
    for (const node of incompleteNodes) {
      const path = getLongestPathFrom(node.id);
      if (path.length > longestPath.length) {
        longestPath = path;
      }
    }

    return longestPath;
  }

  calculateExecutionPressure(): ExecutionPressure[] {
    const pressures: ExecutionPressure[] = [];

    for (const node of this.nodes.values()) {
      if (node.status === "completed" || node.status === "skipped") continue;

      const dependents = this.getDependents(node.id);
      const downstreamCount = dependents.length;
      const depth = this.getDependencyDepth(node.id);
      const blockedDescendants = dependents.filter(
        (d) => d.status === "blocked" || this.isNodeBlocked(d.id)
      ).length;

      const factors: string[] = [];
      let score = node.priority * 10;
      factors.push(`Base Priority (${node.priority}x10 = ${node.priority * 10})`);

      if (downstreamCount > 0) {
        score += downstreamCount * 15;
        factors.push(`Downstream Dependents (${downstreamCount}x15 = ${downstreamCount * 15})`);
      }

      if (depth > 0) {
        score += depth * 5;
        factors.push(`Dependency Depth (${depth}x5 = ${depth * 5})`);
      }

      if (blockedDescendants > 0) {
        score += blockedDescendants * 20;
        factors.push(`Blocked Descendants (${blockedDescendants}x20 = ${blockedDescendants * 20})`);
      }

      pressures.push({
        nodeId: node.id,
        score,
        contributingFactors: factors,
      });
    }

    return pressures.sort((a, b) => b.score - a.score);
  }

  getParallelExecutionGroups(): ExecutionNode[][] {
    const groups: ExecutionNode[][] = [];
    const remainingNodes = new Set(
      Array.from(this.nodes.values())
        .filter((n) => n.status !== "completed" && n.status !== "skipped")
        .map((n) => n.id)
    );

    const completedIds = new Set(
      Array.from(this.nodes.values())
        .filter((n) => n.status === "completed" || n.status === "skipped")
        .map((n) => n.id)
    );

    while (remainingNodes.size > 0) {
      const currentGroup: ExecutionNode[] = [];

      for (const id of Array.from(remainingNodes)) {
        const deps = this.getDependencies(id);
        const allDepsSatisfied = deps.every((d) => completedIds.has(d.id));

        if (allDepsSatisfied) {
          const node = this.nodes.get(id);
          if (node) currentGroup.push(node);
        }
      }

      if (currentGroup.length === 0) {
        const leftover = Array.from(remainingNodes)
          .map((id) => this.nodes.get(id)!)
          .filter(Boolean);
        groups.push(leftover);
        break;
      }

      groups.push(currentGroup);
      for (const node of currentGroup) {
        remainingNodes.delete(node.id);
        completedIds.add(node.id);
      }
    }

    return groups;
  }

  createSnapshot(): ExecutionGraphSnapshot {
    const allNodes = Array.from(this.nodes.values());
    const readyNodes = this.getReadyNodes();
    const blockedNodes = this.getBlockedNodes();
    const completedNodes = allNodes.filter(
      (n) => n.status === "completed" || n.status === "skipped"
    );
    const criticalPath = this.getCriticalPath();
    const executionPressure = this.calculateExecutionPressure();
    const cycleDiagnostics = this.detectCycles();
    const parallelExecutionGroups = this.getParallelExecutionGroups();

    return {
      graphVersion: this.versionInfo.version,
      versionMetadata: { ...this.versionInfo },
      nodeCount: allNodes.length,
      edgeCount: this.edges.length,
      readyNodes,
      blockedNodes,
      completedNodes,
      criticalPath,
      executionPressure,
      cycleDiagnostics,
      parallelExecutionGroups,
    };
  }

  private getDependencyDepth(nodeId: string): number {
    const deps = this.getDependencies(nodeId);
    if (!deps.length) return 0;
    return 1 + Math.max(...deps.map((d) => this.getDependencyDepth(d.id)));
  }

  private isNodeBlocked(nodeId: string): boolean {
    const deps = this.getDependencies(nodeId);
    return deps.some((d) => d.status !== "completed" && d.status !== "skipped");
  }
}
