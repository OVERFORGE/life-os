# ADR-001: Deterministic Adaptive State in the LifeOS Orchestration Kernel

**Status:** Accepted (Amended 2026-05-17)  
**Phase:** 7B (finalized pre-Phase 7C)  
**Authors:** Orchestration Kernel Design  
**Date:** 2026-05-17

---

## Context

The LifeOS planner has evolved from a static scheduling engine into a
**deterministic self-adaptive orchestration substrate** across Phases 6B.5 → 7A → 7B.

This ADR formalizes the architectural decisions that govern how adaptive state
is managed, propagated, replayed, and mutated throughout the kernel. These
invariants are the foundational guarantees of the runtime's correctness model.

The architecture must remain:
- Fully replayable from `(initialState + eventLog)`
- Byte-deterministic across identical input sequences
- Causally reconstructable without external mutable state
- Topology-auditable at any snapshot boundary

---

## Decision 1: Replay-Visible Adaptive State

**Decision:**  
All adaptive state — including heuristic profiles, instability vectors, and
constraint memory — MUST be fully represented in the event log. No adaptive
state may exist outside the replay boundary.

**Rationale:**  
Adaptive state that lives outside the event log creates hidden state transitions
that break causal reconstruction, topology diffing, and regression testing.
Even a single heuristic multiplier that adjusts without an event record would
make the terminal state unreproducible from `(initialState + events)` alone.

**Enforcement:**
- `HeuristicState` evolves only via `heuristic_state_updated` events.
- `ConstraintMemoryState` evolves only via `constraint_memory_updated` events.
- Both event types carry their complete next-state payloads (not deltas),
  enabling replay without recomputation of intermediate states.
- No subsystem may write to `heuristicState` or `constraintMemory` directly.
  All mutations must flow through `applyPlannerEvent()`.

**Violation consequence:** Replay integrity failure (Invariant 7). The terminal
topology hash will diverge between the original run and the replay.

---

## Decision 2: Memory Evolution Determinism

**Decision:**  
Memory evolution must be a **pure function** of its inputs. Given identical
`(prevMemory, signals, governanceMetrics, heuristicState)`, the output
`nextMemory` must be byte-identical across all executions and environments.

**Rationale:**  
Non-determinism in memory evolution — even bounded floating-point variance —
accumulates across boundaries and eventually produces divergent scheduling
behavior on identical event streams. This violates the core correctness model.

**Enforcement:**
- No floating-point operations that depend on CPU instruction ordering.
  All arithmetic uses explicit rational constants.
- Decay-before-reinforcement is always applied in the same order. The order
  itself is a semantic invariant, not an implementation detail.
- All instability dimensions are independently clamped to `[0.0, 1.0]` after
  every evolution step. Clamping is idempotent and cannot be skipped.
- `aggregateInstabilityScore` is always re-derived from the vector using
  fixed weights (displacement: 0.35, oscillation: 0.30, convergence: 0.20,
  deferral: 0.15). Weights are constants, not runtime parameters.
- Region derivation uses `sorted(memberChunkIds).join(':')` as a canonical
  ID — sort order is always lexicographic ASCII, not locale-sensitive.

**Known approximation boundary (Phase 7B temporary):**  
`historicalDeferralRate` uses an inferred rolling denominator. Phase 7C must
replace this with an explicit `boundaryObservationCount` field on
`ConstraintMemoryEntry` to eliminate denominator inference error.

---

## Decision 3: Causal Event Layering

**Decision:**  
All adaptive events must respect the following same-tick causal ordering:

```
chunk_completed
  → chunk_interrupted
  → chunk_overran
  → deadline_modified
  → recovery_window_expanded
  → new_task_inserted
  → day_boundary_crossed          ← horizon transition
  → repair_triggered              ← structural repair
  → heuristic_state_updated       ← adaptive profile response
  → constraint_memory_updated     ← historical learning accumulation
```

