# Step 1: Comprehensive Verification & Test Strategy
## V2.3 — Dual-Boundary Testing, CAS Projection Fencing & Unique Partial Index Verification

**Document ID**: `STEP1_TEST_STRATEGY.md`  
**Version**: V2.3.0 — FINAL IMPLEMENTATION-READY SPECIFICATION  
**Milestone**: Step 1 — Close Mutation Gaps Across the Application Layer  
**Architectural Baseline**: B1–B4 Distributed Kernel Contracts & Global Semantic Remediation Architecture V2.3.0  
**Governing Principle**: *The kernel provides truth. Agents provide intelligence.*  
**Status**: PLANNING & ARCHITECTURAL VERIFICATION ONLY (Zero Source Code Modified)  
**Date**: October 31, 2026  

---

## 1. Executive Summary & V2.3 Dual-Boundary Mandate

A kernel unit test is not proof that a Next.js API route is wired correctly. Conversely, an API route mock test is not proof that the underlying database transaction guarantees atomicity or that concurrent operations do not create race conditions.

V2.3 mandates a **dual-boundary verification strategy**:
1. **Application Route Boundary (`apps/web`)**: Tests Next.js route handlers directly with authenticated request/response mocks, asserting that HTTP requests invoke domain engines, enforce authorization, return proper status codes (e.g., 201 Created, 200 OK, 409 Conflict), and commit outbox events.
2. **Kernel Storage Boundary (`packages/execution-kernel`)**: Tests domain engines and action adapters against `OutboxStorageService`, validating Mode A replica-set transactions, Mode B standalone fencing, L2 durable receipts, and consumer recalculation.

### Key Testing Distinctions Enforced in V2.3:
- **Mock Tests vs Real Replica-Set Tests**: Mocks alone are not sufficient evidence of multi-document atomicity. Mode A tests must execute against a real MongoDB replica set (via `mongodb-memory-server` configured with replica set or live test container) to prove that parent task, successor task, outbox events, and receipts commit or roll back together.
- **Standalone Unique Index & Deduplication Testing (Issue B)**: Mode B tests must simulate concurrent race conditions during recurring task auto-spawn. Tests must prove that MongoDB's unique partial index on `{ userId, recurringParentId, dueDate }` blocks duplicate successor creation via `E11000` duplicate key errors, which `taskEngine.completeTask` catches to return existing records idempotently. Tests must also prove that one-off tasks (`recurringParentId: null`) are unconstrained.
- **Authoritative CAS Projection & Concurrency Testing (Issue A & C)**: Proves that `PhysicalReadinessConsumer` safely fences `DailyLog` updates using Lock-Free CAS on `DailyLog.version`. Tests simulate concurrent workout events for different sessions on the same date, asserting that both sessions are captured in the authoritative recalculation and that neither is rejected by invalid cross-aggregate sequence gating.
- **Timezone & Cumulative Strain Verification (Issue C)**: Proves that active sessions are matched on indexed `dateOnly: targetDate` (eliminating UTC midnight rollover drift), and that multi-session strain scores accumulate asymptotically ($1 - \prod (1 - s_i)$).
- **Semantic Architecture Compliance**: Verifies that zero regex-based intent classification, keyword sniffing, or assistant prose parsing exists in any Step 1 code path.

---

## 2. Strict Version Number & Receipt Assertions

All tests must assert version numbers matching the actual behavior of `OutboxStorageService.ts`:

| Mutation Stage | `expectedVersion` Supplied | Persisted Aggregate Version | Outbox Event Version | L2 Receipt Version |
|---|---|---|---|---|
| **Initial Creation (`isCreation: true`)** | `0` | **`1`** (`0 + 1 = 1`) | **`1`** | **`1`** |
| **First Update** | `1` | **`2`** (`1 + 1 = 2`) | **`2`** | **`2`** |
| **N-th Update** | `K` | **`K + 1`** | **`K + 1`** | **`K + 1`** |

Tests must NEVER assert that a newly created aggregate has `version: 0`.

---

## 3. Required Dual-Boundary Test Battery (Specifications)

