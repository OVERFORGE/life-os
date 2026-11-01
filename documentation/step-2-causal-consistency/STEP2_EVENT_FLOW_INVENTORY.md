# LIFEOS STEP 2 — EVENT FLOW INVENTORY
## End-to-End Aggregate-to-Outbox-to-Consumer-to-Projection Pipeline
**Document Version:** 2.2.0  
**Phase:** Step 2 Architecture & Planning Review  
**Governing Specification:** LifeOS V2.3.0 Final Architectural Specification  
**Classification:** Authoritative Technical Inventory  

---

## Document Changelog

### V2.1.0 $\to$ V2.2.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **Dual-Mode Snapshot Reconciliation Protocol** | R-03, R-09: GoalStats Under Contention | Loop 1 | Updated `GoalIntelligenceConsumer` from isolated non-transactional reads to Dual-Mode Reconciliation: Mode A executes multi-document snapshot transactions (`readConcern: "snapshot"`); Mode B executes a 5-step source snapshot boundary protocol ($\Sigma_{\text{source}} = \langle V_{\text{goal}}, N_{\text{tasks}}, \Sigma V_{\text{tasks}}, \max T_{\text{tasks}}\rangle$) with pre-commit revalidation and bounded 3-retry CAS. Preserves strict habit streak decoupling. |
| **Authoritative Source State Fingerprint** | R-02, R-08: Execution Graph Freshness TOCTOU | Loop 2 | Replaced naive timestamp predicate in `ExecutionGraph.buildFromDatabase` with indexed aggregation fingerprint (`sourceTaskCount`, `sourceVersionSum`, `sourceMaxVersion`) and dead-letter/pending outbox check. Added explicit degraded fast-path signature (`{ graph, isDegraded: true, stalenessReason }`). |
| **Deterministic Temporal Partition Manifest Hash** | R-10: Occurrence Reorder Collision | Loop 3 | Replaced scalar sum fingerprint with deterministic SHA-256 partition manifest hash ($H_{\text{source}} = \text{SHA256}(\mathcal{M}_{\text{source}})$) across sorted occurrence tuples, eliminating fingerprint collisions when occurrences are rescheduled across identical boundaries. |

### V2.0.0 $\to$ V2.1.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **Authoritative Task Reconciliation in Flow** | R-03, R-09: Counter Drift | Loop 1 | Updated `GoalIntelligenceConsumer` flow from incremental delta math (`+= 1` / `-= 1`) to authoritative count queries (`Task.countDocuments`), guaranteeing zero drift under out-of-order, retried, or deleted tasks. |
| **Source Snapshot Revalidation in Temporal Flow** | R-10: Stale Sweep Overwrites | Loop 3 | Updated `TemporalConflictConsumer` flow to capture source occurrence snapshot fingerprint and revalidate before report CAS commit, preventing stale overwrite on mid-sweep occurrence mutations. |
| **Graph Cache Freshness & Rebuild TOCTOU** | R-02, R-08: Stale Graph Serving | Loop 2 | Incorporated 2-clause freshness predicate and snapshot revalidation on graph rebuild into the execution graph consumer/read flow. |

### V1.0.0 $\to$ V2.0.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **Event Processing Semantics Classification** | R-01: Causal Misclassification | Loop 1, 2, 3 | Formally classified every event into one of four processing types: **Incremental Effect**, **Aggregate State Transition**, **Invalidation Trigger**, or **Historical Observation Record**. Prevents incorrect assumptions about event supersession. |
| **Complete Task Lifecycle Mapping** | R-08: Incomplete Graph Lifecycle | Loop 2 | Added full event specs for `domain.task.created`, `domain.task.updated`, `domain.task.uncompleted`, and `domain.task.deleted`, tracing exact topology changes in `ExecutionGraphDerivedModel`. |
| **Temporal Lifecycle & Deletion Invalidation** | R-01: Stale Schedule Reports | Loop 3 | Added `domain.temporal.occurrence_deleted` and soft-archival triggers to ensure schedule conflict reports are invalidated when calendar events are removed. |
| **Multi-Aggregate Identity Formalization** | R-05: Interleaved Leases | Loop 4 | Defined canonical aggregate key as composite `tenantId:aggregateType:aggregateId` across all flows. |

---

## 1. Event Processing Semantics Taxonomy

