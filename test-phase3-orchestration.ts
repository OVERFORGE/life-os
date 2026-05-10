import { generateIncrementalRepairPlan } from "./server/planner/replanning/generateIncrementalRepairPlan";
import { propagateTemporalConstraints } from "./server/planner/validation/propagateTemporalConstraints";
import { optimizeScheduleTopology } from "./server/planner/chunking/optimizeScheduleTopology";
import { CandidateSchedule, PlacementAnalysisContext, SchedulableUnit, PlacementAnchorType } from "./server/planner/types/SchedulingTypes";
import { ChunkedTaskPlan, TaskChunk } from "./server/planner/types/ChunkGraphTypes";
import { RepairTrigger, MAX_PROPAGATION_DEPTH, MAX_CHUNK_PROLIFERATION } from "./server/planner/types/IncrementalRepairTypes";
import { TaskExecutionState } from "./server/planner/replanning/analyzeScheduleDrift";
import { createTemporalWindow } from "./server/planner/utils/TemporalWindow";

// ─── Assertion Utilities ──────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}`);
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

const mockContext: PlacementAnalysisContext = {
  availabilityWindows: [
    { window: createTemporalWindow(480, 720), daysOfWeek: [1], score: 1.0, confidence: 1.0 }, // 08:00 - 12:00
    { window: createTemporalWindow(780, 1020), daysOfWeek: [1], score: 1.0, confidence: 1.0 } // 13:00 - 17:00
  ],
  peakFocusWindows: [{ window: createTemporalWindow(480, 600), score: 0.9, confidence: 0.9 }],
  recoveryWindows: [],
  recurringConstraints: [],
  sleepWindow: null,
  chronotype: null,
  fragmentationScore: 0,
  dataReliabilityScore: 1.0
};

// 3 sequential chunks: A -> B -> C
const unitA: SchedulableUnit = {
  id: "task-A", originalTaskId: "task-root", estimatedDurationMinutes: 60,
  requiresDeepWork: false, priorityScore: 3, energyRequirement: 0.5, hardConstraints: [], softConstraints: []
};
const unitB: SchedulableUnit = {
  id: "task-B", originalTaskId: "task-root", estimatedDurationMinutes: 60,
  requiresDeepWork: false, priorityScore: 3, energyRequirement: 0.5, hardConstraints: [], softConstraints: []
};
const unitC: SchedulableUnit = {
  id: "task-C", originalTaskId: "task-root", estimatedDurationMinutes: 60,
  requiresDeepWork: false, priorityScore: 3, energyRequirement: 0.5, hardConstraints: [], softConstraints: []
};

const depGraph = new Map([
  ["task-A", ["task-B"]],
  ["task-B", ["task-C"]],
  ["task-C", []]
]);

const reverseDepGraph = new Map([
  ["task-A", []],
  ["task-B", ["task-A"]],
  ["task-C", ["task-B"]]
]);

const contextWithGraph = { ...mockContext, dependencyGraph: depGraph, reverseDependencyGraph: reverseDepGraph };

const initialSchedule: CandidateSchedule = {
  id: "s1",
  scheduledPlacements: [
    {
      task: unitA,
      placement: {
        temporalWindow: createTemporalWindow(480, 540),
        dayOfWeek: 1, placementScore: 0.9, confidence: 0.9, stabilityScore: 0.9,
        penaltiesApplied: [], boostsApplied: [], blockingReasons: [], reasoning: [],
        metadata: { fragmentationRisk: 0, preferenceRatio: 0 }
      }
    },
    {
      task: unitB,
      placement: {
        temporalWindow: createTemporalWindow(540, 600),
        dayOfWeek: 1, placementScore: 0.9, confidence: 0.9, stabilityScore: 0.9,
        penaltiesApplied: [], boostsApplied: [], blockingReasons: [], reasoning: [],
        metadata: { fragmentationRisk: 0, preferenceRatio: 0 }
      }
    },
    {
      task: unitC,
      placement: {
        temporalWindow: createTemporalWindow(600, 660),
        dayOfWeek: 1, placementScore: 0.9, confidence: 0.9, stabilityScore: 0.9,
        penaltiesApplied: [], boostsApplied: [], blockingReasons: [], reasoning: [],
        metadata: { fragmentationRisk: 0, preferenceRatio: 0 }
      }
    }
  ],
  unscheduledTaskIds: [],
  conflicts: [],
  overallScore: 0.9,
  overallConfidence: 0.9,
  overallStability: 0.9,
  metadata: { generationReasoning: [], computationalCostMs: 0 }
};

// ─── Test 1: Incremental Repair ─────────────────────────────────────────────
console.log("\n--- Testing Incremental Repair (Phase 3A) ---");

const trigger: RepairTrigger = {
  triggerId: "t1",
  type: "chunk_overran",
  sourceChunkId: "task-A",
  anomalyMagnitudeMinutes: 30,
  reasoning: "Task A overran by 30 mins"
};

