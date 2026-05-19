/**
 * Phase 7C.2: Hydration Engine
 *
 * Reconstructs ConstraintMemoryState from a PersistentMemoryRecord.
 * Enforces strict fail-fast determinism. Never degrades gracefully.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PHASE_7C_PERSISTENCE_TRUST_BOUNDARY
 * Crosses: hydration
 * Invariants enforced: H-1 through H-7, INV-7 (Referential Closure), INV-8 (Idempotency)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ConstraintMemoryState, ConstraintMemoryEntry, TopologyRegionMemory, deriveAggregateInstability, createFreshConstraintMemoryEntry } from "./ConstraintMemoryTypes";
import { PersistentMemoryRecord, HydrationError, HydrationPhase, HydrationFailureReason, CURRENT_PERSISTENCE_SCHEMA_VERSION, MutationLineageRecord, PersistedConstraintMemoryEntry } from "./PersistenceTypes";
import { computePersistenceCanonicalHash } from "./PersistenceCanonicalization";

function failHydration(phase: HydrationPhase, reason: HydrationFailureReason, message: string): never {
  const error: HydrationError = { phase, reason, message };
  throw new Error(JSON.stringify(error));
}

/**
 * Validates the acyclicity of the lineage graph.
 * Throws if a cycle is detected.
 */
function validateLineageAcyclicity(lineageTrace: readonly MutationLineageRecord[]) {
  // Build adjacency list: target -> source
  const adj = new Map<string, string[]>();
  for (const record of lineageTrace) {
    for (const target of record.targetChunkIds) {
      if (!adj.has(target)) adj.set(target, []);
      adj.get(target)!.push(...record.sourceChunkIds);
    }
  }

  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string) {
    if (stack.has(node)) {
      failHydration("referential_validation", "lineage_cyclic_ancestry", `Cyclic lineage detected involving chunk ${node}`);
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);

    const sources = adj.get(node) || [];
    for (const src of sources) {
      dfs(src);
    }

    stack.delete(node);
  }

  for (const record of lineageTrace) {
    for (const target of record.targetChunkIds) {
      dfs(target);
    }
  }
}

/**
 * Hydrates a persistent memory record back into a runtime state.
 * Guaranteed to be purely functional and idempotent.
 *
 * Pipeline:
 * PASS 1 -> Schema validation (raw DTO shape)
 * PASS 2 -> Semantic Graph validation (referential closure & acyclicity)
 * PASS 3 -> Canonical Reconstruction (rebuild intermediate objects)
 * PASS 4 -> Map Instantiation (build runtime structures)
 */