In LifeOS, outbox events cannot all be handled using a single generic consumer strategy. Step 2 formally classifies all event flows into **four deterministic processing archetypes**:

```
                                  Outbox Event
                                       │
        ┌───────────────────┬──────────┴──────────┬───────────────────┐
        ▼                   ▼                     ▼                   ▼
  1. Incremental      2. Aggregate State     3. Invalidation     4. Historical
     Effect             Transition              Trigger             Observation
  (e.g. Task          (e.g. Goal             (e.g. Occurrence     (e.g. Cognitive
  Completion Counter)  Deliverable Pct)       Rescheduled)         Assessment)
        │                   │                     │                   │
  Requires Per-       Direct Scalar CAS       Triggers Full       Append-Only
  Constituent Map     Version Fencing         Authoritative Sweep  Time-Series
```

1. **Incremental Effect**: The event conveys an incremental addition or subtraction to a cumulative metric (e.g. completing a task increments `completedTasksCount` on `GoalStatsModel`).
   - *Causal Invariant*: Must **never** be silently skipped or dropped due to a newer event on a different aggregate. Requires per-constituent version mapping.
2. **Aggregate State Transition**: The event conveys a full state change for a single aggregate root (e.g. `domain.goal.progress_updated` sets deliverable progress to $75\%$).
   - *Causal Invariant*: An event with version $V \le V_{\text{applied}}$ for that aggregate root is **safely superseded** and can be classified as `SKIPPED_STALE`.
3. **Invalidation Trigger**: The event signals that a bounded partition of state has mutated, invalidating any cached derived report (e.g. scheduling/rescheduling an occurrence invalidates `ScheduleConflictReportModel` for that `dateOnly`).
   - *Causal Invariant*: The consumer does not do incremental delta math; it authoritatively sweeps all active records in the partition and writes the report protected by a monotonic `sweepRevision` CAS token.
4. **Historical Observation Record**: The event conveys an append-only snapshot of real-world evidence or telemetry (e.g. wearable heart rate, cognitive state assessment, behavioral journal entry).
   - *Causal Invariant*: Append-only with deterministic identity (`obs_...` or timestamp). Idempotent on redelivery; zero overwrites of established history.

---

## 2. Complete Event Flow Matrix

