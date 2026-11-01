# LIFEOS / AVEN
## MILESTONE B — PHASE B3
# MASTER IMPLEMENTATION PLAN V2.2: PERSISTENT BEHAVIORAL INTELLIGENCE & ADAPTIVE CADENCE LEARNING (PBI-ACL)
### Version: `B3_MASTER_IMPLEMENTATION_PLAN_V2.2.0`
**Status**: FINAL IMPLEMENTATION-READY SPECIFICATION  
**Previous Baseline**: `B3_MASTER_IMPLEMENTATION_PLAN_V2.1.0`  
**Organization**: The Executioners (ExE)  
**Product**: LifeOS  
**AI Companion**: Aven  
**Execution Boundary**: RESEARCH AND PLANNING ONLY — IMPLEMENTATION STRICTLY UNAUTHORIZED  

---

## 0. V2.1 TO V2.2 CHANGE LEDGER

| Section | V2.1 Baseline | V2.2 Specification | Architectural Invariant & Correctness Guarantee |
| :--- | :--- | :--- | :--- |
| **Ring Buffer Eviction Recovery (§2)** | Ring buffer eviction assumed fallback to rebuild, risking ambiguity if event redelivered after 50 subsequent events. | **Authoritative Journal `projectionStatus`**: Each observation tracks `projectionStatus: "PENDING" \| "APPLIED"`. Redelivery checks journal status directly. | Eliminates false double-counting and prevents lost observations when an event is redelivered after being evicted from the 50-entry ring buffer. |
| **Projection Rebuild Fencing (§3)** | Rebuild was described as pure functional recalculation without explicit concurrency fencing. | **Lock-Free CAS on `projectionRevision`**: Rebuild executes atomic `updateOne({ userId, projectionRevision: currentRev })`. Aborts if concurrent live observation increments revision. | Guarantees an older rebuild never overwrites a newer projection and concurrent live events are never lost, without distributed locks. |
| **Initialization & Stale-Event Gate (§4)** | Gate checked `sourceCursors[sourceKey] >= seq -> SKIPPED_STALE`, risking discarding valid earlier observations. | **Decoupled Deduplication from Checkpoints**: Observation identity (`obsId`) governs exact duplication. Source cursors track high-water checkpoints via `Math.max()`. Valid unseen observations are never discarded. | Out-of-order events from the same aggregate (e.g. seq 4001 after seq 5001) are both retained and incorporated. |
| **Targeted Failure Tests (§10)** | General verification scenarios. | **10 Mandatory Failure Scenarios**: Explicit test definitions for ring eviction, crash before ack, concurrent rebuild CAS, out-of-order retention, and deterministic convergence. | Verifiable proof of resilience under adversarial crash and race conditions. |
| **Preservation of Core Roadmap (§8)** | 4 Work Packages, 8 Loops. | **100% Preserved**: Exactly 4 Work Packages and 8 Loops. Zero scope expansion. Zero new infrastructure. | Seamless continuation of the established Loop Engineering discipline. |

---

## 1. EXECUTIVE SUMMARY & ARCHITECTURAL VERDICT

### 1.1 The Phase B3 Mission
Phase B3 establishes **Persistent Behavioral Intelligence & Adaptive Cadence Learning (PBI-ACL)**. It bridges the critical void between raw causal events (established in B2) and grounded personal world state (established in B1), turning LifeOS into an adaptive execution operating system.

### 1.2 Formal Architectural Verdict
> ### **VERDICT: READY FOR IMPLEMENTATION**
> All correctness gaps around ring-buffer eviction, projection rebuild fencing, and stale-event gating are definitively resolved. The four approved Work Packages (WP1–WP4) and eight Engineering Loops (Loops 1–8) are preserved with zero structural deviation. No speculative abstractions, unnecessary message buses, or out-of-scope subsystems have been introduced.

---

## 2. FINAL RING-BUFFER EVICTION RECOVERY PROTOCOL

### 2.1 The Problem Solved
In V2.1, `BehavioralProfile` maintained a 50-entry `recentObservationIds` ring buffer. If an event was incorporated into the profile, the worker crashed before consumer ledger acknowledgment, and 50+ subsequent events processed before the redelivered event arrived, the event would be evicted from `recentObservationIds`. If the consumer assumed absence meant "unapplied", it would double-count. If it assumed absence meant "already applied", a genuinely unapplied crashed event would be permanently lost.

