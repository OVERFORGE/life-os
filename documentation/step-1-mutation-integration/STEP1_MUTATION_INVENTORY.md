# Step 1: Mutation Inventory Across LifeOS Application & Kernel Layers
## V2.3 — Authoritative Multi-Tier Taxonomy and Reconciliation Baseline

**Document ID**: `STEP1_MUTATION_INVENTORY.md`  
**Version**: V2.3.0 — FINAL IMPLEMENTATION-READY SPECIFICATION  
**Milestone**: Step 1 — Close Mutation Gaps Across the Application Layer  
**Architectural Baseline**: B1–B4 Distributed Kernel Contracts & Global Semantic Remediation Architecture V2.3.0  
**Governing Principle**: *The kernel provides truth. Agents provide intelligence.*  
**Status**: PLANNING & ARCHITECTURAL VERIFICATION ONLY (Zero Source Code Modified)  
**Date**: October 31, 2026  

---

## 1. Executive Summary & Authoritative Accounting System

This document establishes the authoritative accounting system for all state mutations across the LifeOS application layer (`apps/web`), domain engines, action adapters, and the execution kernel (`packages/execution-kernel`).

To eliminate ambiguity, V2.3 strictly distinguishes four architectural tiers:
1. **Logical Mutation Operations (19)**: The domain-level state transitions recognized by LifeOS (e.g., "Create Goal", "Complete Task", "Reschedule Occurrence").
2. **Application & Kernel Entry Points (24)**: The concrete HTTP routes, action adapters, or dispatcher entry points where mutations initiate.
3. **Distinct Underlying Implementation Code Paths (24)**: The separate code paths in the repository executing database mutations (distinguishing separate implementations from multiple entry points sharing an implementation).
4. **Compliance Classification**:
   - **Confirmed Direct-Write Bypasses (16 implementation paths / 14 logical operations)**: Write directly to MongoDB without transactional outbox events, version fencing, or durable receipts.
   - **Partially Compliant Paths (1 implementation path / 1 logical operation)**: Emits an outbox event but retains unfenced secondary direct writes or wrong event types (`POST /api/gym/session`).
   - **Fully Compliant Paths (4 implementation paths / 4 logical operations)**: Atomically execute through `persistWithStandaloneFencing`, advance aggregate version, and record L1/L2 receipts.
   - **Dormant Kernel Handlers (2 handlers)**: Implemented with outbox persistence in the kernel, but bypassed by Web API routes.
   - **Missing Kernel Handlers (1 handler)**: Completely absent from execution handlers and dispatcher (`handleUpdateGoal.ts`).

---

## 2. Master Mutation Accounting Table