| Event Type | Aggregate Type | Source Adapter | Processing Archetype | Consumers Subscribed | Target Projections Updated | State Mutation in Projection | Causal Boundary & Fencing Key |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `domain.task.completed` | `task` | `TaskActionAdapters.ts` | **Incremental Effect** & **State Transition** | 1. `GoalIntelligenceConsumer`<br>2. `ExecutionGraphConsumer`<br>3. `TemporalConflictConsumer`<br>4. `CadenceLearningConsumer`<br>5. `BehavioralIntelligenceConsumer` | 1. `GoalStatsModel`<br>2. `ExecutionGraphDerivedModel`<br>3. `ScheduleConflictReportModel`<br>4. `CadenceProfile`<br>5. `BehavioralProfile` | 1. Increments `completedTasksCount`; recomputes percent.<br>2. Sets node status `"completed"`; unblocks downstream DAG nodes.<br>3. Invalidates remaining day conflict report.<br>4. Appends task execution chronicle.<br>5. Ingests execution observation; advances velocity. | `userId:goal:goalId` (Constituent map `taskVersions[taskId]`), `userId:graph:graphId` (Node `appliedVersion`), `userId:day:dateOnly` (Sweep revision). |
| `domain.task.created` | `task` | `TaskActionAdapters.ts` | **State Transition** | 1. `ExecutionGraphConsumer`<br>2. `BehavioralIntelligenceConsumer` | 1. `ExecutionGraphDerivedModel`<br>2. `BehavioralProfile` | 1. Appends new pending node and incoming/outgoing edges.<br>2. Logs task creation observation to behavioral journal. | `userId:graph:graphId` (Node `appliedVersion`), `userId:profile` (Revision CAS). |
| `domain.task.updated` | `task` | `TaskActionAdapters.ts` | **State Transition** | 1. `ExecutionGraphConsumer` | 1. `ExecutionGraphDerivedModel` | Updates node title, priority, or prerequisite dependency edges. | `userId:graph:graphId` (Node `appliedVersion`). |
| `domain.task.uncompleted`| `task` | `TaskActionAdapters.ts` | **Incremental Effect** & **State Transition** | 1. `GoalIntelligenceConsumer`<br>2. `ExecutionGraphConsumer` | 1. `GoalStatsModel`<br>2. `ExecutionGraphDerivedModel` | 1. Decrements `completedTasksCount`; recomputes percent.<br>2. Re-blocks downstream dependencies. | `userId:goal:goalId` (Constituent map), `userId:graph:graphId` (Node `appliedVersion`). |
| `domain.task.deleted` | `task` | `TaskActionAdapters.ts` | **State Transition** | 1. `ExecutionGraphConsumer`<br>2. `GoalIntelligenceConsumer` | 1. `ExecutionGraphDerivedModel`<br>2. `GoalStatsModel` | 1. Removes node and prunes edges.<br>2. Adjusts total task counts. | `userId:graph:graphId` (Node `appliedVersion`), `userId:goal:goalId`. |
| `domain.goal.created` | `goal` | `GoalActionAdapters.ts` | **State Transition** | 1. `GoalIntelligenceConsumer` | 1. `GoalStatsModel` | Initializes derived `GoalStats` document with 0% progress, 0 milestones. | `userId:goal:goalId` (Scalar `goalVersion`). |
| `domain.goal.progress_updated` | `goal` | `GoalActionAdapters.ts` | **State Transition** | 1. `GoalIntelligenceConsumer` | 1. `GoalStatsModel` | Updates `deliverableProgressPercent`, `completedMilestonesCount`, `totalMilestonesCount`. | `userId:goal:goalId` (Scalar `goalVersion`). |
| `domain.goal.updated` | `goal` | `GoalActionAdapters.ts` | **State Transition** | 1. `GoalIntelligenceConsumer` | 1. `GoalStatsModel` | Updates target dates, titles, milestone structures. | `userId:goal:goalId` (Scalar `goalVersion`). |
| `domain.goal.deleted` | `goal` | `GoalActionAdapters.ts` | **State Transition** | 1. `GoalIntelligenceConsumer` | 1. `GoalStatsModel` | Marks derived projection status as `"archived"` with `archivedAt` timestamp. | `userId:goal:goalId` (Scalar `goalVersion`). |
| `domain.temporal.scheduled` | `occurrence` | `TemporalActionAdapters.ts` | **Invalidation Trigger** | 1. `TemporalConflictConsumer`<br>2. `CadenceLearningConsumer` | 1. `ScheduleConflictReportModel`<br>2. `CadenceProfile` | 1. Invalidates date report; triggers authoritative day sweep for overlaps.<br>2. Feeds schedule interval into day-of-week cadence bucket. | `userId:day:dateOnly` (`sweepRevision` CAS token). |
| `domain.temporal.rescheduled` | `occurrence` | `TemporalActionAdapters.ts` | **Invalidation Trigger** | 1. `TemporalConflictConsumer`<br>2. `CadenceLearningConsumer` | 1. `ScheduleConflictReportModel`<br>2. `CadenceProfile` | 1. Invalidates both old and new date reports; triggers sweeps.<br>2. Adjusts cadence distribution. | `userId:day:dateOnly` (`sweepRevision` CAS token). |
| `domain.temporal.occurrence_created` | `occurrence` | `TemporalActionAdapters.ts` | **Invalidation Trigger** | 1. `TemporalConflictConsumer` | 1. `ScheduleConflictReportModel` | Invalidates target date report; sweeps all active day occurrences. | `userId:day:dateOnly` (`sweepRevision` CAS token). |
| `domain.temporal.occurrence_deleted` | `occurrence` | `TemporalActionAdapters.ts` | **Invalidation Trigger** | 1. `TemporalConflictConsumer` | 1. `ScheduleConflictReportModel` | Clears conflicts caused by deleted occurrence via authoritative day sweep. | `userId:day:dateOnly` (`sweepRevision` CAS token). |
| `domain.health.workout_logged` | `workout_session` | `WorkoutActionAdapters.ts` | **Invalidation Trigger** & **Historical Obs** | 1. `PhysicalReadinessConsumer`<br>2. `CadenceLearningConsumer`<br>3. `BehavioralIntelligenceConsumer` | 1. `DailyLog`<br>2. `CadenceProfile`<br>3. `BehavioralProfile` | 1. Sweeps active sessions on date; recalculates daily strain: $1 - \prod(1 - S_i)$.<br>2. Partitions workout duration into circadian routine profile.<br>3. Updates physical activity frequency in behavioral profile. | `userId:day:dateOnly` (`DailyLog.version` CAS), `userId:profile` (Revision CAS). |
| `domain.physical.session_deleted` | `workout_session` | `WorkoutActionAdapters.ts` | **Invalidation Trigger** | 1. `PhysicalReadinessConsumer` | 1. `DailyLog` | Sweeps active sessions; recalculates strain; resets to 0 if none remain. | `userId:day:dateOnly` (`DailyLog.version` CAS). |
| `telemetry.wearables.ingested` | `telemetry_batch` | Ingestion Service | **State Transition** & **Historical Obs** | 1. `PhysicalReadinessConsumer`<br>2. `CognitiveHistoryConsumer` | 1. `DailyLog`<br>2. `CognitiveStateHistoryModel` | 1. Updates `steps`, `restingHeartRate`, `sleepQuality` via CAS.<br>2. Creates new cognitive state snapshot (`stress`, `energy`, `cognitiveLoad`, `focusReadiness`). | `userId:day:dateOnly`, `(userId, timestamp)` unique key. |
| `observation.cognitive.assessed` | `cognitive_assessment` | Cognitive Assessment Service | **Historical Obs** | 1. `CognitiveHistoryConsumer` | 1. `CognitiveStateHistoryModel` | Appends validated cognitive snapshot with 4-hour validity horizon. | `(userId, timestamp)` unique key. |
| `domain.signal.logged` | `signal` | `HabitActionAdapters.ts` | **Historical Obs** | 1. `BehavioralIntelligenceConsumer` | 1. `BehavioralProfile` | Ingests subjective mood, energy, or cognitive rating into ring buffer. | `userId:profile` (Revision CAS). |

