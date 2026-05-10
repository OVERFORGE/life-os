import { generateTaskChunks } from "./server/planner/chunking/generateTaskChunks";
import { analyzeScheduleDrift, RawExecutionData } from "./server/planner/replanning/analyzeScheduleDrift";
import { rebuildSchedule } from "./server/planner/replanning/rebuildSchedule";
import { generateCandidateSchedules } from "./server/planner/scheduling/generateCandidateSchedules";
import { normalizeTaskForScheduling } from "./server/planner/normalization/normalizeTaskForScheduling";
import { PlacementAnalysisContext, SchedulableTask, PlacementAnchorType } from "./server/planner/types/SchedulingTypes";
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

// ─── Shared Fixtures ─────────────────────────────────────────────────────────

const defaultContext: PlacementAnalysisContext = {
  availabilityWindows: [
    { window: createTemporalWindow(480, 720), daysOfWeek: [1], score: 0.9, confidence: 0.9 },  // 08:00–12:00
    { window: createTemporalWindow(780, 1020), daysOfWeek: [1], score: 0.8, confidence: 0.9 }, // 13:00–17:00
  ],
  recurringConstraints: [],
  recoveryWindows: [],
  peakFocusWindows: [
    { window: createTemporalWindow(540, 660), score: 1.0, confidence: 0.9 },  // 09:00–11:00
  ],
  sleepWindow: { window: createTemporalWindow(1380, 360), confidence: 0.9 },  // 23:00–06:00
  chronotype: { type: "morning", confidence: 0.8 },
  fragmentationScore: 0.2,
  dataReliabilityScore: 0.85,
};

function makeTask(
  id: string,
  durationMinutes: number,
  priority: number = 3,
  requiresDeepWork: boolean = false
): SchedulableTask {
  return normalizeTaskForScheduling({
    id,
    title: `Task ${id}`,
    priority,
    metadata: {
      estimatedDuration: durationMinutes,
      requiresDeepWork,
    },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

function testFragmentationLimits() {
  console.log("\n--- Testing Fragmentation Boundaries ---");
  
  // 1. Deep Work Protection
  const dwTask = makeTask("dw-1", 100, 3, true);
  const plan1 = generateTaskChunks(dwTask);
  
  assert("Deep Work task under 120m is NOT fragmented (preserves 60m minimum)", plan1.chunks.length === 1 && plan1.chunks[0].estimatedDurationMinutes === 100);

  // 2. Normal Fragmentation
  const normalTask = makeTask("norm-1", 100, 3, false);
  const plan2 = generateTaskChunks(normalTask);
  
  // 100 / 15 (fallback minimum) = 6.66 -> 6 chunks.
  assert("Normal task 100m is fragmented (minChunkSize=15 -> 6 chunks)", plan2.chunks.length === 6);

  // 3. Deterministic Chunk IDs
  assert("Chunk IDs are deterministic", plan2.chunks[0].id === "norm-1:chunk:0" && plan2.chunks[1].id === "norm-1:chunk:1");

  // 4. Graph Topology
  assert("Dependency Graph matches chunks length - 1", plan2.dependencyGraph.size === 6);
  assert("Reverse Graph captures parent relationship", plan2.reverseDependencyGraph.get("norm-1:chunk:1")![0] === "norm-1:chunk:0");
}

function testScheduleDriftAnalysis() {
  console.log("\n--- Testing Schedule Drift Analysis ---");

  const rawData: RawExecutionData[] = [
    {
       taskId: "t-1",
       plannedDuration: 60,
       completedDuration: 60,
       remainingDuration: 30, // underestimated by 30 min
       interruptionCount: 1
    },
    {
       taskId: "t-2",
       plannedDuration: 60,
       completedDuration: 30,
       remainingDuration: 0, // overestimated by 30 min
       interruptionCount: 5  // excessive interruptions
    }
  ];

  const analyzed = analyzeScheduleDrift(rawData);
  
  assert("Underestimation Bias computed correctly", analyzed[0].underestimationBias === 1.5);
  assert("Overestimation Bias computed correctly", analyzed[1].overestimationBias === 2.0);
  assert("Focus Instability Score rises with excessive interruptions", analyzed[1].focusInstabilityScore > 0.9);
}

function testTopologicalOrchestration() {
  console.log("\n--- Testing Topological Chunk Orchestration ---");
  
  const longTask = makeTask("long-1", 120, 3, false); // Target 120m -> 8 chunks of 15m
  const plan = generateTaskChunks(longTask);
  
  const context = {
    ...defaultContext,
    dependencyGraph: plan.dependencyGraph,
    reverseDependencyGraph: plan.reverseDependencyGraph
  };

  const schedules = generateCandidateSchedules(plan.chunks, context);
  const best = schedules[0];

  assert("Schedules generated successfully", schedules.length > 0);
  assert("All chunks placed", best.scheduledPlacements.length === 8);

  // Verify sequential start times
  const sp0 = best.scheduledPlacements.find(sp => sp.task.id === "long-1:chunk:0")!;
  const sp1 = best.scheduledPlacements.find(sp => sp.task.id === "long-1:chunk:1")!;

  assert("Chunk 0 starts before Chunk 1 ends", sp0.placement.temporalWindow.startMinute < sp1.placement.temporalWindow.endMinute);
}

function testReplanningPreservesAnchors() {
  console.log("\n--- Testing Replanning Anchor Preservation ---");

  // Create an initial schedule
  const taskA = makeTask("task-A", 60, 3, false);
  const taskB = makeTask("task-B", 60, 3, false);
  
  const initialSchedules = generateCandidateSchedules([taskA, taskB], defaultContext);
  const initialSchedule = initialSchedules[0];

  // Force rebuilding with taskA as 'fixed'
  const anchors = new Map<string, PlacementAnchorType>();
  anchors.set("task-A", "fixed");

  // Rebuild
  const result = rebuildSchedule(
    initialSchedule,
    [], // execution states empty for this test
    [taskA, taskB],
    defaultContext,
    anchors
  );

  const prevTaskA = initialSchedule.scheduledPlacements.find(sp => sp.task.id === "task-A")!;
  const newTaskA = result.schedule.scheduledPlacements.find(sp => sp.task.id === "task-A")!;

  if (!prevTaskA || !newTaskA) {
     console.error("Missing taskA in schedules!", !!prevTaskA, !!newTaskA);
  } else {
     console.log("Prev:", prevTaskA.placement.temporalWindow);
     console.log("New:", newTaskA.placement.temporalWindow);
  }

  assert("Fixed anchor preserves exact placement", 
    prevTaskA?.placement.temporalWindow.startMinute === newTaskA?.placement.temporalWindow.startMinute &&
    prevTaskA?.placement.temporalWindow.endMinute === newTaskA?.placement.temporalWindow.endMinute
  );

  assert("Lineage generation is tracked", newTaskA?.placement.repairGeneration === 1);
  assert("Delta preserved ratio is high", result.delta.preservedPlacementRatio >= 0.5);
}

// ─── Runner ──────────────────────────────────────────────────────────────────

function runAll() {
  testFragmentationLimits();
  testScheduleDriftAnalysis();
  testTopologicalOrchestration();
  testReplanningPreservesAnchors();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll();
