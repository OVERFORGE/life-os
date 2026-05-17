# ADR-002: Persistent Adaptive Memory & Replay Hydration

**Status:** Accepted — Pre-implementation specification for Phase 7C  
**Phase:** 7C prerequisite (authored pre-Phase 7C)  
**Authors:** Orchestration Kernel Design  
**Date:** 2026-05-17  
**Depends on:** ADR-001 (Deterministic Adaptive State)

---

## Context

Phase 7B established a deterministic, horizon-local constraint memory substrate.
Memory evolves within a single `simulateExecutionHorizon` call and is fully
reset at the start of each new planning session.

Phase 7C introduces **cross-session memory persistence**: the ability to carry
`ConstraintMemoryState` across planning session boundaries so that instability
history learned in one session informs scheduling decisions in future sessions.

This is a fundamental architectural expansion. Persistence introduces:
- **Serialization/deserialization boundaries** where type safety cannot be guaranteed
- **Compaction requirements** to prevent unbounded memory growth
- **Hydration invariants** that govern how persisted state is restored into a live runtime
- **Lineage continuity problems** when chunk topology changes between sessions
- **Staleness risk** where ancient instability scores distort scheduling for chunks
  that have since become stable

This ADR formally defines the contracts that Phase 7C implementation must satisfy
before any persistent memory is introduced.

---

## Persistence Model Overview

```
Session N:
  simulateExecutionHorizon(...)
    → ConstraintMemoryState (horizon-local, volatile)
    → [COMPACTION GATE] → filter extinct/stale entries
    → PersistentMemoryRecord (serialized to storage)

Session N+1:
  hydrateMemoryFromPersistence(PersistentMemoryRecord, currentTopology)
    → HydratedConstraintMemoryState (verified, reconstructed)
    → simulateExecutionHorizon(..., initialMemory: HydratedConstraintMemoryState)
```

The **Compaction Gate** and **Hydration** steps are where correctness is enforced.
Both must be deterministic and auditable.

---

## Decision 1: Persistence Boundaries

**Decision:**  
Memory persistence occurs at exactly one boundary: **session end**, after the
final `day_boundary_crossed` event has been processed and the terminal
`ConstraintMemoryState` has been produced.

No intermediate persistence occurs within a session. Intra-session checkpointing
must use the existing `CompactExecutionTrace` mechanism (snapshot-based),
not persistent memory writes.

**Rationale:**  
Mid-session persistence introduces partial-state writes that are incompatible
with the atomic compaction requirement. A persisted memory record must represent
a complete, self-contained state — not a state in the middle of event processing.

**Permitted persistence triggers:**
1. Session completes normally (`event_sequence_exhausted`)
2. Session terminates with `all_chunks_complete`
3. Session terminates with `max_repairs_reached` (with a `PARTIAL` quality flag)

**Forbidden persistence triggers:**
1. `unresolvable_conflict` — terminal state is undefined
2. Mid-event-sequence checkpoints
3. Any trigger that occurs while the event queue is non-empty

---

## Decision 2: Snapshot Hydration Invariants

A **replay-complete** hydrated memory state satisfies all of the following:

### H-1: Topology Consistency
All chunk IDs referenced in `chunkMemory` must exist in the current planning
topology. Chunk IDs present in the persistence record but absent from the
current topology are classified as **extinct** and must be handled by one of:
- **Tombstoning**: retained with a `tombstonedAt` tick field, zero instability
- **Eviction**: removed during compaction (see Decision 5)

The choice between tombstoning and eviction is governed by the mutation lineage
rules in Decision 6.

### H-2: Version Compatibility
The persistence record must include a `schemaVersion` field. Hydration must
fail-fast and surface an explicit error if `schemaVersion` does not match the
current runtime's expected version, rather than silently hydrating incompatible
data.

### H-3: Reconstructable Field Derivation
All fields classified as **Reconstructable** in ADR-001 INV-5 Criterion B must
NOT be read from the persistence record. They must be re-derived from the
persisted verbatim fields and the current topology.

Specifically:
- `aggregateInstabilityScore` → re-derived via `deriveAggregateInstability(instabilityVector)`
- All `TopologyRegionMemory` fields except `convergenceFailures` → re-derived from
  current chunk scores and dependency topology

### H-4: Tick Continuity
The `lastEvolvedTick` of each hydrated entry must be less than the first tick
of the new session. If not, the memory state is from a concurrent or future
session and must be rejected.

### H-5: Instability Vector Invariant
All hydrated `instabilityVector` components must satisfy `[0.0, 1.0]` bounds.
If any component falls outside bounds (e.g., due to schema migration or storage
corruption), the hydration must either:
- Clamp to `[0.0, 1.0]` with a warning log entry, OR
- Reject the entry and initialize a fresh `ConstraintMemoryEntry` for that chunk

Silent acceptance of out-of-bounds values is forbidden.

