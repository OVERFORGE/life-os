# LIFEOS STEP 2 — CONSUMER INVENTORY
## Canonical Consumer Specifications, Idempotency, Retries & State Fencing
**Document Version:** 2.2.0  
**Phase:** Step 2 Architecture & Planning Review  
**Governing Specification:** LifeOS V2.3.0 Final Architectural Specification (*Frozen*)  
**Core Architectural Axiom:** *"The kernel provides truth. Agents provide intelligence."*  
**Classification:** Authoritative Technical Inventory  

---

## Document Changelog

### V2.1.0 $\to$ V2.2.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **Dual-Mode Snapshot Protocol in Goal Consumer** | R-03, R-09: Un-isolated Snapshot Drift | Loop 1 | Updated `GoalIntelligenceConsumer` from un-isolated `countDocuments` queries to Dual-Mode Snapshot Reconciliation: Mode A uses snapshot transactions; Mode B uses 5-step source fingerprint revalidation and projection revision CAS with bounded retry. Strictly decoupled task counts from habitual cadence streaks. |
| **Authoritative Source State in Graph Consumer** | R-02, R-08: Stale Graph Reads & Skew | Loop 2 | Updated `ExecutionGraphConsumer` to maintain Authoritative Source State Summary (`sourceTaskCount`, `sourceVersionSum`, `sourceMaxVersion`) on projection cache, enabling sub-2ms proof of graph freshness. |
| **Deterministic Manifest Hash in Temporal Consumer** | R-10: Sum Collision on Temporal Rescheduling | Loop 3 | Updated `TemporalConflictConsumer` from scalar sums to deterministic SHA-256 partition manifest hash $H_{\text{source}} = \text{SHA256}(\mathcal{M}_{\text{source}})$ over sorted occurrence tuples, eliminating sum collisions on multi-event moves. Background sweeper guarantees recovery from lost/delayed events. |