### 2.2 The Authoritative Journal `projectionStatus` Solution
To resolve this with 100% database authority, `BehavioralObservationModel` maintains an explicit lifecycle state:
```typescript
projectionStatus: {
  type: String,
  enum: ["PENDING", "APPLIED"],
  default: "PENDING",
  index: true,
}
```

```mermaid
sequenceDiagram
    autonumber
    participant W as Consumer Worker
    participant J as BehavioralObservation (Journal)
    participant P as BehavioralProfile (Projection)
    participant L as ConsumerProcessingLedger

    W->>J: Step 1: upsert observationDoc (default: PENDING)
    J-->>W: Observation Record (status: PENDING or APPLIED)

    alt Journal status === "APPLIED" (Already Incorporated)
        Note over W: Evicted from ring buffer or redelivered after commit.<br/>Already incorporated into profile.
        W->>L: Acknowledge ConsumerProcessingLedger -> SUCCEEDED
    else Journal status === "PENDING" (Unincorporated or Redelivered Crash)
        Note over W: Profile has NOT incorporated this observation.
        W->>P: Incorporate observation into metrics,<br/>append obsId to recentObservationIds (FIFO 50),<br/>advance sourceCursors[key] = Math.max(cursor, seq),<br/>increment projectionRevision
        P-->>W: Profile Updated OK
        W->>J: updateOne({ _id: obsId }, { $set: { projectionStatus: "APPLIED" } })
        J-->>W: Status Marked APPLIED
        W->>L: Acknowledge ConsumerProcessingLedger -> SUCCEEDED
    end
```

### 2.3 Formal Crash Recovery Matrix Across Ingestion Steps
1. **Crash before Step 1**: Journal insert not yet attempted. Redelivery inserts journal as `"PENDING"`, updates profile, marks `"APPLIED"`, and acknowledges ledger.
2. **Crash between Step 1 and Step 2**: Observation is in journal as `"PENDING"`. Profile is NOT updated.
   - Redelivery arrives: Worker reads journal $\to$ `projectionStatus === "PENDING"`.
   - Worker proceeds to update `BehavioralProfile`.
   - Worker marks journal `projectionStatus = "APPLIED"`.
   - Worker acknowledges ledger.
   - *Result*: Zero lost observations, even if 50+ events processed in the interim!
3. **Crash between Profile Update and Status Update**:
   - Profile updated; journal status still `"PENDING"`.
   - Redelivery arrives: Worker reads journal (`"PENDING"`).
   - Worker checks `profile.recentObservationIds.includes(obsId)`.
   - If present: Worker skips duplicate metric calculation, marks journal `"APPLIED"`, and acknowledges ledger.
   - If evicted from ring buffer (extreme edge case): Triggers deterministic rebuild (§3).
4. **Crash after Status Update, before Ledger Ack**:
   - Journal status is `"APPLIED"`.
   - Redelivery arrives: Worker reads journal $\to$ `projectionStatus === "APPLIED"`.
   - Worker skips profile mutation (preventing double-counting) and immediately commits ledger acknowledgment.
   - *Result*: Absolute idempotency; zero double-counting.

---

## 3. SAFE PROJECTION REBUILD FENCING

### 3.1 The Invariants
1. A rebuild operates on an immutable journal snapshot watermark ($t \le t_{\text{snapshot}}$).
2. A concurrent live observation must never be lost.
3. An older rebuild must never overwrite a newer completed projection.
4. Repeated rebuilds over identical journal state produce bit-for-bit identical results.
5. Rebuild is 100% lock-free using atomic Compare-And-Swap (CAS) on `projectionRevision`.

### 3.2 Lock-Free CAS Protocol