---

## Decision 3: Replay Restoration Guarantees

**Decision:**  
A replayed session that begins from a `HydratedConstraintMemoryState` must
produce the same terminal `ConstraintMemoryState` as the original session,
given identical subsequent event sequences.

**Formal guarantee:**  
```
replayFrom(
  hydratedMemory,
  sessionEvents
) == originalRun(
  hydratedMemory,
  sessionEvents
)
```

This guarantee holds **only if** the hydrated memory satisfies all H-1 through
H-5 invariants. Hydration that violates any invariant voids the replay guarantee.

**What this guarantee does NOT cover:**
- Sessions where chunk topology changed between the persistence point and
  hydration (lineage continuity rules apply — see Decision 6)
- Sessions where the `evolveConstraintMemory` evolution constants changed
  (a schema migration event must be recorded in this case)

---

## Decision 4: Memory Compaction Correctness

Compaction is the process of reducing the size of `ConstraintMemoryState` before
persistence to prevent unbounded growth. Compaction is **destructive by design**
— it permanently removes entries that are no longer useful.

### Compaction Rules (ordered by priority)

**Rule C-1: Extinct Chunk Eviction**  
Chunks absent from the current topology AND from all known lineage roots are
**extinct**. Their entries must be evicted from the persisted record.
Exception: chunks with non-zero `convergenceFailures` must be tombstoned
(not evicted) to preserve region convergence history.

**Rule C-2: Zero-Instability Eviction**  
Chunks where all `instabilityVector` components are `< 0.01` AND `repairCount == 0`
have never been unstable. Their entries may be evicted — they will be
re-initialized as fresh entries if they appear in a future session.