### V1.0.0 $\to$ V2.0.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **8-Point Formal Consumer Specification** | R-01: Incomplete Convergence Semantics | Loops 1–3 | Expanded every consumer definition to formally specify all 8 operational boundaries: Event Identity, Aggregate Identity, Version Ownership, Idempotency Boundary, Stale-Event Behavior, Out-of-Order Behavior, Duplicate-Event Behavior, and Recovery Behavior. |
| **Constituent Entity Isolation in Goal Intelligence** | R-01: Cross-Aggregate Sequence Collisions | Loop 1 | Replaced scalar causal clock check in [`GoalIntelligenceConsumer.ts#L78`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/consumers/GoalIntelligenceConsumer.ts#L78) with composite constituent map (`taskVersions[taskId]`), guaranteeing Task B v1 completions are never rejected after Goal v5 events. |
| **Per-Node Applied Version in Execution Graph** | R-01 & R-02: Graph Collisions & Read Disconnect | Loop 2 | Refactored [`ExecutionGraphConsumer.ts#L88`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/consumers/ExecutionGraphConsumer.ts#L88) to track `appliedVersion` per node subdocument. Expanded event types to handle task creation, modification, uncompletion, and deletion. |
| **Sweep Revision CAS Fencing in Temporal Reconciliation** | R-01: Stale Sweep Overwrites | Loop 3 | Replaced timestamp checks in [`TemporalConflictConsumer.ts#L78`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/consumers/TemporalConflictConsumer.ts#L78) with an Authoritative Day Sweep protected by atomic CAS on `sweepRevision`. |
| **Safely Superseded vs. Missing Historical Effects** | R-01: Lost Incremental Updates | Loops 1–3 | Established explicit distinction: state transitions with lower version are safely superseded; incremental effects (counters, completions) are never discarded and must be accounted for via constituent maps or authoritative reconciliation. |

---

## 1. Consumer System Architecture

The LifeOS asynchronous processing subsystem employs a **Pull-Based, Leased-Batch Dispatcher** driving a set of decoupled canonical consumers registered within `ConsumerRegistry`.

### 1.1 Sibling Isolation & Partial Acknowledgment
When an outbox event matches multiple consumers (e.g. `domain.task.completed` matches 5 consumers), `ConsumerRegistry` processes consumers sequentially or concurrently with **sibling isolation**:
- If Consumer 1 succeeds, it writes a completion record to `ConsumerProcessingLedgerModel` with `status: "SUCCEEDED"`.
- If Consumer 2 fails with `FAILED_RETRYABLE`, the batch fails and is rescheduled for retry with exponential backoff.
- On redelivery, `ConsumerRegistry` queries `ConsumerProcessingLedgerModel` using the unique compound key `ledgerKey = "${userId}:${consumerName}:${eventId}"`.
- Because Consumer 1 is marked `SUCCEEDED`, it is skipped (`skippedConsumers.push(consumer.name)`), preventing duplicate downstream side-effects. Only Consumer 2 (and subsequent uncompleted consumers) are re-executed.

### 1.2 The Four-State Event Processing Classification
Every consumer must classify incoming events into one of four deterministic states:
1. **`NOT_YET_APPLIED`**: The event is valid, causal guards pass, and mutations must be atomically written to the projection.
2. **`ALREADY_APPLIED`**: The projection or ledger already records this exact `eventId`. The consumer returns `SUCCEEDED` immediately with zero state mutation.
3. **`ALREADY_SUBSUMED`**: A newer event has already advanced the projection state past this event's causality boundary. The consumer returns `SKIPPED_STALE` with zero state mutation.
4. **`RETRYABLE_FAILURE`**: A transient error (e.g., CAS write collision, network blip, temporary lock timeout) occurred. The consumer returns `FAILED_RETRYABLE` to trigger dispatcher exponential backoff.

---

## 2. Exhaustive Consumer Specifications (8-Point Formal Protocol)

### 2.1 `GoalIntelligenceConsumer`
- **Source File**: [`packages/execution-kernel/src/events/consumers/GoalIntelligenceConsumer.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/consumers/GoalIntelligenceConsumer.ts)
- **Class**: `GoalIntelligenceConsumer` implements `ICanonicalConsumer`
- **Target Categories**: `["DOMAIN_EVENT"]`
- **Target Event Types**:
  - `domain.task.completed`, `domain.task.uncompleted`, `domain.task.deleted`
  - `domain.goal.created`, `domain.goal.updated`, `domain.goal.progress_updated`, `domain.goal.deleted`
- **Primary Projections Written**: `GoalStatsModel` (`goalstats` collection).

#### 8-Point Operational Protocol:
1. **Event Identity**: `envelope.eventId` (UUIDv4).
2. **Aggregate Identity**: `userId:goal:goalId` (or extracted `payload.goalId` for tasks).
3. **Version Ownership**:
   - For Goal events: Owned by `Goal.version` $\to$ tracked as `derivedFromVersions.goalVersion`.
   - For Task events: Owned by `Task.version` $\to$ tracked as `derivedFromVersions.taskVersions[taskId]`.
4. **Idempotency Boundary**:
   - Direct: `currentDoc.lastEventId === envelope.eventId` $\implies$ return `SUCCEEDED`.
   - Durable: `ConsumerProcessingLedgerModel` entry `"${userId}:GoalIntelligenceConsumer:${eventId}"`.
5. **Stale-Event Behavior (Superseded vs. Missing)**:
   - *Goal Events*: If `envelope.aggregateVersion <= currentDoc.derivedFromVersions.goalVersion`, state transition is **safely superseded** $\implies$ return `SKIPPED_STALE`.
   - *Task Events*: If `envelope.aggregateVersion <= currentDoc.derivedFromVersions.taskVersions[taskId]`, task completion was already counted $\implies$ return `SKIPPED_STALE`.
   - If Task A completes at version 1 after Goal has advanced to version 5, Task A is **NOT stale** and is applied immediately!
   - *Dual-Mode Snapshot Reconciliation*:
     - **Mode A (Replica Set Active)**: Single multi-document transaction with `readConcern: { level: "snapshot" }`. Reads `Goal` and active `Task` documents atomically; computes deliverable percent; commits with CAS on `projectionRevision`.
     - **Mode B (Standalone Direct Writes)**: 5-step snapshot boundary protocol: capture fingerprint $\Sigma_{\text{source}} = \langle V_{\text{goal}}, N_{\text{tasks}}, \Sigma V_{\text{tasks}}, \max T_{\text{tasks}} \rangle$, compute metrics, pre-commit revalidate (`!Goal.exists(version > V_goal) && !Task.exists(updatedAt > maxT_tasks) && Task.countDocuments == N_tasks`), and commit via atomic CAS on `projectionRevision`.
   - **Decoupling Invariant**: `currentStreak` and `bestStreakEver` are never modified by task events. They are updated exclusively via 14-day `DailyLog` signal scans in `explainGoal`.
6. **Out-of-Order Behavior**:
   - If Task completion arrives before Goal creation event, consumer invokes `initializeFromAggregate(goalId, envelope)` to load primary `Goal` aggregate root and initialize `GoalStatsModel`.
7. **Duplicate-Event Behavior**:
   - Detects `lastEventId` match; returns `SUCCEEDED` with zero state modification.
8. **Recovery Behavior**:
   - Reconstructable via `rebuildGoalStats(goalId)`. Rebuild combines current `Goal` and `Task` documents with historical signal data for habitual cadence goals.

---

### 2.2 `ExecutionGraphConsumer`
- **Source File**: [`packages/execution-kernel/src/events/consumers/ExecutionGraphConsumer.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/consumers/ExecutionGraphConsumer.ts)
- **Class**: `ExecutionGraphConsumer` implements `ICanonicalConsumer`
- **Target Categories**: `["DOMAIN_EVENT"]`
- **Target Event Types**:
  - `domain.task.created`, `domain.task.updated`, `domain.task.completed`, `domain.task.uncompleted`, `domain.task.deleted`
- **Primary Projections Written**: `ExecutionGraphDerivedModel` (`executiongraphderiveds` collection).

#### 8-Point Operational Protocol:
1. **Event Identity**: `envelope.eventId` (UUIDv4).
2. **Aggregate Identity**: `userId:graph:graph_${userId}` (Single graph per user).
3. **Version Ownership**:
   - Individual task version owned by `Task.version` $\to$ tracked as `node.appliedVersion` on each node.
   - Graph document version owned by `projectionRevision: number` (monotonic increment on every DAG change).
   - Authoritative source boundary tracked on graph root schema as `sourceTaskCount: number`, `sourceVersionSum: number`, and `sourceMaxVersion: number`.
4. **Idempotency Boundary**:
   - Direct: `currentDoc.lastEventId === envelope.eventId` $\implies$ return `SUCCEEDED`.
   - Durable: `ConsumerProcessingLedgerModel` entry `"${userId}:ExecutionGraphConsumer:${eventId}"`.
5. **Stale-Event Behavior (Superseded vs. Missing)**:
   - For `taskId`: Look up target node $n \in \text{currentDoc.nodes}$.
   - If $n$ exists and $n.\text{appliedVersion} \ge \text{envelope.aggregateVersion}$:
     $$\text{Return } \text{SKIPPED\_STALE} \quad \text{(Safely superseded node edit)}$$
   - An event for Task B at version 1 arriving after Task A at version 5 is evaluated against Task B's node only $\implies$ **Never incorrectly discarded!**
   - Authoritative source summary fields (`sourceTaskCount`, `sourceVersionSum`, `sourceMaxVersion`) are updated on DAG recalculation, enabling sub-2ms proof of graph freshness.
6. **Out-of-Order Behavior**:
   - If a completion event arrives for a task not yet present in `nodes`, consumer auto-inserts the node with status `"completed"` and `appliedVersion = envelope.aggregateVersion`, then computes DAG unblocking.
7. **Duplicate-Event Behavior**:
   - Returns `SUCCEEDED` immediately; no duplicate DAG unblocking passes.
8. **Recovery Behavior**:
   - Reconstructable via `rebuildExecutionGraph(userId)`. Scans active tasks from `Task.find({ userId })`, computes ready/blocked sets, and overwrites projection with incremented `projectionRevision`.

---

### 2.3 `TemporalConflictConsumer`
- **Source File**: [`packages/execution-kernel/src/events/consumers/TemporalConflictConsumer.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/consumers/TemporalConflictConsumer.ts)
- **Class**: `TemporalConflictConsumer` implements `ICanonicalConsumer`
- **Target Categories**: `["DOMAIN_EVENT"]`
- **Target Event Types**:
  - `domain.temporal.scheduled`, `domain.temporal.rescheduled`, `domain.temporal.occurrence_created`, `domain.temporal.occurrence_deleted`, `domain.task.completed`
- **Primary Projections Written**: `ScheduleConflictReportModel` (`scheduleconflictreports` collection).

#### 8-Point Operational Protocol:
1. **Event Identity**: `envelope.eventId` (UUIDv4).
2. **Aggregate Identity**: `userId:day:dateOnly` (Composite day partition key).
3. **Version Ownership**:
   - Partition sweep owned by `sweepRevision: number` on `ScheduleConflictReportModel`.
   - Source partition integrity owned by `sourcePartitionHash: string` (SHA-256 over sorted tuple manifest).
4. **Idempotency Boundary**:
   - Direct: `currentDoc.lastEventId === envelope.eventId` $\implies$ return `SUCCEEDED`.
   - Durable: `ConsumerProcessingLedgerModel` entry `"${userId}:TemporalConflictConsumer:${eventId}"`.
5. **Stale-Event Behavior (Superseded vs. Missing)**:
   - Events act as **invalidation triggers**.
   - Builds sorted tuple manifest $\mathcal{M}_{\text{source}} = [(o.\text{id}, o.\text{version}, o.\text{status}, o.\text{startMinute}, o.\text{endMinute})]$ and computes SHA-256 hash $H_{\text{source}}$.
   - Pre-commit check re-verifies $H_{\text{source}}^{\text{current}} == H_{\text{source}}$. If any occurrence was rescheduled into/out of the day, canceled, or adjusted mid-sweep, the sweep aborts and retries authoritatively.
   - If a sweep completes but CAS on `sweepRevision` matches 0 documents (indicating a newer sweep committed in parallel), the older sweep's result is **safely discarded** and the sweep retries authoritatively.
   - Background automation periodically executes `reconcileStaleScheduleReports(userId, activeDateStr)` to guarantee eventual consistency for delayed or lost events.
6. **Out-of-Order Behavior**:
   - Because the consumer authoritatively queries all active occurrences for `(userId, dateOnly)` from MongoDB, arrival order does not matter; the resulting report reflects current primary database state.
7. **Duplicate-Event Behavior**:
   - Idempotent return via ledger or `lastEventId`.
8. **Recovery Behavior**:
   - Reconstructable via `rebuildScheduleConflicts(userId, dateOnly)`.
   - **Human Governance Rule**: Consequential changes are strictly marked `humanGovernanceStatus: "PENDING_CONFIRMATION"`.

---

### 2.4 `PhysicalReadinessConsumer`
- **Source File**: [`packages/execution-kernel/src/events/consumers/PhysicalReadinessConsumer.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/consumers/PhysicalReadinessConsumer.ts)
- **Class**: `PhysicalReadinessConsumer` implements `ICanonicalConsumer`
- **Target Categories**: `["DOMAIN_EVENT", "TELEMETRY_EVENT"]`
- **Target Event Types**:
  - `domain.health.workout_logged`, `domain.physical.session_deleted`, `telemetry.wearables.ingested`
- **Primary Projections Written**: `DailyLog` (`dailylogs` collection).

#### 8-Point Operational Protocol:
1. **Event Identity**: `envelope.eventId` (UUIDv4).
2. **Aggregate Identity**: `userId:day:dateOnly` (Daily log document key).
3. **Version Ownership**:
   - Primary document version owned by `DailyLog.version` (integer).
4. **Idempotency Boundary**:
   - Direct: `currentDoc.lastEventId === envelope.eventId` $\implies$ return `SUCCEEDED`.
   - Durable: `ConsumerProcessingLedgerModel` entry.
5. **Stale-Event Behavior (Superseded vs. Missing)**:
   - *Workouts*: Handled via Authoritative Session Sweep of `WorkoutSession` collection. Any deletion or edit is authoritatively reconciled; strain is recomputed as $1 - \prod(1 - S_i)$.
   - *Wearables*: Guarded by `currentDoc.derivedFromCausalSequence >= envelope.causalSequence`. Older telemetry batches are skipped as stale.
6. **Out-of-Order Behavior**:
   - Handled cleanly via Lock-Free CAS on `DailyLog.version` with in-band jittered retry loop (up to 5 attempts).
7. **Duplicate-Event Behavior**:
   - Returns `SUCCEEDED` with zero modification.
8. **Recovery Behavior**:
   - Reconstructable via `rebuildDailyLogPhysical(userId, dateOnly)`. Preserves sleep, habits, and cognitive fields owned by other domains.

---

### 2.5 `CadenceLearningConsumer`
- **Source File**: [`packages/execution-kernel/src/events/consumers/CadenceLearningConsumer.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/consumers/CadenceLearningConsumer.ts)
- **Class**: `CadenceLearningConsumer` implements `ICanonicalConsumer`
- **Target Categories**: `["DOMAIN_EVENT"]`
- **Target Event Types**:
  - `domain.temporal.scheduled`, `domain.temporal.rescheduled`, `domain.physical.workout_logged`, `domain.task.completed`
- **Primary Projections Written**: `CadenceProfile` (`cadenceprofiles` collection).

#### 8-Point Operational Protocol:
1. **Event Identity**: `envelope.eventId` (UUIDv4).
2. **Aggregate Identity**: `userId:cadence:dayOfWeek` (`MONDAY` $\dots$ `SUNDAY`).
3. **Version Ownership**: Owned by `CadenceProfileRepository`.
4. **Idempotency Boundary**: `chronicleId = "chron_" + envelope.eventId`.
5. **Stale-Event Behavior**: Historical chronicles are sorted by `startedAtMs` before circular averaging; older events adjust variance spread without corrupting centroids.
6. **Out-of-Order Behavior**: Trigonometric averaging over historical windows absorbs out-of-order deliveries gracefully.
7. **Duplicate-Event Behavior**: Handled via `ConsumerProcessingLedgerModel`.
8. **Recovery Behavior**: Rebuilt by streaming the past 30 days of completed occurrences, workouts, and tasks.

---

### 2.6 `BehavioralIntelligenceConsumer`
- **Source File**: [`packages/execution-kernel/src/events/consumers/BehavioralIntelligenceConsumer.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/consumers/BehavioralIntelligenceConsumer.ts)
- **Class**: `BehavioralIntelligenceConsumer` implements `ICanonicalConsumer`
- **Target Categories**: `["DOMAIN_EVENT", "OBSERVATION_EVENT"]`
- **Target Event Types**:
  - `domain.task.*`, `domain.signal.logged`, `domain.health.workout_logged`
- **Primary Projections Written**: `BehavioralProfile` (`behavioralprofiles` collection).

#### 8-Point Operational Protocol:
1. **Event Identity**: `obs_{aggregateType}_{aggregateId}_v{aggregateVersion}_{eventOrdinal}`.
2. **Aggregate Identity**: `userId:profile:behavioral`.
3. **Version Ownership**: Monotonic `BehavioralProfile.projectionRevision`.
4. **Idempotency Boundary**: L1 observation ring buffer (size: 50) + L2 durable observation journal (`BehavioralObservationModel`).
5. **Stale-Event Behavior**: Out-of-order retention guaranteed via Option C ingestion; historical records appended to journal without duplicating window metrics.
6. **Out-of-Order Behavior**: CAS on `projectionRevision` rejects concurrent writes with `FAILED_RETRYABLE` for clean dispatcher retry.
7. **Duplicate-Event Behavior**: Returns `SKIPPED_ALREADY_APPLIED` $\to$ `SUCCEEDED`.
8. **Recovery Behavior**: Rebuilt by re-streaming all observations from `BehavioralObservationModel.find({ userId }).sort({ observedAt: 1 })`.

---

### 2.7 `CognitiveHistoryConsumer`
- **Source File**: [`packages/execution-kernel/src/events/consumers/CognitiveHistoryConsumer.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/consumers/CognitiveHistoryConsumer.ts)
- **Class**: `CognitiveHistoryConsumer` implements `ICanonicalConsumer`
- **Target Categories**: `["TELEMETRY_EVENT", "OBSERVATION_EVENT"]`
- **Target Event Types**:
  - `telemetry.wearables.ingested`, `observation.cognitive.assessed`
- **Primary Projections Written**: `CognitiveStateHistoryModel` (`cognitivestatehistories` collection).

#### 8-Point Operational Protocol:
1. **Event Identity**: `envelope.eventId` (UUIDv4).
2. **Aggregate Identity**: `userId:cognitive:time_series`.
3. **Version Ownership**: Append-only time-series (No version updates; each record immutable).
4. **Idempotency Boundary**: Compound unique index `{ userId: 1, timestamp: 1 }`.
5. **Stale-Event Behavior**: Older telemetry inserts past snapshots without altering current active window.
6. **Out-of-Order Behavior**: Sorted by `timestamp` on query; delivery order irrelevant.
7. **Duplicate-Event Behavior**: Query check `findOne({ userId, timestamp })` returns `SUCCEEDED`.
8. **Recovery Behavior**: Time-series collection with 90-day TTL index.
