// ─────────────────────────────────────────────────────────────────────────────
// ConstraintMemoryTypes
//
// Defines the replay-visible, immutable memory substrate for Phase 7B.
//
// DESIGN INVARIANTS:
//   1. All instability dimensions are bounded [0.0, 1.0].
//      Enforcement: clamp() is applied at every mutation boundary.
//   2. Decay ALWAYS executes before reinforcement in evolveConstraintMemory.
//      This guarantees boundedness and prevents runaway accumulation.
//   3. Region aggregation is derived purely from member chunk scores.
//      Region IDs are topology-derived (sorted member IDs, joined by ':').
//      Region state is therefore fully replay-reconstructable from events alone.
//   4. ConstraintMemoryState is immutable — evolution always produces new objects.
//      No hidden caches. No in-place mutation. No lazy recalculation.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Per-Chunk Memory ────────────────────────────────────────────────────────

/**
 * Multi-dimensional instability vector for a single chunk.
 *
 * Each dimension captures a distinct causal failure mode, enabling
 * future adaptive policies to react differently per instability source
 * without requiring scalar collapse or future schema migration.
 *
 * ALL dimensions are bounded [0.0, 1.0]. Clamping is applied at every
 * evolution boundary — never rely on upstream callers to clamp.
 */
export interface InstabilityVector {
  /**
   * Displacement instability.
   * Increases when the chunk is evicted from its slot during repair.
   * Decays on successful convergence.
   *
   * DECAY CLASS: TEMPORAL (transient) — persistence aging factor: 0.78/session.
   * Displacement frequently resolves with capacity normalization. Aggressive
   * cross-session decay prevents over-penalizing chunks for past overload events.
   */
  displacementInstability: number;

  /**
   * Oscillation instability.
   * Increases when the chunk participates in a repair-storm cycle
   * (i.e., repaired → displaced → repaired again within a short window).
   * Decays when convergence is maintained across multiple boundaries.
   *
   * DECAY CLASS: STRUCTURAL (chronic) — persistence aging factor: 0.92/session.
   * Oscillation indicates deep dependency conflicts that rarely self-resolve.
   * Slow decay preserves this hard-won structural knowledge across sessions.
   */
  oscillationInstability: number;

  /**
   * Convergence instability.
   * Increases when a repair cycle containing this chunk fails to converge
   * (terminates with max_repairs_reached or unresolvable_conflict).
   * Decays when convergence succeeds.
   *
   * DECAY CLASS: STRUCTURAL (chronic) — persistence aging factor: 0.92/session.
   * Convergence failures indicate systemic constraint violations that require
   * explicit topology changes to resolve.
   */
  convergenceInstability: number;

  /**
   * Deferral instability.
   * Increases when the chunk is carried forward to a subsequent day.
   * Represents chronically unschedulable chunks.
   * Decays slowly as the chunk successfully completes across days.
   *
   * DECAY CLASS: TEMPORAL (transient) — persistence aging factor: 0.78/session.
   * Deferral can result from temporary capacity pressure or voluntary scheduling
   * decisions. Aggressive decay avoids penalizing chunks for past deferrals that
   * have since resolved.
   */
  deferralInstability: number;
}

/**
 * Deterministic historical record for one chunk across a planning horizon.
 *
 * Produced by evolveConstraintMemory(). Never mutated in place.
 */
export interface ConstraintMemoryEntry {
  readonly chunkId: string;

  // ── Raw Counters ────────────────────────────────────────────────────────────
  /** Total repair cycles this chunk was displaced in */
  readonly repairCount: number;
  /** Total times it was removed from a placed slot */
  readonly displacementCount: number;
  /** Total times it participated in a storm/oscillation cycle */
  readonly oscillationParticipationCount: number;