**Rule C-3: Dormant Region Compaction**  
Regions where all member chunks have either been evicted or have
`regionAggregateInstability < 0.05` for `N` consecutive sessions (recommended N=3)
are **dormant**. Their `TopologyRegionMemory` entries may be evicted.
The `convergenceFailures` counter is the only field that must survive eviction
(via the member chunks' entries, not the region entry itself).

**Rule C-4: Saturation Cooling**  
Chunks that have been at `aggregateInstabilityScore >= 0.9` for more than
`saturationCoolingThreshold` consecutive sessions without any new displacement,
oscillation, or deferral events are **saturated-stale**. Their instability
must be **decayed by 50%** before persistence.

Rationale: Long-lived saturation plateaus distort scheduling for chunks that
may have stabilized in practice. A chunk that was unstable 10 sessions ago
but has been clean for 5 sessions should not permanently suffer a 30% bias.

**Rule C-5: Memory Aging**  
All persisted instability vectors are subject to an **age decay** proportional
to the number of sessions since `lastEvolvedTick`. The decay formula:

```
agedInstability = instability * (agingDecayFactor ^ sessionsSinceEvolution)
agingDecayFactor = 0.85 (per session)
```

This ensures instability from ancient sessions exponentially approaches zero
rather than persisting indefinitely. After 10 sessions of inactivity, any
instability score is reduced to ≈`0.85^10 ≈ 0.2` of its original value.

**Rule C-6: Stale Instability Eviction**  
After age decay (C-5), chunks with `aggregateInstabilityScore < 0.01` are
eligible for eviction under Rule C-2. Age decay feeds into eviction naturally.

### Compaction Ordering

Compaction rules must be applied in this exact order to avoid evicting entries
that should be tombstoned:

```
C-4 (Saturation Cooling)
→ C-5 (Memory Aging)
→ C-6 (Stale Eviction, fed by C-5)
→ C-1 (Extinct Eviction)
→ C-2 (Zero-Instability Eviction, fed by C-6)
→ C-3 (Dormant Region Compaction)
```

### Compaction Determinism

Compaction must be deterministic. Given the same `ConstraintMemoryState` and
the same `currentTopology`, two compaction runs must produce identical
`PersistentMemoryRecord` outputs.

This requires:
- No wall-clock timestamps in compaction logic
- No random eviction selection
- All thresholds are explicit constants, not runtime parameters
- Iteration order is always lexicographic (sort by chunkId before processing)

---

## Decision 5: Lineage Continuity Across Persistence Reloads

When chunk topology changes between the session that produced the persistence
record and the session that hydrates it, the following rules govern memory
inheritance.

### Mutation Case 1: Chunk Split (A → B, C)
Both `B` and `C` inherit from `A`'s memory entry:
- `instabilityVector` → each child inherits 50% of parent's vector values
  (halved, not copied verbatim — dilution reflects uncertainty post-split)
- `repairCount` / `displacementCount` → NOT inherited (reset to 0)
  Rationale: repair semantics are not transferable to child chunks
- `convergenceSuccessRate` → inherited verbatim
- Region derivation: both children are placed in the same region as `A`
  if they share the same dependency cluster post-split

### Mutation Case 2: Chunk Merge (A, B → C)
`C` inherits the **maximum** instability vector across `A` and `B`:
- `instabilityVector.displacementInstability` = max(A.displacement, B.displacement)
- Same for all other vector dimensions
- `repairCount` = A.repairCount + B.repairCount
- `convergenceSuccessRate` = weighted mean by repairCount
- Region derivation: `C` inherits the union of A's and B's region memberships

### Mutation Case 3: Chunk Rechunk (same logical task, new chunk IDs)
The new chunk ID inherits the old chunk ID's full memory entry verbatim.
This is the only mutation case where full inheritance is correct, because
rechunking preserves task identity.

### Mutation Case 4: Dependency Rewiring
Region membership is re-derived from the new dependency topology. No prior
region memory is carried forward for chunks that changed dependency sets.
`convergenceFailures` for affected regions resets to 0.

### Lineage Record Requirement
All mutations must produce a lineage record in the persistence store:
```
{ mutationType: "split" | "merge" | "rechunk" | "rewire",
  parentChunkIds: string[],
  childChunkIds: string[],
  sessionTick: number }
```
This record is required for replay hydration to apply the correct inheritance
rules deterministically.

---

## Decision 6: Union-Find Cluster Determinism Under Mutation

The Union-Find algorithm used in `extractMemorySignals` for dependency cluster
derivation must remain deterministic under all four mutation cases.

**Invariant UF-1: Root Selection Determinism**  
When two clusters are merged by `union(a, b)`, the root selection must be
deterministic. Use lexicographic comparison of root IDs: always make the
lexicographically smaller root the new root.

Without this invariant, `find()` may return different roots across runs
depending on insertion order, making `regionId = sorted(roots).join(':')` vary.

**Invariant UF-2: Split Isolation**  
When chunk `A` splits into `B` and `C`, both are placed in new, independent
Union-Find trees initialized from A's prior dependency edges. They do not
share a tree unless an explicit dependency edge connects them.

**Invariant UF-3: Merge Identity**  
When chunks `A` and `B` merge into `C`, all of A's and B's dependency edges
are inherited by `C`. The Union-Find tree for `C` is constructed fresh from
the union of inherited edges.

**Invariant UF-4: Deterministic Processing Order**  
Union-Find must always process unit dependency edges in lexicographic order
by `(unitId, depId)` pair. Non-deterministic processing order can produce
different cluster shapes even with identical inputs.

---

## Pre-Phase 7C Implementation Checklist

Before any Phase 7C code is written, the following must be true:

- [ ] `ConstraintMemoryEntry` gains `boundaryObservationCount: number` field
      (resolves the Phase 7B `historicalDeferralRate` approximation boundary)
- [ ] `PersistentMemoryRecord` type is defined with `schemaVersion: string`
- [ ] `hydrateMemoryFromPersistence()` function is defined with H-1 through H-5
      invariant enforcement
- [ ] Compaction pipeline is defined with C-1 through C-6 rules in correct order
- [ ] Mutation lineage records are defined and emitted on all chunk mutations
- [ ] Union-Find invariants UF-1 through UF-4 are implemented and tested
- [ ] A causal cycle assertion (INV-6 from ADR-001) is added to the event
      injection path in `simulateExecutionHorizon`
- [ ] Phase 7B regression tests (32 tests) still pass after all additions

---

## Consequences

### Positive
- Cross-session memory enables the runtime to learn from historical planning
  sessions, producing progressively better scheduling decisions for chronically
  unstable chunks without requiring any stochastic behavior.
- Explicit compaction rules prevent unbounded memory growth and ensure the
  persistence layer remains operationally manageable.
- Lineage continuity rules ensure that chunk topology evolution (splits, merges)
  does not orphan or corrupt the historical memory substrate.

### Constraints on Phase 7C
- Memory persistence must be atomic. Partial writes that leave the persistence
  store in an intermediate state violate H-2 and H-5.
- The `schemaVersion` field must be incremented whenever any `ConstraintMemoryEntry`
  field changes type, is added, or is removed.
- Compaction must be idempotent: running compaction twice on the same input
  must produce the same output.
- No persistence-layer optimization (compression, delta encoding) may be
  introduced before replay hydration proofs exist for that optimization.
  Correctness precedes compression (see ADR-001).

---

## References

- ADR-001 — `ADR-001-deterministic-adaptive-state.md`
- `ConstraintMemoryTypes.ts` — INV-B, INV-C region continuity invariants
- `evolveConstraintMemory.ts` — Phase 7B approximation boundary markers
- `MemoryObservabilityTypes.ts` — Saturation and decay observability
- `simulateExecutionHorizon.ts` — Event injection site (INV-6 assertion needed)
- `hashConstraintMemoryDelta.ts` — Delta hashing (foundation for compaction diffing)
- `test-phase7b-constraint-memory.ts` — Regression baseline (32 tests)