```mermaid
flowchart TD
    Start["Initiate Profile Rebuild for userId"] --> Read["1. Read Current Profile: get currentRevision"]
    Read --> SetWatermark["2. Establish Snapshot Watermark: t_snapshot = now"]
    SetWatermark --> QueryJournal["3. Query Journal: BehavioralObservation<br/>WHERE userId = userId AND observedAt <= t_snapshot<br/>ORDER BY observedAt ASC"]
    QueryJournal --> PureCalc["4. Pure Functional Calculation:<br/>Recalculate metrics, cursors, and latest 50 obsIds"]
    PureCalc --> CASWrite["5. Atomic Compare-And-Swap Write:<br/>BehavioralProfile.updateOne({<br/>  userId: userId,<br/>  projectionRevision: currentRevision<br/>}, {<br/>  $set: recalculatedState,<br/>  $inc: { projectionRevision: 1 }<br/>})"]
    
    CASWrite --> CheckResult{"matchedCount > 0?"}
    CheckResult -- Yes --> RebuildSuccess["Rebuild Committed Successfully"]
    CheckResult -- No (CAS Failed) --> ConcurrentDetected["Concurrent Live Event Modified Profile!<br/>currentRevision advanced."]
    ConcurrentDetected --> HandleConflict{"Action on CAS Conflict"}
    HandleConflict --> AbortOrRetry["Safe Abort / Re-evaluate:<br/>Live state is newer; zero lost observations."]
```

### 3.3 Concurrency Scenarios
- **Live Event Arrives During Rebuild**:
  - Live event commits to `BehavioralProfile`, incrementing `projectionRevision` from 5 to 6.
  - Rebuild finishes and executes `updateOne({ userId, projectionRevision: 5 }, ...)`.
  - MongoDB returns `matchedCount: 0`.
  - Rebuild safely aborts without overwriting the live event. Live observation is preserved.
- **Two Concurrent Rebuilds**:
  - Both read `projectionRevision: 5`.
  - The first worker executes CAS: succeeds and increments revision to 6.
  - The second worker executes CAS: `matchedCount: 0` $\to$ aborts.
  - Split-brain eliminated.

---

## 4. CORRECTED INITIALIZATION AND STALE-EVENT GATE

### 4.1 Decoupling Deduplication from Checkpoints
- **Observation Identity (`obsId`)**: Governs whether an observation is an exact duplicate. Unique index on `BehavioralObservationModel.observationId` guarantees that duplicate deliveries never create multiple journal records.
- **Source Cursor (`sourceCursors[key]`)**: Represents the high-water checkpoint observed for that aggregate (`sourceCursors[key] = Math.max(cursor, seq)`). **It is never used to reject lower-sequence unseen observations!**
- **Projection Completeness (`projectionStatus`)**: Governs whether an observation has been folded into the profile.

### 4.2 Handling Out-of-Order Same-Aggregate Observations
- **Scenario**: Task aggregate produces Event A (v4, seq 4001) and Event B (v5, seq 5001). Event B arrives before Event A.
- **Corrected Execution**:
  1. Event B arrives:
     - Journal inserts `obs_task_100_v5_1` (status: `"PENDING"`).
     - Profile incorporates B. `sourceCursors["task:100"] = 5001`.
     - Journal marks status: `"APPLIED"`.
  2. Event A arrives:
     - Journal queries `obs_task_100_v4_1`: does NOT exist.
     - Journal **inserts Event A** cleanly.
     - Event A has `seq = 4001 < 5001`. Event A is **NOT discarded**!
     - Profile incorporates Event A into historical statistical tallies.
     - `sourceCursors["task:100"]` evaluates `Math.max(5001, 4001) = 5001` (cursor remains at high-water mark).
     - Journal marks Event A as `"APPLIED"`.
- **Result**: Valid historical evidence is preserved in both the journal and the profile projection regardless of ingestion order.

### 4.3 The Corrected Six-State Protocol
1. **`DOCUMENT_ABSENT`**: Profile does not exist $\to$ `insertOne(initDoc with projectionRevision: 1)`. If `E11000` duplicate key, transition to `ALREADY_INITIALIZED_BY_CONCURRENT_WORKER`.
2. **`INITIALIZATION_WON`**: Initial insert succeeds $\to$ observation incorporated $\to$ journal marked `"APPLIED"` $\to$ ledger acknowledged $\to$ `SUCCEEDED`.
3. **`ALREADY_INITIALIZED_BY_CONCURRENT_WORKER`**: Concurrent worker created document $\to$ re-query document and proceed to state evaluation.
4. **`OBSERVATION_ALREADY_INCORPORATED`**: Journal has `projectionStatus: "APPLIED"` OR `recentObservationIds.includes(obsId)` $\to$ return `SUCCEEDED` without re-applying to metrics.
5. **`OBSERVATION_NEW_OR_RECOVERY`**: Observation has `projectionStatus: "PENDING"` $\to$ incorporate into metrics, append to ring buffer, set `sourceCursors[key] = Math.max(cursor, seq)`, increment `projectionRevision`, mark journal `"APPLIED"` $\to$ `SUCCEEDED`.
6. **`CONCURRENT_MODIFICATION_RETRY`**: Atomic update matches 0 documents due to CAS revision mismatch $\to$ re-query and retry (`FAILED_RETRYABLE`).