const repairResult = generateIncrementalRepairPlan(
  initialSchedule, trigger, [unitA, unitB, unitC], contextWithGraph, new Map()
);

assert("Repair creates plan and schedule", !!repairResult.plan && !!repairResult.schedule);
assert("Repair identifies affected topological chunks", repairResult.plan.affectedChunkIds.includes("task-B") && repairResult.plan.affectedChunkIds.includes("task-C"));
assert("Operations are emitted (move/defer)", repairResult.plan.operations.length > 0);

const placementB = repairResult.schedule.scheduledPlacements.find(sp => sp.task.id === "task-B");
const placementC = repairResult.schedule.scheduledPlacements.find(sp => sp.task.id === "task-C");

// Task-A is frozen at 480-540 (original slot). After overrun, B and C are repaired — 
// they must come AFTER the frozen A window ends (540), i.e. startMinute >= 540
console.log("  [debug] Chunk B actual start:", placementB?.placement.temporalWindow.startMinute);
assert("Chunk B is rescheduled after frozen A ends", (placementB?.placement.temporalWindow.startMinute ?? 0) >= 540);
// C must come after B regardless of where B lands
const bEnd = placementB?.placement.temporalWindow.endMinute ?? 0;
assert("Chunk C is rescheduled after repaired B ends", (placementC?.placement.temporalWindow.startMinute ?? 0) >= bEnd);

// Test freezing anchor preservation
const unitD: SchedulableUnit = {
  id: "task-D", originalTaskId: "task-D", estimatedDurationMinutes: 60,
  requiresDeepWork: false, priorityScore: 3, energyRequirement: 0.5, hardConstraints: [], softConstraints: []
};

const initialScheduleWithD = {
  ...initialSchedule,
  scheduledPlacements: [
    ...initialSchedule.scheduledPlacements,
    {
      task: unitD,
      placement: {
        temporalWindow: createTemporalWindow(660, 720),
        dayOfWeek: 1, placementScore: 0.9, confidence: 0.9, stabilityScore: 0.9,
        penaltiesApplied: [], boostsApplied: [], blockingReasons: [], reasoning: [],
        metadata: { fragmentationRisk: 0, preferenceRatio: 0 }
      }
    }
  ]
};

const repairResultWithAnchor = generateIncrementalRepairPlan(
  initialScheduleWithD, trigger, [unitA, unitB, unitC, unitD], contextWithGraph, new Map([["task-D", "fixed"]])
);

assert("Anchor D is perfectly preserved outside blast radius", repairResultWithAnchor.plan.preservedPlacements.includes("task-D"));
const placementD = repairResultWithAnchor.schedule.scheduledPlacements.find(sp => sp.task.id === "task-D");
assert("Anchor D keeps exact time", placementD?.placement.temporalWindow.startMinute === 660);

// ─── Test 2: Constraint Propagation ─────────────────────────────────────────
console.log("\n--- Testing Constraint Propagation (Phase 3B) ---");

const unitADeadline: SchedulableUnit = {
  ...unitA, hardDeadline: 560 // Completes at 540 in schedule, very tight buffer
};

const dlSchedule = {
  ...initialSchedule,
  scheduledPlacements: [
    { ...initialSchedule.scheduledPlacements[0], task: unitADeadline },
    initialSchedule.scheduledPlacements[1],
    initialSchedule.scheduledPlacements[2]
  ]
};

const propResult = propagateTemporalConstraints(dlSchedule, [unitADeadline, unitB, unitC], contextWithGraph);

const deadlineSignal = propResult.propagatedSignals.find(s => s.type === "deadline_pressure");
assert("Deadline pressure is detected", !!deadlineSignal);
assert("Pressure score reflects tightness", deadlineSignal!.pressureScore > 0.5);

// Test focus overload
const dwSchedule = {
  ...initialSchedule,
  scheduledPlacements: [
    { ...initialSchedule.scheduledPlacements[0], task: { ...unitA, requiresDeepWork: true } },
    { ...initialSchedule.scheduledPlacements[1], task: { ...unitB, requiresDeepWork: true } },
    { ...initialSchedule.scheduledPlacements[2], task: { ...unitC, requiresDeepWork: true } },
    {
      task: { ...unitD, requiresDeepWork: true, id: "task-E", originalTaskId: "task-root" },
      placement: {
        temporalWindow: createTemporalWindow(660, 720), // Adds up to 240m continuous
        dayOfWeek: 1, placementScore: 0.9, confidence: 0.9, stabilityScore: 0.9,
        penaltiesApplied: [], boostsApplied: [], blockingReasons: [], reasoning: [], metadata: { fragmentationRisk: 0, preferenceRatio: 0 }
      }
    }
  ]
};
const depGraphDeep = new Map([
  ["task-A", ["task-B"]], ["task-B", ["task-C"]], ["task-C", ["task-E"]], ["task-E", []]
]);
const contextDeep = { ...mockContext, dependencyGraph: depGraphDeep };