### 3.1 Suite 1: Goal Domain Dual-Boundary Integration
- **File**: `packages/execution-kernel/src/testing/step1GoalIntegration.test.ts`
- **Application Route Tests (`apps/web`)**:
  - `POST /api/goals/create`: Submits JSON payload with authenticated session context; asserts HTTP 201, `Goal` created with `version: 1`, L2 receipt in `MutationReceiptModel`, and `domain.goal.created` outbox event committed.
  - `PUT /api/goals/[id]`: Submits update payload with `expectedVersion: 1`; asserts HTTP 200, `version: 2`, diffHash recorded, and `domain.goal.updated` event. Submits update with stale `expectedVersion: 1`; asserts HTTP 409 Conflict with error code `AGGREGATE_CONFLICT`.
  - `DELETE /api/goals/[id]`: Asserts HTTP 200, goal marked `status: "archived"`, `archivedAt` populated, `version: 3`, and `domain.goal.deleted` event emitted. Asserts `Goal` document is **NOT physically deleted**.
  - Title Reuse After Archive: Creates a new goal with the identical title as the archived goal; asserts HTTP 201 success (proving Mongoose partial unique index permits reuse).
- **Kernel Dispatcher Tests (`packages/execution-kernel`)**:
  - `handleUpdateGoal.ts`: Verifies kernel handler delegates to `goalEngine.updateGoal` and returns standardized execution result.
  - `handleDeleteGoal.ts`: Verifies kernel handler delegates to `goalEngine.deleteGoal` and produces soft tombstone.
- **Consumer Tests**:
  - `GoalIntelligenceConsumer`: Verifies receiving `domain.goal.deleted` sets `GoalStatsModel.status = "archived"`.

### 3.2 Suite 2: Task Domain Lifecycle & Multi-Aggregate Integration
- **File**: `packages/execution-kernel/src/testing/step1TaskLifecycleIntegration.test.ts`
- **Replica-Set Multi-Document Transaction Tests (Mode A - Real Replica Set)**:
  - `completeTask` Atomicity: Completes a recurring task in a replica-set session. Asserts parent task completed, successor task spawned, 2 outbox events (`domain.task.completed`, `domain.task.created`), and 2 durable receipts committed inside the single transaction.
  - Injected Rollback: Simulates a database error during successor creation. Asserts that the parent task remains `"pending"` and zero outbox events commit.
- **Standalone Staged Recovery & Unique Index Deduplication Tests (Mode B - Issue B)**:
  - Concurrent Duplicate Collision: Simulates two simultaneous threads completing the same recurring task. Asserts one thread creates the successor and the other catches `E11000` on `{ userId, recurringParentId, dueDate }`, queries the existing successor, and returns `{ success: true, deduplicated: true }`. Zero duplicate tasks exist.
  - One-Off Independence: Creates two regular tasks (`recurringParentId: null`) for the same user on the same `dueDate`. Asserts both create successfully without index collision.
  - Crash Recovery: Simulates crash after parent task commits but before successor is spawned. Client retries `completeTask`; asserts engine detects missing successor, spawns exactly one successor, and records receipt.
  - Partial Error Reporting: Simulates non-duplicate failure during Step 2; asserts return value is `{ success: false, status: "SUCCESSOR_CREATION_FAILED", parentCompleted: true }`.
- **Secondary Lifecycle Tests**:
  - `uncompleteTask`: Asserts status reverted to `"pending"`, `completedAt: null`, version bumped, `domain.task.updated` emitted.
  - `skipTask` & `skipAllForToday`: Asserts tasks updated to `"skipped"` with per-item deterministic receipts (`mut_skip_${taskId}_${today}`).
  - `rescheduleOverdue`: Verifies overdue tasks rescheduled in both `taskEngine.ts` and `handleCompleteTask.ts` execute within fenced transactions and emit `domain.task.updated`.