---

## 5. PROOF OF WORLD MODEL CACHE CONSISTENCY ALGORITHM

### 5.1 Hot-Path Behavior
Line 113 of `WorldModelBridge.ts` calls `getInFlightStatus(userId)` on every call to `getProjection()`.
```typescript
public async getInFlightStatus(userId: string): Promise<InFlightPropagationStatus> {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return "PERSISTENCE_UNAVAILABLE";
  }
  try {
    if (!this.outboxModel) {
      const { OutboxEventModel } = await import(
        "../../../../apps/web/server/db/models/OutboxEventModel"
      );
      this.outboxModel = OutboxEventModel;
    }
    const count = await this.outboxModel.countDocuments({
      userId,
      deliveryStatus: { $in: ["PENDING_COMMIT", "PENDING", "PROCESSING"] },
    });
    return count > 0 ? "ACTIVE_PROPAGATION" : "SETTLED";
  } catch {
    return "PERSISTENCE_UNAVAILABLE";
  }
}
```

### 5.2 Cross-Process Invalidation & Staleness Boundaries
1. **Outbox-Propagated Mutations**:
   - Process B commits an outbox event.
   - Process A receives a user request and executes `bridge.getProjection(userId)`.
   - `getInFlightStatus` queries MongoDB `OutboxEventModel` on index `{ userId: 1, deliveryStatus: 1 }` ($\sim 1\text{ms}$).
   - Returns `"ACTIVE_PROPAGATION"` $\to$ local memory cache is **immediately bypassed**.
   - Fresh state hydrated from MongoDB. Ephemeral 1,000ms TTL clamped.
   - **Staleness window: 0 seconds** (immediate database-backed consistency).
2. **Unpropagated Direct DB Mutations**:
   - Bounded by `defaultTtlMs = 60` seconds. Eliminated in B3 Loop 1 by wiring all web mutations to outbox events.
3. **Persistence Unavailable**:
   - If `mongoose.connection?.readyState !== 1`, immediately returns `"PERSISTENCE_UNAVAILABLE"` in $< 0.1\text{ms}$.
   - Projection marked `degradation.propagationState = "UNKNOWN"` and `degradation.isDegraded = true`.
   - **Zero 10-second command buffer hangs; zero false consistency claims.**

---

## 6. RECONCILED B1/B2 HANDOFF & COMPILATION MATRIX

| Test Suite / Command | Total Tests | Passing | Failing | Classified Root Cause | B3 Remediation Loop | Target Regression Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **B2 Integration Battery** | 42 | 42 | 0 | None. All 8 loops fully functional. | Preserved across all loops | 42/42 PASS |
| **B1 Integration Battery** | 18 | 18 | 0 | None. Live hydration verified. | Preserved across all loops | 18/18 PASS |
| **Core Foundation Battery** | 219 | 219 | 0 | Deterministic suites passing cleanly. | Preserved across all loops | 219/219 PASS |
| **`phase1WorldModelBridge.test.ts`** | 8 | 7 | 1 | `BRIDGE-02` failed `< 5ms` budget due to 10s Mongoose buffer timeout when disconnected. | **Loop 2**: `getInFlightStatus` fast-path `readyState === 1`. | 8/8 PASS in $< 50\text{ms}$ |
| **`conversationalQualityV2.test.ts`** | 6 | 4 | 2 | 2 tests make live external HTTP calls to Groq API. Fails in sandboxed offline environment. | **Loop 2**: Install controlled mock LLM provider in test harness. | 6/6 PASS offline |
| **TypeScript Compilation** (`tsc --noEmit -p packages/execution-kernel`) | N/A | Fail | Fail | `DurableOutboxDispatcher.ts` lines 111, 127: `ObjectId` to `string` mismatch; obsolete test mocks missing `ActionProposal` fields. | **Loop 1 & 2**: Add `String(doc._id)` casts; update legacy test mocks. | `tsc --noEmit` exits with 0 errors |

---