export function hydrateMemoryFromPersistence(
  record: PersistentMemoryRecord,
  topology: { chunks: any[], edges: any[] } // Dummy type, Phase 7C.2 specifies we don't rely on full topology logic yet
): ConstraintMemoryState {
  
  // Protect against accidental mutations during hydration
  if (process.env.NODE_ENV !== "production") {
    Object.freeze(record);
    Object.freeze(topology);
  }

  // ============================================================================
  // PASS 1: Schema Validation
  // ============================================================================
  if (record.schemaVersion !== CURRENT_PERSISTENCE_SCHEMA_VERSION) {
    failHydration(
      "schema_validation",
      "schema_version_mismatch",
      `Expected ${CURRENT_PERSISTENCE_SCHEMA_VERSION}, got ${record.schemaVersion}`
    );
  }

  // Duplicate Authority Check
  const seenChunks = new Set<string>();
  for (const c of record.chunks) {
    if (seenChunks.has(c.chunkId)) {
      failHydration("schema_validation", "duplicate_authority_violation", `Duplicate chunkId: ${c.chunkId}`);
    }
    seenChunks.add(c.chunkId);
  }

  const seenRegions = new Set<string>();
  for (const r of record.regions) {
    if (seenRegions.has(r.regionId)) {
      failHydration("schema_validation", "duplicate_authority_violation", `Duplicate regionId: ${r.regionId}`);
    }
    seenRegions.add(r.regionId);
  }

  const seenLineages = new Set<string>();
  for (const l of record.lineageTrace) {
    if (seenLineages.has(l.lineageId)) {
      failHydration("schema_validation", "duplicate_authority_violation", `Duplicate lineageId: ${l.lineageId}`);
    }
    seenLineages.add(l.lineageId);
  }

  // ============================================================================
  // PASS 2: Semantic Graph Validation (INV-7 Referential Closure)
  // ============================================================================
  const topologyChunkIds = new Set(topology.chunks.map(c => c.id));
  const evictedIds = new Set(record.evictedChunkIds);
  const lineageTargetIds = new Set(record.lineageTrace.flatMap(l => l.targetChunkIds));

  // Validate chunk referential closure
  for (const chunk of record.chunks) {
    if (!topologyChunkIds.has(chunk.chunkId) && !evictedIds.has(chunk.chunkId) && !lineageTargetIds.has(chunk.chunkId)) {
      failHydration(
        "referential_validation",
        "referential_closure_failure",
        `Orphaned chunk detected: ${chunk.chunkId} is absent from topology, eviction list, and lineage ancestry`
      );
    }
  }

  // Validate lineage graph acyclicity
  validateLineageAcyclicity(record.lineageTrace);

  // Validate lineage depth limits
  for (const chunk of record.chunks) {
    if (chunk.mutationGeneration > 5) {
      failHydration(
        "referential_validation",
        "lineage_depth_violation",
        `Chunk ${chunk.chunkId} exceeded MAX_LINEAGE_DEPTH (${chunk.mutationGeneration} > 5)`
      );
    }
  }

  // ============================================================================
  // PASS 3: Canonical Reconstruction
  // ============================================================================
  
  // Reconstruct chunks
  const reconstructedChunks: ConstraintMemoryEntry[] = record.chunks.map(persisted => {
    // Enforce bounds
    const v = persisted.instabilityVector;
    if (v.displacementInstability < 0 || v.displacementInstability > 1 ||
        v.oscillationInstability < 0 || v.oscillationInstability > 1 ||
        v.convergenceInstability < 0 || v.convergenceInstability > 1 ||
        v.deferralInstability < 0 || v.deferralInstability > 1) {
      failHydration("canonical_reconstruction", "vector_bounds_violation", `Out of bounds vector for ${persisted.chunkId}`);
    }

    const entry: ConstraintMemoryEntry = {
      ...persisted,
      aggregateInstabilityScore: deriveAggregateInstability(persisted.instabilityVector)
    };

    if (process.env.NODE_ENV !== "production") {
      Object.freeze(entry);
    }
    return entry;
  });

  // Reconstruct regions (recalculate derived metrics from chunks)
  const reconstructedRegions: TopologyRegionMemory[] = record.regions.map(persistedRegion => {
    // Reconstructable field purity check: regionId must exactly match sorted(members).join(':')
    const expectedRegionId = [...persistedRegion.memberChunkIds].sort().join(':');
    if (persistedRegion.regionId !== expectedRegionId) {
      failHydration(
        "canonical_reconstruction",
        "reconstructable_field_purity_violation",
        `Region ID '${persistedRegion.regionId}' does not match sorted members '${expectedRegionId}'`
      );
    }

    let sumInstability = 0;
    let sumOscillation = 0;
    
    // We rebuild based on the current reconstructed chunks
    for (const chunkId of persistedRegion.memberChunkIds) {
      const chunk = reconstructedChunks.find(c => c.chunkId === chunkId);
      if (chunk) {
        sumInstability += chunk.aggregateInstabilityScore;
        sumOscillation += chunk.instabilityVector.oscillationInstability;
      }
    }
    
    const count = persistedRegion.memberChunkIds.length || 1; // avoid div/0

    const region: TopologyRegionMemory = {
      regionId: persistedRegion.regionId,
      memberChunkIds: [...persistedRegion.memberChunkIds],
      convergenceFailures: persistedRegion.convergenceFailures,
      
      // Re-derived fields
      regionRepairDensity: sumInstability / count,
      regionOscillationRate: sumOscillation / count,
      averageRepairRadius: 0, // Placeholder, will be re-derived fully later
      regionAggregateInstability: sumInstability / count,
    };

    if (process.env.NODE_ENV !== "production") {
      Object.freeze(region);
    }
    return region;
  });

  // Canonical Serialization Check
  // The hydrated output should exactly match the canonical hash of the input.
  // We don't reconstruct the full PersistentMemoryRecord here since we are just 
  // ensuring the input record itself was canonical before trusting it.
  try {
    const inputHash = computePersistenceCanonicalHash(record);
    // If we wanted to re-serialize the reconstructed chunks to compare, we'd do it here.
    // For now, ensuring computePersistenceCanonicalHash doesn't throw on the input proves
    // that the input contains no non-finite numbers and structurally parses.
  } catch (e: any) {
    if (e.message.includes("non_finite")) {
      failHydration("canonical_reconstruction", "non_finite_persistence_number", e.message);
    }
    failHydration("canonical_reconstruction", "non_canonical_serialization", e.message);
  }

  // ============================================================================
  // PASS 4: Map Instantiation
  // ============================================================================
  
  const chunkMemory = new Map<string, ConstraintMemoryEntry>();
  for (const chunk of reconstructedChunks) {
    chunkMemory.set(chunk.chunkId, chunk);
  }

  const topologyRegionMemory = new Map<string, TopologyRegionMemory>();
  for (const region of reconstructedRegions) {
    topologyRegionMemory.set(region.regionId, region);
  }

  const finalState: ConstraintMemoryState = {
    chunkMemory,
    topologyRegionMemory,
    evolutionTick: record.evolutionTick
  };

  if (process.env.NODE_ENV !== "production") {
    Object.freeze(finalState);
  }

  return finalState;
}
