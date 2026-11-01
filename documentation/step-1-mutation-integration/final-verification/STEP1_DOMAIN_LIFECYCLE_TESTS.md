# STEP 1 DOMAIN LIFECYCLE TESTS
## Aggregate Invariants, Derived Projections, and Lifecycle Testing

**Project**: LifeOS / Aven  
**Milestone**: Step 1 Post-Implementation Audit  
**Date**: November 1, 2026  
**Auditor**: Independent Adversarial Verification Campaign  

---

## 1. AGGREGATE LIFECYCLE AUDIT MATRIX

| Domain Aggregate | Creation | Update (CAS) | Completion / Action | Soft Archival | Idempotency | Version Monotonicity |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Goal** | **PASS** (v1, receipt, event) | **PASS** (CAS 409) | **PASS** (`status: "completed"`) | **PASS** (`status: "archived"`) | **PASS** (L1/L2 receipts) | **PASS** (Strictly ascending) |
| **Task** | **PASS** (v1, receipt, event) | **PASS** (CAS 409) | **PASS** (Mode A/B successor) | **INCONSISTENT** (Sets `status: "deleted"`) | **PASS** (`E11000` recovery) | **PASS** (Strictly ascending) |
| **WorkoutSession** | **PASS** (v1, timezone dateOnly) | **PASS** (CAS 409) | N/A | **PASS** (`status: "archived"`) | **PASS** (L1/L2 receipts) | **PASS** (Strictly ascending) |
| **TemporalOccurrence** | **PASS** (fenced adapter) | **PASS** (fenced adapter) | **DEFECT** (Raw save in interval log) | **INCONSISTENT** (`status: "CANCELLED"`) | **PASS** (receipts) | **PASS** (Strictly ascending) |
| **DailyLog** | **PARTIAL** (`signals/log` CAS) | **DEFECT** (Raw routes bypass) | N/A | N/A | **PASS** (`lastEventId`) | **PASS** (In consumer CAS) |

---

## 2. GOAL LIFECYCLE & DERIVED STATE (`GoalStats`)