const dwPropResult = propagateTemporalConstraints(dwSchedule, [
  { ...unitA, requiresDeepWork: true }, { ...unitB, requiresDeepWork: true }, 
  { ...unitC, requiresDeepWork: true }, { ...unitD, requiresDeepWork: true, id: "task-E" }
], contextDeep);

const focusSignal = dwPropResult.propagatedSignals.find(s => s.type === "focus_overload");
console.log("  [debug] Focus signals:", dwPropResult.propagatedSignals.map(s => s.type));
assert("Focus overload is detected across deep work chain", !!focusSignal);
assert("Propagation depth identifies downstream chunks", (focusSignal?.propagationDepth ?? 0) > 0);
assert("Global failure probability rises with risks", dwPropResult.stabilityRiskScore > 0);

// ─── Test 3: Topology Optimization ─────────────────────────────────────────
console.log("\n--- Testing Topology Optimization (Phase 3C) ---");

const chunkPlan: ChunkedTaskPlan = {
  taskId: "root-1",
  originalDurationMinutes: 120,
  chunks: [
    { id: "root-1:chunk:0", taskId: "root-1", chunkIndex: 0, estimatedDurationMinutes: 60, minimumChunkSize: 15, isTerminalChunk: false, chunkStatus: "pending" },
    { id: "root-1:chunk:1", taskId: "root-1", chunkIndex: 1, estimatedDurationMinutes: 60, minimumChunkSize: 15, isTerminalChunk: true, chunkStatus: "pending" }
  ],
  dependencies: [], dependencyGraph: new Map(), reverseDependencyGraph: new Map()
};

// Case 1: Unstable, Shrink
const unstableState: TaskExecutionState = {
  taskId: "root-1",
  totalDurationLoggedMinutes: 0, actualChunksCompleted: 0,
  focusInstabilityScore: 0.8, underestimationBias: 1.5,
  cognitiveOverheadRatio: 0.1, averageChunkCompletionTime: 0,
  lastInteractionTimestamp: 0
};

const optShrink = optimizeScheduleTopology(chunkPlan, [unstableState], { isAsyncMaintenance: false });
assert("Topology restructured due to instability", optShrink.isRestructured);
assert("Chunks shrank in size (more chunks generated)", optShrink.optimizedPlan.chunks.length > 2);
assert("Chunk sizes are smaller than original 60m", optShrink.optimizedPlan.chunks[0].estimatedDurationMinutes < 60);

// Case 2: Stable Deep Work, Expand
const chunkPlanDW = {
  ...chunkPlan,
  chunks: chunkPlan.chunks.map(c => ({ ...c, requiresDeepWork: true, estimatedDurationMinutes: 30 })) // 4 chunks of 30m originally (assume remainder)
};

const stableState: TaskExecutionState = {
  taskId: "root-1", totalDurationLoggedMinutes: 0, actualChunksCompleted: 0,
  focusInstabilityScore: 0.1, underestimationBias: 1.0, cognitiveOverheadRatio: 0, averageChunkCompletionTime: 0, lastInteractionTimestamp: 0
};

// Pass remaining as 120m via 4 chunks of 30m
chunkPlanDW.chunks = [0,1,2,3].map(i => ({
  id: `root-1:chunk:${i}`, taskId: "root-1", chunkIndex: i, estimatedDurationMinutes: 30, minimumChunkSize: 15, requiresDeepWork: true, isTerminalChunk: i===3, chunkStatus: "pending"
}));

const optExpand = optimizeScheduleTopology(chunkPlanDW, [stableState], { isAsyncMaintenance: false });
assert("Stable deep-work chunks expanded", optExpand.isRestructured);
assert("Chunk sizes expanded from 30m", optExpand.optimizedPlan.chunks[0].estimatedDurationMinutes > 30);
assert("Total chunks reduced for cognitive continuity", optExpand.optimizedPlan.chunks.length < 4);

// Case 3: MAX_CHUNK_PROLIFERATION bounds fragmentation
const hugePlan: ChunkedTaskPlan = {
  taskId: "root-huge", originalDurationMinutes: 360, // 6 hours
  chunks: [{ id: "c1", taskId: "root-huge", chunkIndex: 0, estimatedDurationMinutes: 360, minimumChunkSize: 15, isTerminalChunk: true, chunkStatus: "pending" }],
  dependencies: [], dependencyGraph: new Map(), reverseDependencyGraph: new Map()
};

const shrinkHugeState: TaskExecutionState = {
  ...unstableState, taskId: "root-huge"
};

const optProlif = optimizeScheduleTopology(hugePlan, [shrinkHugeState], { isAsyncMaintenance: false });
assert("Chunk proliferation is capped below absolute limits", optProlif.optimizedPlan.chunks.length <= MAX_CHUNK_PROLIFERATION);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
