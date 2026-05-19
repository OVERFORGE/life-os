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

### H-6: Topology-Monotonic Hydration

Hydration may enrich the current runtime with historical instability context,
but must **never** mutate, rewrite, reorder, or structurally alter the live topology.

Formally: let `T` be the topology state before hydration, `T'` be the topology
state after hydration. The following must hold exactly:

```
T'.chunks    == T.chunks
T'.edges     == T.edges
T'.deadlines == T.deadlines
T'.eventQueue (length and ordering) is unchanged
```

The only permitted effect of hydration is enriching `PlannerSimulationState.constraintMemory`.

**Enforcement:** `hydrateMemoryFromPersistence(record, topology)` must return
`ConstraintMemoryState` only — never a modified topology object. The function
signature itself is the contract: it accepts topology as read-only input and
produces only a memory state as output. Any hydration function that returns a
modified topology is an architectural violation.

**Corollary:** If the current topology differs from the persisted topology
(chunks have been added, removed, or rewired), hydration must adapt the memory
state to match the current topology — not the other way around. The topology
is the authority; memory is the dependent.

### H-7: Arbitrary Array Ordering

Hydration must be deterministic under arbitrary array ordering.
Even if `chunks`, `regions`, `lineageTrace`, or `evictedChunkIds` arrive in randomized
order, hydration must reconstruct the identical runtime state. Serialization ordering
is a mechanical guarantee, but hydration logic must never couple its correctness to
that order (e.g., assuming parents arrive before children).

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
H-6 invariants and INV-8 (Hydration Idempotency). Hydration that violates any
invariant voids the replay guarantee.

To structurally enforce this, we introduce the **Canonical Replay Hash**:
`computeConstraintMemoryHash(memory)` must produce a canonical hash using
lexicographically sorted serialization. All persistence replay tests must
compare this hash instead of relying solely on deep object equality, as future
schema evolution may preserve semantic equality while changing physical object layout.

**What this guarantee does NOT cover:**
- Sessions where chunk topology changed between the persistence point and
  hydration (lineage continuity rules apply — see Decision 5)
- Sessions where the `evolveConstraintMemory` evolution constants changed
  (a schema migration event must be recorded in this case)
- Sessions where compaction was applied between the original run and replay
  (compaction must satisfy C-7: Replay-Transparent Eviction)

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

**Rule C-7: Replay-Transparent Eviction**  
For any entry evicted by rules C-1 through C-6, its absence in the hydrated
state must not alter the replay outcome for any surviving topology entity.

Formally: for compacted state `M_compact` ⊂ `M_full` (a proper subset of entries),
and any subsequent event sequence `E` that does not reference evicted chunk IDs:

```
replay(M_compact, E).terminalMemoryHash
  == replay(M_full, E).terminalMemoryHash
```

This invariant must be verified by `test-phase7c-persistence-replay.ts` before
any compaction rule is used in production.

**Enforcement:** The `PersistentMemoryRecord` must carry an `evictedChunkIds: string[]`
field listing all evicted chunk IDs. If any evicted chunk ID reappears in a
subsequent session's topology, it must be re-initialized as a fresh `ConstraintMemoryEntry`
— not silently resurrected from any zombie state. The eviction record is
consumed on hydration and then discarded.

---

## Decision 4.5: Instability Decay Classification — Structural vs. Temporal

Not all instability should persist and decay at the same rate. Phase 7C must
classify instability dimensions into two decay classes:

### Structural Instability (slow decay, persistent)

Instability arising from chronic, topology-rooted constraints — dependency
fragility, hard constraint violations, resource exclusion zones. These indicate
problems that will likely recur in future sessions regardless of capacity variation.

**Dimensions:** `oscillationInstability`, `convergenceInstability`  
**Persistence aging decay factor:** `0.92` per session  
**Rationale:** Oscillation and convergence failures typically indicate systemic
architectural conflicts (deep dependency loops, resource exclusion) that do not
resolve without explicit intervention. Aggressive decay would cause the system
to forget hard-won structural knowledge.

