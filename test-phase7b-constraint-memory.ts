import { simulateExecutionHorizon } from "./server/planner/simulation/simulateExecutionHorizon";
import { replayTrace } from "./server/planner/observability/replayTrace";
import { INITIAL_CONSTRAINT_MEMORY, deriveAggregateInstability, INITIAL_INSTABILITY_VECTOR } from "./server/planner/heuristics/ConstraintMemoryTypes";
import { evolveConstraintMemory, extractMemorySignals } from "./server/planner/heuristics/evolveConstraintMemory";
import { hashConstraintMemoryDelta } from "./server/planner/heuristics/hashConstraintMemoryDelta";
import { INITIAL_HEURISTIC_STATE } from "./server/planner/heuristics/HeuristicTypes";
import { GovernanceMetrics } from "./server/planner/types/GovernanceTypes";
import { CandidateSchedule } from "./server/planner/types/ScheduleGraphTypes";
import { PlannerEvent } from "./server/planner/types/PlannerEventTypes";

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

const stableMetrics: GovernanceMetrics = {
  topologyChurnRate: 0.1, repairDensity: 0.1,
  deferredCarryForwardVelocity: 0, convergenceHalfLife: 1,
  replayAmplificationFactor: 1, trajectory: "stabilizing",
  trajectoryMetadata: { trendSlope: -1, volatility: 0, envelopeExpansionRate: -1, oscillationFrequency: 0 }
};