This ordering is enforced by `PLANNER_EVENT_SAME_TICK_PRECEDENCE` and applied
via `sortPlannerEvents()` at every replay boundary.

**Rationale:**  
Causal ordering ensures that each adaptive layer observes the correct "world
state" before producing its output. Memory evolution reads the heuristic state
that was already updated this tick. Heuristic evolution reads the governance
metrics computed from the boundary crossing. No event type may observe a state
produced by a causally downstream event.

**Critical rule:**  
Events injected into the queue during simulation (e.g., `heuristic_state_updated`
injected after `day_boundary_crossed`) must trigger a single queue re-sort before
the next event is dequeued. Multiple re-sorts per tick are wasteful but not
incorrect. A missing re-sort is a correctness failure.

---

## Decision 4: Adaptive State Projection Invariants

**Decision:**  
The following properties are permanent architectural invariants of the adaptive
state model. They must be preserved by all future phases (7C, 7D, etc.) and
any new event types or memory fields must be proven compliant with each invariant
before merging.

### INV-1: Pure Projection
`constraint_memory_updated` is a pure projection event. It projects an already-
computed memory state into the simulation. The handler in `applyPlannerEvent`
must never compute, infer, or partially apply memory — it only assigns
`event.nextMemoryState` to `state.constraintMemory`. All computation happens
before the event is injected into the queue.

### INV-2: Instability Boundedness
All instability vector components and aggregate scores are bounded `[0.0, 1.0]`
at all times. This is enforced by `clamp01()` applied at every mutation boundary
in `evolveConstraintMemory`. Boundedness must hold even under:
- Simultaneous multi-signal reinforcement (displacement + oscillation + convergence)
- Extreme heuristic pressure multipliers (e.g., `repairAggressivenessMultiplier = 2.0`)
- Memory evolution called many times per boundary (replay adversarial scenarios)

### INV-3: Region Topology Derivability
Region IDs and their member sets are always derivable from the current topology
state. Region memory is NEVER an independent authority. If the topology changes,
region membership is re-derived from the new topology. No region state is carried
forward independently of its member chunk scores.

Implication: If all member chunks of a region are removed from the topology,
the region ceases to exist in the next memory evolution. It is not preserved as
an orphan. (Phase 7C will add explicit tombstoning for mutation lineage tracking.)

### INV-4: Memory Bias Subordination
Memory bias applied in `applyMemoryBias()` is permanently secondary to hard
scheduling constraints. Memory bias:
- Adjusts ordering priority only (urgency, priorityScore)
- Cannot cause a feasible task to become unschedulable
- Cannot override deadlines, dependency safety, or mandatory task constraints
- Is capped at 30% reduction per chunk — this cap is an architectural invariant

### INV-5: Snapshot Completeness & Replay Hydration

Any `ConstraintMemoryState` stored in a snapshot (e.g., `CompactExecutionTrace`,
a cross-session persistence record, or a compaction boundary) must satisfy
all three **replay-completeness criteria**:

**Criterion A — Forward Sufficiency:**  
Given `(snapshot.constraintMemory + subsequent event log)`, it must be possible
to reconstruct all descendant `ConstraintMemoryState` values deterministically.
No external data source, side channel, or ambient runtime state may be required.

**Criterion B — Field Persistence Classification:**  
Every field on `ConstraintMemoryEntry` falls into one of two classes:

| Field | Class | Rationale |
|---|---|---|
| `repairCount` | **Persisted verbatim** | Counter, not derivable from events alone |
| `displacementCount` | **Persisted verbatim** | Counter, not derivable from events alone |
| `oscillationParticipationCount` | **Persisted verbatim** | Counter, not derivable |
| `convergenceSuccessRate` | **Persisted verbatim** | Rolling ratio, depends on history |
| `historicalDeferralRate` | **Persisted verbatim** | Rolling ratio (see approximation boundary) |
| `averagePropagationDepth` | **Persisted verbatim** | Rolling mean, depends on history |
| `instabilityVector` | **Persisted verbatim** | Bounded continuous state |
| `aggregateInstabilityScore` | **Reconstructable** | Derived from `instabilityVector` via fixed weights |
| `lastEvolvedTick` | **Persisted verbatim** | Required for replay ordering validation |

