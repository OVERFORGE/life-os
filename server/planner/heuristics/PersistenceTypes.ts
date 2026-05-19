/**
 * Phase 7C.1: Persistence Record Schema
 *
 * Defines the pure serialization shape for Persistent Adaptive Memory.
 * No runtime orchestration logic, no hydration, no physical storage coupling.
 *
 * All definitions here adhere to ADR-002 requirements:
 * - schemaVersion for fail-fast migration validation
 * - evictedChunkIds for C-7 replay transparency
 * - lineage metadata structures for rechunk tracking
 */

import { ConstraintMemoryEntry, TopologyRegionMemory } from "./ConstraintMemoryTypes";

export const CURRENT_PERSISTENCE_SCHEMA_VERSION = "1.0";
export type PersistenceSchemaVersion = typeof CURRENT_PERSISTENCE_SCHEMA_VERSION;

/**
 * Explicit taxonomy of failure reasons for hydration rejection.
 * Rejections must fail-fast with one of these canonical reasons.
 */
export type HydrationFailureReason =
  | "schema_version_mismatch"
  | "duplicate_authority_violation"
  | "tick_continuity_violation"
  | "referential_closure_failure"
  | "lineage_cyclic_ancestry"
  | "lineage_depth_violation"
  | "vector_bounds_violation"
  | "non_finite_persistence_number"
  | "non_canonical_serialization"
  | "reconstructable_field_purity_violation"
  | "topology_monotonicity_violation";

/**
 * Hydration process is strictly pipelined.
 * This tracks which phase failed for debugging attribution.
 */
export type HydrationPhase =
  | "schema_validation"          // Pass 1: raw DTO shape and versions
  | "referential_validation"     // Pass 2: semantic graph and acyclicity
  | "canonical_reconstruction"   // Pass 3: rebuild intermediate projection
  | "map_instantiation";         // Pass 4: build runtime structures

/**
 * Structured error thrown during hydration failures.
 * Never degrades gracefully — fail-fast prevents historical divergence.
 */
export interface HydrationError {
  readonly phase: HydrationPhase;
  readonly reason: HydrationFailureReason;
  readonly message: string;
}

/**
 * Lineage mutation types recognized by Phase 7C.4 reconstruction.
 */
export type MutationType = 
  | "split"   // Chunk divided into N smaller chunks
  | "merge"   // Multiple chunks combined into 1
  | "rechunk" // Same logical task, new chunk IDs (carries instability inheritance)
  | "rewire"; // Dependency graph altered (forces region recalculation)

/**
 * Tracks topology churn events across persistence boundaries.
 * Used by hydration (Phase 7C.2) and lineage reconstruction (Phase 7C.4)
 * to maintain stability history for chunks that change identity.
 */
export interface MutationLineageRecord {
  /**
   * Deterministic unique identity for this mutation.
   * Derived as: hash(type + sorted(sourceChunkIds) + sorted(targetChunkIds) + mutationTick)
   * Required for replay hashing and deduplication.
   */
  readonly lineageId: string;

  /** The mutation action that occurred */
  readonly type: MutationType;
  
  /** Original chunk IDs before mutation */
  readonly sourceChunkIds: readonly string[];
  
  /** New chunk IDs created by mutation */
  readonly targetChunkIds: readonly string[];
  
  /**
   * Logical tick when mutation occurred.
   * Ensures causality ordering during reconstruction.
   */
  readonly mutationTick: number;
}

/**
 * A persistence-only projection of a chunk's memory entry.
 * Explicitly OMITS all fields classified as 'Reconstructable' in ADR-001
 * (e.g., aggregateInstabilityScore).
 * 
 * If derived values were persisted, schema migrations would become
 * exponentially harder, and deep equality would break.
 */
export type PersistedConstraintMemoryEntry = Omit<
  ConstraintMemoryEntry,
  "aggregateInstabilityScore"
>;

/**
 * A persistence-only projection of a region's memory entry.
 * Explicitly OMITS all Reconstructable fields (only members/failures are persisted).
 */
export type PersistedTopologyRegionMemory = Pick<
  TopologyRegionMemory,
  "regionId" | "memberChunkIds" | "convergenceFailures"
>;

/**
 * The pure serialized shape of ConstraintMemoryState.
 * This is what is physically stored by the PersistenceAdapter.
 */
export interface PersistentMemoryRecord {
  /**
   * Version of the persistence schema.
   * Hydration must fail-fast if this does not match CURRENT_PERSISTENCE_SCHEMA_VERSION.
   * Strict literal type enforces validation at compile-time boundary as well.
   */
  readonly schemaVersion: PersistenceSchemaVersion;

  /**
   * The structural completeness quality of this snapshot.
   * "complete" = fully converged memory state.
   * "partial" = max_repairs_reached (fallback).
   * A partial snapshot must never silently masquerade as a complete one.
   */
  readonly persistenceQuality: "complete" | "partial";

  /**
   * Logical tick of the planner at the time of persistence.
   * Used to guarantee temporal continuity.
   */
  readonly evolutionTick: number;

  /**
   * List of chunk IDs that were explicitly evicted during compaction (C-1 -> C-6).
   * Ensures C-7 Replay-Transparent Eviction.
   * INVARIANT: MUST be lexicographically sorted before serialization.
   */
  readonly evictedChunkIds: readonly string[];

  /**
   * Serialized state of surviving chunk memory entries (omitting derived values).
   * Array layout ensures lexicographic ordering is maintained during serialization.
   * DO NOT USE THIS ARRAY AS RUNTIME AUTHORITY (must hydrate into Map).
   */
  readonly chunks: readonly PersistedConstraintMemoryEntry[];

  /**
   * Serialized state of surviving topology regions (omitting derived values).
   * Array layout ensures lexicographic ordering is maintained during serialization.
   * DO NOT USE THIS ARRAY AS RUNTIME AUTHORITY (must hydrate into Map).
   */
  readonly regions: readonly PersistedTopologyRegionMemory[];

  /**
   * Lineage trace of mutations that have occurred since the last full persistence sync.
   * Required for inheriting instability scores across changing chunk IDs.
   */
  readonly lineageTrace: readonly MutationLineageRecord[];
}
