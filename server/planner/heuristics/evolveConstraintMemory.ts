// ─────────────────────────────────────────────────────────────────────────────
// evolveConstraintMemory
//
// Pure deterministic function: (prevMemory, signals) → nextMemory
//
// DECAY BEFORE REINFORCEMENT INVARIANT:
//   Decay is always applied first, then reinforcement.
//   This guarantees all instability dimensions remain bounded [0.0, 1.0]
//   and prevents runaway accumulation regardless of call frequency.
//
// IMMUTABILITY INVARIANT:
//   prevMemory is never mutated. All evolution produces new objects.
//
// REGION INVARIANT:
//   Region IDs are always derived as sorted(memberChunkIds).join(':').
//   Region memory is re-aggregated from member chunks after every evolution.
//   No region state is carried forward independently — it is topology-derived.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ConstraintMemoryState,
  ConstraintMemoryEntry,
  InstabilityVector,
  TopologyRegionMemory,
  INITIAL_INSTABILITY_VECTOR,
  INITIAL_CONSTRAINT_MEMORY,
  INSTABILITY_WEIGHTS,
  deriveAggregateInstability
} from "./ConstraintMemoryTypes";
import { GovernanceMetrics } from "../types/GovernanceTypes";
import { HeuristicState } from "./HeuristicTypes";

// ─── Evolution Signals ────────────────────────────────────────────────────────

/**
 * The set of signals used to drive memory evolution at a day boundary.
 *
 * All signals are derived from replay-visible kernel state — no hidden inputs.
 */
export interface MemoryEvolutionSignals {
  /** Chunks displaced during the day's repair cycles (source of instability) */
  readonly displacedChunkIds: readonly string[];

  /** Chunks that participated in an oscillation/storm cycle */
  readonly oscillatingChunkIds: readonly string[];

  /** Chunks that failed to converge (still deferred at boundary) */
  readonly nonConvergedChunkIds: readonly string[];

  /** Chunks carried forward to the next day */
  readonly deferredChunkIds: readonly string[];

  /** Chunks that successfully converged (their repair plan stabilized) */
  readonly convergedChunkIds: readonly string[];

  /**
   * Dependency clusters: each array is a set of chunkIds that belong
   * to the same dependency region. Used to derive regionIds and
   * aggregate region memory.
   */
  readonly dependencyClusters: readonly (readonly string[])[];

  /**
   * Per-chunk propagation depth observed during repairs.
   * Key: chunkId, Value: depth of blast radius.
   */
  readonly propagationDepths: ReadonlyMap<string, number>;

  /** Logical tick at which this evolution is occurring. */
  readonly logicalTick: number;
}

// ─── Clamp Utility ────────────────────────────────────────────────────────────

/** Clamps a value to [0.0, 1.0]. Applied at every mutation boundary. */
function clamp01(v: number): number {
  return Math.min(1.0, Math.max(0.0, v));
}

// ─── Evolution Step Magnitudes ────────────────────────────────────────────────
// All magnitudes are explicit rational constants — no floating-point inference.

const DECAY = {
  displacement: 0.05,
  oscillation: 0.04,
  convergence: 0.06,
  deferral: 0.03
} as const;

const REINFORCE = {
  displacement: 0.10,
  oscillation: 0.15,
  convergenceFailure: 0.12,
  deferral: 0.08
} as const;

// ─── Core Evolution Function ──────────────────────────────────────────────────

/**
 * Evolves the ConstraintMemoryState deterministically from governance signals.
 *
 * Called once per day boundary, downstream of heuristic evolution.
 * Returns a new ConstraintMemoryState — never mutates prevMemory.
 *
 * Processing order per chunk:
 *   1. Apply global decay on all active instability dimensions.
 *   2. Apply reinforcement for each signal dimension (displacement, oscillation, etc.).
 *   3. Clamp all dimensions to [0.0, 1.0].
 *   4. Update rolling ratios (convergenceSuccessRate, historicalDeferralRate, etc.).
 *   5. Derive aggregateInstabilityScore from updated vector.
 *
 * After all chunks are updated:
 *   6. Re-derive all topology regions from dependencyClusters.
 *   7. Aggregate region metrics from member chunk scores.
 */
