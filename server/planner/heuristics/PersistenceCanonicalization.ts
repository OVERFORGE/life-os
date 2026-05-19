/**
 * Phase 7C: Persistence Canonicalization
 *
 * Provides deterministic, stable canonicalization and hashing for persistence records.
 * 
 * Rules:
 * 1. Lexicographic sorting of chunk IDs, region IDs, lineage arrays, and evicted arrays.
 * 2. Stable JSON object key ordering.
 * 3. Float normalization to prevent precision drift.
 */

import { createHash } from "crypto";
import { PersistentMemoryRecord } from "./PersistenceTypes";

/**
 * Explicit semantics for array canonicalization.
 * Enforces that all arrays passing through the persistence layer
 * carry an explicit sort contract, preventing implicit schema drift.
 */
export type CanonicalArraySemantics =
  | "lexicographic" // Semantically unordered arrays sorted alphabetically by their primary string ID
  | "causal_tick"   // Arrays sorted primarily by temporal tick (causality), secondarily by ID
  | "preserve";     // Strict order-dependent arrays (currently none exist in persistence)

/**
 * PHASE_7C_PERSISTENCE_TRUST_BOUNDARY
 * Crosses: serialization | hashing | hydration canonicalization
 * Invariants enforced: C-7 sorting, Hash Determinism
 */

// Simple robust deep sort for JSON objects
function deepSortKeys(obj: any): any {
  if (Array.isArray(obj)) {
    // Arrays must be sorted structurally before passing to deepSortKeys via canonicalizePersistenceRecord
    return obj.map(deepSortKeys);
  }
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = deepSortKeys(obj[key]);
        return acc;
      }, {} as Record<string, any>);
  }
  if (typeof obj === "number") {
    // Reject non-finite floats to prevent silent hydration corruption (JSON.stringify(NaN) -> null)
    if (!Number.isFinite(obj)) {
      throw new Error(`non_finite_persistence_number: ${obj}`);
    }
    // Normalization: limit precision to prevent cross-platform drift
    return Number(obj.toFixed(6));
  }
  return obj;
}

/**
 * Helper for explicit ASCII lexicographic comparison.
 * localeCompare is environment-sensitive and breaks replay determinism.
 */
function compareAscii(a: string, b: string): number {
  return a < b ? -1 : (a > b ? 1 : 0);
}

/**
 * Single internal dispatcher for deterministic array canonicalization.
 * Prevents schema drift by forcing explicit semantics on every array.
 */
function canonicalizeArray<T>(items: readonly T[], semantics: CanonicalArraySemantics, idSelector?: (item: T) => string, tickSelector?: (item: T) => number): T[] {
  const arr = [...items];
  if (arr.length === 0 || semantics === "preserve") {
    return arr;
  }
  
  if (semantics === "lexicographic") {
    if (typeof arr[0] === "string") {
      return (arr as unknown as string[]).sort(compareAscii) as unknown as T[];
    }
    if (!idSelector) throw new Error("lexicographic sorting of objects requires an idSelector");
    return arr.sort((a, b) => compareAscii(idSelector(a), idSelector(b)));
  }

  if (semantics === "causal_tick") {
    if (!idSelector || !tickSelector) throw new Error("causal_tick sorting requires both idSelector and tickSelector");
    return arr.sort((a, b) => {
      const tA = tickSelector(a);
      const tB = tickSelector(b);
      if (tA !== tB) return tA - tB;
      return compareAscii(idSelector(a), idSelector(b));
    });
  }

  throw new Error(`Unknown CanonicalArraySemantics: ${semantics}`);
}

/**
 * Returns a structurally identical but canonically sorted and float-normalized
 * clone of the provided PersistentMemoryRecord.
 * 
 * Arrays where order does not imply causality are sorted lexicographically.
 * Arrays where order implies causality (like lineageTrace) must be sorted by tick/id.
 */
export function canonicalizePersistenceRecord(record: PersistentMemoryRecord): PersistentMemoryRecord {
  const clone = JSON.parse(JSON.stringify(record)) as PersistentMemoryRecord;

  // 1. Lexicographically sort primitive arrays
  const evictedChunkIds = canonicalizeArray(clone.evictedChunkIds, "lexicographic");

  // 2. Lexicographically sort entity arrays by their primary IDs
  const chunks = canonicalizeArray(clone.chunks, "lexicographic", (c) => c.chunkId);
  const regions = canonicalizeArray(clone.regions, "lexicographic", (r) => r.regionId).map(r => ({
    ...r,
    memberChunkIds: canonicalizeArray(r.memberChunkIds, "lexicographic")
  }));

  // 3. Lineage arrays must be sorted by tick first, then by lineageId
  const lineageTrace = canonicalizeArray(clone.lineageTrace, "causal_tick", (l) => l.lineageId, (l) => l.mutationTick);

  const canonical = {
    schemaVersion: clone.schemaVersion,
    persistenceQuality: clone.persistenceQuality,
    evolutionTick: clone.evolutionTick,
    evictedChunkIds,
    chunks,
    regions,
    lineageTrace
  };

  // 4. Stable JSON key sort and float precision normalization
  return deepSortKeys(canonical) as PersistentMemoryRecord;
}

/**
 * Computes a deterministic SHA-256 hash of the canonicalized persistence record.
 * This is the ultimate proof mechanism for Hydration Idempotency (INV-8) and
 * Replay-Transparent Eviction (C-7).
 */
export function computePersistenceCanonicalHash(record: PersistentMemoryRecord): string {
  const canonical = canonicalizePersistenceRecord(record);
  const json = JSON.stringify(canonical);
  // Add schema salt to prevent cross-schema semantic collisions
  return createHash("sha256").update(`schema=${record.schemaVersion}|` + json).digest("hex");
}
