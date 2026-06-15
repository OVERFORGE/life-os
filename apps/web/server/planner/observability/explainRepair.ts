// ─────────────────────────────────────────────────────────────────────────────
// explainRepair
//
// Causal explanation layer: WHY did repair cycle N occur?
//
// ANSWERS:
//   - Which event triggered this repair?
//   - Which chunks were in the blast radius?
//   - Which chunks were displaced and by how much?
//   - Which chunks were preserved by anchor constraints?
//   - What exact topology transition did this repair create?
//
// DESIGN:
//   Works purely from ExecutionTrace state — no external state required.
//   The causal chain is reconstructed from the event log + repair-boundary
//   snapshot diffs. This is what "explainable temporal causality" means.
//
// TOPOLOGY TRANSITION:
//   RepairCausalChain includes topologyTransition: { fromHash, toHash }
//   so repair chains are composable: chains can be linked across generations
//   by matching toHash of generation N to fromHash of generation N+1.
// ─────────────────────────────────────────────────────────────────────────────

import { ExecutionTrace, PlannerSimulationState } from "../types/SimulationTypes";
import { PlannerEvent } from "../types/PlannerEventTypes";
import { diffTopologies, ChunkMovement } from "./diffTopologies";
import { projectTopology } from "./projectTopology";
import { collectReplaySteps } from "./replayTrace";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RepairCausalChain {
  /** Which repair generation this explains (1-indexed) */
  repairGeneration: number;
  /** The event that directly triggered this repair cycle */
  triggeringEvent: PlannerEvent;
  /** ID of the chunk that was the direct source of the repair trigger */
  triggeringChunkId: string;
  /** All chunk IDs within the repair blast radius */
  affectedChunkIds: string[];
  /** Chunks repositioned as a result of this repair */
  displacedChunks: ChunkMovement[];
  /** Chunks preserved in-place by the anchor map */
  anchoredChunkIds: string[];
  /**
   * The exact topology transition this repair created.
   * fromHash/toHash are canonical topology hashes — enables composable
   * repair chain linking across generations.
   */
  topologyTransition: {
    fromHash: string;
    toHash: string;
  };
  /** Forwarded reasoning from the underlying repair plan */
  reasoning: string[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Explains the causal chain for a specific repair generation.
 *
 * @param trace           - Full ExecutionTrace from simulateExecutionDay
 * @param repairGeneration - The repair cycle to explain (1-indexed)
 * @returns RepairCausalChain if the generation exists, null otherwise
 */
export function explainRepair(
  trace: ExecutionTrace,
  repairGeneration: number
): RepairCausalChain | null {
  if (repairGeneration < 1) return null;

  const steps = collectReplaySteps(trace);

  // Find the replay step where repairGeneration first appears
  const repairStep = steps.find(
    s => s.repairTriggered && s.stateAfter.repairGeneration === repairGeneration
  );
  if (!repairStep) return null;

  // State before the repair
  const stateBefore = repairStep.stateBefore;
  // State after the repair
  const stateAfter = repairStep.stateAfter;

  const fromHash = projectTopology(stateBefore).topologyHash;
  const toHash = projectTopology(stateAfter).topologyHash;

  // Structural diff to find what actually changed
  const diff = diffTopologies(stateBefore, stateAfter);

  // Extract triggeringChunkId from the event
  const event = repairStep.event;
  const triggeringChunkId =
    "chunkId" in event ? event.chunkId :
    "trigger" in event && event.trigger.sourceChunkId ? event.trigger.sourceChunkId :
    "unknown";

  // Affected chunk IDs = anything moved or removed
  const affectedChunkIds = [
    ...diff.movedChunks.map(m => m.chunkId),
    ...diff.removedChunkIds,
  ].filter((id, i, arr) => arr.indexOf(id) === i).sort();

  // Anchored chunks = chunks in finalState that were NOT moved despite being in the blast radius
  // (approximated: completed or active chunks in stateBefore that stayed in place)
  const anchoredChunkIds: string[] = [];
  for (const sp of stateBefore.schedule.scheduledPlacements) {
    const id = sp.task.id;
    if (
      stateBefore.completedChunkIds.has(id) ||
      stateBefore.activeChunkIds.has(id)
    ) {
      anchoredChunkIds.push(id);
    }
  }

  return {
    repairGeneration,
    triggeringEvent: event,
    triggeringChunkId,
    affectedChunkIds,
    displacedChunks: diff.movedChunks,
    anchoredChunkIds: anchoredChunkIds.sort(),
    topologyTransition: { fromHash, toHash },
    reasoning: stateAfter.eventLog
      .filter(e => e.tick === event.tick)
      .map(e => `tick:${e.tick} type:${e.type}`),
  };
}
