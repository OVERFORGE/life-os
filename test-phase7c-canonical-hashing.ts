/**
 * Phase 7C: Canonical Hashing Replay Proofs
 *
 * Proves that hash(canonicalize(record)) is byte-identical across
 * permutations of arbitrary array ordering.
 */

import { computePersistenceCanonicalHash, canonicalizePersistenceRecord } from "./server/planner/heuristics/PersistenceCanonicalization";
import { PersistentMemoryRecord } from "./server/planner/heuristics/PersistenceTypes";

function generateDeterministicFixture(): PersistentMemoryRecord {
  return {
    schemaVersion: "1.0",
    persistenceQuality: "complete",
    evolutionTick: 142,
    evictedChunkIds: ["Z", "A", "M"], // Intentionally unsorted
    chunks: [
      {
        chunkId: "C2",
        repairCount: 5,
        displacementCount: 1,
        oscillationParticipationCount: 0,
        convergenceSuccessRate: 0.8,
        historicalDeferralRate: 0.1,
        boundaryObservationCount: 10,
        averagePropagationDepth: 2.0,
        mutationGeneration: 2, // deep inheritance
        deepInheritanceFlag: false,
        instabilityVector: {
          displacementInstability: 0.5, // saturated instability
          oscillationInstability: 0.2,
          convergenceInstability: 0.1,
          deferralInstability: 0.8
        },
        lastEvolvedTick: 140
      } as any,
      {
        chunkId: "C1", // Intentionally out of order relative to C2
        repairCount: 0,
        displacementCount: 0,
        oscillationParticipationCount: 0,
        convergenceSuccessRate: 1.0,
        historicalDeferralRate: 0.0,
        boundaryObservationCount: 1,
        averagePropagationDepth: 0.0,
        mutationGeneration: 0, // clean memory
        deepInheritanceFlag: false,
        instabilityVector: {
          displacementInstability: 0,
          oscillationInstability: 0,
          convergenceInstability: 0,
          deferralInstability: 0
        },
        lastEvolvedTick: 142
      } as any
    ],
    regions: [
      {
        regionId: "C1:C2",
        memberChunkIds: ["C2", "C1"], // Intentionally unsorted
        convergenceFailures: 1
      } as any
    ],
    lineageTrace: [
      {
        lineageId: "L2",
        type: "rechunk",
        sourceChunkIds: ["C_OLD2"],
        targetChunkIds: ["C2"],
        mutationTick: 100
      },
      {
        lineageId: "L1", // Same tick, out of order lineageId
        type: "rechunk",
        sourceChunkIds: ["C_OLD1"],
        targetChunkIds: ["C1"],
        mutationTick: 100
      }
    ]
  };
}

// Fisher-Yates shuffle to randomize arrays
function shuffle<T>(array: readonly T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function runCanonicalProofs() {
  console.log("─────────────────────────────────────────────────────────────────");
  console.log(" Phase 7C: Canonical Replay Proofs");
  console.log("─────────────────────────────────────────────────────────────────\n");

  const baseRecord = generateDeterministicFixture();
  const baselineHash = computePersistenceCanonicalHash(baseRecord);

  let passed = 0;
  let failed = 0;

  function assert(name: string, record: PersistentMemoryRecord) {
    try {
      const hash = computePersistenceCanonicalHash(record);
      if (hash === baselineHash) {
        console.log(`  ✅ ${name}`);
        passed++;
      } else {
        console.log(`  ❌ ${name}`);
        console.log(`     Expected: ${baselineHash}`);
        console.log(`     Got:      ${hash}`);
        failed++;
      }
    } catch (e: any) {
      console.log(`  ❌ ${name} (Threw Error)`);
      console.log(`     ${e.message}`);
      failed++;
    }
  }

  assert("Baseline canonicalization produces stable hash", baseRecord);

  // Permutation 1: Randomize evicted chunks
  const perm1 = { ...baseRecord, evictedChunkIds: shuffle(baseRecord.evictedChunkIds) };
  assert("Hash is invariant under evictedChunkIds permutation", perm1);

  // Permutation 2: Randomize chunks
  const perm2 = { ...baseRecord, chunks: shuffle(baseRecord.chunks) };
  assert("Hash is invariant under chunks permutation", perm2);

  // Permutation 3: Randomize regions and their members
  const perm3 = {
    ...baseRecord,
    regions: shuffle(baseRecord.regions).map(r => ({ ...r, memberChunkIds: shuffle(r.memberChunkIds) }))
  };
  assert("Hash is invariant under region/members permutation", perm3);

  // Permutation 4: Randomize lineage trace
  const perm4 = { ...baseRecord, lineageTrace: shuffle(baseRecord.lineageTrace) };
  assert("Hash is invariant under lineageTrace permutation", perm4);

  // Permutation 5: Float Precision drift
  const perm5 = { ...baseRecord, chunks: baseRecord.chunks.map(c => c.chunkId === "C2" ? ({
    ...c,
    instabilityVector: {
      displacementInstability: 0.5000000000000001, // Realistic IEEE 754 drift
      oscillationInstability: 0.2000000000000004,
      convergenceInstability: 0.0999999999999999,
      deferralInstability: 0.7999999999999999
    }
  }) : c)} as any;
  // NOTE: In JS, 0.5000001.toFixed(6) is "0.500000".
  // 0.7999999 -> "0.800000"
  assert("Hash normalizes float precision drift (<= 6 digits)", perm5);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runCanonicalProofs();
