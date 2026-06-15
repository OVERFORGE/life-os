// ─────────────────────────────────────────────────────────────────────────────
// verifyRepairConvergence
//
// Tests the core planner convergence invariant:
//
//   same drift scenario
//   → bounded repair sequence
//   → stable terminal topology
//
// This is the most important correctness property in Phase 4.
// A slightly suboptimal stable topology is always preferred over an
// unstable "clever" repair sequence.
//
// OSCILLATION DETECTION:
//   Oscillation = the same chunkId is moved to the same temporal window
//   it occupied in a prior repair generation. This is detected by comparing
//   topology hashes at each repair generation.
//
//   If hash[N] === hash[N-2] for any N, oscillation is detected.
//   (hash[N] === hash[N-1] means convergence — stable in consecutive generations)
//
// TOPOLOGY HASH STABILITY:
//   The topology hash is computed by computeTopologyHash() from applyPlannerEvent.
//   It is lexicographically sorted by chunkId — never by Map iteration order.
//   This is a correctness primitive. Do not change the hash algorithm without
//   updating all convergence tests.
// ─────────────────────────────────────────────────────────────────────────────

import { CandidateSchedule } from "../types/ScheduleGraphTypes";
import { SchedulableUnit, PlacementAnalysisContext } from "../types/SchedulingTypes";
import { PlannerEvent } from "../types/PlannerEventTypes";
import { ConvergenceReport, SimulationOptions } from "../types/SimulationTypes";
import { simulateExecutionDay } from "./simulateExecutionDay";
import { CanonicalTopologyProjection, projectTopology } from "../observability/projectTopology";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Runs a drift scenario through the simulation and verifies that the
 * repair engine converges to a stable terminal topology within the
 * configured cycle bound.
 *
 * @param schedule       - Initial schedule before drift events
 * @param units          - All schedulable units
 * @param context        - Placement analysis context
 * @param driftScenario  - Events representing the adversarial drift scenario
 * @param options        - Simulation bounds
 * @returns ConvergenceReport with stability metrics
 */
export function verifyRepairConvergence(
  schedule: CandidateSchedule,
  units: SchedulableUnit[],
  context: PlacementAnalysisContext,
  driftScenario: PlannerEvent[],
  options: SimulationOptions
): ConvergenceReport {
  const trace = simulateExecutionDay(
    schedule,
    units,
    context,
    driftScenario,
    options
  );

  // ── Collect topology hashes at each repair generation ─────────────────────
  // We track the topology hash each time repairGeneration increments.
  // Index 0 = initial topology (before any events).
  const topologyProjectionsByGeneration: CanonicalTopologyProjection[] = [projectTopology(trace.initialState)];
  const topologyHashByGeneration: string[] = [topologyProjectionsByGeneration[0].topologyHash];

  let lastRepairGen = 0;
  for (const snapshot of trace.snapshots) {
    if (snapshot.repairGeneration > lastRepairGen) {
      const proj = projectTopology(snapshot);
      topologyProjectionsByGeneration.push(proj);
      topologyHashByGeneration.push(proj.topologyHash);
      lastRepairGen = snapshot.repairGeneration;
    }
  }

  const finalHash = topologyHashByGeneration[topologyHashByGeneration.length - 1];
  const repairCycles = trace.totalRepairCycles;

  // ── Oscillation Detection ─────────────────────────────────────────────────
  // Oscillation: hash[N] === hash[N-2] but hash[N] !== hash[N-1]
  // (bouncing back to a previous topology rather than converging)
  const oscillatingChunkIds: string[] = [];
  let oscillationDetected = false;

  for (let i = 2; i < topologyHashByGeneration.length; i++) {
    const current = topologyHashByGeneration[i];
    const previous = topologyHashByGeneration[i - 1];
    const twoBack = topologyHashByGeneration[i - 2];

    if (current === twoBack && current !== previous) {
      oscillationDetected = true;
      // Extract which chunkIds changed between generation i-2 and i-1
      // (the "bounce") using canonical projections
      const bounced = extractBouncingChunks(
        topologyProjectionsByGeneration[i - 2],
        topologyProjectionsByGeneration[i - 1]
      );
      oscillatingChunkIds.push(...bounced);
    }
  }

  // ── Convergence Verdict ───────────────────────────────────────────────────
  // Converged = not oscillating, within bounds, and terminated cleanly
  const converged =
    !oscillationDetected &&
    trace.terminationReason !== "max_repairs_reached" &&
    trace.terminationReason !== "unresolvable_conflict";

  return {
    converged,
    repairCycles,
    finalTopologyHash: finalHash,
    oscillationDetected,
    oscillatingChunkIds: [...new Set(oscillatingChunkIds)], // deduplicate
    topologyHashByGeneration,
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Extracts chunk IDs that differ between two topology projections.
 * Returns only the IDs of chunks whose position changed.
 */
function extractBouncingChunks(a: CanonicalTopologyProjection, b: CanonicalTopologyProjection): string[] {
  const changed: string[] = [];
  for (const [id, entryA] of a.placements) {
    const entryB = b.placements.get(id);
    if (!entryB || entryB.startMinute !== entryA.startMinute || entryB.endMinute !== entryA.endMinute) {
      changed.push(id);
    }
  }
  return changed;
}