### 2.1 Canonical Goal Engine Testing
Tested in [`step1GoalIntegration.test.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/step1GoalIntegration.test.ts) (7/7 tests pass):
- `G-01`: Goal creation initializes `version: 1`, `mutationEpoch: 0`, writes L1 ring buffer receipt, and emits `domain.goal.created`.
- `G-02`: Fenced CAS prevents lost updates; stale `expectedVersion` triggers HTTP 409 `AGGREGATE_CONFLICT`.
- `G-03`: `completeGoal` transitions status to `completed` and advances version.
- `G-04`: `deleteGoal` enforces soft archival exclusively (`status: "archived"`, `archivedAt: new Date()`). No `deleteOne` called on Goal aggregate root.
- `G-05`, `G-06`: Kernel handlers `handleUpdateGoal` and `handleDeleteGoal` cleanly delegate to `goalEngine`.

### 2.2 `updateGoalStats` vs `GoalIntelligenceConsumer` Boundary Audit
The audit investigated the relationship between the synchronous updater and the asynchronous consumer:
1. **The Goal Mutation Bypass is Closed**:
   `apps/web/features/goals/engine/updateGoalStats.ts` lines 51 and 53 now route Goal status changes through `goalEngine.completeGoal` and `goalEngine.updateGoal`. The raw Goal mutation bypass is closed.
2. **Synchronous Projection Updater**:
   `updateGoalStats` updates the derived read-model `GoalStats` via direct synchronous Mongoose calls:
   `GoalStats.findOneAndUpdate({ goalId: goal._id }, { ... }, { upsert: true })`.
   This is invoked synchronously in `apps/web/app/api/tasks/complete/route.ts` and `handleCompleteTask.ts`.
3. **Consumer Execution Boundary**:
   [`GoalIntelligenceConsumer`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/consumers/GoalIntelligenceConsumer.ts) was implemented and verified to handle `domain.goal.deleted` by archiving `GoalStats`. However, in production, the background outbox dispatcher daemon is not running as a persistent service in `apps/web`; `GoalIntelligenceConsumer` is tested and registered in kernel tests, but runtime projection updates in the web app currently rely on the synchronous `updateGoalStats` execution path.

---

## 3. TASK LIFECYCLE & RECURRING RESILIENCY

### 3.1 Lifecycle Operations
Tested in [`step1TaskLifecycleIntegration.test.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/step1TaskLifecycleIntegration.test.ts) (8/8 tests pass) and [`step1AdversarialLifecycles.test.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/verification/step1AdversarialLifecycles.test.ts):
- One-off tasks complete cleanly with zero successor generation.
- Recurring tasks compute the correct successor date according to cadence rules (daily, custom interval, weekly weekdays).
- `uncompleteTask` reverts a completed task to `pending` with a monotonic version bump and emits `domain.task.updated`.
- `skipTask` advances status to `skipped` with a version bump.
- `rescheduleOverdue` moves overdue tasks forward, updating due dates and emitting `domain.task.updated` with reason `overdue_reschedule`.

### 3.2 Identified Invariants & Defects
1. **Status Discrepancy on Deletion**:
   In `taskEngine.deleteTask`:
   Because it delegates to `persistWithStandaloneFencing` with `isDeletion: true`, `OutboxStorageService.ts:337` sets `status: "deleted"` and `deletedAt: new Date()`. In contrast, Goal and WorkoutSession set `status: "archived"` and `archivedAt: new Date()`.
2. **Subtask Physical Deletion**:
   `taskEngine.deleteTask:251` executes:
   `await taskModel.deleteMany({ parentTaskId: taskId, userId })`
   Subtasks are physically destroyed rather than soft-archived.

---

## 4. WORKOUT SESSION & PHYSICAL READINESS AUDIT

### 4.1 Timezone Subjective Day Calculation (`resolveDateOnly`)
Tested in [`step1AdversarialLifecycles.test.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/verification/step1AdversarialLifecycles.test.ts#L275-L300) (`TIME-01`):
- **UTC vs Western Hemisphere**: `2026-11-01T02:30:00Z` in `"America/New_York"` (UTC-4 / UTC-5) maps to `2026-10-31`, aligning with the user's local evening workout.
- **UTC vs Eastern Hemisphere**: `2026-11-01T02:30:00Z` in `"Asia/Tokyo"` (UTC+9) maps to `2026-11-01`.
- **Invalid Timezone Resiliency**: An invalid timezone string gracefully falls back to UTC without throwing runtime exceptions.
- **Missing Date Parameter**: Automatically defaults to current local date.

### 4.2 Cumulative Asymptotic Strain Formula
The consumer calculates cumulative strain for a day using:
$$S = 1 - \prod_{i=1}^n (1 - s_i)$$
Tested in [`step1AdversarialLifecycles.test.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/verification/step1AdversarialLifecycles.test.ts#L150-L260) (`MATH-01`):
1. **Normalization**: If a session reports WHOOP-scale strain $14.7 \in (0, 21]$, it is normalized to $14.7 / 21 = 0.70$.
2. **Multi-Session Cumulative Aggregation**:
   - Session 1: $s_1 = 0.70$
   - Session 2: $s_2 = 0.50$ (from strain 10.5 / 21)
   - Composite strain: $1 - (1 - 0.70)(1 - 0.50) = 1 - (0.30 \times 0.50) = 1 - 0.15 = 0.85$.
   - Accurately matches mathematical properties with zero double-counting.
3. **Bound Clamping**: Extreme strain inputs (e.g. 100) are strictly clamped within $[0.0, 1.0]$.
4. **Authoritative Zero-Reset**: When all workout sessions for a date are deleted or soft-archived, the consumer resets `physical.gym = false`, `physical.calories = 0`, and `physical.trainingStrainScore = 0`.

### 4.3 DailyLog Concurrency & CAS Fencing
The consumer executes an in-band CAS retry loop (up to 3 attempts with exponential backoff):
1. In Step 1, it queries `DailyLog.findOne({ userId, date: targetDate })`.
2. In Step 3, it re-queries active `WorkoutSession` documents from the database.
3. In Step 5, it executes an atomic CAS update:
   `updateOne({ _id: currentDoc._id, version: currentDoc.version }, { $set: ..., $inc: { version: 1 } })`
   If another worker updated `DailyLog` in the interim, `matchedCount === 0`, causing the loop to re-read the fresh state and retry, preventing lost updates.

---

## 5. TEMPORAL OCCURRENCE & MIGRATION TESTING

### 5.1 Fencing Migration Script (`backfillTemporalFencing.ts`)
Tested in [`backfillTemporalFencing.test.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/backfillTemporalFencing.test.ts) (2/2 pass):
- Safe dry-run mode identifies legacy documents lacking `mutationEpoch` or `recentMutationReceipts` without modifying documents.
- Execution mode safely updates missing fields while strictly preserving existing `version` values.
- Reruns are idempotent and produce 0 modified documents on fully migrated databases.

### 5.2 Identified Adapter Bypass
In `packages/execution-kernel/src/temporal/adapters/TemporalActionAdapters.ts:974` (`LogExecutionIntervalAdapter`):
The adapter marks an occurrence completed via:
```typescript
matchOcc.status = "COMPLETED";
await matchOcc.save();
```
This is a direct Mongoose save bypassing `persistWithStandaloneFencing`, omitting outbox events and version increments.

