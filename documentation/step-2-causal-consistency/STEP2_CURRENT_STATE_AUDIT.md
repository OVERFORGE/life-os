# LIFEOS STEP 2 — CURRENT STATE ARCHITECTURAL AUDIT
## Causal Consistency, Projection Convergence & Subsystem Reality
**Document Version:** 2.2.0  
**Phase:** Step 2 Architecture & Planning Review  
**Governing Specification:** LifeOS V2.3.0 Final Architectural Specification  
**Classification:** Authoritative Technical Audit  

---

## Document Changelog

### V2.1.0 $\to$ V2.2.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **Execution Graph Freshness TOCTOU Audit** | R-02, R-08: Stale Graph Serving | Loop 2 | Proved that naive timestamp predicates (`updatedAt > lastAppliedAt`) fail to detect task deletions and millisecond clock collisions. Formally prescribed Authoritative Source State Fingerprint (`sourceTaskCount`, `sourceVersionSum`, `sourceMaxVersion`) via indexed aggregation, outbox status verification, and explicit degraded fast-path return semantics. |
| **GoalStats Snapshot Reconciliation Audit** | R-03, R-09: GoalStats Under Contention | Loop 1 | Proved that un-isolated count queries risk skewed deliverable progress ratios under concurrent writes. Formally specified Dual-Mode Reconciliation: Mode A executes multi-document snapshot transactions (`readConcern: "snapshot"`); Mode B executes a 5-step source snapshot boundary protocol ($\Sigma_{\text{source}} = \langle V_{\text{goal}}, N_{\text{tasks}}, \Sigma V_{\text{tasks}}, \max T_{\text{tasks}}\rangle$) with pre-commit revalidation and bounded 3-retry CAS. Preserves strict habit streak decoupling. |
| **Atomic Worker Partition Lease Protocol** | R-05: Duplicate Key Leases | Loop 4 | Proved that conditional `findOneAndUpdate` with `upsert: true` throws `MongoServerError: E11000` under active lease contention. Formally replaced with the Seed-or-Acquire Protocol (Step 1 atomic CAS without upsert, Step 2 exists check, Step 3 atomic create catching E11000) and monotonic sequence dispatch. |
| **Deterministic Temporal Partition Manifest Hash** | R-10: Occurrence Reorder Collision | Loop 3 | Proved that scalar sum fingerprints collide under occurrence swaps/reorders. Formally specified deterministic SHA-256 partition manifest hash ($H_{\text{source}} = \text{SHA256}(\mathcal{M}_{\text{source}})$) and pre-commit revalidation. |
| **Dead-Letter Consumer Ledger Reset Audit** | R-07: Incomplete Replay Recovery | Loop 4 | Proved that resetting outbox status alone leaves sibling consumers in `FAILED_TERMINAL`. Formally specified paired Consumer Processing Ledger reset (`updateMany` to `PENDING_RETRY`) while preserving `SUCCEEDED` sibling consumers. |

### V2.0.0 $\to$ V2.1.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **Forensic Drift Elimination** | R-03, R-09: Counter Drift | Loop 1 | Proved that incremental arithmetic in `GoalIntelligenceConsumer` causes permanent count drift under out-of-order delivery. Formally audited and prescribed authoritative task reconciliation (`Task.countDocuments`). |
| **Temporal Sweep Source Mutation Race** | R-10: Stale Sweep Overwrites | Loop 3 | Proved that `sweepRevision` CAS alone does not prevent publishing obsolete conflict reports when primary occurrences mutate mid-sweep. Prescribed source snapshot fingerprinting and pre-commit revalidation. |
| **Concurrent Worker Aggregate Race Audit** | R-05: Non-Partitioned Leases | Loop 4 | Proved that in-memory candidate sorting fails under concurrent worker queries. Formally specified atomic aggregate partition mutual exclusion via MongoDB `findOneAndUpdate` CAS on `partitionKey = "${userId}:${aggregateType}:${aggregateId}"`. |
| **Dead-Letter Replay State Audit** | R-07: Replay State Bloat | Loop 4 | Proved that creating synthetic replay events risks domain duplication and re-executing already-succeeded sibling consumers. Replaced with minimal in-place status reset and consumer processing ledger inspection. |
| **Graph Cache Freshness Audit** | R-02, R-08: Stale Graph Serving | Loop 2 | Proved that document presence and 0 in-flight events do not guarantee freshness against direct writes. Specified 2-clause freshness predicate and TOCTOU protection. |
| **Test Runner & Scope Reconciliations** | Monorepo Tooling Inconsistency | All Loops | Reconciled test commands to `npx tsx --test` and unified gate count (11 gates) and test counts (131 new + 222 regression = 353 total). |