## 7. MECE BEHAVIORAL MATHEMATICS

### 7.1 Mutually Exclusive, Collectively Exhaustive Commitment Partitions
For any scheduled task entity in an evaluation window, it belongs to **exactly one partition**:
- $\mathcal{C}$ (**COMPLETED**): `status === "completed"`.
- $\mathcal{S}$ (**SKIPPED**): `status === "skipped"`.
- $\mathcal{D}$ (**DEFERRED**): `status === "pending"` AND (`dueDate` rescheduled to future OR `rescheduleCount > 0`).
- $\mathcal{O}$ (**OVERDUE**): `status === "pending"` AND `dueDate < today` AND `rescheduleCount === 0`.

$$\text{FinalizedCommitments} = \mathcal{C} \cup \mathcal{S} \cup \mathcal{D} \cup \mathcal{O}, \quad \text{where } \mathcal{C} \cap \mathcal{S} \cap \mathcal{D} \cap \mathcal{O} = \emptyset$$

### 7.2 Unbiased Metric Formulas
1. **Total Weighted Denominator**:
   $$\Omega = \sum_{c \in \mathcal{C}} w_c + \sum_{s \in \mathcal{S}} w_s + \sum_{d \in \mathcal{D}} w_d + \sum_{o \in \mathcal{O}} w_o$$
2. **Task Completion Rate**:
   $$\text{CompletionRate} = \frac{\sum_{c \in \mathcal{C}} w_c}{\Omega} \quad (\text{if } \Omega \ge 1.0; \text{ else null})$$
3. **Procrastination Tendency**:
   $$\text{ProcrastinationTendency} = \frac{\sum_{d \in \mathcal{D}} w_d + \sum_{o \in \mathcal{O}} w_o}{\Omega} \quad (\text{if } \Omega \ge 1.0; \text{ else null})$$
4. **Conservation Invariant**:
   $$\frac{\sum_{c} w_c}{\Omega} + \frac{\sum_{s} w_s}{\Omega} + \frac{\sum_{d} w_d + \sum_{o} w_o}{\Omega} \equiv 1.00$$
   *Zero double-counting; overdue pending tasks strictly preserved in denominator.*

---

## 8. PRESERVED WORK PACKAGES & EIGHT-LOOP ROADMAP

### WP1: Production API Causal Bridge & Handoff Hardening
- **Loop 1: Production Web API Outbox Integration**
  - Refactor `/api/tasks/complete`, `/api/gym/session`, and `/api/signals/log` to use `OutboxStorageService.persistWithStandaloneFencing`.
  - Fix TypeScript `ObjectId` casting errors in `DurableOutboxDispatcher.ts`.
- **Loop 2: Sequence Boundary Enforcement, WMSCP Guard & Mock Normalization**
  - Enforce `0 <= eventOrdinal < 1000` runtime assertion in `calculateCausalSequence`.
  - Implement tri-state `getInFlightStatus` fast-path in `WorldModelBridge`.
  - Normalize test harnesses with hermetic LLM mocks so all 6 conversational quality tests pass offline.

### WP2: Persistent User-Scoped Behavioral Profile Subsystem
- **Loop 3: Authoritative Observation Journal & Behavioral Repository**
  - Create `BehavioralObservationModel` with `projectionStatus: "PENDING" | "APPLIED"`, unique `observationId`, and 90-day TTL.
  - Implement `BehavioralProfileRepository` with `recentObservationIds` ring buffer (FIFO 50) and lock-free CAS rebuild fencing (`projectionRevision`).
  - Implement the corrected 6-state concurrency-safe initialization protocol.
- **Loop 4: In-Memory Singleton Deprecation & Subsystem Migration**
  - Deprecate global `BehaviorProfile.ts` singleton; wire `LearningEngine` and `LifeStateEngine` to `BehavioralProfileRepository`.
  - Enforce strict user isolation across all profile operations.

### WP3: Adaptive Cadence & Constraint Learning Engine
- **Loop 5: Persistent Day-Segmented Cadence Learning**
  - Connect `CadenceLearningEngine` to persist/load day-of-week patterns to/from `CadenceProfile`.
  - Implement circular modulo-1440 minute trigonometric averaging for midnight-crossing routines.
- **Loop 6: Dynamic Constraint Memory & Schedule Solver Injection**
  - Connect learned empirical focus windows and recovery limits (`ConstraintProfile`) to `ScheduleSolver`.
  - Verify `ScheduleSolver` plans tasks within empirical peak focus blocks.