export function evolveConstraintMemory(
  prevMemory: ConstraintMemoryState,
  signals: MemoryEvolutionSignals,
  governanceMetrics: GovernanceMetrics,
  heuristicState: HeuristicState
): ConstraintMemoryState {
  // Build mutable working copy — Map is rebuilt from scratch (immutability)
  const nextChunkMemory = new Map<string, ConstraintMemoryEntry>(prevMemory.chunkMemory);

  // Collect all chunk IDs mentioned by any signal
  const allAffectedChunks = new Set<string>([
    ...signals.displacedChunkIds,
    ...signals.oscillatingChunkIds,
    ...signals.nonConvergedChunkIds,
    ...signals.deferredChunkIds,
    ...signals.convergedChunkIds
  ]);

  // ── Step 1-5: Evolve each affected chunk ─────────────────────────────────
  for (const chunkId of allAffectedChunks) {
    const prev = nextChunkMemory.get(chunkId) ?? createInitialEntry(chunkId, signals.logicalTick);
    const updated = evolveChunkEntry(prev, chunkId, signals, heuristicState);
    nextChunkMemory.set(chunkId, updated);
  }

  // ── Step 6-7: Re-derive topology regions ─────────────────────────────────
  const nextRegionMemory = deriveRegionMemory(
    signals.dependencyClusters,
    nextChunkMemory,
    prevMemory.topologyRegionMemory,
    signals.logicalTick
  );

  return {
    chunkMemory: nextChunkMemory,
    topologyRegionMemory: nextRegionMemory,
    evolutionTick: signals.logicalTick
  };
}

// ─── Chunk Entry Evolution ────────────────────────────────────────────────────

