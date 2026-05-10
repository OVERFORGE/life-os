import { validateAcyclicGraph } from "./server/planner/validation/validateAcyclicGraph";
import { propagateTemporalConstraints } from "./server/planner/validation/propagateTemporalConstraints";
import { CandidateSchedule, PlacementAnalysisContext, SchedulableUnit } from "./server/planner/types/SchedulingTypes";

// Simple test runner helper
const suites: (() => void)[] = [];
function test(name: string, fn: () => void) {
  suites.push(() => {
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
    } catch (e: any) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(e);
      process.exit(1);
    }
  });
}
function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ─── DAG Safety Tests ────────────────────────────────────────────────────────

test("DAG Validation: Accepts valid acyclic graph", () => {
  const graph = new Map<string, string[]>();
  graph.set("A", ["B", "C"]);
  graph.set("B", ["D"]);
  graph.set("C", ["D"]);
  graph.set("D", []);

  const result = validateAcyclicGraph(graph);
  assert(result.valid === true, "Valid graph should be accepted.");
});

test("DAG Validation: Rejects directed cycle and returns path", () => {
  const graph = new Map<string, string[]>();
  graph.set("A", ["B"]);
  graph.set("B", ["C"]);
  graph.set("C", ["A"]); // Cycle: A -> B -> C -> A

  const result = validateAcyclicGraph(graph);
  assert(result.valid === false, "Graph with cycle should be rejected.");
  assert(result.cyclePath !== undefined, "Should return cycle path");
  assert(result.cyclePath!.join(" -> ") === "A -> B -> C -> A", `Expected A -> B -> C -> A, got ${result.cyclePath?.join(" -> ")}`);
});

test("DAG Validation: Directed edges do not trigger false positive on undirected 'cycle'", () => {
  // A -> B -> D
  // A -> C -> D
  // This is a diamond, not a cycle in a directed graph.
  const graph = new Map<string, string[]>();
  graph.set("A", ["B", "C"]);
  graph.set("B", ["D"]);
  graph.set("C", ["D"]);
  graph.set("D", []);

  const result = validateAcyclicGraph(graph);
  assert(result.valid === true, "Diamond DAG should be valid.");
});

// ─── Deterministic Replay Tests ─────────────────────────────────────────────

test("Propagation: Deterministic replay yields identical output", () => {
  const units: SchedulableUnit[] = [
    {
      id: "Task1", unitType: "task", estimatedDurationMinutes: 60, hardConstraints: [], softConstraints: [],
      priorityScore: 1, temporalFlexibility: 0, urgency: 1, requiresDeepWork: false, cognitiveLoad: 0.5, minimumChunkSize: 15,
      hardDeadline: new Date("2026-05-11T12:00:00Z").getTime() as any // Just a number for testing buffer
    }
  ];

  const schedule: CandidateSchedule = {
    scheduleId: "test",
    scheduledPlacements: [
      {
        task: { id: "Task1", unitType: "chunk", parentTaskId: "Task1", chunkIndex: 0, estimatedDurationMinutes: 60, isTerminalChunk: true, chunkStatus: "pending", hardConstraints: [], softConstraints: [], priorityScore: 1, temporalFlexibility: 0, urgency: 1, requiresDeepWork: false, cognitiveLoad: 0.5, minimumChunkSize: 15 },
        placement: {
          temporalWindow: { startMinute: 1000, endMinute: 1060, durationMinutes: 60 },
          placementScore: 1, confidence: 1, stabilityScore: 1, hardConstraintsSatisfied: true, reasoning: []
        }
      }
    ],
    unscheduledTaskIds: [],
    frozenConstraintSources: [],
    overallScore: 1,
    overallConfidence: 1,
    overallStability: 1,
    reasoning: []
  };

  const context: PlacementAnalysisContext = {
    dependencyGraph: new Map(),
    reverseDependencyGraph: new Map(),
    targetDayBounds: { startMinute: 0, endMinute: 1440, durationMinutes: 1440 }
  };

  const tick = 42;

  // Simulate deadlines so that pressure is triggered
  // If endMinute is 1060, deadline should be 1060 + 30 = 1090
  units[0].hardDeadline = 1090 as any; 

  const result1 = propagateTemporalConstraints(schedule, units, context, tick);
  
  // Wait to ensure wall-clock changes
  const start = Date.now();
  while(Date.now() - start < 10) {}

  const result2 = propagateTemporalConstraints(schedule, units, context, tick);

  assert(JSON.stringify(result1) === JSON.stringify(result2), "Results must be byte-for-byte identical across runs");
  assert(result1.logicalTick === tick, "Must use provided logicalTick");
  assert(result1.propagatedSignals[0].signalId.includes("42"), "Signal ID must use logicalTick");
});

// Run all
console.log("Running Phase 3B Hardening Tests...");
suites.forEach(s => s());
console.log("All Phase 3B Hardening Tests Passed! 🚀");