---

## 3. Detailed Consumer-by-Consumer Flow Analysis

### 3.1 Goal Intelligence Flow
- **Archetype**: Authoritative Reconciliation (for Tasks) + Aggregate State Transition (for Goals).
- **Triggers**: `domain.task.completed`, `domain.task.uncompleted`, `domain.task.deleted`, `domain.goal.progress_updated`, `domain.goal.created`, `domain.goal.deleted`.
- **Target Model**: `GoalStatsModel` (`goalstats` collection).
- **Execution Logic**:
  1. For `domain.goal.*`:
     - Evaluates `envelope.aggregateVersion <= currentDoc.derivedFromVersions.goalVersion`. If true, returns `SKIPPED_STALE` (safely superseded).
     - Otherwise, applies full state transition (`deliverableProgressPercent`, milestones) and updates `derivedFromVersions.goalVersion = envelope.aggregateVersion`.
  2. For `domain.task.*` (`completed`, `uncompleted`, `deleted`):
     - Checks constituent map: `envelope.aggregateVersion <= currentDoc.derivedFromVersions.taskVersions[taskId]`. If true, returns `SKIPPED_STALE`.
     - Otherwise, executes **Dual-Mode Snapshot Reconciliation Protocol**:
       - **Mode A (Replica Set Active)**: Executes within a multi-document transaction with `readConcern: { level: "snapshot" }`. Reads `Goal` and active `Task` documents atomically; computes deliverable metrics; commits projection update with CAS on `projectionRevision`.
       - **Mode B (Standalone Direct Writes)**: Executes a 5-step source snapshot boundary protocol:
         1. Capture source fingerprint: $\Sigma_{\text{source}} = \langle V_{\text{goal}}, N_{\text{tasks}}, \Sigma V_{\text{tasks}}, \max T_{\text{tasks}} \rangle$.
         2. Read primary `Task` collection:
            ```typescript
            const [completedTasksCount, totalTasksCount] = await Promise.all([
              this.taskModel.countDocuments({ goalId, status: "completed" }),
              this.taskModel.countDocuments({ goalId, status: { $nin: ["archived", "deleted"] } }),
            ]);
            ```
         3. Recompute deliverable progress percent: `totalTasksCount > 0 ? (completedTasksCount / totalTasksCount) * 100 : 0`.
         4. Pre-commit revalidate: verifies `!Goal.exists({ _id: goalId, version: { $gt: V_goal } })` and active task counts/versions have not mutated.
         5. Commit atomically via CAS on `projectionRevision` (up to 3 retries under contention).
     - Sets `derivedFromVersions.taskVersions[taskId] = envelope.aggregateVersion`.
     - **Decoupling Invariant**: Never mutates `currentStreak` or `bestStreakEver` from task events. Habitual cadence streaks are computed exclusively from 14 days of `DailyLog` historical signals via `explainGoal`.
  3. Commits atomically via MongoDB `$set` condition enforcing CAS on constituent versions and `projectionRevision`.

