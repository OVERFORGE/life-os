import { CandidateSchedule } from "./server/planner/types/ScheduleGraphTypes";
import { PlannerEvent } from "./server/planner/types/PlannerEventTypes";
import { HeuristicEvolutionSnapshot } from "./server/planner/types/SimulationTypes";
import { simulateExecutionHorizon } from "./server/planner/simulation/simulateExecutionHorizon";
import { replayTrace } from "./server/planner/observability/replayTrace";
import { INITIAL_HEURISTIC_STATE } from "./server/planner/heuristics/HeuristicTypes";
import { evolveHeuristicState } from "./server/planner/heuristics/evolveHeuristicState";
import { GovernanceMetrics } from "./server/planner/types/GovernanceTypes";
import { calculateGovernanceMetrics } from "./server/planner/governance/calculateGovernanceMetrics";

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
  console.log(" Phase 7A: Deterministic Adaptive Heuristics Tests");
  console.log("─────────────────────────────────────────────────────────────────\n");

  // ── Scenario 1: Deterministic State Evolution ─────────────
  {
    console.log("Scenario 1: Deterministic State Evolution");
    
    let currentState = INITIAL_HEURISTIC_STATE;
    assert("Initial profile is balanced", currentState.profile === "balanced");
    
    // Simulate an explosive trajectory
    const explosiveMetrics: GovernanceMetrics = {
      topologyChurnRate: 0.5,
      repairDensity: 0.8,
      deferredCarryForwardVelocity: 5,
      convergenceHalfLife: -1,
      replayAmplificationFactor: 1,
      trajectory: "explosive",
      trajectoryMetadata: { trendSlope: 5, volatility: 2, envelopeExpansionRate: 1, oscillationFrequency: 0 }
    };
    
    const nextState = evolveHeuristicState(currentState, explosiveMetrics);
    
    assert("Explosive trajectory triggers conservative profile", nextState.profile === "conservative");
    assert("Conservative profile increases downstreamPressureMultiplier", nextState.downstreamPressureMultiplier > currentState.downstreamPressureMultiplier);
    
    // Simulate decaying oscillation trajectory to return to balanced
    const balancedMetrics: GovernanceMetrics = {
      topologyChurnRate: 0.1,
      repairDensity: 0.1,
      deferredCarryForwardVelocity: 0,
      convergenceHalfLife: 1,
      replayAmplificationFactor: 1,
      trajectory: "decaying_oscillation",
      trajectoryMetadata: { trendSlope: -1, volatility: 0, envelopeExpansionRate: -1, oscillationFrequency: 0 }
    };
    
    const finalState = evolveHeuristicState(nextState, balancedMetrics);
    assert("Decaying oscillation returns to balanced", finalState.profile === "balanced");
  }

  // ── Scenario 2: Kernel Integration & Replay Parity ─────────────
  {
    console.log("\nScenario 2: Kernel Integration & Replay Parity");
    
    const initialSchedule: CandidateSchedule = {
      scheduleId: "init",
      scheduledPlacements: [],
      unscheduledTaskIds: [],
      conflicts: [],
      scheduleScore: 1.0,
      stabilityScore: 1.0,
      focusScore: 1.0,
      fragmentationScore: 0.0,
      recoverySafetyScore: 1.0,
      coverageRatio: 1.0,
      confidence: 1.0,
      seedStrategy: "priority_first",
      reasoning: [],
      penaltiesApplied: [],
      boostsApplied: []
    };

    // We simulate a horizon with some boundary events
    const boundaries = [
      { dayIndex: 1, startMinute: 0, endMinute: 1440, carryOverBufferMinutes: 0 },
      { dayIndex: 2, startMinute: 0, endMinute: 1440, carryOverBufferMinutes: 0 }
    ];

    const events: PlannerEvent[] = [
      { type: "day_boundary_crossed", tick: 10, boundary: boundaries[0] },
      { type: "day_boundary_crossed", tick: 20, boundary: boundaries[1] }
    ];
    
    // We mock units with 0 tasks to keep the engine simple
    const trace = simulateExecutionHorizon(
      initialSchedule,
      [],
      {} as any,
      events,
      boundaries,
      { maxRepairCycles: 5 }
    );
    
    // In an empty schedule, trajectory is "stabilizing" so heuristics evolve toward "aggressive".
    const heuristicEvents = trace.events.filter(e => e.type === "heuristic_state_updated");
    assert("Simulation terminates non-catastrophically", trace.terminationReason !== "unresolvable_conflict",
      `actual: ${trace.terminationReason}, events: ${trace.events.map(e => e.type).join(',')}`);;
    // Two boundaries → two heuristic evaluations; both on a stabilizing trajectory → profile "aggressive"
    assert("Heuristic events emitted per boundary crossing",
      heuristicEvents.length === 2 && heuristicEvents.every(e => e.nextProfile === "aggressive"),
      `heuristicEvents.length=${heuristicEvents.length}, events=${trace.events.map(e => e.type).join(',')}`);
    
    // Evaluate convergence metrics
    const metrics = calculateGovernanceMetrics(trace, {} as any, boundaries);
    // profileSwitchCount counts all heuristic_state_updated events in the trace
    assert("profileSwitchCount correctly counts heuristic evolution events", metrics.profileSwitchCount === 2);
    // 2 boundaries, 2 switches: 2 <= max(1, 2/3=1), trajectory is stabilizing → converged
    assert("heuristicConvergence is true for a stable schedule", metrics.heuristicConvergence === true);
    
    // Verify Replay Parity — replaying the trace should reconstruct the same final heuristic state
    let replayedHeuristicState = INITIAL_HEURISTIC_STATE;
    for (const step of replayTrace(trace as any)) {
      if (step.event.type === "heuristic_state_updated") {
        replayedHeuristicState = step.event.heuristicState;
      }
    }
    const terminalState = trace.terminalDayStates.get(2) || trace.initialDayState;
    assert("Replayed heuristic state matches simulation terminal state",
      terminalState.heuristicState.profile === replayedHeuristicState.profile);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
