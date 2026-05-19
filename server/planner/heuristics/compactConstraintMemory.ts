/**
 * Phase 7C.3: Compaction Engine
 *
 * Compaction is NOT compression. It is causality-preserving forgetting.
 * The compaction engine decides:
 * - which historical instability still matters
 * - which causal signals remain behaviorally relevant
 * - which topology ancestry survives
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * PHASE_7C_PERSISTENCE_TRUST_BOUNDARY
 * Crosses: compaction
 * Invariants enforced: C-1 through C-7
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ConstraintMemoryState } from "./ConstraintMemoryTypes";
import { PersistentMemoryRecord, PersistedConstraintMemoryEntry, PersistedTopologyRegionMemory, CURRENT_PERSISTENCE_SCHEMA_VERSION } from "./PersistenceTypes";
import { canonicalizePersistenceRecord } from "./PersistenceCanonicalization";

/**
 * Transforms runtime memory state into a canonical persistent record.
 * 
 * Compaction Strategy (Pending Eviction Implementation):
 * Currently performs a pure 1:1 structural projection to prove:
 * hash(compact(hydrate(compact(M)))) === hash(compact(M))
 */
export function compactConstraintMemory(
  memory: ConstraintMemoryState,
  topology: { chunks: any[], edges: any[] } // Dummy type for now
): PersistentMemoryRecord {
  
  // 1. Build Chunk Projections
  // Explicitly omit reconstructable derived fields (aggregateInstabilityScore)
  const chunks: PersistedConstraintMemoryEntry[] = [];
  for (const [chunkId, entry] of memory.chunkMemory.entries()) {
    chunks.push({
      chunkId: entry.chunkId,
      repairCount: entry.repairCount,
      displacementCount: entry.displacementCount,
      oscillationParticipationCount: entry.oscillationParticipationCount,
      convergenceSuccessRate: entry.convergenceSuccessRate,
      historicalDeferralRate: entry.historicalDeferralRate,
      boundaryObservationCount: entry.boundaryObservationCount,
      averagePropagationDepth: entry.averagePropagationDepth,
      mutationGeneration: entry.mutationGeneration,
      deepInheritanceFlag: entry.deepInheritanceFlag,
      instabilityVector: { ...entry.instabilityVector },
      lastEvolvedTick: entry.lastEvolvedTick
    });
  }

  // 2. Build Region Projections
  // Explicitly omit reconstructable derived fields (densities, rates, averages)
  const regions: PersistedTopologyRegionMemory[] = [];
  for (const [regionId, region] of memory.topologyRegionMemory.entries()) {
    regions.push({
      regionId: region.regionId,
      memberChunkIds: [...region.memberChunkIds],
      convergenceFailures: region.convergenceFailures
    });
  }

  // 3. Construct Raw Record
  const rawRecord: PersistentMemoryRecord = {
    schemaVersion: CURRENT_PERSISTENCE_SCHEMA_VERSION,
    persistenceQuality: "complete", // Assumed complete for now until partial fallback is wired
    evolutionTick: memory.evolutionTick,
    evictedChunkIds: [], // Pending eviction logic
    chunks,
    regions,
    lineageTrace: [] // Pending lineage aggregation logic
  };

  // 4. Return canonicalized record
  // Forces strict semantics (lexicographic arrays, float normalization, etc)
  return canonicalizePersistenceRecord(rawRecord);
}
