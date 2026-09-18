import { ExecutionGraphSnapshot, ExecutionNode } from "../../kernel/ExecutionGraph";
import { KernelSnapshot } from "../../worldv2/KernelSnapshot";

export function createMockExecutionNode(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return {
    id: overrides.id || `node_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    entityType: overrides.entityType || "task",
    title: overrides.title || "Mock Task Title",
    status: overrides.status || "pending",
    priority: overrides.priority ?? 2,
    createdAt: overrides.createdAt || new Date("2026-09-14T08:00:00Z"),
    updatedAt: overrides.updatedAt || new Date("2026-09-14T08:00:00Z"),
    metadata: overrides.metadata || { dueDate: "2026-09-15" },
  };
}

export function createMockGraphSnapshot(overrides: Partial<ExecutionGraphSnapshot> = {}): ExecutionGraphSnapshot {
  const defaultNodes = [
    createMockExecutionNode({ id: "task_1", title: "Complete Thesis Chapter 1", status: "pending", priority: 3, metadata: { dueDate: "2026-09-15" } }),
    createMockExecutionNode({ id: "task_2", title: "Review Code PR #104", status: "pending", priority: 2, metadata: { dueDate: "2026-09-16" } }),
    createMockExecutionNode({ id: "task_3", title: "Buy Groceries", status: "completed", priority: 1, metadata: { dueDate: "2026-09-14" } }),
  ];

  return {
    graphVersion: overrides.graphVersion ?? 1,
    versionMetadata: overrides.versionMetadata || {
      version: 1,
      parentVersion: 0,
      repairId: "init",
      createdAt: Date.now(),
    },
    nodeCount: overrides.nodeCount ?? defaultNodes.length,
    edgeCount: overrides.edgeCount ?? 0,
    readyNodes: overrides.readyNodes || defaultNodes.filter((n) => n.status === "pending"),
    blockedNodes: overrides.blockedNodes || [],
    completedNodes: overrides.completedNodes || defaultNodes.filter((n) => n.status === "completed"),
    criticalPath: overrides.criticalPath || [defaultNodes[0]],
    executionPressure: overrides.executionPressure || [{ nodeId: "task_1", score: 75, contributingFactors: ["Urgent deadline"] }],
    cycleDiagnostics: overrides.cycleDiagnostics || [],
    parallelExecutionGroups: overrides.parallelExecutionGroups || [[defaultNodes[0], defaultNodes[1]]],
  };
}

export function createMockKernelSnapshot(overrides: Partial<KernelSnapshot> = {}): KernelSnapshot {
  return {
    metadata: {
      snapshotId: "mock_snap_001",
      userId: "test_user_001",
      generationTimestamp: Date.now(),
      schemaVersion: 2,
    },
    quality: {
      coverage: 1.0,
      completeness: 0.95,
      freshnessDays: 0,
      consistencyScore: 1.0,
      overallConfidence: 0.95,
      defects: { missingLogsCount: 0, hasSkippedDays: false, isStale: false, isSparse: false },
    },
    observations: [],
    executionGraphSummary: {
      nodeCount: 3,
      edgeCount: 1,
      readyCount: 2,
      blockedCount: 0,
      criticalPathLength: 1,
      stabilityScore: 92,
    },
    subsystems: {
      lifeState: {
        state: "Recovery",
        confidence: 0.88,
        explanation: "Elevated mental fatigue detected with recent short sleep duration.",
        evidence: ["Sleep deficit of 2.1 hours", "Overdue tasks count: 1"],
      },
      goalPressure: [
        {
          goalId: "goal_thesis",
          goalTitle: "Finish Master Thesis",
          pressureScore: 82,
          trend: "rising",
          factors: ["Chapter 1 pending", "Critical path active"],
          explanation: "High deadline proximity with critical path dependency.",
        },
      ],
      learning: {
        activeProfile: null,
        learnedPatterns: [],
        emittedSignals: [],
      },
      trends: [],
      predictions: [
        {
          id: "pred_1",
          type: "RecoveryRisk",
          probability: 0.75,
          predictionText: "High likelihood of cognitive fatigue if evening rest is skipped.",
          impact: "negative",
          timeHorizon: "short_term",
        },
      ],
    },
    diagnostics: {
      evaluationDurationMs: 12,
      subsystemsEvaluated: 5,
      defectsDetected: [],
      stabilityScore: 92,
    },
    ...overrides,
  } as KernelSnapshot;
}
