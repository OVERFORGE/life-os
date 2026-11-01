# LIFEOS STEP 2 — REMAINING CORRECTIONS LEDGER
## Forensic Evidence, Failure Scenarios & Minimal Sufficient Resolutions
**Document Version:** 2.1.0  
**Phase:** Step 2 Pre-Implementation Quality Gate  
**Governing Specification:** LifeOS V2.3.0 Final Architectural Specification  
**Classification:** Authoritative Technical Ledger  

---

## 1. Overview

This ledger documents the final set of implementation-readiness corrections applied to the Step 2 planning specifications. Every correction is backed by actual repository evidence, describes a concrete failure scenario, proves why the correction is necessary, specifies the smallest sufficient resolution, identifies the exact affected loop, and defines the verification required.

---

## 2. Exhaustive Correction Entries

### Correction C-01: ExecutionGraph Freshness Contract
- **Actual Repository Evidence**:
  - [`ExecutionGraphDerivedModel.ts#L17-L27`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/server/db/models/ExecutionGraphDerivedModel.ts#L17-L27): Document records `graphId`, `userId`, `nodes`, `unblockedTaskIds`, `lastAppliedAt: Date`.
  - [`ExecutionGraph.ts#L112-L127`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/kernel/ExecutionGraph.ts#L112-L127): `buildFromDatabase(userId)` queries raw `Task.find({ userId }).lean()`.
  - `Task.ts`: Tasks have compound index on `{ userId: 1, updatedAt: 1 }`.
- **Identified Failure Scenario**:
  A reader inspects `ExecutionGraphDerivedModel`. If the reader relies solely on `hasInFlightEvents(userId) === false`, it can serve an outdated graph if a direct mutation or background sync occurred without an active outbox lease, or if an outbox event completed without triggering the graph consumer.
- **Why the Correction is Necessary**:
  The presence of a cached document and an empty outbox queue does not prove that the graph reflects the latest tasks in MongoDB. Serving a stale graph causes agents and kernel services to dispatch already-completed or still-blocked tasks.
- **The Smallest Sufficient Resolution**:
  In `ExecutionGraph.buildFromDatabase(userId)`, enforce the minimum freshness contract:
  ```typescript
  const cached = await ExecutionGraphDerivedModel.findOne({ graphId: `graph_${userId}` }).lean();
  if (cached && cached.nodes?.length > 0) {
    const hasInFlight = await WorldModelBridge.getInstance().hasInFlightEvents(userId);
    if (!hasInFlight) {
      const newerTask = await Task.findOne({
        userId,
        updatedAt: { $gt: cached.lastAppliedAt },
      }).select("_id").lean();

      if (!newerTask) {
        return ExecutionGraph.fromDerivedModel(cached); // Guaranteed 100% fresh!
      }
    }
  }
  // Authoritative fallback: scan tasks, construct graph, upsert projection cache
  return await ExecutionGraph.rebuildAndCache(userId);
  ```
- **Exact Affected Implementation Loop**: **Loop 2 (Execution Graph Projection Convergence & Read Integration)**.
- **Verification Required**: Unit and benchmark test in `EndToEndConvergence.test.ts` verifying sub-5ms cache hit when fresh, and instant authoritative invalidation when a task has `updatedAt > lastAppliedAt`.

---

### Correction C-02: Drift-Proof GoalStats Task Reconciliation
- **Actual Repository Evidence**:
  - [`GoalStatsModel.ts#L10-L22`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/server/db/models/GoalStatsModel.ts#L10-L22): Tracks `completedTasksCount: number` and `totalTasksCount: number`.
  - [`Task.ts`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/server/db/models/Task.ts): Authoritative aggregate root with `status: "completed" | "pending" | "archived"`.
  - [`Goal.ts`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/features/goals/models/Goal.ts): Authoritative aggregate root for milestone structures.
- **Identified Failure Scenario**:
  Performing incremental arithmetic (`completedTasksCount += 1` on completed, `-= 1` on uncompleted) across distributed, retried, or out-of-order events results in permanent count drift. For example, if a task is completed, deleted, and another completed out of sequence, the counter permanently diverges from actual completed tasks in the database.
- **Why the Correction is Necessary**:
  A derived projection must never drift away from primary truth. Blind incremental updates violate the core principle: "The kernel provides truth. Agents provide intelligence."
- **The Smallest Sufficient Resolution**:
  In `GoalIntelligenceConsumer`, replace incremental delta counters with authoritative task counts on the target `goalId`:
  ```typescript
  const [completedTasksCount, totalTasksCount] = await Promise.all([
    this.taskModel.countDocuments({ goalId, status: "completed" }),
    this.taskModel.countDocuments({ goalId, status: { $ne: "archived" } }),
  ]);
  ```
  The milestone percentage and task completion counts are authoritatively reconciled directly from the primary collections. Historical cadence streaks are preserved from 14 days of `DailyLog` signals via `explainGoal`.
- **Exact Affected Implementation Loop**: **Loop 1 (Multi-Aggregate Causal Disambiguation & GoalStats Unification)**.
- **Verification Required**: Concurrency test in `ConcurrencyContention.test.ts` executing 20 interleaved completed/uncompleted/deleted events, asserting that `completedTasksCount` matches `Task.countDocuments` with 100% accuracy.

---

### Correction C-03: Atomic Aggregate Partition Mutual Exclusion
- **Actual Repository Evidence**:
  - [`WorkerLeaseManager.ts#L37-L76`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/dispatch/WorkerLeaseManager.ts#L37-L76): Iterates candidate events and executes `findOneAndUpdate` per individual event document.
- **Identified Failure Scenario**:
  If aggregate $A$ has Event 1 and Event 2 in `PENDING` status, Worker 1 and Worker 2 both execute candidate lookup at the same millisecond. Worker 1 leases Event 1; Worker 2 leases Event 2. The workers execute concurrently, violating causal sequence ordering for aggregate $A$. Sorting in memory does not prevent this race.
- **Why the Correction is Necessary**:
  Events belonging to the same aggregate root must be processed strictly in causal order. Concurrent execution of events for the same aggregate causes state overwrite race conditions in consumers.
- **The Smallest Sufficient Resolution**:
  Implement **Atomic Aggregate Partition Mutual Exclusion**:
  Define `partitionKey = "${userId}:${aggregateType}:${aggregateId}"`.
  Before acquiring events for an aggregate partition, `WorkerLeaseManager` atomically acquires a partition lease using MongoDB CAS:
  ```typescript
  const filter = {
    partitionKey,
    $or: [{ status: "RELEASED" }, { expiresAt: { $lt: now } }],
  };
  const update = {
    $set: { workerId, acquiredAt: now, expiresAt: new Date(now.getTime() + leaseDurationMs), status: "ACTIVE" },
    $inc: { leaseGeneration: 1 },
  };
  const acquired = await this.partitionLeaseModel.findOneAndUpdate(filter, update, { upsert: true, new: true });
  ```
  If another worker holds an active lease for `partitionKey`, the acquisition fails and candidate events for that aggregate are skipped until the active lease finishes or expires. Once acquired, the worker leases all ready events for that aggregate in causal sequence order.
- **Exact Affected Implementation Loop**: **Loop 4 (Monotonic Worker Lease Partitioning & Dead-Letter Queue Management)**.
- **Verification Required**: Concurrency test in `CausalMonotonicityMatrix.test.ts` running 3 competing workers on 50 interleaved events across 5 aggregates, asserting zero concurrent interleaving for the same aggregate ID.

---

### Correction C-04: Safe Dead-Letter Replay Without State Machine Bloat
- **Actual Repository Evidence**:
  - [`ConsumerProcessingLedgerModel.ts#L9-L25`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/server/db/models/ConsumerProcessingLedgerModel.ts#L9-L25): Records durable completion status per `(userId, consumerName, eventId)`.
  - [`ConsumerRegistry.ts#L112-L121`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/consumers/ConsumerRegistry.ts#L112-L121): Automatically skips consumers whose ledger status is `SUCCEEDED` or `SKIPPED_STALE`.
- **Identified Failure Scenario**:
  Introducing "replay generations" or synthetic replay events creates duplicate domain events, breaks causal sequence ordering, and risks duplicate execution of side-effects in sibling consumers that already succeeded.
- **Why the Correction is Necessary**:
  Dead-letter replay must safely re-drive the failed consumer without repeating successful side effects or corrupting historical audit records.
- **The Smallest Sufficient Resolution**:
  Reuse the existing outbox document and consumer ledger without adding new state machines:
  1. `DeadLetterService.replayDeadLetter(eventId, userId)` resets the existing document:
     `{ $set: { deliveryStatus: "PENDING", attempts: 0, nextAttemptAt: new Date(), failureReason: null } }`.
  2. The original `eventId`, `correlationId`, `causalityRef`, and `payload` are preserved.
  3. When dispatched, `ConsumerRegistry` reads `ConsumerProcessingLedgerModel` and automatically skips consumers that already succeeded (`skippedConsumers.push(consumer.name)`).
  4. Only the failed consumer is re-executed. Tenant isolation is enforced via mandatory `userId` filtering.
- **Exact Affected Implementation Loop**: **Loop 4 (Monotonic Worker Lease Partitioning & Dead-Letter Queue Management)**.
- **Verification Required**: Fault injection test in `FailureInjectionPoisonPill.test.ts` verifying that replaying a dead-lettered event skips Consumer 1 (which succeeded) and only executes Consumer 2 (which previously failed).

---

### Correction C-05: Projection Rebuild Snapshot Consistency (TOCTOU Race Prevention)
- **Actual Repository Evidence**:
  - All derived projection models maintain revision/version counters: `ExecutionGraphDerivedModel.projectionRevision`, `ScheduleConflictReportModel.sweepRevision`, `DailyLog.version`, `GoalStatsModel.derivedFromVersions`.
- **Identified Failure Scenario**:
  A projection rebuild reads source aggregates at $t_1$. At $t_2$, a live user mutation commits. At $t_3$, the rebuild finishes and unconditionally writes its $t_1$ snapshot to the database, overwriting the newer mutation from $t_2$.
- **Why the Correction is Necessary**:
  Projection rebuilding must be deterministic and must never overwrite newer live state with an older snapshot.
- **The Smallest Sufficient Resolution**:
  Every rebuild function implements **Snapshot Version Revalidation & Atomic CAS**:
  - Before reading source aggregates, record `initialRevision` of the projection document.
  - Record the maximum source aggregate timestamp / version read.
  - On write, use atomic CAS on `initialRevision`.
  - Revalidate that no source document has mutated past the read snapshot. If CAS matches 0 documents (a live event committed during rebuild), abort and retry authoritatively (bounded up to 3 retries).
- **Exact Affected Implementation Loop**: **Loop 1, Loop 2, Loop 3, Loop 7**.
- **Verification Required**: Deterministic rebuild test suite in `DeterministicRebuild.test.ts` simulating a concurrent mutation mid-rebuild, asserting that CAS rejects the stale snapshot and cleanly re-converges.

---

### Correction C-06: Strict Separation of Structural AST and Behavioral Semantic Testing
- **Actual Repository Evidence**:
  - [`scripts/verify-semantic-architecture.ts`](file:///d:/PROGRAMMING/Projects/life-os/scripts/verify-semantic-architecture.ts): Inspects TypeScript AST for syntax violations.
- **Identified Failure Scenario**:
  Relying solely on an AST scanner to claim semantic architecture compliance provides a false sense of security. An AST scanner can verify that banned regex intent routers are absent, but it cannot verify whether the intelligence layer understands unseen Hinglish phrasing, novel custom signals, or ambiguous intent.
- **Why the Correction is Necessary**:
  Mandatory LifeOS V2.3.0 architectural principle: "The kernel provides truth. Agents provide intelligence." Structural compliance and semantic behavioral generalization are fundamentally different acceptance dimensions.
- **The Smallest Sufficient Resolution**:
  Formally decouple acceptance into two separate gates:
  - **Gate 9A (Structural Semantic Architecture AST Compliance)**: Static scanner verifying 0 regex semantic routing, 0 keyword intent classifiers, 0 phrase dictionaries in the execution kernel. Legitimate structural validation (UUIDs, ObjectIds, ISO dates) is explicitly permitted.
  - **Gate 9B (Semantic Behavioral Generalization across 15 Held-Out Categories)**: Independent, held-out test suite (`SemanticBehavioralGeneralization.test.ts`) covering 15 distinct categories (slang, custom signals, Hinglish, compound multi-intent, ambiguous intent, etc.).
- **Exact Affected Implementation Loop**: **Loop 7 (Full-Spectrum Verification & Acceptance Battery)**.
- **Verification Required**: Separate test execution reports (`npx tsx --test`) for `SemanticArchitectureAST.test.ts` and `SemanticBehavioralGeneralization.test.ts`.

---

## 3. Summary of Affected Loops & Verification Mapping

| Correction ID | Core Problem Resolved | Affected Loop | Primary Acceptance Gate | Target Test Suite |
| :---: | :--- | :---: | :---: | :--- |
| **C-01** | Graph freshness verified against task `updatedAt` | Loop 2 | Gate 2 | `EndToEndConvergence.test.ts` |
| **C-02** | Drift-proof task reconciliation on GoalStats | Loop 1 | Gate 1, Gate 3 | `ConcurrencyContention.test.ts` |
| **C-03** | Atomic partition mutual exclusion in WorkerLeaseManager | Loop 4 | Gate 5 | `CausalMonotonicityMatrix.test.ts` |
| **C-04** | Dead-letter replay reusing ledger without state bloat | Loop 4 | Gate 7 | `FailureInjectionPoisonPill.test.ts` |
| **C-05** | TOCTOU snapshot revalidation on projection rebuilds | Loop 1, 2, 3 | Gate 6 | `DeterministicRebuild.test.ts` |
| **C-06** | Decoupling AST compliance (9A) and behavioral generalization (9B) | Loop 7 | Gate 9A, Gate 9B | `SemanticBehavioralGeneralization.test.ts` |

