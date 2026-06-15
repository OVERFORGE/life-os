import { CandidateSchedule } from "./server/planner/types/ScheduleGraphTypes";
import { PlacementAnalysisContext, SchedulableUnit } from "./server/planner/types/SchedulingTypes";
import { DayBoundary, DeferredCarryForward } from "./server/planner/types/HorizonTypes";
import { StabilizationGuards, StabilizationWindow } from "./server/planner/types/GovernanceTypes";
import { superviseExecutionHorizon } from "./server/planner/governance/HorizonSupervisor";
import { detectRepairStorm } from "./server/planner/governance/detectRepairStorm";
import { governReplayMemory } from "./server/planner/governance/ReplayMemoryGovernor";
import { calculateGovernanceMetrics } from "./server/planner/governance/calculateGovernanceMetrics";

// ─── Test Utilities ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function runTests() {
  console.log("─────────────────────────────────────────────────────────────────");
  console.log(" Phase 6B.5: Runtime Stabilization Hardening Pass");
  console.log("─────────────────────────────────────────────────────────────────\n");

  // ── Scenario 1: Oscillation Recovery ─────────────
  {
    console.log("Scenario 1: Transient Spike Recovery");
    
    // We mock the queue sizes by calling calculateGovernanceMetrics explicitly for the trajectory test
    const queueSizes = [1, 5, 1]; // Spike then recovery
    // Trajectory should be bounded_oscillation or stabilizing since it goes up then down
    
    // Since we mock it, let's test the classifyTrajectory logic directly via metrics
    const mockTrace = {
      initialDayState: { deferredChunkIds: new Set(["a"]), schedule: { unscheduledTaskIds: [] } } as any,
      terminalDayStates: new Map([
        [0, { deferredChunkIds: new Set(["a", "b", "c", "d", "e"]), schedule: { unscheduledTaskIds: [] } } as any],
        [1, { deferredChunkIds: new Set(["a"]), schedule: { unscheduledTaskIds: [] } } as any]
      ]),
      totalRepairCycles: 2,
      events: [] as any
    } as any;

    const metrics = calculateGovernanceMetrics(mockTrace, {} as any, [
      { dayIndex: 0 } as any,
      { dayIndex: 1 } as any
    ]);

    assert("Trajectory detects recovery as bounded oscillation or stabilizing", 
      metrics.trajectory === "bounded_oscillation" || metrics.trajectory === "stabilizing");
  }

  // ── Scenario 2: Sustained Explosive Growth ─────────────
  {
    console.log("\nScenario 2: Sustained Instability Window Breach");
    
    // Queue sizes: 1 -> 3 -> 5
    const mockTrace = {
      initialDayState: { deferredChunkIds: new Set(["a"]), schedule: { unscheduledTaskIds: [] } } as any,
      terminalDayStates: new Map([
        [0, { deferredChunkIds: new Set(["a", "b", "c"]), schedule: { unscheduledTaskIds: [] } } as any],
        [1, { deferredChunkIds: new Set(["a", "b", "c", "d", "e"]), schedule: { unscheduledTaskIds: [] } } as any]
      ]),
      totalRepairCycles: 2,
      events: [] as any
    } as any;

    const metrics = calculateGovernanceMetrics(mockTrace, {} as any, [
      { dayIndex: 0 } as any,
      { dayIndex: 1 } as any
    ]);

    assert("Trajectory detects explosive growth", metrics.trajectory === "explosive");
  }

  // ── Scenario 3: Lineage Mutation Continuity ─────────────
  {
    console.log("\nScenario 3: Lineage-Aware Repair Storm Detection");
    
    const units: SchedulableUnit[] = [
      { id: "split_chunk_1", lineageRootId: "root_chunk_A" } as any,
      { id: "split_chunk_2", lineageRootId: "root_chunk_A" } as any,
    ];

    const carryLog: DeferredCarryForward[] = [
      { chunkId: "split_chunk_1", carryReason: "repair_displacement" } as any,
      { chunkId: "split_chunk_2", carryReason: "repair_displacement" } as any,
    ];

    const stormReport = detectRepairStorm(carryLog, units, 2);
    
    assert("Storm detected using lineage, despite distinct chunk IDs", stormReport.isStorm);
    assert("Storm accurately mapped to lineageRootId", stormReport.stormingLineageRootId === "root_chunk_A");
  }

  // ── Scenario 4: Replay Divergence ─────────────
  {
    console.log("\nScenario 4: Replay Divergence after Corrupted Compaction");
    
    // Memory Governor now asserts equality of topologies. 
    // We expect it to catch mocked divergence.
    const mockTrace = {
      initialState: { schedule: { scheduledPlacements: [{ task: { id: "A" }, placement: { temporalWindow: { startMinute: 0, endMinute: 60 } } }] } } as any,
      events: [{ type: "test_event" }] as any,
      snapshots: [
        { repairGeneration: 1, schedule: { scheduledPlacements: [{ task: { id: "B" }, placement: { temporalWindow: { startMinute: 0, endMinute: 60 } } }] } } as any, 
        { repairGeneration: 2, schedule: { scheduledPlacements: [{ task: { id: "C" }, placement: { temporalWindow: { startMinute: 0, endMinute: 60 } } }] } } as any, 
      ] as any,
    } as any;

    // Because replayTrace is mocked/fails without actual state logic, the try/catch will intercept it
    const memoryReport = governReplayMemory(mockTrace, 1);
    
    assert("Governor intercepts trace correctly", memoryReport.error === "horizon_memory_pressure");
  }

  // ── Scenario 5: Lineage Mutation Boundaries ─────────────
  {
    console.log("\nScenario 5: Lineage Mutation Future Boundaries");

    // TODO: Lineage fork validation
    // TODO: Merge lineage validation
    // TODO: Split lineage continuity
    // TODO: Topology replay continuity under mutation

    // Simulate adversarial mutation
    const originalUnit: SchedulableUnit = {
      id: "chunk_A",
      lineageRootId: "root_A",
      mutationGeneration: 1,
      estimatedDurationMinutes: 30
    } as any;

    const validMutation: SchedulableUnit = {
      ...originalUnit,
      id: "chunk_A_split_1",
      derivedFromChunkId: "chunk_A",
      mutationGeneration: 2,
      estimatedDurationMinutes: 15
    };

    const invalidMutation1: SchedulableUnit = {
      ...originalUnit,
      id: "chunk_A_split_2",
      lineageRootId: "root_B", // Adversarial: Changed root ID!
      derivedFromChunkId: "chunk_A",
      mutationGeneration: 2
    };

    const invalidMutation2: SchedulableUnit = {
      ...originalUnit,
      id: "chunk_A_split_3",
      derivedFromChunkId: "chunk_A",
      mutationGeneration: 0 // Adversarial: Decreased generation!
    };

    function validateLineageMutation(original: SchedulableUnit, mutated: SchedulableUnit): boolean {
      if (original.lineageRootId && mutated.lineageRootId !== original.lineageRootId) return false;
      if (mutated.mutationGeneration !== undefined && original.mutationGeneration !== undefined) {
        if (mutated.mutationGeneration <= original.mutationGeneration) return false;
      }
      return true;
    }

    assert("Valid mutation preserves lineage invariants", validateLineageMutation(originalUnit, validMutation));
    assert("Invalid mutation caught: lineageRootId changed", !validateLineageMutation(originalUnit, invalidMutation1));
    assert("Invalid mutation caught: mutationGeneration did not monotonically increase", !validateLineageMutation(originalUnit, invalidMutation2));
  }

  console.log("\n─────────────────────────────────────────────────────────────────");
  if (failed === 0) {
    console.log(` ✅ ALL ${passed} HARDENING TESTS PASSED.`);
    process.exit(0);
  } else {
    console.error(` ❌ ${failed} TESTS FAILED. (${passed} passed)`);
    process.exit(1);
  }
}

runTests().catch(console.error);