`TopologyRegionMemory` fields:

| Field | Class | Rationale |
|---|---|---|
| `regionId` | **Reconstructable** | Derived from `sorted(memberChunkIds).join(':')` |
| `memberChunkIds` | **Reconstructable** | Derived from current dependency topology |
| `regionRepairDensity` | **Reconstructable** | Aggregated from member chunk scores |
| `regionOscillationRate` | **Reconstructable** | Aggregated from member chunk scores |
| `convergenceFailures` | **Persisted verbatim** | Cumulative counter across boundaries |
| `averageRepairRadius` | **Reconstructable** | Aggregated from member chunk scores |
| `regionAggregateInstability` | **Reconstructable** | Aggregated from member chunk scores |

**Criterion C — No External References:**  
No persisted memory field may reference a chunk ID, task ID, region ID, or
topology node that does not also exist in the persisted schedule topology
at the same snapshot boundary. Dangling references violate replay hydration.
Phase 7C compaction must tombstone extinct references before persisting.

### INV-6: No Causal Cycles in Event Injection

**Invariant:**  
> No event may inject another event with lower or equal causal precedence within
> the same logical tick.

Formally: if event `E` at tick `T` is being processed and causes the injection
of event `E'`, then either:
- `E'.tick > T` (future tick — always safe), OR
- `E'.tick == T` AND `getPlannerEventPrecedence(E'.type) > getPlannerEventPrecedence(E.type)`
  (strictly higher precedence — causally downstream)

Violations of this invariant create causal cycles where an event can observe
state produced by events that causally depend on it. This breaks the
replay ordering guarantee and makes terminal state non-reconstructable.

**Current safe injection patterns (Phase 7B):**

| Injector event | Injected event | Tick relation | Safe? |
|---|---|---|---|
| `day_boundary_crossed` (prec 7) | `heuristic_state_updated` (prec 9) | Same tick | ✅ Higher prec |
| `day_boundary_crossed` (prec 7) | `constraint_memory_updated` (prec 10) | Same tick | ✅ Higher prec |
| `heuristic_state_updated` (prec 9) | `constraint_memory_updated` (prec 10) | Same tick | ✅ Higher prec |

**Prohibited patterns (must be caught at injection site):**

| Injector event | Injected event | Reason |
|---|---|---|
| `constraint_memory_updated` | `heuristic_state_updated` | Lower precedence — causal cycle |
| `constraint_memory_updated` | `day_boundary_crossed` | Lower precedence — causal cycle |
| `heuristic_state_updated` | `day_boundary_crossed` | Lower precedence — causal cycle |
| Any event | itself | Same precedence — infinite loop risk |

**Enforcement:** Phase 7C must add a runtime assertion in the event injection
path verifying INV-6 before any new event is pushed to the queue.

### INV-7: Persistence Referential Closure

**Invariant:**  
> Every persisted identifier must resolve internally within the persistence record,
> resolve within the hydrated topology, or be explicitly tombstoned.

Formally, for any chunk ID, task ID, region ID, or lineage root ID present in a
persisted memory record:
1. It must exist in the runtime topology being hydrated into, OR
2. It must be explicitly tracked in the persistence record's tombstone/eviction list, OR
3. It must resolve to a fully formed ancestral record within the persistence file itself.

There must be:
- No dangling lineage references
- No orphaned region ancestry
- No unresolved parent chains
- **No cyclic ancestry** (a lineage record cannot eventually resolve back to itself)