  // ── Rolling Ratios ──────────────────────────────────────────────────────────
  /**
   * Fraction of repair cycles that converged without re-displacement of this chunk.
   * Rolling ratio over all observed repair cycles involving this chunk.
   */
  readonly convergenceSuccessRate: number;
  /**
   * Fraction of day boundaries where this chunk was carried forward (deferred).
   * Rolling ratio: deferralCount / boundaryObservationCount.
   */
  readonly historicalDeferralRate: number;
  /**
   * True denominator for historicalDeferralRate (replaces Phase 7B approximation).
   * Persisted verbatim to allow exact rolling updates across sessions.
   */
  readonly boundaryObservationCount: number;
  /**
   * Deterministic rolling mean of the propagation depth in repair events
   * where this chunk was the source or a primary casualty.
   */
  readonly averagePropagationDepth: number;

  // ── Lineage Metadata ────────────────────────────────────────────────────────
  /**
   * Tracks rechunk inheritance depth to bound entropy (MAX_LINEAGE_DEPTH = 5).
   * Fresh chunks start at 0. Rechunk descendants inherit parent + 1.
   */
  readonly mutationGeneration: number;
  /**
   * True if this entry had its instability halved due to crossing the max lineage depth.
   * Useful for audit traces and replay observability.
   */
  readonly deepInheritanceFlag: boolean;

  // ── Multi-Dimensional Instability Vector ────────────────────────────────────
  /**
   * Per-source instability scores, each bounded [0.0, 1.0].
   * INVARIANT: All components remain within [0.0, 1.0] after every evolution.
   */
  readonly instabilityVector: InstabilityVector;

  /**
   * Aggregate composite score derived deterministically from instabilityVector.
   * Formula: weighted sum of vector components, clamped to [0.0, 1.0].
   * Weights: displacement=0.35, oscillation=0.30, convergence=0.20, deferral=0.15
   *
   * Used for scheduling bias. Kept separate from vector dimensions so
   * future policies can use raw dimensions for fine-grained decisions.
   */
  readonly aggregateInstabilityScore: number;

  /** Logical tick at which this entry was last evolved. For replay ordering validation. */
  readonly lastEvolvedTick: number;
}

// ─── Per-Region Memory ────────────────────────────────────────────────────────

/**
 * Stability characterization for a topology region (dependency cluster).
 *
 * INVARIANT A: regionId is derived deterministically as:
 *   sorted(memberChunkIds).join(':')
 *   This is topology-derived and replay-reconstructable. No runtime-generated IDs.
 *
 * INVARIANT B (Topology Continuity — Phase 7C enforcement required):
 *   Region IDs must remain reconstructable from topology at every replay boundary.
 *   Mutation operations (chunk split, merge, rechunk) must propagate region
 *   membership deterministically. A mutation that produces new chunkIds must
 *   derive their region membership from their lineage root's prior region.
 *
 * INVARIANT C (Orphan Prevention — Phase 7C enforcement required):
 *   Mutation lineage must never orphan region memory.
 *   When a chunk is split: both children must inherit the parent's regionId
 *     if they share the same dependency cluster.
 *   When chunks are merged: the merged chunk's regionId is derived from the
 *     union of parent member sets, sorted lexicographically.
 *   Orphaned region memory (regions with no living member chunks) must be
 *     explicitly tombstoned in the memory state, not silently dropped.
 */
export interface TopologyRegionMemory {
  readonly regionId: string;

  /** Stable, sorted set of chunk IDs belonging to this region */
  readonly memberChunkIds: readonly string[];

  /**
   * Average instability aggregate score across member chunks.
   * Re-aggregated from member ConstraintMemoryEntry values on every evolution.
   */
  readonly regionRepairDensity: number;

  /**
   * Average oscillation instability across member chunks.
   */
  readonly regionOscillationRate: number;

  /**
   * Number of day boundary crossings where at least one member chunk
   * failed to converge (was still deferred/displaced after boundary).
   */
  readonly convergenceFailures: number;

  /**
   * Deterministic rolling mean of blast radius across all repairs
   * where any member chunk was a source or primary casualty.
   */
  readonly averageRepairRadius: number;

  /** Aggregate instability of the region: mean of member aggregateInstabilityScore */
  readonly regionAggregateInstability: number;
}

