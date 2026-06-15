// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION TYPES
//
// These types represent the state and observability model for the
// deterministic execution simulation kernel.
//
// DESIGN CONSTRAINTS:
//   - PlannerSimulationState is fully immutable (all fields readonly)
//   - ExecutionTrace is replay-oriented, NOT observability/analytics-oriented
//     It must contain exactly what is needed to reproduce terminal state
//     from (initialState + events), nothing more.
//   - ConvergenceReport captures topology stability, not optimization metrics
//   - Topology hashing is canonical: sorted, deterministic, serialization-stable
//     NEVER hash raw object layout, Map iteration order, or runtime-generated IDs
//
// TOPOLOGY HASH ALGORITHM:
//   hash = stableJSON(
//     scheduledPlacements
//       .map(sp => ({ id: sp.task.id, start: sp.placement.temporalWindow.startMinute,
//                    end: sp.placement.temporalWindow.endMinute }))
//       .sort((a, b) => a.id < b.id ? -1 : 1)   // lexicographic by chunkId
//   )
//   This is ordering-stable and serialization-stable. It is a correctness
//   primitive — convergence detection depends on hash equality.
// ─────────────────────────────────────────────────────────────────────────────

import { CandidateSchedule } from "./ScheduleGraphTypes";
import { SchedulableUnit, PlacementAnalysisContext } from "./SchedulingTypes";
import { PlannerEvent } from "./PlannerEventTypes";
import { HeuristicState, HeuristicEvolutionSnapshot } from "../heuristics/HeuristicTypes";
import { ConstraintMemoryState } from "../heuristics/ConstraintMemoryTypes";

// ─── Simulation State ────────────────────────────────────────────────────────

/**
 * The complete, immutable state of one simulation point-in-time.
 *
 * All fields are readonly. Mutation is never legal — transitions always
 * produce a new PlannerSimulationState via applyPlannerEvent().
 */
export interface PlannerSimulationState {
  /** The current schedule topology — updated by repair cycles */
  readonly schedule: CandidateSchedule;

  /** All schedulable units visible to this simulation */
  readonly units: readonly SchedulableUnit[];

  /** The placement analysis context for this day */
  readonly context: PlacementAnalysisContext;

  /** Chunks currently being executed */
  readonly activeChunkIds: ReadonlySet<string>;

  /** Chunks that have been fully completed */
  readonly completedChunkIds: ReadonlySet<string>;

  /** Chunks deferred to a future slot by repair operations */
  readonly deferredChunkIds: ReadonlySet<string>;

  /**
   * Monotonically increasing repair cycle counter.
   * Incremented on every repair cycle triggered by event application.
   * Never decremented. Used for oscillation detection.
   */
  readonly repairGeneration: number;

  /** Current logical tick — matches the tick of the last applied event */
  readonly logicalTick: number;

  /**
   * Immutable log of all events applied to reach this state.
   * Append-only. Required for full replay.
   */
  readonly eventLog: readonly PlannerEvent[];

  /** 
   * Current active heuristic adaptation state.
   * Ensures deterministic heuristic evolution can be captured in snapshots.
   */
  readonly heuristicState: HeuristicState;

  /**
   * Current constraint memory state — historical instability accumulation.
   * Evolved at each day boundary via evolveConstraintMemory().
   * Replay-visible: always reconstructable from (initialState + events).
   */
  readonly constraintMemory: ConstraintMemoryState;
}

// ─── Execution Trace ─────────────────────────────────────────────────────────

/**
 * Replay-oriented record of a complete simulation run.
 *
 * REPLAY GUARANTEE: Given (initialState + events), the terminal state
 * is exactly snapshots[snapshots.length - 1]. No external inputs required.
 *
 * NOT intended for: telemetry, analytics, UI streaming, or product events.
 * The trace exists primarily for correctness verification and topology debugging.
 */
export interface ExecutionTrace {
  /** The initial state before any events were applied */
  readonly initialState: PlannerSimulationState;

  /** The canonical, sorted event sequence applied during this simulation */
  readonly events: readonly PlannerEvent[];

  /**
   * One state snapshot per applied event.
   * snapshots[i] = state AFTER applying events[i]
   * snapshots.length === events.length is always true.
   */
  readonly snapshots: readonly PlannerSimulationState[];

  /**
   * Reason simulation terminated.
   *   "all_chunks_complete"       — all scheduled chunks reached completed state
   *   "max_repairs_reached"       — repair cycle limit hit; topology may be unstable
   *   "unresolvable_conflict"     — repair could not produce a valid schedule
   *   "event_sequence_exhausted"  — all events applied; execution ended normally
   */
  readonly terminationReason:
    | "all_chunks_complete"
    | "max_repairs_reached"
    | "unresolvable_conflict"
    | "event_sequence_exhausted";

  /** Total repair cycles triggered across the full simulation */
  readonly totalRepairCycles: number;

  /** The history of heuristic adaptations throughout the trace. */
  readonly heuristicSnapshots: readonly HeuristicEvolutionSnapshot[];

