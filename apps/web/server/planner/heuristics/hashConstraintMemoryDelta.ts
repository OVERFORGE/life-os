// ─────────────────────────────────────────────────────────────────────────────
// hashConstraintMemoryDelta
//
// Produces a canonical, deterministic string hash of a constraint memory delta.
//
// DETERMINISM GUARANTEE:
//   All inputs are canonicalized by lexicographic sort before serialization.
//   Map iteration order is NEVER relied upon — all entries are sorted by key
//   before hashing to prevent nondeterministic output across JS runtimes.
//
// INVARIANT: Given identical (prevMemory, nextMemory), this function MUST
//   produce byte-identical output across all replay runs.
// ─────────────────────────────────────────────────────────────────────────────

import { ConstraintMemoryState } from "./ConstraintMemoryTypes";

/**
 * Deterministic delta between two ConstraintMemoryState instances.
 * Carries only the changed chunk IDs and region IDs for inclusion in the
 * `constraint_memory_updated` event payload.
 */
export interface ConstraintMemoryDelta {
  readonly affectedChunkIds: readonly string[];
  readonly affectedRegionIds: readonly string[];
  readonly memoryDeltaHash: string;
}

/**
 * Computes the canonical memory delta between two states.
 *
 * Steps:
 * 1. Collect chunk IDs where aggregateInstabilityScore changed.
 * 2. Collect region IDs where regionAggregateInstability changed.
 * 3. Canonicalize both lists lexicographically.
 * 4. Serialize as stable JSON and hash via djb2.
 */
export function hashConstraintMemoryDelta(
  prevMemory: ConstraintMemoryState,
  nextMemory: ConstraintMemoryState
): ConstraintMemoryDelta {
  const affectedChunkIds: string[] = [];
  const affectedRegionIds: string[] = [];

  // 1. Detect changed chunks — compare aggregate scores
  //    Process next memory keys first (new + changed)
  for (const [chunkId, nextEntry] of nextMemory.chunkMemory) {
    const prevEntry = prevMemory.chunkMemory.get(chunkId);
    if (!prevEntry || prevEntry.aggregateInstabilityScore !== nextEntry.aggregateInstabilityScore) {
      affectedChunkIds.push(chunkId);
    }
  }
  // Also capture deleted chunks (shouldn't happen in Phase 7B, but be safe)
  for (const chunkId of prevMemory.chunkMemory.keys()) {
    if (!nextMemory.chunkMemory.has(chunkId)) {
      affectedChunkIds.push(chunkId);
    }
  }

  // 2. Detect changed regions
  for (const [regionId, nextRegion] of nextMemory.topologyRegionMemory) {
    const prevRegion = prevMemory.topologyRegionMemory.get(regionId);
    if (!prevRegion || prevRegion.regionAggregateInstability !== nextRegion.regionAggregateInstability) {
      affectedRegionIds.push(regionId);
    }
  }
  for (const regionId of prevMemory.topologyRegionMemory.keys()) {
    if (!nextMemory.topologyRegionMemory.has(regionId)) {
      affectedRegionIds.push(regionId);
    }
  }

  // 3. Lexicographic canonicalization — eliminates Map iteration nondeterminism
  affectedChunkIds.sort();
  affectedRegionIds.sort();

  // 4. Stable JSON serialization + djb2 hash
  const payload = stableJSON({
    chunkIds: affectedChunkIds,
    regionIds: affectedRegionIds,
    tick: nextMemory.evolutionTick,
    // Include key score values for changed chunks to detect score-identical ID changes
    chunkScores: affectedChunkIds.map(id => ({
      id,
      score: nextMemory.chunkMemory.get(id)?.aggregateInstabilityScore ?? -1
    }))
  });

  return {
    affectedChunkIds,
    affectedRegionIds,
    memoryDeltaHash: djb2Hash(payload)
  };
}

// ─── Stable Serialization ─────────────────────────────────────────────────────

/**
 * Produces deterministic JSON from a plain object.
 * Object keys are sorted lexicographically to eliminate key-order variance.
 * Arrays are preserved as-is (callers must pre-sort if order matters).
 */
function stableJSON(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableJSON).join(",") + "]";
  }
  const sortedKeys = Object.keys(value as object).sort();
  const pairs = sortedKeys.map(k =>
    `${JSON.stringify(k)}:${stableJSON((value as Record<string, unknown>)[k])}`
  );
  return "{" + pairs.join(",") + "}";
}

// ─── djb2 Hash ────────────────────────────────────────────────────────────────

/**
 * Classic djb2 string hash — deterministic, integer-safe, no external deps.
 * Returns a fixed-length hex string for use as a compact event hash field.
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & 0xffffffff; // keep it 32-bit signed
  }
  // Convert to unsigned hex for stable representation
  return (hash >>> 0).toString(16).padStart(8, "0");
}
