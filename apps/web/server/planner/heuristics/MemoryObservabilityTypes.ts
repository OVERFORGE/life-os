// ─────────────────────────────────────────────────────────────────────────────
// MemoryObservabilityTypes
//
// Pre-Phase 7C observability layer for constraint memory health monitoring.
//
// PURPOSE:
//   These metrics expose the health of the memory substrate before cross-horizon
//   persistence and chunk mutation arrive in Phase 7C. They are critical for:
//     - Detecting memory saturation before it distorts scheduling bias
//     - Identifying unstable topology regions for targeted reinforcement
//     - Measuring adaptation speed via decay half-life
//     - Ensuring reinforcement/decay balance remains bounded
//
// COMPUTATION:
//   All metrics are derived deterministically from ConstraintMemoryState.
//   No runtime-only state. All results are replay-reconstructable.
// ─────────────────────────────────────────────────────────────────────────────

import { ConstraintMemoryState } from "./ConstraintMemoryTypes";

// ─── Memory Health Metrics ────────────────────────────────────────────────────

/**
 * Snapshot of the health and saturation characteristics of the constraint memory.
 *
 * Computed by analyzeMemoryObservability() from a ConstraintMemoryState.
 * Safe to compute on every day boundary — O(chunks + regions).
 */
export interface MemoryObservabilityReport {
  // ── Memory Saturation ─────────────────────────────────────────────────────
  /**
   * Fraction of tracked chunks with aggregateInstabilityScore >= 0.7.
   * A value > 0.3 indicates broad memory saturation — many chunks are near-maximum
   * instability, which risks uniform bias flattening (all tasks equally deprioritized).
   * Bounded [0.0, 1.0].
   */
  memorySaturationRate: number;

  /**
   * Count of chunks currently at or above 0.9 aggregateInstabilityScore.
   * These are "critically saturated" chunks — near the instability ceiling.
   * If this count is high, consider whether decay rates need adjustment.
   */
  criticallySaturatedChunkCount: number;

  /**
   * Total chunks tracked in memory. Grows monotonically as new chunks
   * are observed. Used to detect memory cardinality growth.
   */
  totalTrackedChunks: number;

  // ── Region Instability Concentration ──────────────────────────────────────
  /**
   * The highest regionAggregateInstability across all tracked regions.
   * Identifies the single most fragile region in the current topology.
   * Bounded [0.0, 1.0].
   */
  peakRegionInstability: number;

  /**
   * Fraction of tracked regions with regionAggregateInstability >= 0.5.
   * A value > 0.4 means more than 40% of dependency clusters are unstable,
   * suggesting systemic topology fragility rather than isolated incidents.
   * Bounded [0.0, 1.0].
   */
  unstableRegionConcentration: number;

  /**
   * ID of the region with the highest aggregate instability.
   * Used to focus causal analysis and observability tracing.
   * Null if no regions are tracked.
   */
  mostInstableRegionId: string | null;

  // ── Decay Half-Life Estimate ───────────────────────────────────────────────
  /**
   * Estimated number of no-displacement ticks required for a maximally
   * saturated chunk (aggregateInstabilityScore = 1.0) to reach 0.5.
   *
   * Computed from the minimum decay rate across all vector dimensions:
   *   halfLife = ceil(0.5 / minDecayRate)
   *
   * This is deterministic from the decay constants in evolveConstraintMemory.
   * It does NOT change per-chunk — it is a system-level constant.
   *
   * A low half-life means the memory forgets quickly (responsive but noisy).
   * A high half-life means memory is persistent (stable but slow to adapt).
   */
  decayHalfLifeEstimate: number;