### V1.0.0 $\to$ V2.0.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **GoalStats Read/Write Forensic Expansion** | R-03: Dual-Model Split & Unchecked Writers | Loop 1 | Audited [`loadGoalSystemState.ts#L23-L30`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/features/goals/utils/loadGoalSystemState.ts#L23-L30) and [`evaluateGoal.ts#L13-L26`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/features/goals/engine/evaluateGoal.ts#L13-L26). Found that `evaluateGoal` acts as an un-adapted direct writer initializing `GoalStats` without `userId`, creating Mongoose schema validation failures against `GoalStatsModel.ts`. |
| **Habitual Cadence Streak Reconstruction Reality** | R-03: Projection Rebuild Data Loss | Loop 1 | Audited [`updateGoalStats.ts#L99-L130`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/features/goals/engine/updateGoalStats.ts#L99-L130). Proved that `bestStreakEver` and `currentStreak` are computed from 14 days of historical signals via `explainGoal` and `DailyLog`. Projections cannot be reconstructed from current `Goal` and `Task` documents alone without historical log data. |
| **Partition Sweep Revision Audit** | R-01: Temporal Sweep Overwrites | Loop 3 | Audited [`ScheduleConflictReportModel.ts#L35-L47`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/server/db/models/ScheduleConflictReportModel.ts#L35-L47). Found zero revision/fencing tokens (`sweepRevision`). An older day sweep finishing after a newer sweep will clobber the newer conflict report. |
| **Multi-Worker Aggregate Interleaving Audit** | R-05: Non-Partitioned Leases | Loop 4 | Audited [`WorkerLeaseManager.ts#L37-L76`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/dispatch/WorkerLeaseManager.ts#L37-L76). Proved that candidate lookups lack aggregate mutual exclusion. If aggregate $X$ has multiple events, two workers can lease them concurrently, violating causal processing order. |
| **Production Runtime Environment Audit** | R-04: Dispatcher Production Activation | Loop 5 | Audited Next.js 16 (`apps/web/package.json`), standalone Node container, and desktop Tauri scripts. Proved that single-process `setInterval` cannot survive serverless cold starts; Step 2 requires a Dual-Mode Worker Architecture (In-Band Automation Batch + Standalone Daemon Process). |
| **Semantic Boundary Independent Audit** | R-08: Semantic Coercion / Keyword Leaks | Loop 7 | Proved that static AST inspection does not verify semantic generalization. Documented the necessity of 15 held-out behavioral test categories for intelligence-to-kernel handoffs. |

---

## 1. Executive Summary

This document provides a comprehensive, evidence-backed architectural audit of the current state of asynchronous event processing, outbox dispatching, projection convergence, and causal ordering in the LifeOS repository following the completion of **Step 1 (Application-to-Kernel Mutation Convergence)**.

During Step 1, 26 application mutation routes were successfully consolidated into canonical persistence adapters (`TaskActionAdapters.ts`, `GoalActionAdapters.ts`, `WorkoutActionAdapters.ts`, `HabitActionAdapters.ts`, `TemporalActionAdapters.ts`), establishing durable L1/L2 mutation receipts, outbox record generation (`OutboxEventModel.ts`), and soft-archival lifecycle semantics.

However, an exhaustive forensic audit of the post-mutation downstream pipeline reveals **eight critical architectural defects and structural gaps** that prevent projections from converging causally and leave the asynchronous processing loop dormant in production:

1. **Systemic Cross-Aggregate Causal Sequence Collisions (The Global Monotonicity Fallacy)**: Consumers managing multi-aggregate projections compare `currentDoc.derivedFromCausalSequence >= envelope.causalSequence` as a global scalar clock, causing valid events from newly created or low-version aggregates to be silently discarded as `SKIPPED_STALE`.
2. **Orphan Derived Projection Model (`ExecutionGraphDerivedModel`)**: While `ExecutionGraphConsumer` updates `ExecutionGraphDerivedModel`, every reading service in LifeOS (`WorldModelBridge`, `WorldService`, `TaskService`, `DashboardService`) calls `ExecutionGraph.buildFromDatabase(userId)`, which queries raw `Task` documents directly, bypassing the projection entirely.
3. **Dual-Model Split & Unchecked Writers on Goal Statistics (`GoalStats`)**: Two separate schema definitions exist for the `"GoalStats"` collection (`apps/web/features/goals/models/GoalStats.ts` vs `apps/web/server/db/models/GoalStatsModel.ts`), with concurrent dual writers (`updateGoalStats.ts` and `evaluateGoal.ts` vs `GoalIntelligenceConsumer.ts`) mutating diverging fields. Furthermore, `evaluateGoal.ts` creates records omitting the required `userId` field.
4. **Complete Absence of Production Dispatcher & Worker Activation**: `DurableOutboxDispatcher`, `ConsumerRegistry`, and `WorkerLeaseManager` are never instantiated or ticked in production; outbox events generated by Step 1 mutations remain perpetually in `"PENDING"` status.
5. **Unsorted & Non-Partitioned Lease Candidate Queries**: `WorkerLeaseManager.acquireLeases` performs candidate queries without sorting by causal sequence and without aggregate-level partition keys, exposing concurrent workers to race conditions on the same aggregate.
6. **Decoupled Personal World Model Cache Convergence**: `WorldModelBridge.getProjection` shortens TTL to 1 second during active propagation, but lacks any deterministic await mechanism or event replay barrier, returning stale projections under high mutation load.
7. **Lack of Poison-Pill DLQ Administration & Replay Infrastructure**: Although `DurableOutboxDispatcher` transitions events to `DEAD_LETTER` after 5 failed attempts, there is no administrative surface, alert trigger, or recovery tool for dead-lettered events.
8. **Lack of Partition Sweep Fencing in Temporal Reconciliation**: `ScheduleConflictReportModel` relies on raw timestamps rather than monotonic sweep revision tokens, permitting concurrent day sweeps to overwrite newer conflict evaluations with stale state.

---

## 2. Infrastructure Inventory & File Analysis

The following files constitute the current causal event pipeline in the repository:

| Component Type | File Path | Current Status | Primary Architectural Responsibility |
| :--- | :--- | :--- | :--- |
| **Outbox Model** | `apps/web/server/db/models/OutboxEventModel.ts` | Complete | Schema for `OutboxEvent` collection (`eventId`, `userId`, `aggregateId`, `causalSequence`, `deliveryStatus`, leasing fields). |
| **Outbox Storage** | `packages/execution-kernel/src/events/persistence/OutboxStorageService.ts` | Complete | Mode A (Mongo session) and Mode B (direct write) outbox persistence; computes `causalSequence = (version * 1000) + ordinal`. |
| **Worker Lease** | `packages/execution-kernel/src/events/dispatch/WorkerLeaseManager.ts` | Test-Only | Distributed leasing via CAS updates on `OutboxEventModel` with `leaseGeneration` fencing. |
| **Outbox Dispatcher** | `packages/execution-kernel/src/events/dispatch/DurableOutboxDispatcher.ts` | Test-Only | Monotonic dispatch cycle: leases events, sorts by aggregate, invokes consumer handler, acknowledges or backs off. |
| **Consumer Registry** | `packages/execution-kernel/src/events/consumers/ConsumerRegistry.ts` | Test-Only | Category and type matching; partial acknowledgment isolation; durable recording in `ConsumerProcessingLedgerModel`. |
| **Ledger Model** | `apps/web/server/db/models/ConsumerProcessingLedgerModel.ts` | Complete | Records `(userId, consumerName, eventId)` execution status (`SUCCEEDED`, `SKIPPED_STALE`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`). |
| **Consumer 1** | `packages/execution-kernel/src/events/consumers/GoalIntelligenceConsumer.ts` | Defective | Projects task completions & goal edits to `GoalStatsModel`. Suffers from Cross-Aggregate Causal Collisions. |
| **Consumer 2** | `packages/execution-kernel/src/events/consumers/ExecutionGraphConsumer.ts` | Defective / Orphan | Projects task completions to `ExecutionGraphDerivedModel`. Suffers from Cross-Aggregate Causal Collisions and is unread. |
| **Consumer 3** | `packages/execution-kernel/src/events/consumers/TemporalConflictConsumer.ts` | Defective | Projects schedule overlaps to `ScheduleConflictReportModel`. Suffers from Cross-Aggregate Causal Collisions and lack of sweep revision fencing. |
| **Consumer 4** | `packages/execution-kernel/src/events/consumers/PhysicalReadinessConsumer.ts` | Partially Mitigated | Projects workouts to `DailyLog`. Mitigated via Lock-Free CAS on `DailyLog.version` and active session queries. |
| **Consumer 5** | `packages/execution-kernel/src/events/consumers/CadenceLearningConsumer.ts` | Partially Complete | Extracts circadian cadence profiles and saves via `CadenceProfileRepository`. |
| **Consumer 6** | `packages/execution-kernel/src/events/consumers/BehavioralIntelligenceConsumer.ts` | Partially Complete | Ingests behavioral observations with ring-buffer deduplication and CAS revision fencing. |
| **Consumer 7** | `packages/execution-kernel/src/events/consumers/CognitiveHistoryConsumer.ts` | Complete | Appends cognitive state snapshots to `CognitiveStateHistoryModel`. |
| **Background Runner** | `apps/web/app/api/automation/run/route.ts` | Missing Dispatcher | Calls `Kernel.runAutomation(userId)` -> `automationEngine.ts`. Does NOT tick `DurableOutboxDispatcher`. |
| **Automation Engine** | `packages/execution-kernel/src/automation/automationEngine.ts` | Missing Dispatcher | Runs `dailyLoop`, `syncEngine`, and `missedDayRecovery`. Completely omits outbox dispatching. |

---

## 3. Deep Forensic Investigation of Identified Gaps

### GAP 1: The Global Monotonicity Fallacy (Cross-Aggregate Sequence Collisions)

#### Exact Code Evidence
In `packages/execution-kernel/src/events/persistence/OutboxStorageService.ts#L44-L46`:
```typescript
public static calculateCausalSequence(aggregateVersion: number, eventOrdinal: number): number {
  return (aggregateVersion * 1000) + eventOrdinal;
}
```
In `packages/execution-kernel/src/events/consumers/GoalIntelligenceConsumer.ts#L78`:
```typescript
// 3. ALREADY_SUBSUMED: Out-of-order delivery (Correction B Guard)
// A newer event at a higher causalSequence has already updated the derived document
if ((currentDoc.derivedFromCausalSequence ?? 0) >= envelope.causalSequence) {
  return { status: "SKIPPED_STALE" };
}
```
In `packages/execution-kernel/src/events/consumers/ExecutionGraphConsumer.ts#L88`:
```typescript
// 3. ALREADY_SUBSUMED: Out-of-order delivery
if ((currentDoc.derivedFromCausalSequence ?? 0) >= envelope.causalSequence) {
  return { status: "SKIPPED_STALE" };
}
```
In `packages/execution-kernel/src/events/consumers/TemporalConflictConsumer.ts#L78`:
```typescript
// 3. ALREADY_SUBSUMED: Out-of-order delivery
if (currentDoc && (currentDoc.derivedFromCausalSequence ?? 0) >= envelope.causalSequence) {
  return { status: "SKIPPED_STALE" };
}
```

#### Detailed Failure Mechanism
The formula `(aggregateVersion * 1000) + eventOrdinal` generates numbers that are **strictly monotonic only within the lifecycle of a single aggregate ID**. Aggregate versions are incremented independently:
- Aggregate `Task_Alpha` may be at version 5 (`causalSequence` = 5001).
- Aggregate `Task_Beta` may be newly created at version 1 (`causalSequence` = 1001).
- Aggregate `Goal_Gamma` may be at version 2 (`causalSequence` = 2001).

When `ExecutionGraphConsumer` processes a completion event for `Task_Alpha`, `graph_${userId}.derivedFromCausalSequence` is updated to `5001`.
Subsequently, when `Task_Beta` completes, its event has `causalSequence = 1001`.
`ExecutionGraphConsumer` checks:
```typescript
if (currentDoc.derivedFromCausalSequence >= envelope.causalSequence) // 5001 >= 1001 -> TRUE!
```
The consumer logs the event as `SKIPPED_STALE` and exits with `{ status: "SKIPPED_STALE" }`. `Task_Beta` is **never marked completed in the DAG**, and all tasks depending on `Task_Beta` remain perpetually blocked.

The exact same catastrophic failure occurs in:
- `GoalIntelligenceConsumer`: A goal progress event (`Goal_Gamma` v3, seq 3001) will cause any subsequent task completion (`Task_Beta` v1, seq 1001) to be discarded as stale.
- `TemporalConflictConsumer`: An occurrence reschedule (`Occ_1` v2, seq 2001) will cause any new occurrence creation (`Occ_2` v1, seq 1001) on that date to be discarded as stale, leaving schedule conflicts undetected.

---

### GAP 2: Orphan Derived Model (`ExecutionGraphDerivedModel`)

#### Exact Code Evidence
`ExecutionGraphConsumer.ts#L19-L21` imports and updates `ExecutionGraphDerivedModel`:
```typescript
import {
  ExecutionGraphDerivedModel,
  IGraphNodeSubdoc,
} from "../../../../../apps/web/server/db/models/ExecutionGraphDerivedModel";
```
However, a full repository search for `ExecutionGraphDerivedModel` yields exactly three references:
1. `apps/web/server/db/models/ExecutionGraphDerivedModel.ts` (Model definition)
2. `packages/execution-kernel/src/events/consumers/ExecutionGraphConsumer.ts` (Write site)
3. Zero read sites.

Meanwhile, all runtime consumers of execution graphs call `ExecutionGraph.buildFromDatabase(userId)`:
- `packages/execution-kernel/src/worldv2/WorldModelBridge.ts#L217`
- `packages/execution-kernel/src/services/WorldService.ts#L18`
- `packages/execution-kernel/src/services/TaskService.ts#L30, L53`
- `packages/execution-kernel/src/services/DashboardService.ts#L30`
- `packages/execution-kernel/src/services/GoalService.ts#L31`
- `packages/execution-kernel/src/services/AssistantService.ts#L39`

In `packages/execution-kernel/src/kernel/ExecutionGraph.ts#L112-L117`:
```typescript
static async buildFromDatabase(userId: string): Promise<ExecutionGraph> {
  const graph = new ExecutionGraph();
  try {
    // 1. Fetch all user tasks
    const tasks = await Task.find({ userId }).lean();
...
```
`buildFromDatabase` issues a full collection scan on `Task.find({ userId })`. The projection `ExecutionGraphDerivedModel` maintained by `ExecutionGraphConsumer` is completely dead code, providing zero query offloading, zero caching, and zero causal projection guarantees.

---

### GAP 3: Dual-Model Split, Schema Divergence & Unchecked Writers on Goal Statistics

#### Exact Code Evidence
There are two competing definitions for the `"GoalStats"` collection in MongoDB:
1. `apps/web/features/goals/models/GoalStats.ts#L3-L52`:
   ```typescript
   const GoalStatsSchema = new mongoose.Schema({
     goalId: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", unique: true },
     currentScore: Number,
     nature: { type: String, enum: ["finite_deliverable", "habitual_cadence"] },
     deliverableProgressPercent: Number,
     completedMilestonesCount: Number,
     totalMilestonesCount: Number,
     completedTasksCount: Number,
     state: { type: String, enum: ["on_track", "slow", "drifting", "stalled", "recovering", "completed"] },
     momentum: { type: String, enum: ["up", "down", "flat"] },
     bestScoreEver: Number,
     bestStreakEver: Number,
     currentStreak: Number,
     daysSinceProgress: Number,
     lastEvaluatedAt: Date,
   });
   export const GoalStats = mongoose.models.GoalStats || mongoose.model("GoalStats", GoalStatsSchema);
   ```
2. `apps/web/server/db/models/GoalStatsModel.ts#L24-L85`:
   ```typescript
   const GoalStatsSchema = new Schema<IGoalStatsDoc>({
     goalId: { type: String, required: true, unique: true, index: true },
     userId: { type: String, required: true, index: true },
     deliverableProgressPercent: { type: Number, required: true, default: 0 },
     completedMilestonesCount: { type: Number, required: true, default: 0 },
     totalMilestonesCount: { type: Number, required: true, default: 0 },
     completedTasksCount: { type: Number, required: true, default: 0 },
     derivedFromCausalSequence: { type: Number, required: true, default: 0 },
     lastEventId: { type: String, required: true },
     lastAppliedAt: { type: Date, required: true },
   });
   export const GoalStatsModel: Model<IGoalStatsDoc> =
     mongoose.models.GoalStats || mongoose.model<IGoalStatsDoc>("GoalStats", GoalStatsSchema);
   ```

#### Additional Forensic Discovery: Direct Writers
1. [`evaluateGoal.ts#L13-L26`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/features/goals/engine/evaluateGoal.ts#L13-L26):
   Calls `GoalStats.create({ goalId: goal._id, currentScore: 0, state: "on_track", ... })` omitting `userId`. If `GoalStatsModel.ts` is registered first in Mongoose, this creation throws a validation exception (`userId: Path userId is required`).
2. [`updateGoalStats.ts#L118-L130`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/features/goals/engine/updateGoalStats.ts#L118-L130):
   Computes `currentStreak` and `bestStreakEver` from 14 days of signals via `explainGoal(goal, days)` and calls `GoalStats.findOneAndUpdate`, overwriting fields without setting `derivedFromCausalSequence` or updating version checkpoints.
3. [`loadGoalSystemState.ts#L23-L29`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/features/goals/utils/loadGoalSystemState.ts#L23-L29):
   Loads `GoalStats.find({ goalId: { $in: goalIds } })` and constructs a map. Because fields are stripped depending on which schema loaded first, UI and engine context receives undefined fields.

---

### GAP 4: Production Dormancy of Outbox Dispatcher & Consumers

#### Exact Code Evidence
In `apps/web/app/api/automation/run/route.ts#L30`:
```typescript
const result = await Kernel.runAutomation(userId);
```
In `packages/execution-kernel/src/automation/automationEngine.ts#L28-L35`:
```typescript
// 2. Execute Modules Sequentially
const loopActions = await dailyLoop(userId, activeDateStr, past9PM, preferences, timezone);
actions.push(...loopActions);

const syncActions = await syncEngine(userId, activeDateStr);
actions.push(...syncActions);

const recoveryActions = await missedDayRecovery(userId, activeDateStr);
actions.push(...recoveryActions);
```
In `packages/execution-kernel/src/testing/`:
`DurableOutboxDispatcher`, `WorkerLeaseManager`, and `ConsumerRegistry` are instantiated in:
- `b2ConsumerQuarantine.test.ts`
- `b2EndToEndCausalReality.test.ts`
- `b2WorkerLeasing.test.ts`
- `b3EndToEndBehavioralReality.test.ts`

**Finding**: There is zero production invocation of `DurableOutboxDispatcher.executeCycle()`.
When a mutation occurs in production (e.g. `POST /api/tasks`, `PATCH /api/goals`), `OutboxStorageService.insertEvent` inserts an event into `outboxevents` with `deliveryStatus: "PENDING"`.
Because no background worker or tick loop invokes `DurableOutboxDispatcher`, these events sit in `PENDING` indefinitely. Projections are never updated outside of test execution.

---

### GAP 5: Unsorted & Non-Partitioned Lease Candidate Queries

#### Exact Code Evidence
In `packages/execution-kernel/src/events/dispatch/WorkerLeaseManager.ts#L37-L42`:
```typescript
// 1. Candidate lookup
const candidates = await this.outboxModel.find({
  $or: [
    { deliveryStatus: "PENDING", nextAttemptAt: { $lte: now } },
    { deliveryStatus: "PROCESSING", leaseExpiresAt: { $lt: now } },
  ],
}).limit(batchSize * 2);
```
In `packages/execution-kernel/src/events/dispatch/DurableOutboxDispatcher.ts#L94-L99`:
```typescript
// 2. Sort events by aggregateId and causalSequence to guarantee monotonic dispatch
const sortedEvents = [...leasedEvents].sort((a, b) => {
  if (a.aggregateId === b.aggregateId) {
    return (a.causalSequence ?? 0) - (b.causalSequence ?? 0);
  }
  return 0;
});
```

#### Race Condition Analysis
1. `find(...)` has no `.sort(...)` clause. MongoDB returns documents in natural allocation order.
2. If an aggregate has Event 1 (`seq: 1001`) and Event 2 (`seq: 2001`), and `Event 1` was inserted slightly later in disk block or retry schedule, `find(...)` may return `Event 2` without `Event 1`.
3. If two workers run concurrently (`Worker A` and `Worker B`), `Worker A` can lease `Event 2` while `Worker B` leases `Event 1`.
4. The sort in `DurableOutboxDispatcher` only operates **within the local batch of a single worker**. It does not protect against concurrent workers executing events for the same aggregate out of order.

---

### GAP 6: Decoupled Personal World Model Cache Convergence

#### Exact Code Evidence
In `packages/execution-kernel/src/worldv2/WorldModelBridge.ts#L127-L139`:
```typescript
const inFlight = await this.hasInFlightEvents(userId);

// Return cached projection if unexpired, not in active propagation, and no forceRefresh/overrides requested
if (
  cached &&
  cached.expiresAt > now &&
  !inFlight &&
  !inputOverrides?.forceRefresh &&
  ...
) {
  return cached.projection;
}
```

#### Analysis
- When an outbox event is in flight, `WorldModelBridge` marks the context as `ACTIVE_PROPAGATION` and reduces the TTL to 1 second.
- However, when the consumer completes and acknowledges the outbox event, the outbox table has 0 in-flight events. `WorldModelBridge` will immediately re-cache the projection for 60 seconds.
- If the consumer failed with `FAILED_RETRYABLE` (and was backed off for 2000ms), `hasInFlightEvents` still sees `nextAttemptAt > now`, but if the event status is marked `PENDING` with a future `nextAttemptAt`, `WorldModelBridge` may treat the world as `SETTLED` while projections are still divergent.
- Moreover, `WorldModelBridge` has no `waitForConvergence(userId, correlationId, timeoutMs)` primitive to allow callers to guarantee read-your-writes causal consistency after submitting a mutation.

---

### GAP 7: Lack of Dead-Letter Queue (DLQ) Management & Poison-Pill Isolation

#### Exact Code Evidence
In `packages/execution-kernel/src/events/dispatch/WorkerLeaseManager.ts#L162-L170`:
```typescript
if (currentAttempts >= maxAttempts) {
  update.$set.deliveryStatus = "DEAD_LETTER";
  update.$set.failureReason = `Exceeded max attempts (${maxAttempts}): ${failureReason}`;
} else {
  update.$set.deliveryStatus = "PENDING";
  update.$set.nextAttemptAt = new Date(now.getTime() + retryDelayMs);
}
```

#### Analysis
- When an event fails repeatedly (e.g. malformed payload or unhandled runtime TypeError in a consumer), `WorkerLeaseManager` marks it `"DEAD_LETTER"`.
- However, there is no dead-letter repository, query API, administrative replay tool, or operational alerting mechanism.
- Once an event is marked `DEAD_LETTER`, downstream projections remain permanently un-converged for that entity, with no way to repair or re-drive the event pipeline.

---

### GAP 8: Lack of Partition Sweep Fencing in Temporal Reconciliation

#### Exact Code Evidence
In `apps/web/server/db/models/ScheduleConflictReportModel.ts#L35-L47`:
```typescript
export interface IScheduleConflictReportDoc extends Document {
  reportId: string;
  userId: string;
  dateOnly: string;
  hasConflicts: boolean;
  conflicts: IScheduleConflictItem[];
  repairPlan?: IRepairPlanSubdoc | null;
  derivedFromCausalSequence: number;
  lastEventId: string;
  lastAppliedAt: Date;
  ...
}
```

#### Analysis
- `TemporalConflictConsumer` performs a day sweep on `dateOnly`.
- If two occurrence events for the same date arrive near-simultaneously (e.g. Event A: Occ 1 rescheduled; Event B: Occ 2 scheduled), two workers can initiate day sweeps in parallel.
- Worker 1 starts at $t_1$, reading Occ 1. Worker 2 starts at $t_2$, reading Occ 1 and Occ 2.
- If Worker 2 finishes at $t_3$, saving a report showing no conflicts, but Worker 1 (running slower due to GC or network delay) finishes at $t_4$, Worker 1 will unconditionally overwrite Worker 2's newer evaluation with stale state!
- To prevent this, `ScheduleConflictReportModel` must maintain a monotonic `sweepRevision: number` or fence writes using CAS on `sweepRevision`.

---

## 4. Current State Summary & Step 2 Imperatives

The audit establishes that while Step 1 succeeded in capturing mutations and durably recording them into the transactional outbox, **Step 2 must solve the core distributed systems challenges of causal ordering, multi-aggregate projection convergence, and production execution**:

1. Replace the flawed scalar `causalSequence` comparison with **per-aggregate version vectors / sequence checkpoint maps** on multi-aggregate projections.
2. Unify the split `GoalStats` schemas into a single canonical derived model, resolve unchecked direct writers in `evaluateGoal.ts` and `updateGoalStats.ts`, and define a complete migration and rebuild strategy.
3. Wire `ExecutionGraphDerivedModel` directly into `ExecutionGraph.buildFromDatabase` (with fallback rebuild) so the derived model serves as an authoritative read cache.
4. Activate the `DurableOutboxDispatcher` within the production execution loop (supporting both scheduled automation and standalone daemon execution) with aggregate-level partitioning.
5. Provide a deterministic `waitForConvergence` barrier on `WorldModelBridge` that verifies all required consumer ledger statuses rather than merely checking outbox counts.
6. Implement a comprehensive DLQ management and replay utility respecting consumer idempotency.
7. Implement sweep revision CAS fencing on `ScheduleConflictReportModel`.
8. Enforce independent Semantic Behavioral Generalization testing across 15 held-out categories in addition to structural AST compliance.