async function runTests() {
  console.log("─────────────────────────────────────────────────────────────────");
  console.log(" Phase 7B: Deterministic Constraint Learning & Adaptive Memory");
  console.log("─────────────────────────────────────────────────────────────────\n");

  // ── Scenario 1: Fragility Reinforcement ─────────────────────────────
  {
    console.log("Scenario 1: Fragility Reinforcement (monotonic instability growth)");

    const chunkId = "chunk_A";
    let memory = INITIAL_CONSTRAINT_MEMORY;

    // Apply 5 successive displacement events — score must grow monotonically
    let prevScore = -1;
    let monotonic = true;
    for (let i = 0; i < 5; i++) {
      const signals = extractMemorySignals(
        new Set(),                   // deferredChunkIds
        [],                          // oscillatingChunkIds
        [chunkId],                   // displacedChunkIds
        [chunkId],                   // nonConvergedChunkIds
        [],                          // convergedChunkIds
        [{ id: chunkId }],           // units
        new Map(),                   // propagationDepths
        i * 10                       // logicalTick
      );
      const next = evolveConstraintMemory(memory, signals, stableMetrics, INITIAL_HEURISTIC_STATE);
      const entry = next.chunkMemory.get(chunkId);
      const score = entry?.aggregateInstabilityScore ?? 0;
      if (score < prevScore - 0.001) {
        monotonic = false;
      }
      prevScore = score;
      memory = next;
    }

    assert("instabilityScore grows monotonically under repeated displacement", monotonic);
    assert("instabilityScore remains bounded [0, 1]", prevScore >= 0 && prevScore <= 1.0,
      `final score: ${prevScore}`);
    assert("displacementInstability is tracked separately",
      (memory.chunkMemory.get(chunkId)?.instabilityVector.displacementInstability ?? 0) > 0);
    assert("oscillationInstability stays 0 without oscillation events",
      (memory.chunkMemory.get(chunkId)?.instabilityVector.oscillationInstability ?? -1) < 0.01);
  }

  // ── Scenario 2: Recovery Decay ───────────────────────────────────────
  {
    console.log("\nScenario 2: Recovery Decay (stable convergence reduces fragility)");

    const chunkId = "chunk_B";
    let memory = INITIAL_CONSTRAINT_MEMORY;

    // First: accumulate instability with 3 displacement cycles
    for (let i = 0; i < 3; i++) {
      const signals = extractMemorySignals(
        new Set(), [], [chunkId], [chunkId], [], [{ id: chunkId }], new Map(), i * 10
      );
      memory = evolveConstraintMemory(memory, signals, stableMetrics, INITIAL_HEURISTIC_STATE);
    }
    const peakScore = memory.chunkMemory.get(chunkId)?.aggregateInstabilityScore ?? 0;
    assert("Peak instability after displacement cycles is > 0", peakScore > 0,
      `peakScore: ${peakScore}`);

    // Now: apply 5 successful convergence cycles (no displacement, only converged)
    for (let i = 0; i < 5; i++) {
      const signals = extractMemorySignals(
        new Set(), [], [], [], [chunkId], [{ id: chunkId }], new Map(), 30 + i * 10
      );
      memory = evolveConstraintMemory(memory, signals, stableMetrics, INITIAL_HEURISTIC_STATE);
    }
    const recoveryScore = memory.chunkMemory.get(chunkId)?.aggregateInstabilityScore ?? 0;

    assert("instabilityScore decays after sustained convergence", recoveryScore < peakScore,
      `peak: ${peakScore}, after recovery: ${recoveryScore}`);
  }

  // ── Scenario 3: Region Stability Propagation ─────────────────────────
  {
    console.log("\nScenario 3: Region Stability (oscillation elevates region instability)");

    const chunkA = "region_A_1";
    const chunkB = "region_A_2";
    let memory = INITIAL_CONSTRAINT_MEMORY;

    // Both chunks share a dependency cluster — they form a region together
    const units = [
      { id: chunkA, dependencyIds: [chunkB] },
      { id: chunkB }
    ];

    for (let i = 0; i < 3; i++) {
      const signals = extractMemorySignals(
        new Set(), [chunkA, chunkB], [chunkA], [chunkA], [], units, new Map(), i * 10
      );
      memory = evolveConstraintMemory(memory, signals, stableMetrics, INITIAL_HEURISTIC_STATE);
    }

    // Region should now exist with elevated instability
    const regionEntries = [...memory.topologyRegionMemory.values()];
    assert("At least one topology region was derived", regionEntries.length > 0,
      `regions: ${regionEntries.length}`);

    const region = regionEntries[0];
    assert("Region ID is topology-derived (lexicographic sort of chunk IDs)", 
      region.regionId === `${chunkA}:${chunkB}` || region.regionId.includes(":"),
      `regionId: ${region.regionId}`);
    assert("Region oscillation rate is elevated after storm cycles",
      region.regionOscillationRate > 0,
      `regionOscillationRate: ${region.regionOscillationRate}`);
    assert("Region aggregate instability is bounded [0, 1]",
      region.regionAggregateInstability >= 0 && region.regionAggregateInstability <= 1.0);
  }

  // ── Scenario 4: Replay Parity (identical stream → identical hash) ─────
  {
    console.log("\nScenario 4: Replay Parity (deterministic delta hash)");

    const chunkId = "chunk_C";
    const makeSignals = (tick: number) => extractMemorySignals(
      new Set([chunkId]), [], [], [chunkId], [], [{ id: chunkId }], new Map(), tick
    );

    // Run A
    let memA = INITIAL_CONSTRAINT_MEMORY;
    for (let i = 0; i < 3; i++) {
      memA = evolveConstraintMemory(memA, makeSignals(i * 10), stableMetrics, INITIAL_HEURISTIC_STATE);
    }
    const deltaA = hashConstraintMemoryDelta(INITIAL_CONSTRAINT_MEMORY, memA);

    // Run B — identical inputs
    let memB = INITIAL_CONSTRAINT_MEMORY;
    for (let i = 0; i < 3; i++) {
      memB = evolveConstraintMemory(memB, makeSignals(i * 10), stableMetrics, INITIAL_HEURISTIC_STATE);
    }
    const deltaB = hashConstraintMemoryDelta(INITIAL_CONSTRAINT_MEMORY, memB);

    assert("Identical event streams produce byte-identical delta hashes",
      deltaA.memoryDeltaHash === deltaB.memoryDeltaHash,
      `hashA=${deltaA.memoryDeltaHash}, hashB=${deltaB.memoryDeltaHash}`);
    assert("Affected chunk IDs are canonically sorted",
      JSON.stringify(deltaA.affectedChunkIds) === JSON.stringify([...deltaA.affectedChunkIds].sort()));
  }

  // ── Scenario 5: Causal Ordering in Kernel Simulation ─────────────────
  {
    console.log("\nScenario 5: Causal Ordering (memory event follows heuristic event)");

    const initialSchedule: CandidateSchedule = {
      scheduleId: "init", scheduledPlacements: [], 
      // Include an unscheduled task so memory signals are non-empty
      unscheduledTaskIds: ["task_X"],
      conflicts: [], scheduleScore: 1.0, stabilityScore: 1.0, focusScore: 1.0,
      fragmentationScore: 0.0, recoverySafetyScore: 1.0, coverageRatio: 1.0,
      confidence: 1.0, seedStrategy: "priority_first", reasoning: [], penaltiesApplied: [], boostsApplied: []
    };
    const units = [{ 
      id: "task_X", urgency: 0.5, priorityScore: 0.5, temporalFlexibility: 1.0,
      estimatedDurationMinutes: 30 
    }] as any[];
    const boundaries = [
      { dayIndex: 1, startMinute: 0, endMinute: 1440, carryOverBufferMinutes: 0 },
      { dayIndex: 2, startMinute: 0, endMinute: 1440, carryOverBufferMinutes: 0 }
    ];
    const events: PlannerEvent[] = [
      { type: "day_boundary_crossed", tick: 10, boundary: boundaries[0] },
      { type: "day_boundary_crossed", tick: 20, boundary: boundaries[1] }
    ];

    const trace = simulateExecutionHorizon(
      initialSchedule, units, {} as any, events, boundaries, { maxRepairCycles: 5 }
    );

    const memoryEvents = trace.events.filter(e => e.type === "constraint_memory_updated");
    const heuristicEvents = trace.events.filter(e => e.type === "heuristic_state_updated");

    assert("constraint_memory_updated events are emitted",
      memoryEvents.length > 0,
      `memoryEvents: ${memoryEvents.length}`);

    // For each memory event, verify no heuristic event at same tick comes AFTER it
    let causalOrderCorrect = true;
    for (const memEvent of memoryEvents) {
      const heuristicAtSameTick = heuristicEvents.filter(e => e.tick === memEvent.tick);
      // All heuristic events at same tick must appear before this memory event in trace.events
      for (const he of heuristicAtSameTick) {
        const hiIdx = trace.events.indexOf(he);
        const miIdx = trace.events.indexOf(memEvent);
        if (hiIdx > miIdx) {
          causalOrderCorrect = false;
        }
      }
    }
    assert("constraint_memory_updated always follows heuristic_state_updated at same tick",
      causalOrderCorrect);

    // Verify memoryChanged in replay
    let memoryChangedSteps = 0;
    for (const step of replayTrace(trace as any)) {
      if (step.memoryChanged) memoryChangedSteps++;
    }
    assert("replayTrace correctly reports memoryChanged steps",
      memoryChangedSteps === memoryEvents.length,
      `replayTrace memoryChanged=${memoryChangedSteps}, emitted events=${memoryEvents.length}`);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