### 3.3 Suite 3: Gym Domain & Authoritative Recalculation Integration
- **File**: `packages/execution-kernel/src/testing/step1GymIntegration.test.ts`
- **Application Route Tests (`apps/web`)**:
  - `POST /api/gym/session`: Asserts HTTP 201, `WorkoutSession` created with `version: 1`, `dateOnly: localDateStr`, L2 receipt, and `domain.health.workout_logged` outbox event. Asserts **zero direct fire-and-forget writes to `DailyLog` occur in the route handler**.
  - `PATCH /api/gym/session/[id]`: Asserts HTTP 200, volume updated, version bumped, L2 receipt created, and `domain.health.workout_logged` with `{ isUpdate: true }`.
  - `DELETE /api/gym/session/[id]`: Asserts HTTP 200, session marked `status: "archived"`, version bumped, and `domain.physical.session_deleted` emitted.
- **Authoritative Recalculation & Projection CAS Tests (`PhysicalReadinessConsumer` - Issue A & C)**:
  - Multi-Aggregate Concurrent Ingestion: Dispatches two events for different workout sessions (Session 1 with causalSequence 2000, Session 2 with causalSequence 1000) on the same date. Asserts both sessions are included in `DailyLog.physical.calories` via CAS version fencing without false "stale" rejection.
  - Timezone Boundary Independence: Seeds a session logged in `Asia/Kolkata` (01:00 AM local = previous day UTC). Asserts `dateOnly: "2026-11-01"` correctly updates November 1's `DailyLog`.
  - Cumulative Strain Aggregation: Logs Session A (strain 0.5) and Session B (strain 0.4). Asserts `trainingStrainScore = 1 - (1 - 0.5)*(1 - 0.4) = 0.700` (proving cumulative exertion is captured).
  - Deletion Recalculation: Deletes Session B $\to$ consumer re-aggregates $\to$ `DailyLog.physical.trainingStrainScore = 0.500`.
  - Total Deletion: Deletes Session A $\to$ consumer re-aggregates $\to$ `DailyLog.physical.calories = 0`, `physical.gym = false`, `physical.trainingStrainScore = 0`.
  - Field Preservation: Asserts `DailyLog` fields owned by other consumers (`steps`, `sleep`, `cognitive`, `customSignals`) are preserved untouched during physical recalculation.
  - Idempotent Replay: Dispatches identical event twice; asserts second execution returns `SUCCEEDED` without re-writing `DailyLog`.

### 3.4 Suite 4: Temporal & Calendar Action Integration
- **File**: `packages/execution-kernel/src/testing/step1TemporalIntegration.test.ts`
- **Legacy Document Backfill Compatibility**:
  - Seeds MongoDB with unversioned `TemporalOccurrence` documents (some missing both fields, some missing only `recentMutationReceipts`).
  - Executes `backfillTemporalFencing` utility with `{ dryRun: true }`; asserts accurate report without modifying records.
  - Executes live migration; asserts `mutationEpoch: 0` and `recentMutationReceipts: []` populated independently.
  - Re-executes migration; asserts 0 records modified (idempotency).
- **Adapter Integration**:
  - `ScheduleOccurrenceAdapter`: Asserts `version: 1`, L2 receipt, and `domain.temporal.scheduled` event.
  - `RescheduleOccurrenceAdapter` (Materialized): Asserts version bump (`1 -> 2`), planned interval shift, and `domain.temporal.rescheduled` event.
  - `RescheduleOccurrenceAdapter` (Projected): Asserts materialization from series template with `version: 1` and `overrideType: "SINGLE_INSTANCE_MODIFIED"`.
  - `CancelOccurrenceAdapter`: Asserts status updated to `"CANCELLED"`, version bumped, and `domain.temporal.deleted` event.
- **Conflict Consumer Check**:
  - Verifies `TemporalConflictConsumer` receives `domain.temporal.scheduled` and generates conflict report on interval overlap.

---

## 4. Execution Commands & Acceptance Thresholds

```bash
# 1. Typecheck execution kernel and web app
npx tsc --noEmit -p packages/execution-kernel/tsconfig.json

# 2. Run Semantic Architecture AST Linter
npm run verify:architecture

# 3. Run Architecture Invariant & Adversarial Suites
npm run test:architecture

# 4. Run Step 1 Integration Test Battery
npx tsx --tsconfig packages/execution-kernel/tsconfig.json --test packages/execution-kernel/src/testing/step1*.test.ts
```