| # | Domain | Logical Mutation Operation | Entry Point(s) | Underlying Implementation Handler & File | Direct DB Write? | Outbox Event? | Version / Epoch Fenced? | Durable L1/L2 Receipts? | Compliance Status in V2.3 Baseline | Target V2.3 Canonical Path |
|---|---|---|---|---|---|---|---|---|---|---|
| **1** | **Goal** | Create Goal | `POST /api/goals/create` | Inline route handler in `apps/web/app/api/goals/create/route.ts` (`Goal.create`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `goalEngine.createGoal` |
| **2** | **Goal** | Create Goal (Kernel) | Kernel Dispatcher (`executionEngine.ts`) | `packages/execution-kernel/src/dispatch/executionHandlers/handleCreateGoal.ts` | **NO** | **YES** (`domain.goal.created`) | **YES** (`version: 1`) | **YES** | ⚠️ **DORMANT COMPLIANT** | Unified with `goalEngine.createGoal` |
| **3** | **Goal** | Update Goal | `PUT /api/goals/[id]` | Inline route handler in `apps/web/app/api/goals/[id]/route.ts` (`Goal.findOneAndUpdate`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `goalEngine.updateGoal` |
| **4** | **Goal** | Update Goal (Kernel) | Kernel Dispatcher | *DOES NOT EXIST* (Missing from `executionEngine.ts` and handlers) | N/A | N/A | N/A | N/A | ❌ **MISSING KERNEL HANDLER** | Create `handleUpdateGoal.ts` $\to$ `goalEngine.updateGoal` |
| **5** | **Goal** | Delete Goal | `DELETE /api/goals/[id]` | Inline route handler in `apps/web/app/api/goals/[id]/route.ts` (`Goal.deleteOne`, `GoalStats.deleteOne`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `goalEngine.deleteGoal` (Soft Archival) |
| **6** | **Goal** | Delete Goal (Kernel) | Kernel Dispatcher (`executionEngine.ts`) | `packages/execution-kernel/src/dispatch/executionHandlers/handleDeleteGoal.ts` (`persistWithStandaloneFencing` + physical `deleteOne`) | **NO** | **YES** (`domain.goal.deleted`) | **YES** (`version += 1`) | **YES** | ⚠️ **DORMANT COMPLIANT** (Violates soft-archival policy) | Refactored to `goalEngine.deleteGoal` (Soft Archival) |
| **7** | **Goal** | Approve AI Adaptation | `POST /api/insights/goal-adaptations/action` | Inline route handler in `apps/web/app/api/insights/goal-adaptations/action/route.ts` (`goal.save()`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | Route to `goalEngine.updateGoal` |
| **8** | **Goal** | Auto-Complete Milestone Deliverable | Internal engine trigger | `apps/web/features/goals/engine/updateGoalStats.ts` line 50 (`Goal.updateOne({ status: 'completed' })`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | Route to `goalEngine.completeGoal` |
| **9** | **Task** | Create Task | `POST /api/tasks` & `handleCreateTask.ts` | `apps/web/features/tasks/engine/taskEngine.ts` (`createTask` via `persistWithStandaloneFencing`) | **NO** | **YES** (`domain.task.created`) | **YES** (`version: 1`) | **YES** | ✅ **FULLY COMPLIANT** | Maintained |
| **10** | **Task** | Update Task | `PUT /api/tasks/[id]` & `handleUpdateTask.ts` | `apps/web/features/tasks/engine/taskEngine.ts` (`updateTask` via `persistWithStandaloneFencing`) | **NO** | **YES** (`domain.task.updated`) | **YES** (`version += 1`) | **YES** | ✅ **FULLY COMPLIANT** | Maintained |
| **11** | **Task** | Delete Task | `DELETE /api/tasks/[id]` & `handleDeleteTask.ts` | `apps/web/features/tasks/engine/taskEngine.ts` (`deleteTask` via `persistWithStandaloneFencing`) | **NO** | **YES** (`domain.task.deleted`) | **YES** (`version += 1`) | **YES** | ✅ **FULLY COMPLIANT** | Maintained |
| **12** | **Task** | Complete Task (Primary Document) | `POST /api/tasks/[id]/complete` & `handleCompleteTask.ts` | `apps/web/features/tasks/engine/taskEngine.ts` (`completeTask` lines 330–345 via `persistWithStandaloneFencing`) | **NO** | **YES** (`domain.task.completed`) | **YES** (`version += 1`) | **YES** | ✅ **FULLY COMPLIANT** | Maintained |
| **13** | **Task** | Auto-Spawn Recurring Successor | `POST /api/tasks/[id]/complete` | Inline in `apps/web/features/tasks/engine/taskEngine.ts` lines 351–365 (`Task.create`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** (Multi-Aggregate Split Brain) | Mode A Transaction (Replica Set) / Mode B Staged Recovery with Unique Partial Index on `{ userId, recurringParentId, dueDate }` |
| **14** | **Task** | Uncomplete / Revert Task | `POST /api/tasks/[id]/uncomplete` | `apps/web/features/tasks/engine/taskEngine.ts` line 382 (`task.status = "pending"; task.save()`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `taskEngine.uncompleteTask` via `persistWithStandaloneFencing` |
| **15** | **Task** | Skip Single Task | `POST /api/tasks/[id]/skip` | `apps/web/features/tasks/engine/taskEngine.ts` line 399 (`task.status = "skipped"; task.save()`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `taskEngine.skipTask` via `persistWithStandaloneFencing` |
| **16** | **Task** | Bulk Skip Tasks For Today | `POST /api/tasks/skip-all` | `apps/web/features/tasks/engine/taskEngine.ts` line 409 (`Task.updateMany({ status: "skipped" })`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `taskEngine.skipAllForToday` with per-item L2 receipts |
| **17** | **Task** | Reschedule Overdue (Web Engine) | `POST /api/tasks/reschedule-overdue` | `apps/web/features/tasks/engine/taskEngine.ts` lines 463–467 (`t.dueDate = today; t.save()` loop) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `taskEngine.rescheduleOverdue` via fenced batch |
| **18** | **Task** | Reschedule Overdue (Kernel Complete) | Kernel Complete Task Handler | `packages/execution-kernel/src/dispatch/executionHandlers/handleCompleteTask.ts` lines 27–34 (raw `t.save()` loop) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | Delegates to `taskEngine.rescheduleOverdue` |
| **19** | **Gym** | Log Workout Session (Web API) | `POST /api/gym/session` | Hybrid in `apps/web/app/api/gym/session/route.ts` (`WorkoutSession.create` + outbox + fire-and-forget `DailyLog`) | **PARTIAL** | **YES** (`domain.physical.workout_logged`) | **PARTIAL** | **PARTIAL** | ⚠️ **PARTIAL BYPASS / MISMATCH** | `gymEngine.logSession` with `dateOnly` emitting canonical `domain.health.workout_logged` |
| **20** | **Gym** | Log Workout Session (Kernel) | Kernel Dispatcher (`executionEngine.ts`) | `packages/execution-kernel/src/dispatch/executionHandlers/handleLogWorkout.ts` lines 22–45 (`WorkoutSession.create` + raw `DailyLog`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | Delegates to `gymEngine.logSession` |
| **21** | **Gym** | Update Workout Session (Web API) | `PATCH /api/gym/session/[id]` | Inline route handler in `apps/web/app/api/gym/session/[id]/route.ts` (`WorkoutSession.findOneAndUpdate`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `gymEngine.updateSession` with `dateOnly` via `persistWithStandaloneFencing` |
| **22** | **Gym** | Update Workout Session (Adapter) | Action Adapter | `packages/execution-kernel/src/orchestration/kernel/DefaultActionAdapters.ts` line 874 (`WorkoutSession.findOneAndUpdate`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `gymEngine.updateSession` |
| **23** | **Gym** | Delete Workout Session | `DELETE /api/gym/session/[id]` | Inline route handler in `apps/web/app/api/gym/session/[id]/route.ts` (`WorkoutSession.findOneAndDelete`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `gymEngine.deleteSession` (Soft Archival + `session_deleted`) |
| **24** | **Temporal** | Schedule Occurrence | Action Adapter (`TemporalActionAdapters.ts`) | `packages/execution-kernel/src/temporal/adapters/TemporalActionAdapters.ts` line 99 (`TemporalOccurrence.findOneAndUpdate`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `ScheduleOccurrenceAdapter` via `persistWithStandaloneFencing` |
| **25** | **Temporal** | Reschedule Occurrence | Action Adapter (`TemporalActionAdapters.ts`) | `packages/execution-kernel/src/temporal/adapters/TemporalActionAdapters.ts` lines 182 & 190 (`existing.save()` / `TemporalOccurrence.create`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `RescheduleOccurrenceAdapter` via `persistWithStandaloneFencing` |
| **26** | **Temporal** | Cancel Occurrence | Action Adapter (`TemporalActionAdapters.ts`) | `packages/execution-kernel/src/temporal/adapters/TemporalActionAdapters.ts` lines 312 & 327 (`foundOcc.save()` / `TemporalOccurrence.create`) | **YES** | **NO** | **NO** | **NO** | ❌ **CONFIRMED BYPASS** | `CancelOccurrenceAdapter` via `persistWithStandaloneFencing` |

---

## 3. Reconciled Accounting Breakdown

- **Total Logical Mutation Operations**: **19 operations** across Goals (5), Tasks (8), Gym (3), and Temporal (3).
- **Total Application & Kernel Entry Points**: **24 entry points**.
- **Distinct Underlying Implementation Code Paths Audited**: **24 implementation code paths** (numbered 1–3, 5–26 above; item 4 is currently missing from codebase).
- **Confirmed Direct-Write Bypasses Requiring Integration**: **16 implementation code paths** (covering 14 logical operations).
- **Partially Compliant Implementation Paths**: **1 path** (`POST /api/gym/session`).
- **Fully Compliant Implementation Paths**: **4 paths** (`createTask`, `updateTask`, `deleteTask`, and the primary document write in `completeTask`).
- **Dormant Kernel Handlers**: **2 handlers** (`handleCreateGoal.ts`, `handleDeleteGoal.ts`).
- **Missing Kernel Handlers**: **1 handler** (`handleUpdateGoal.ts`).

---

## 4. Multi-Aggregate Mutation Operation Classifications

Three logical operations touch multiple persisted collections:

1. **Recurring Task Completion** (Operation 12 + 13):
   - **Affected Collections**: `tasks` (parent task updated to completed) + `tasks` (successor task created) + `outbox_events` + `mutation_receipts`.
   - **Mode A (Replica Set / Production)**: Multi-Document Transaction commits all four records atomically within a single `session.withTransaction`.
   - **Mode B (Standalone Fallback)**: **Explicitly unsupported as ACID atomic**. Handled as staged sequential execution with a database-enforced unique partial index on `{ userId: 1, recurringParentId: 1, dueDate: 1 }` (`recurringParentId: { $type: "objectId" }`). Deduplicates concurrent retries via `E11000` catch. Returns explicit partial error if successor creation fails.
2. **Goal Deletion** (Operation 5 / 6):
   - **Affected Collections**: `goals` + `goalstats` + `outbox_events` + `mutation_receipts`.
   - **Authoritative Policy**: **Soft deletion / tombstone to `status: "archived"` with `archivedAt: new Date()` and version increment**. Related `GoalStats` is tombstoned via `GoalIntelligenceConsumer` upon receiving `domain.goal.deleted`. Physical `deleteOne` is strictly prohibited.
3. **Workout Session Logging** (Operation 19 / 20):
   - **Affected Collections**: `workoutsessions` + `dailylogs` + `outbox_events` + `mutation_receipts`.
   - **Authoritative Policy**: `WorkoutSession` (with indexed `dateOnly`), `outbox_events`, and `mutation_receipts` commit through `gymEngine.logSession`. `DailyLog` updates are driven authoritatively through `PhysicalReadinessConsumer` upon event dispatch using **Lock-Free CAS on `DailyLog.version`**, eliminating fire-and-forget direct writes and cross-aggregate causal sequence inversion.