### 3.2 Execution Graph Flow
- **Archetype**: Aggregate State Transition per Node + Topological DAG Recalculation + Freshness Cache.
- **Triggers**: `domain.task.created`, `domain.task.updated`, `domain.task.completed`, `domain.task.uncompleted`, `domain.task.deleted`.
- **Target Model**: `ExecutionGraphDerivedModel` (`executiongraphderiveds` collection).
- **Execution Logic**:
  1. Resolves `graphId = "graph_" + userId`.
  2. Reads existing projection or reconstructs from `Task.find({ userId })`.
  3. Checks target node: `existingNode?.appliedVersion >= envelope.aggregateVersion`. If true, returns `SKIPPED_STALE`.
  4. Mutates node subdocument (`status`, `dependencies`, `title`) and sets `appliedVersion = envelope.aggregateVersion`.
  5. Computes complete set of completed task IDs:
     $$\mathcal{C} = \{n.\text{id} \mid n \in \text{nodes} \land n.\text{status} = \text{"completed"}\}$$
  6. Computes newly unblocked tasks:
     $$\mathcal{U} = \{n.\text{id} \mid n \in \text{nodes} \land n.\text{status} = \text{"pending"} \land n.\text{dependencies} \subseteq \mathcal{C}\}$$
  7. Updates `unblockedTaskIds = Array.from(\mathcal{U})`, sets `lastAppliedAt = new Date()`, updates source state metadata (`sourceTaskCount`, `sourceVersionSum`, `sourceMaxVersion`), and increments `projectionRevision = projectionRevision + 1`.
  8. Commits atomically via CAS on `projectionRevision`.
  9. **Read-Side Freshness Contract**: `ExecutionGraph.buildFromDatabase(userId)` evaluates freshness against the Authoritative Source State Fingerprint:
     - Checks pending/processing/dead-letter outbox events: `OutboxEventModel.exists({ userId, aggregateType: "task", deliveryStatus: { $in: ["PENDING", "PROCESSING", "DEAD_LETTER"] } })`.
     - Executes indexed aggregation on active tasks (`status: { $nin: ["archived", "deleted"] }`) to compute `currentCount`, `currentVersionSum`, `currentMaxVersion`.
     - Freshness verified iff:
       $$\text{IsFresh} \iff (\text{cached.sourceTaskCount} == \text{currentCount}) \land (\text{cached.sourceVersionSum} == \text{currentVersionSum}) \land (\text{cached.sourceMaxVersion} == \text{currentMaxVersion})$$
     - If stale and degraded read allowed by caller, returns explicit `{ graph, isDegraded: true, stalenessReason }`. Stale graphs are NEVER silently returned as authoritative.
     - If authoritative read required or degraded disallowed, rebuilds in-memory directly from primary tasks and commits via CAS on `projectionRevision` (with up to 3 retries).