Violations of referential closure mean the memory graph is structurally broken,
which causes silent corruption during lineage reconstruction. Cyclic ancestry
in particular creates immortal inheritance chains that break entropy bounds.

**Enforcement:** Hydration must perform a two-pass validation. Pass 1 validates
closure of all identifiers. Pass 2 performs actual hydration. Any unresolvable
reference in Pass 1 must fail-fast and reject the entire persistence record.

### INV-8: Hydration Idempotency

**Invariant:**  
> Hydrating a previously hydrated and then re-serialized record must produce a
> byte-identical memory state.
> `hydrate(serialize(hydrate(record))) === hydrate(record)`

Formally, once a record has passed validation and hydrated into memory,
subsequent serialization and re-hydration passes must not introduce any state drift.

This becomes critical to prevent corruption when:
- Schema migrations exist
- Reconstructable fields are omitted in persistence but re-derived in hydration
- Lineage inheritance rules are evaluated
- Compaction aging modifies instability scores

Without INV-8, the act of saving and loading the system could continuously alter
its state, breaking determinism.

**Enforcement:** Adversarial tests must prove this idempotency mechanically
using the canonical replay hash (`computeConstraintMemoryHash`), rather than just
deep object equality.

---

## Observability Pre-Conditions for Phase 7C

Before cross-horizon memory persistence is introduced, the following observability
metrics must be instrumentable from `ConstraintMemoryState` alone:

| Metric | Purpose |
|---|---|
| `memorySaturationRate` | Detect uniform bias flattening risk |
| `criticallySaturatedChunkCount` | Alert on instability ceiling proximity |
| `peakRegionInstability` | Identify most fragile topology region |
| `unstableRegionConcentration` | Detect systemic vs. isolated fragility |
| `decayHalfLifeEstimate` | Measure memory responsiveness |
| `reinforcementToDecayRatio` | Detect accumulation vs. stabilization trends |

These are implemented in `MemoryObservabilityTypes.ts` as `analyzeMemoryObservability()`.

---

## Consequences

### Positive
- The runtime is now a **deterministic self-stabilizing orchestration substrate**.
  It adapts, learns, and reinforces — all without introducing any stochastic behavior.
- All adaptive decisions are explainable from the event log. A developer can
  replay any past run and reconstruct exactly why the system switched heuristic
  profiles or deprioritized a chunk.
- Memory evolution is fully testable via adversarial determinism scenarios
  (see `test-phase7b-constraint-memory.ts`).

### Constraints on Future Work
- Phase 7C must introduce explicit `boundaryObservationCount` to replace the
  `historicalDeferralRate` inferred denominator.
- Phase 7C memory persistence must define a compaction boundary that preserves
  INV-5 (Snapshot Completeness) across session reloads. Specifically:
  - Persisted-verbatim fields (per INV-5 Criterion B) must be written atomically.
  - Reconstructable fields must NOT be persisted — they are re-derived on hydration.
  - Extinct chunk references must be tombstoned before persistence.
- Any chunk mutation (split/merge/rechunk) in Phase 7C must implement the
  region continuity protocol defined in `ConstraintMemoryTypes.ts` (INV-B, INV-C).
- New event types that inject further events at the same tick must be proven
  compliant with INV-6 (No Causal Cycles) before introduction.
- New event types must be proven compliant with all 8 invariants before introduction.

---

## References

- `ConstraintMemoryTypes.ts` — Type definitions and invariant annotations
- `evolveConstraintMemory.ts` — Evolution engine with approximation boundary markers
- `applyPlannerEvent.ts` — Pure projection enforcement comment
- `generateCandidateSchedules.ts` — Hard constraint guard invariants on `applyMemoryBias`
- `MemoryObservabilityTypes.ts` — Pre-7C observability layer
- `PlannerEventTypes.ts` — `PLANNER_EVENT_SAME_TICK_PRECEDENCE` definition
- `test-phase7b-constraint-memory.ts` — Adversarial determinism test suite