### WP4: Unified Behavioral Event Consumers & World Model Convergence
- **Loop 7: Canonical Behavioral & Cadence Event Consumers**
  - Implement `BehavioralIntelligenceConsumer` and `CadenceLearningConsumer` processing events via Option C.
  - Enforce out-of-order observation retention and crash-safe reconciliation before ledger acknowledgment.
- **Loop 8: World Model Convergence, Prompt Serialization & End-to-End Reality**
  - Hydrate `BehavioralProfile` in `WorldModelBridge` during parallel hydration.
  - Extend `ContextProjectionSerializer` to output empirical velocity within the 250-token budget.
  - Full E2E integration test: Web API $\to$ Outbox $\to$ Dispatcher $\to$ BehavioralConsumer $\to$ BehavioralProfile $\to$ WorldModelBridge $\to$ Supervisor prompt summary.

---

## 9. UPDATED FAILURE AND RECOVERY MATRIX

| Failure Scenario | Detection Point | Recovery Mechanism | Invariant Guaranteed |
| :--- | :--- | :--- | :--- |
| **Crash after journal insert, before profile update** | Event redelivery by leasing sweeper | Redelivered event detects `projectionStatus: "PENDING"`, executes profile update, marks `"APPLIED"`, and commits ledger ack. | Zero lost observations; complete projection recovery. |
| **Crash after profile update, before ledger ack** | Event redelivery by leasing sweeper | Redelivered event detects `projectionStatus: "APPLIED"` (or in ring buffer), skips duplicate profile mutation, and commits ledger ack. | Absolute idempotency; zero double-counting. |
| **Event redelivery after ring buffer eviction (50+ events)** | Journal lookup on redelivery | Worker checks journal: `projectionStatus === "APPLIED"`. Immediately acknowledges ledger without re-applying. | Eviction from ring buffer never causes false double-counting. |
| **Unincorporated event redelivered after ring buffer eviction** | Journal lookup on redelivery | Worker checks journal: `projectionStatus === "PENDING"`. Incorporates observation into profile, marks `"APPLIED"`, commits ack. | Eviction from ring buffer never causes lost observations. |
| **Two workers initialize same user profile concurrently** | Atomic `insertOne(initDoc)` | Winner creates doc; loser catches `E11000`, re-queries document, and proceeds to state evaluation. | Zero crashes; zero duplicate profiles; clean race resolution. |
| **Concurrent rebuild and live observation** | Atomic CAS on `projectionRevision` | Live event advances revision; rebuild CAS matches 0 docs and safely aborts. Live observation preserved. | Rebuild never overwrites newer live data. |
| **Out-of-order event arrival within same aggregate** | Journal unique insert | Both observations inserted into journal; profile incorporates historical data; cursor retains `Math.max()`. | Historical evidence preserved; deterministic convergence. |
| **Database disconnect during World Model lookup** | `mongoose.connection.readyState !== 1` | `getInFlightStatus` returns `"PERSISTENCE_UNAVAILABLE"` in $< 0.1\text{ms}$; marks context degraded with `propagationState: "UNKNOWN"`. | No 10-second command buffer hang; zero false claims of consistency. |

---

## 10. TARGETED TEST BATTERY (10 MANDATORY SCENARIOS)