### 3.3 Temporal Conflict Flow
- **Archetype**: Invalidation Trigger $\to$ Authoritative Day Sweep with Source Fencing.
- **Triggers**: `domain.temporal.scheduled`, `domain.temporal.rescheduled`, `domain.temporal.occurrence_created`, `domain.temporal.occurrence_deleted`, `domain.task.completed`.
- **Target Model**: `ScheduleConflictReportModel` (`scheduleconflictreports` collection).
- **Execution Logic**:
  1. Resolves `targetDate = payload.dateOnly || payload.date`.
  2. Fetches current report to read `sweepRevision`.
  3. Captures **Deterministic Temporal Partition Manifest Hash**:
     - Queries active occurrences: `TemporalOccurrence.find({ userId, dateOnly: targetDate, status: { $in: ["SCHEDULED", "IN_PROGRESS"] } }).sort({ "plannedInterval.startMinute": 1, _id: 1 })`.
     - Constructs canonical ordered manifest:
       $$\mathcal{M}_{\text{source}} = \big[\big(o.\text{id}, o.\text{version}, o.\text{status}, o.\text{startMinute}, o.\text{endMinute}\big) \big]_{o \in \mathcal{O}}$$
     - Computes hash token:
       $$H_{\text{source}} = \text{SHA256}\big(\mathcal{M}_{\text{source}}\big)$$
  4. Sweeps intervals pairwise: identifies intersections $[s_i, e_i] \cap [s_j, e_j] > 0$.
  5. Generates conflict items and non-destructive proposed adjustments.
  6. **Human Governance Invariant**: Strictly marks all repair proposals with `humanGovernanceStatus: "PENDING_CONFIRMATION"`.
  7. **Pre-Commit Source Revalidation**: Re-queries active occurrences and verifies $H_{\text{source}}^{\text{current}} == H_{\text{source}}$. If any occurrence was rescheduled, created, or deleted mid-sweep, aborts and retries sweep.
  8. Commits updated report with atomic CAS:
     `{ reportId, sweepRevision: currentRevision }` $\to$ `$set: { ... }, $inc: { sweepRevision: 1 }`.
     If CAS matches 0 documents (race with concurrent sweep), retries sweep up to 3 times before deferring to background sweeper.
  9. Background automation periodically runs `reconcileStaleScheduleReports(userId, activeDateStr)` to guarantee eventual consistency for delayed events.

### 3.4 Physical Readiness Flow
- **Archetype**: Invalidation Trigger (Workouts) + State Transition (Wearables).
- **Triggers**: `domain.health.workout_logged`, `domain.physical.session_deleted`, `telemetry.wearables.ingested`.
- **Target Model**: `DailyLog` (`dailylogs` collection).
- **Execution Logic**:
  1. Resolves `targetDate = payload.dateOnly`.
  2. If workout event:
     - Authoritatively queries: `WorkoutSession.find({ userId, dateOnly: targetDate, status: { $ne: "deleted" } })`.
     - Recalculates asymptotic cumulative strain:
       $$S_{\text{daily}} = 1 - \prod_{i=1}^n (1 - S_i)$$
     - If $n = 0$, resets `strain = 0`, `durationMinutes = 0`, `sessionsCount = 0`.
  3. If wearable telemetry event:
     - Evaluates `envelope.causalSequence <= currentDoc.derivedFromCausalSequence`. If true, returns `SKIPPED_STALE`.
     - Merges `steps`, `restingHeartRate`, `sleepQuality`.
  4. Commits via Lock-Free CAS on `DailyLog.version` with exponential backoff on collision.

### 3.5 Cadence Learning Flow
- **Archetype**: Historical Observation Journaling $\to$ Circular Statistics.
- **Triggers**: `domain.temporal.scheduled`, `domain.temporal.rescheduled`, `domain.physical.workout_logged`, `domain.task.completed`.
- **Target Repository**: `CadenceProfileRepository`.
- **Execution Logic**:
  1. Synthesizes `ExecutionChronicleEntry` with timestamp, duration, activity type.
  2. Partitions by day of week (`MONDAY` $\dots$ `SUNDAY`).
  3. Recomputes circular minute centroids modulo-1440.
  4. Persists updated profile to `CadenceProfileRepository`.

### 3.6 Behavioral Intelligence Flow
- **Archetype**: Historical Observation Ingestion $\to$ CAS Revision Advancement.
- **Triggers**: `domain.task.*`, `domain.signal.logged`, `domain.health.workout_logged`.
- **Target Repository**: `BehavioralProfileRepository`.
- **Execution Logic**:
  1. Derives deterministic identity: `obs_{aggregateType}_{aggregateId}_v{aggregateVersion}_{eventOrdinal}`.
  2. Queries ring buffer; returns `SKIPPED_ALREADY_APPLIED` on duplicate.
  3. Appends observation to L2 journal.
  4. Updates velocity, daily volume, and behavioral drift.
  5. Commits via CAS on `projectionRevision`.

### 3.7 Cognitive History Flow
- **Archetype**: Append-Only Historical Time-Series.
- **Triggers**: `telemetry.wearables.ingested`, `observation.cognitive.assessed`.
- **Target Model**: `CognitiveStateHistoryModel`.
- **Execution Logic**:
  1. Checks for existing snapshot at `(userId, timestamp)` for idempotency.
  2. Clamps dimensions to $[0.0, 1.0]$.
  3. Attaches 4-hour temporal validity window.
  4. Inserts new snapshot into `CognitiveStateHistoryModel`.