### Temporal Instability (fast decay, transient)

Instability arising from transient system conditions — temporary resource
overload, one-off displacement during system initialization, scheduling pressure
from concurrent high-priority tasks. These frequently resolve without intervention.

**Dimensions:** `displacementInstability`, `deferralInstability`  
**Persistence aging decay factor:** `0.78` per session  
**Rationale:** Displacement and deferral frequently result from capacity pressure
that resolves in future sessions. Preserving these at the same rate as structural
instability over-penalizes chunks for transient conditions.

### Enforcement in Compaction

Rule C-5 (Memory Aging) must split into two passes:
```
Pass 1 — Structural decay (oscillation, convergence): factor = 0.92 ^ sessionsSince
Pass 2 — Temporal decay  (displacement, deferral):   factor = 0.78 ^ sessionsSince
```

`aggregateInstabilityScore` is always re-derived after both passes via the fixed
weighted sum. The decay class of each dimension is an architectural invariant —
it must not be made configurable or overridable by heuristic state.

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

Rechunking is the **highest-risk mutation class** because it grants full
instability inheritance, creating the risk of immortal instability memory
persisting through recursive rechunk chains. Three additional invariants apply:

**Lineage Identity Continuity:**  
A rechunked chunk `C_new` inheriting from `C_old` must satisfy all of:
- Same `lineageRootId` as `C_old` (or `C_old.id` if `C_old` was itself a root)
- Monotonically incremented `mutationGeneration` field (`C_new.gen = C_old.gen + 1`)
- Same logical task identity (same task ID, different chunk ID)

If any condition fails, `C_new` is treated as a **fresh chunk** with no inheritance.

**Lineage Entropy Bounds:**  
Inheritance chains must not grow unboundedly.
- `MAX_LINEAGE_DEPTH = 5` generations of rechunk inheritance are permitted.
- At generation 6 (`mutationGeneration >= MAX_LINEAGE_DEPTH`), the chain is severed:
  - `instabilityVector` components are **halved** (dilution at depth boundary)
  - All counters (`repairCount`, `displacementCount`, etc.) are **reset to 0**
  - A `deepInheritanceFlag: true` marker is recorded for replay audit

**Maximum Inheritance Depth:**  
The `mutationGeneration` field is the authoritative depth counter. Its value
must be persisted verbatim and validated during hydration. Any entry where
`mutationGeneration > MAX_LINEAGE_DEPTH` that was not processed by the depth-
boundary rule is a hydration violation — reject the entry.

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

## Phase 7C Persistence Trust Boundary

Any code that crosses the following operations is a **persistence trust boundary
site** and must carry the `PHASE_7C_PERSISTENCE_TRUST_BOUNDARY` comment marker:

- Serialization of `ConstraintMemoryState` to persistent storage
- Deserialization from persistent storage into any runtime type
- Hydration (`PersistentMemoryRecord` → `ConstraintMemoryState`)
- Compaction (`ConstraintMemoryState` → `PersistentMemoryRecord`)
- Lineage reconstruction (applying mutation inheritance rules)
- Schema migration (transforming one `schemaVersion` record to another)

These are the **highest-risk correctness surfaces in the entire runtime.**
A bug here can corrupt memory across sessions without any per-session test
detecting it. All trust boundary code must:

1. Be a **pure function** — no side effects beyond the persistence record
2. Explicitly enforce all applicable invariants (H-1 through H-6, C-1 through C-7)
3. Be tested **in isolation** by `test-phase7c-persistence-replay.ts`
4. **Never be called from within the event-processing loop** (synchronous replay path)
5. Carry **no implicit fallbacks** — any invariant violation must throw, not degrade
6. **No trust-boundary function may call another trust-boundary function transitively.**

To ensure invariants can be cleanly attributed during failures, trust boundaries
must not be nested.
**BAD:** `hydrate()` calls `compact()` internally.
**GOOD:** The orchestration caller invokes `hydrate()`, then `compact()`, then `serialize()`.

### Stage Isolation Pipeline