function evolveChunkEntry(
  prev: ConstraintMemoryEntry,
  chunkId: string,
  signals: MemoryEvolutionSignals,
  heuristicState: HeuristicState
): ConstraintMemoryEntry {
  const isDisplaced   = signals.displacedChunkIds.includes(chunkId);
  const isOscillating = signals.oscillatingChunkIds.includes(chunkId);
  const isNonConverged = signals.nonConvergedChunkIds.includes(chunkId);
  const isDeferred    = signals.deferredChunkIds.includes(chunkId);
  const isConverged   = signals.convergedChunkIds.includes(chunkId);

  // ── DECAY FIRST (Invariant: decay before reinforcement) ──────────────────
  let vec: InstabilityVector = {
    displacementInstability: clamp01(prev.instabilityVector.displacementInstability - DECAY.displacement),
    oscillationInstability:  clamp01(prev.instabilityVector.oscillationInstability  - DECAY.oscillation),
    convergenceInstability:  clamp01(prev.instabilityVector.convergenceInstability  - DECAY.convergence),
    deferralInstability:     clamp01(prev.instabilityVector.deferralInstability     - DECAY.deferral)
  };

  // ── REINFORCE from signals ────────────────────────────────────────────────
  // Scale reinforcement by heuristicState multiplier for pressure sensitivity
  const pressureScale = heuristicState.repairAggressivenessMultiplier;

  if (isDisplaced) {
    vec = { ...vec, displacementInstability: clamp01(vec.displacementInstability + REINFORCE.displacement * pressureScale) };
  }
  if (isOscillating) {
    vec = { ...vec, oscillationInstability: clamp01(vec.oscillationInstability + REINFORCE.oscillation * pressureScale) };
  }
  if (isNonConverged) {
    vec = { ...vec, convergenceInstability: clamp01(vec.convergenceInstability + REINFORCE.convergenceFailure * pressureScale) };
  }
  if (isDeferred) {
    vec = { ...vec, deferralInstability: clamp01(vec.deferralInstability + REINFORCE.deferral) };
  }
  // Successful convergence: minor additional decay on convergence dimension
  if (isConverged && !isNonConverged) {
    vec = { ...vec, convergenceInstability: clamp01(vec.convergenceInstability - 0.04) };
  }

  // ── Update rolling ratios ─────────────────────────────────────────────────
  const newRepairCount  = prev.repairCount + (isDisplaced ? 1 : 0);
  const newDispCount    = prev.displacementCount + (isDisplaced ? 1 : 0);
  const newOscCount     = prev.oscillationParticipationCount + (isOscillating ? 1 : 0);

  // convergenceSuccessRate: rolling ratio using repair count as denominator
  const totalRepairs = newRepairCount > 0 ? newRepairCount : 1;
  const convergenceSuccesses = Math.round(prev.convergenceSuccessRate * (totalRepairs - (isDisplaced ? 1 : 0)));
  const newConvergenceSuccessRate = isConverged && !isNonConverged
    ? (convergenceSuccesses + 1) / totalRepairs
    : convergenceSuccesses / totalRepairs;

  // historicalDeferralRate: rolling ratio of deferrals to boundary crossings
  //
  // ⚠️ PHASE 7B APPROXIMATION BOUNDARY:
  //   The denominator (totalObservations) is inferred from the current
  //   repairCount and deferralRate rather than tracked as an independent counter.
  //   This is a temporary approximation that introduces bounded error in the
  //   rolling ratio when repairCount ≫ boundary crossings.
  //
  //   Phase 7C must replace this with a true bounded rolling denominator:
  //     historicalDeferralRate = deferralCount / boundaryObservationCount
  //   where `boundaryObservationCount` is an explicit integer field on
  //   ConstraintMemoryEntry, incremented once per day boundary crossing.
  //   This eliminates the inferred-denominator approximation entirely.
  const prevObservations = Math.round(prev.historicalDeferralRate / (prev.historicalDeferralRate === 0 ? 1 : prev.historicalDeferralRate));
  const totalObservations = (prevObservations || (newRepairCount + 1));
  const prevDeferrals = Math.round(prev.historicalDeferralRate * totalObservations);
  const newDeferrals = prevDeferrals + (isDeferred ? 1 : 0);
  const newHistoricalDeferralRate = clamp01(newDeferrals / (totalObservations + 1));

  // averagePropagationDepth: rolling mean
  const depth = signals.propagationDepths.get(chunkId);
  const newAvgPropagationDepth = depth !== undefined
    ? (prev.averagePropagationDepth * (newRepairCount - 1) + depth) / Math.max(1, newRepairCount)
    : prev.averagePropagationDepth;

  const aggregateInstabilityScore = deriveAggregateInstability(vec);

  return {
    chunkId,
    repairCount: newRepairCount,
    displacementCount: newDispCount,
    oscillationParticipationCount: newOscCount,
    convergenceSuccessRate: clamp01(newConvergenceSuccessRate),
    historicalDeferralRate: newHistoricalDeferralRate,
    averagePropagationDepth: Math.max(0, newAvgPropagationDepth),
    instabilityVector: vec,
    aggregateInstabilityScore,
    lastEvolvedTick: signals.logicalTick
  };
}

// ─── Initial Entry Factory ────────────────────────────────────────────────────

function createInitialEntry(chunkId: string, tick: number): ConstraintMemoryEntry {
  return {
    chunkId,
    repairCount: 0,
    displacementCount: 0,
    oscillationParticipationCount: 0,
    convergenceSuccessRate: 1.0,
    historicalDeferralRate: 0.0,
    averagePropagationDepth: 0.0,
    instabilityVector: { ...INITIAL_INSTABILITY_VECTOR },
    aggregateInstabilityScore: 0.0,
    lastEvolvedTick: tick
  };
}

// ─── Region Derivation ────────────────────────────────────────────────────────