  // ── Reinforcement/Decay Ratio ─────────────────────────────────────────────
  /**
   * Net balance between reinforcement and decay events across the current tick.
   *
   * Ratio: totalReinforcementEvents / totalDecayEvents
   *   > 1.0 → more reinforcement than decay — system is accumulating instability
   *   < 1.0 → more decay than reinforcement — system is stabilizing
   *   = 1.0 → balanced
   *
   * Computed from the count of affected chunks in the last evolution step:
   *   reinforcementEvents = chunks that received any instability increase
   *   decayEvents = chunks that received only instability decrease
   *
   * Note: A chunk that received both decay and reinforcement in the same tick
   * counts as a reinforcement event (net positive change).
   */
  reinforcementToDecayRatio: number;

  /** Number of chunks that received net instability increase this evolution step */
  reinforcementEventCount: number;

  /** Number of chunks that received net instability decrease this evolution step */
  decayEventCount: number;

  /** Logical tick at which this report was computed */
  computedAtTick: number;
}

// ─── Analysis Function ────────────────────────────────────────────────────────

/**
 * Derives a MemoryObservabilityReport from a ConstraintMemoryState.
 *
 * Pure deterministic function — no side effects, no external state.
 * Safe to call on any ConstraintMemoryState at any replay boundary.
 *
 * @param memory       - The current memory state to analyze
 * @param prevMemory   - The previous memory state (for reinforcement/decay ratio)
 */
export function analyzeMemoryObservability(
  memory: ConstraintMemoryState,
  prevMemory: ConstraintMemoryState
): MemoryObservabilityReport {
  const chunks = [...memory.chunkMemory.values()];
  const regions = [...memory.topologyRegionMemory.values()];

  // ── Saturation metrics ─────────────────────────────────────────────────
  const saturatedChunks = chunks.filter(c => c.aggregateInstabilityScore >= 0.70);
  const criticallySaturated = chunks.filter(c => c.aggregateInstabilityScore >= 0.90);
  const memorySaturationRate = chunks.length > 0 ? saturatedChunks.length / chunks.length : 0;

  // ── Region concentration ───────────────────────────────────────────────
  let peakRegionInstability = 0;
  let mostInstableRegionId: string | null = null;
  for (const region of regions) {
    if (region.regionAggregateInstability > peakRegionInstability) {
      peakRegionInstability = region.regionAggregateInstability;
      mostInstableRegionId = region.regionId;
    }
  }
  const unstableRegions = regions.filter(r => r.regionAggregateInstability >= 0.5);
  const unstableRegionConcentration = regions.length > 0 ? unstableRegions.length / regions.length : 0;

  // ── Decay half-life estimate ───────────────────────────────────────────
  // Minimum decay rate across all vector dimensions (from evolveConstraintMemory constants)
  const MIN_DECAY_RATE = 0.03; // deferral decay — the slowest dimension
  const decayHalfLifeEstimate = Math.ceil(0.5 / MIN_DECAY_RATE);

  // ── Reinforcement/decay ratio ──────────────────────────────────────────
  let reinforcementEventCount = 0;
  let decayEventCount = 0;

  for (const chunk of chunks) {
    const prev = prevMemory.chunkMemory.get(chunk.chunkId);
    if (!prev) {
      // New chunk — counts as reinforcement (first instability accumulation)
      reinforcementEventCount++;
      continue;
    }
    const netChange = chunk.aggregateInstabilityScore - prev.aggregateInstabilityScore;
    if (netChange > 0.0001) reinforcementEventCount++;
    else if (netChange < -0.0001) decayEventCount++;
    // Changes within epsilon are neither — system at equilibrium for this chunk
  }

  const reinforcementToDecayRatio = decayEventCount > 0
    ? reinforcementEventCount / decayEventCount
    : reinforcementEventCount > 0 ? Infinity : 1.0;

  return {
    memorySaturationRate,
    criticallySaturatedChunkCount: criticallySaturated.length,
    totalTrackedChunks: chunks.length,
    peakRegionInstability,
    unstableRegionConcentration,
    mostInstableRegionId,
    decayHalfLifeEstimate,
    reinforcementToDecayRatio,
    reinforcementEventCount,
    decayEventCount,
    computedAtTick: memory.evolutionTick
  };
}