  /**
   * Ordered sequence of ConstraintMemoryState snapshots, one per evolution event.
   * memoryEvolutionHistory[i] = state after the i-th constraint_memory_updated event.
   * Enables diff-by-generation analysis of instability accumulation.
   */
  readonly memoryEvolutionHistory: readonly ConstraintMemoryState[];
}

// ─── Convergence Report ───────────────────────────────────────────────────────

/**
 * Deterministic stability report for a convergence invariant test.
 *
 * Tests the core invariant:
 *   same drift scenario
 *   → bounded repair sequence
 *   → stable terminal topology
 *
 * This is a correctness report, not an optimization report.
 * A stable suboptimal topology is preferred over an unstable optimal one.
 */
export interface ConvergenceReport {
  /** True iff the simulation reached a stable terminal topology within bounds */
  converged: boolean;

  /** Number of repair cycles executed */
  repairCycles: number;

  /**
   * Canonical, deterministic hash of the final schedule topology.
   *
   * Algorithm: stableJSON(placements sorted lexicographically by chunkId,
   *   projecting { id, startMinute, endMinute } only)
   *
   * MUST be identical across runs with identical inputs.
   * Used for replay verification and oscillation detection.
   */
  finalTopologyHash: string;

  /**
   * True iff any chunk was repositioned to the same temporal slot
   * it previously occupied in an earlier repair generation.
   * (i.e., the repair loop bounced rather than converged)
   */
  oscillationDetected: boolean;

  /** ChunkIds that moved more than once during repair convergence */
  oscillatingChunkIds: string[];

  /**
   * Topology hash at each repair generation (index 0 = initial).
   * Enables diff-by-generation debugging without replaying the full trace.
   */
  topologyHashByGeneration: string[];
}

// ─── Simulation Options ───────────────────────────────────────────────────────

/**
 * Configuration for a simulation run.
 * All options affect termination behavior, not scheduling heuristics.
 */
export interface SimulationOptions {
  /**
   * Maximum number of repair cycles before forced termination.
   * Must be a positive integer. Simulation terminates with
   * "max_repairs_reached" if this limit is hit.
   *
   * Recommended: MAX_REPAIR_RADIUS from IncrementalRepairTypes.
   */
  maxRepairCycles: number;

  /**
   * Controls when state snapshots are captured during simulation.
   *
   *   "repair_boundaries" (default) — snapshot only when repairGeneration
   *     increments. Memory-efficient for long simulations. Intra-repair-cycle
   *     granularity is reconstructable on-demand via replayTrace().
   *
   *   "all_events" — snapshot after every event. Full granularity.
   *     Used for debugging and correctness verification.
   *
   * In both modes the full event log is always preserved, ensuring
   * the Replay Integrity Invariant (PlannerKernel.ts, Invariant 7) holds.
   */
  snapshotStrategy?: SnapshotStrategy;
}

// ─── Snapshot Strategy ───────────────────────────────────────────────────────────────────────

export type SnapshotStrategy = "repair_boundaries" | "all_events";

// ─── Repair Boundary Snapshot ──────────────────────────────────────────────────────────────

/**
 * A snapshot of planner state captured at the boundary of a repair cycle.
 * Contains explicit metadata for deterministic navigation without full replay.
 *
 * Used in CompactExecutionTrace as the primary observability checkpoint:
 * - binary search over topology instability by generation
 * - integrity verification via topologyHash comparison
 * - diff input for diffTopologies()
 */
export interface RepairBoundarySnapshot {
  /** The repair generation index this snapshot was captured after */
  repairGeneration: number;
  /** Logical tick at which this repair completed */
  logicalTick: number;
  /**
   * Canonical deterministic hash of the schedule topology at this point.
   * Algorithm: stableJSON(placements sorted lexicographically by chunkId,
   *   projecting { id, startMinute, endMinute }).
   * Identical to projectTopology(state).topologyHash.
   */
  topologyHash: string;
  /** Full immutable state at this repair boundary */
  state: PlannerSimulationState;
}

// ─── Compact Execution Trace ─────────────────────────────────────────────────────────────────────

/**
 * Memory-efficient alternative to ExecutionTrace.
 * Stores only repair-boundary snapshots + full event log.
 *
 * REPLAY GUARANTEE (Invariant 7):
 *   replayTrace(compactTrace) applied from initialState + events
 *   produces terminal topology hash byte-identical to the original run.
 *
 * Memory profile: O(repairCycles) state objects, not O(events).
 * In a 200-event, 6-repair-cycle simulation this is 7 states vs 200.
 *
 * NOT intended for: telemetry, analytics, UI streaming.
 * Optimized for: topology debugging, convergence inspection, causal tracing.
 */
export interface CompactExecutionTrace {
  readonly initialState: PlannerSimulationState;
  readonly events: readonly PlannerEvent[];
  /**
   * One snapshot per completed repair cycle.
   * repairBoundarySnapshots[i].repairGeneration === i + 1 (1-indexed)
   * repairBoundarySnapshots[0] = state after the first repair cycle.
   */
  readonly repairBoundarySnapshots: readonly RepairBoundarySnapshot[];
  readonly terminationReason: ExecutionTrace["terminationReason"];
  readonly totalRepairCycles: number;
}