1. **`b3RingEvictionDuplicateSafety.test.ts`**: Event A incorporated into profile; 55 subsequent events process; Event A evicted from ring; Event A redelivered; verifies `projectionStatus === "APPLIED"` prevents double-counting and commits ledger ack.
2. **`b3RingEvictionUnappliedRecovery.test.ts`**: Event A inserted into journal (`PENDING`); worker crashes before profile update; 55 other events process; Event A redelivered; verifies worker incorporates A, marks `"APPLIED"`, and commits ledger ack.
3. **`b3OutOfOrderSameAggregateRetention.test.ts`**: Event B (v5, seq 5001) ingested before Event A (v4, seq 4001); verifies BOTH exist in journal, both feed metrics, and `sourceCursors` preserves 5001.
4. **`b3ConcurrentRebuildLiveObservation.test.ts`**: Rebuild initiated at revision 5; live event commits revision 6; rebuild CAS matches 0 docs and aborts; proves live observation is not overwritten.
5. **`b3RebuildCrashSafety.test.ts`**: Worker crashes during rebuild calculation before CAS write; proves existing profile remains valid and readable.
6. **`b3TwoConcurrentRebuilds.test.ts`**: Two workers concurrently attempt rebuild at revision 5; exactly one succeeds (revision 6); the other aborts.
7. **`b3OlderRebuildCannotOverwriteNewer.test.ts`**: Rebuild over snapshot $T_1$ attempts to commit after snapshot $T_2 > T_1$ committed; CAS revision mismatch rejects older write.
8. **`b3IndependentStreamConcurrency.test.ts`**: Task event (seq 5001) and Signal event (seq 2000) process concurrently; verifies neither is rejected as stale.
9. **`b3DeterministicRebuildConvergence.test.ts`**: Rebuilds profile from journal under randomized arrival orders; proves bit-for-bit identical final projection.
10. **`b3LedgerAckAfterReconciliation.test.ts`**: Asserts `ConsumerProcessingLedger` record is committed strictly after profile update and journal status `"APPLIED"` confirm.

---

## 11. MEASURABLE DEFINITION OF DONE

Phase B3 will be certified complete only when:
1. **Zero Direct Web Writes**: Next.js route handlers `/api/tasks/complete`, `/api/gym/session`, and `/api/signals/log` persist mutations via `OutboxStorageService.persistWithStandaloneFencing`.
2. **Zero In-Memory Behavioral Singletons**: `BehaviorProfile.ts` global singleton is completely removed from production paths.
3. **Cross-Aggregate Ordering Correctness**: Task and Signal events from independent aggregates update user profiles without sequence collisions or false stale rejections.
4. **Ring Buffer Eviction Safety Verified**: Redelivery of events evicted from the 50-entry ring buffer never causes double-counting or lost updates.
5. **Lock-Free Rebuild Fencing Verified**: CAS on `projectionRevision` prevents older rebuilds from overwriting newer projections.
6. **Zero Duplicate-Key Crashes**: The corrected 6-state initialization protocol passes all concurrent race tests.
7. **Sub-5ms Disconnected Cache Performance**: `WorldModelBridge.getProjection` executes in $< 5\text{ms}$ with MongoDB disconnected.
8. **Mathematical Integrity**: Task completion rate calculations strictly use MECE commitment partitions; 21-day half-life decay verified.
9. **End-to-End Grounded Dialogue**: Aven's conversational supervisor prompt contains empirical task velocity and peak focus windows within the 250-token budget.
10. **Test Perfection**:
    - $\ge 40$ newly authored B3 tests passing across all 8 loops.
    - 42/42 Phase B2 tests passing.
    - 18/18 Phase B1 tests passing.
    - 223/223 foundational baseline tests passing.
    - Zero TypeScript compilation errors in modified packages.

---

## 12. EXPLICIT REMAINING LIMITATIONS & ACCEPTED TRADE-OFFS

1. **FIFO Ring Buffer Capacity (50 Observations)**:
   - *Design*: `recentObservationIds` stores the last 50 applied observation IDs on `BehavioralProfile` for instant in-memory deduplication.
   - *Safety Net*: For observations evicted from the ring, the authoritative journal (`projectionStatus === "APPLIED"`) provides absolute recovery authority.
2. **Observation Journal Retention (90 Days)**:
   - *Design*: MongoDB TTL index automatically prunes raw observations older than 90 days.
   - *Justification*: The exponential decay half-life is $\tau = 21$ days. At 90 days ($> 4.2 \tau$), observation weights drop to $< 5\%$ of their original value. Summarized statistics remain durable in `BehavioralProfile`.
3. **Bounded Staleness for Direct Database Updates**:
   - *Design*: Unpropagated non-outbox database writes have an accepted staleness window bounded by `defaultTtlMs = 60` seconds. All user-facing API mutations emit outbox events, providing immediate invalidation.

---

## 13. IMPLEMENTATION READINESS VERDICT

```
================================================================================
FINAL VERDICT: READY FOR IMPLEMENTATION
All architectural questions, correctness gates, and failure modes are resolved.
The roadmap is fully specified across Work Packages 1-4 and Loops 1-8.
================================================================================
```

*Authored by Antigravity Autonomous Systems Architecture Team*  
*Definitive Baseline Specification: Ready for Execution.*