// ─── Global Memory Projection ─────────────────────────────────────────────────

/**
 * Replay-visible, immutable global constraint memory state.
 *
 * Produced at each day boundary. Snapshot-compressible.
 * All fields are derivable from (initialMemoryState + events) for replay.
 */
export interface ConstraintMemoryState {
  /**
   * Per-chunk historical memory.
   * Key: chunkId. Value: ConstraintMemoryEntry.
   * Chunks not yet observed are absent (not null) — callers must handle absence.
   */
  readonly chunkMemory: ReadonlyMap<string, ConstraintMemoryEntry>;

  /**
   * Per-region stability characterization.
   * Key: regionId (topology-derived). Value: TopologyRegionMemory.
   * Re-derived from chunkMemory on every evolution.
   */
  readonly topologyRegionMemory: ReadonlyMap<string, TopologyRegionMemory>;

  /** The logical tick at which this state was produced. */
  readonly evolutionTick: number;
}

// ─── Initial State ────────────────────────────────────────────────────────────

export const INITIAL_INSTABILITY_VECTOR: InstabilityVector = {
  displacementInstability: 0,
  oscillationInstability: 0,
  convergenceInstability: 0,
  deferralInstability: 0
};

export const INITIAL_CONSTRAINT_MEMORY: ConstraintMemoryState = {
  chunkMemory: new Map(),
  topologyRegionMemory: new Map(),
  evolutionTick: 0
};

// ─── Helper Factories ─────────────────────────────────────────────────────────

export function createFreshConstraintMemoryEntry(chunkId: string, tick: number): ConstraintMemoryEntry {
  return {
    chunkId,
    repairCount: 0,
    displacementCount: 0,
    oscillationParticipationCount: 0,
    convergenceSuccessRate: 1.0,
    historicalDeferralRate: 0.0,
    boundaryObservationCount: 0,
    averagePropagationDepth: 0.0,
    mutationGeneration: 0,
    deepInheritanceFlag: false,
    instabilityVector: { ...INITIAL_INSTABILITY_VECTOR },
    aggregateInstabilityScore: 0.0,
    lastEvolvedTick: tick
  };
}

// ─── Instability Weights ──────────────────────────────────────────────────────

/**
 * Canonical weights for aggregate instability score derivation.
 * Sum must equal 1.0. These are invariant — do not modify without
 * updating the comment in ConstraintMemoryEntry.aggregateInstabilityScore.
 */
export const INSTABILITY_WEIGHTS = {
  displacement: 0.35,
  oscillation: 0.30,
  convergence: 0.20,
  deferral: 0.15
} as const;

/**
 * Cross-session persistence aging decay factors per ADR-002 Decision 4.5.
 *
 * Structural dimensions (oscillation, convergence) decay slowly — they encode
 * chronic topology-rooted constraints that rarely self-resolve.
 *
 * Temporal dimensions (displacement, deferral) decay aggressively — they
 * encode transient conditions that frequently resolve with capacity normalization.
 *
 * Applied as: agedValue = value * (factor ^ sessionsSinceEvolution)
 * These are ARCHITECTURAL INVARIANTS. Do not make configurable.
 */
export const PERSISTENCE_DECAY_FACTORS = {
  /** Temporal decay: displacement, deferral — fast forgetting */
  temporal: 0.78,
  /** Structural decay: oscillation, convergence — slow forgetting */
  structural: 0.92
} as const;

/**
 * Derive aggregate instability score from vector.
 * Always bounded [0.0, 1.0] if vector components are bounded.
 */
export function deriveAggregateInstability(v: InstabilityVector): number {
  return Math.min(1.0, Math.max(0.0,
    v.displacementInstability * INSTABILITY_WEIGHTS.displacement +
    v.oscillationInstability   * INSTABILITY_WEIGHTS.oscillation   +
    v.convergenceInstability   * INSTABILITY_WEIGHTS.convergence   +
    v.deferralInstability      * INSTABILITY_WEIGHTS.deferral
  ));
}