To prevent corruption from coupled assumptions, the persistence lifecycle must
always follow this strictly isolated pipeline:

```
deserialize → validate → hydrate → reconstruct lineage → compact
```

**CRITICAL:** Lineage reconstruction must *never* be implemented inside hydration.
It operates on already-validated, hydrated state only. Coupling lineage rules
to schema validation creates opaque edge cases that cause silent state drift.

### Mechanical Purity Tests

Before any actual storage adapter is built, the architecture must prove that
all trust boundary functions are purely functional.

`test-phase7c-persistence-replay.ts` must enforce this mechanically by calling
`Object.freeze(input)` on persistence records, topologies, and hydrated memory
objects before passing them to hydration, compaction, or serialization functions.
This guarantees early detection of silent mutation corruption.

### Canonical Serialization Rules

Inside the eventual `PersistenceAdapter`, serialization must not be left to
implicit JSON traversal order. The adapter must enforce:
- Lexicographic ordering for chunk IDs, region IDs, lineage records, and evictedChunkIds.
- Stable JSON field ordering.
- Explicit float precision normalization (e.g., standardizing rounding).

Failure to canonicalize serialization will result in golden snapshot tests
failing unpredictably across different runtimes.

**TypeScript marker template:**
```typescript
// ─────────────────────────────────────────────────────────────────────────────
// PHASE_7C_PERSISTENCE_TRUST_BOUNDARY
// Crosses: [serialization | deserialization | hydration | compaction |
//           lineage reconstruction | schema migration]
// Invariants enforced: [list applicable H-N / C-N]
// Replay proof: test-phase7c-persistence-replay.ts Scenario [N]
// ─────────────────────────────────────────────────────────────────────────────
```

---

## Pre-Phase 7C Implementation Checklist

Before any Phase 7C code is written, the following must be true:

- [ ] `ConstraintMemoryEntry` gains `boundaryObservationCount: number` field
- [ ] `ConstraintMemoryEntry` gains `mutationGeneration: number` and `deepInheritanceFlag: boolean`
      fields (rechunk lineage depth tracking)
- [ ] `PersistentMemoryRecord` type defined with `schemaVersion`, `evictedChunkIds`
- [ ] `hydrateMemoryFromPersistence()` enforces H-1 through H-6
- [ ] `hydrateMemoryFromPersistence()` carries `PHASE_7C_PERSISTENCE_TRUST_BOUNDARY` marker
- [ ] Compaction pipeline implements C-1 through C-7 in correct order
- [ ] C-5 (Memory Aging) splits into structural (0.92) and temporal (0.78) decay passes
- [ ] Rechunk inheritance enforces `MAX_LINEAGE_DEPTH = 5` with halving at depth boundary
- [ ] Mutation lineage records defined and emitted on all chunk mutations
- [ ] Union-Find invariants UF-1 through UF-4 implemented and tested adversarially
      via `test-phase7c-union-find-adversarial.ts`
- [ ] INV-6 causal cycle assertion already in `simulateExecutionHorizon.ts` ✅ (Phase 7B)
- [ ] `test-phase7c-persistence-replay.ts` proves: byte-identical replay, compaction
      idempotency, hydration rejection of invalid lineage, schema fail-fast, C-7
- [ ] Phase 7B regression tests (32 tests) still pass

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
- `ConstraintMemoryTypes.ts` — INV-B, INV-C region continuity; structural/temporal decay classification
- `evolveConstraintMemory.ts` — Phase 7B approximation boundary markers
- `MemoryObservabilityTypes.ts` — Saturation and decay observability
- `simulateExecutionHorizon.ts` — INV-6 causal cycle guard (implemented Phase 7B)
- `hashConstraintMemoryDelta.ts` — Delta hashing (foundation for compaction diffing)
- `test-phase7b-constraint-memory.ts` — Regression baseline (32 tests)
- `test-phase7c-persistence-replay.ts` — Persistence/hydration adversarial suite
- `test-phase7c-union-find-adversarial.ts` — Union-Find determinism adversarial suite