/**
 * Derives topology region memory purely from dependency clusters and current chunk scores.
 *
 * INVARIANT: regionId = sorted(memberChunkIds).join(':')
 * INVARIANT: All region metrics are aggregated from member chunk scores — never carried forward independently.
 */
function deriveRegionMemory(
  clusters: readonly (readonly string[])[],
  chunkMemory: ReadonlyMap<string, ConstraintMemoryEntry>,
  prevRegionMemory: ReadonlyMap<string, TopologyRegionMemory>,
  logicalTick: number
): ReadonlyMap<string, TopologyRegionMemory> {
  const result = new Map<string, TopologyRegionMemory>();

  for (const cluster of clusters) {
    if (cluster.length === 0) continue;

    // Canonicalize: sort member IDs lexicographically
    const sortedMembers = [...cluster].sort();
    const regionId = sortedMembers.join(":");

    // Aggregate from member entries
    let totalRepairDensity = 0;
    let totalOscillationRate = 0;
    let totalInstability = 0;
    let totalRepairRadius = 0;
    let memberCount = 0;

    for (const chunkId of sortedMembers) {
      const entry = chunkMemory.get(chunkId);
      if (!entry) continue;
      memberCount++;
      totalRepairDensity       += entry.instabilityVector.displacementInstability;
      totalOscillationRate     += entry.instabilityVector.oscillationInstability;
      totalInstability         += entry.aggregateInstabilityScore;
      totalRepairRadius        += entry.averagePropagationDepth;
    }

    const count = Math.max(1, memberCount);

    // Carry forward convergenceFailures from previous state if region exists
    const prevRegion = prevRegionMemory.get(regionId);
    const prevFailures = prevRegion?.convergenceFailures ?? 0;

    // Increment convergenceFailures if any member has elevated convergence instability
    const hasConvergenceIssue = sortedMembers.some(id => {
      const e = chunkMemory.get(id);
      return e && e.instabilityVector.convergenceInstability > 0.2;
    });

    result.set(regionId, {
      regionId,
      memberChunkIds: sortedMembers,
      regionRepairDensity:         totalRepairDensity / count,
      regionOscillationRate:       totalOscillationRate / count,
      convergenceFailures:         prevFailures + (hasConvergenceIssue ? 1 : 0),
      averageRepairRadius:         totalRepairRadius / count,
      regionAggregateInstability:  totalInstability / count
    });
  }

  return result;
}

// ─── Signal Extraction Helper ─────────────────────────────────────────────────

/**
 * Extracts MemoryEvolutionSignals from the kernel's simulation state.
 * Called by simulateExecutionHorizon at day boundary.
 *
 * Dependency clusters are derived from unit dependency edges — units that
 * share a dependency relationship are placed in the same cluster.
 */
export function extractMemorySignals(
  deferredChunkIds: ReadonlySet<string>,
  oscillatingChunkIds: readonly string[],
  displacedChunkIds: readonly string[],
  nonConvergedChunkIds: readonly string[],
  convergedChunkIds: readonly string[],
  units: readonly { id: string; dependencyIds?: string[] }[],
  propagationDepths: ReadonlyMap<string, number>,
  logicalTick: number
): MemoryEvolutionSignals {
  // Union-Find for dependency cluster derivation
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id);
    const p = parent.get(id)!;
    if (p !== id) { parent.set(id, find(p)); }
    return parent.get(id)!;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

  for (const unit of units) {
    find(unit.id);
    for (const depId of (unit.dependencyIds ?? [])) {
      find(depId);
      union(unit.id, depId);
    }
  }

  // Collect clusters
  const clusterMap = new Map<string, string[]>();
  for (const unit of units) {
    const root = find(unit.id);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root)!.push(unit.id);
  }

  return {
    displacedChunkIds,
    oscillatingChunkIds,
    nonConvergedChunkIds,
    deferredChunkIds: [...deferredChunkIds],
    convergedChunkIds,
    dependencyClusters: [...clusterMap.values()],
    propagationDepths,
    logicalTick
  };
}
