# STEP 1 FINDINGS AND REPRODUCTIONS
## Exhaustive Defect Catalog, Invariant Violations, and Pre-Step-2 Remediation Ledger

**Project**: LifeOS / Aven  
**Milestone**: Step 1 Post-Implementation Audit  
**Date**: November 1, 2026  
**Auditor**: Independent Adversarial Verification Campaign  

---

## 1. DEFECT SUMMARY TABLE

| ID | Finding Title | Severity | Location | Violated Invariant | Blocks Step 2? |
|---|---|:---:|---|---|:---:|
| **F-01** | Unfenced Mutations in `DefaultActionAdapters.ts` | **HIGH** | `DefaultActionAdapters.ts:776, 874, 944, 420` | Canonical persistence, CAS, Outbox | **YES** |
| **F-02** | Direct Save & Destructive Delete in `TemporalActionAdapters` | **HIGH** | `TemporalActionAdapters.ts:895, 974` | Soft Archival, Outbox Fencing | **YES** |
| **F-03** | Regex-Based Entity Title Substring Matching | **MEDIUM** | `TemporalActionAdapters.ts:496, 961` | Semantic Rule 8 (No heuristic regex) | **NO** (Remediate) |
| **F-04** | Goal Bootstrap Route Raw `insertMany` | **MEDIUM** | `apps/web/app/api/goals/bootstrap/route.ts:29` | Canonical Goal Engine, Versioning | **NO** (Remediate) |
| **F-05** | `clientMutationId` Collision on Same-Millisecond Mutations | **MEDIUM** | `goalEngine.ts:164`, `taskEngine.ts:175`, `gymEngine.ts:178` | Rule 4 (Deterministic Idempotency) | **NO** (Remediate) |
| **F-06** | Recurring Task Partial Failure Contract Inconsistency | **MEDIUM** | `taskEngine.ts:508`, `handleCompleteTask.ts:98` | Honest Failure Communication | **NO** (Contract align) |
| **F-07** | Subtask Physical Deletion via `deleteMany` | **MEDIUM** | `taskEngine.ts:251` | Universal Soft Archival | **NO** (Remediate) |
| **F-08** | AST Linter Directory Blindspots & String Bypasses | **LOW** | `scripts/verify-semantic-architecture.ts:343` | Permanent Architectural Governance | **NO** (Expand linter) |
| **F-09** | English Regex Dictionary in `temporalResolver.ts` | **MEDIUM** | `orchestration/semantic/temporalResolver.ts:120` | Semantic Architecture Principle | **NO** (Clean up) |
| **F-10** | Mode A Transactional Scope Asymmetry | **LOW** | `OutboxStorageService.ts`, `goalEngine`, `gymEngine` | Mode A/B Architectural Parity | **NO** (Clarify scope) |

---

## 2. DETAILED DEFECT SPECIFICATIONS & REPRODUCTIONS

### FINDING F-01: Unfenced Direct Mutations in `DefaultActionAdapters.ts`
- **Severity**: **HIGH** (Blocks Step 2)
- **Location**:
  - Line 776 (`ConfirmGoalAdapter`): `Goal.findOneAndUpdate({ _id: goalId, ... }, { $set: { status: "active", confirmedAt: new Date() } })`
  - Line 874 (`ModifyWorkoutAdapter`): `WorkoutSession.findOneAndUpdate({ _id: sessionId, userId }, { $set: proposal.payload }, { new: true })`
  - Line 944 (`ApplyRecoveryConstraintAdapter`): `DailyLog.findOneAndUpdate({ userId, date: today }, { $set: { "recoveryConstraint": proposal.payload } }, { upsert: true })`
  - Lines 420, 441 (`DeferExecutionAdapter`): `taskCollection.updateOne(...)` and `occCollection.updateOne(...)`
- **Violated Invariant**: All mutations across Goal, Task, WorkoutSession, and DailyLog must pass through canonical domain engines or `persistWithStandaloneFencing`.
- **Reproduction**:
  1. Submit a `confirm_goal` action proposal through the Kernel Dispatcher.
  2. Inspect the Goal document in MongoDB: version is not incremented, no `recentMutationReceipts` entry is added, and no outbox event is created in `outboxevents`.
- **Expected Behavior**: Adapters must delegate to `goalEngine.updateGoal`, `gymEngine.updateSession`, and `taskEngine.updateTask`.
- **Step 2 Impact**: Asynchronous projection consumers in Step 2 will never observe workout modifications or goal confirmations executed via these adapters because no outbox events are generated.

---

### FINDING F-02: Direct Save & Destructive Delete in `TemporalActionAdapters.ts`
- **Severity**: **HIGH** (Blocks Step 2)
- **Location**:
  - Line 974 (`LogExecutionIntervalAdapter`): `matchOcc.status = "COMPLETED"; await matchOcc.save();`
  - Line 895 (`CreateSeriesTemplateAdapter.compensate`): `await TemporalOccurrence.deleteMany({ userId, seriesId });`
- **Violated Invariant**: Soft archival invariant (no physical `deleteMany` on business aggregates) and outbox event persistence for occurrence state transitions.
- **Reproduction**:
  1. Trigger series compensation in `CreateSeriesTemplateAdapter.compensate`.
  2. Inspect database: occurrences are permanently deleted via `deleteMany`, leaving no tombstone or archival record.
- **Expected Behavior**: Deletions must soft-archive (`status: "CANCELLED"`, `isDeletion: true`), and completion must invoke `outboxService.persistWithStandaloneFencing`.

---

### FINDING F-03: Regex-Based Entity Title Substring Matching
- **Severity**: **MEDIUM**
- **Location**: `TemporalActionAdapters.ts:496, 961`
- **Code**:
  ```typescript
  const titleKeyword = p.title.trim().split(" ")[0];
  const titleRegex = new RegExp(titleKeyword, "i");
  const foundOcc = await TemporalOccurrence.findOne({ userId, dateOnly: todayStr, title: titleRegex });
  ```
- **Violated Invariant**: Semantic Architecture Rule 8 (Barring regex-based semantic grounding and action classification in dispatch/adapters). Entity resolution must be performed by the Authoritative Entity Resolver, not heuristic substring splitting.
- **Expected Behavior**: Caller must pass explicit `occurrenceId`, or resolution must query exact canonical entity IDs.

---

### FINDING F-04: Goal Bootstrap Route Raw `insertMany`
- **Severity**: **MEDIUM**
- **Location**: `apps/web/app/api/goals/bootstrap/route.ts:29`
- **Code**: `await Goal.insertMany(docs);`
- **Violated Invariant**: Initial aggregate creation must initialize `version: 1`, `mutationEpoch: 0`, L1 receipts, and emit `domain.goal.created`.
- **Expected Behavior**: Route should loop through `GOAL_TEMPLATES` calling `goalEngine.createGoal` or use a bulk transactional outbox insertion.

---

### FINDING F-05: High-Frequency `clientMutationId` Collision via `Date.now()`
- **Severity**: **MEDIUM**
- **Location**: `goalEngine.ts:164`, `taskEngine.ts:175`, `gymEngine.ts:178`
- **Code**: `const clientMutationId = options?.clientMutationId || \`mut_goal_update_${goalId}_${Date.now()}\`;`
- **Violated Invariant**: Rule 4 (Deterministic Idempotency Keys) and receipt deduplication uniqueness.
- **Reproduction**:
  Executed in `step1AdversarialLifecycles.test.ts`: 60 sequential updates in a synchronous loop produced 40 unique receipts instead of 60 due to timestamp collisions within the same millisecond.
- **Expected Behavior**: Use monotonic sequence or UUID suffix: `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`.

---

### FINDING F-06: Recurring Task Partial Failure Contract Inconsistency
- **Severity**: **MEDIUM**
- **Location**: `apps/web/features/tasks/engine/taskEngine.ts:508-514` & `handleCompleteTask.ts:98-101`
- **Discrepancy**:
  - `taskEngine.completeTask` returns: `{ success: false, status: "SUCCESSOR_CREATION_FAILED", parentCompleted: true, ... }`
  - Completion report claimed: `{ success: true, successorStatus: "FAILED", failureReason: "SUCCESSOR_CREATION_FAILED" }`
  - `handleCompleteTask.ts` handles `result.success === false` by instructing the AI: `"Tell the user the task completion failed... Do NOT say it was completed."`
- **Impact**: User is told the task failed, even though the parent task was marked completed and its completion event was published.
- **Expected Behavior**: Align contract so the caller recognizes that the parent task succeeded while successor scheduling is pending/retrying.

---

### FINDING F-07: Subtask Physical Deletion via `deleteMany`
- **Severity**: **MEDIUM**
- **Location**: `apps/web/features/tasks/engine/taskEngine.ts:251`
- **Code**: `await taskModel.deleteMany({ parentTaskId: taskId, userId })`
- **Violated Invariant**: Universal Soft Archival Invariant.
- **Expected Behavior**: Subtasks should be soft-archived with `{ status: "archived", archivedAt: new Date() }` or marked deleted with outbox event drafts.

---

### FINDING F-08: AST Linter Directory Scope Blindspots & String Bypasses
- **Severity**: **LOW**
- **Location**: `scripts/verify-semantic-architecture.ts:343-346`
- **Defect**: Linter audits only `packages/execution-kernel/src` and `apps/web/app/api`. `apps/web/features/` and `apps/web/server/` are completely excluded. Furthermore, Rule 2 and Rule 7 use literal string searches that can be evaded through variable re-assignment.
- **Expected Behavior**: Expand `collectSourceFiles` to include `apps/web/features` and `apps/web/server`, and enhance AST visitor to trace variable identifiers.

---

### FINDING F-09: Natural Language Relative Time Parsing in `temporalResolver.ts`
- **Severity**: **MEDIUM**
- **Location**: `packages/execution-kernel/src/orchestration/semantic/temporalResolver.ts:120-160`
- **Defect**: Contains hardcoded English word mappings (`one: 1, two: 2...`) and regular expressions for "tomorrow", "yesterday", and "in X hours".
- **Expected Behavior**: Relative time offsets should be resolved by the intelligence model (LLM) producing canonical UTC timestamps.

---

### FINDING F-10: Mode A Transactional Scope Asymmetry
- **Severity**: **LOW**
- **Location**: `goalEngine.ts`, `gymEngine.ts`, `TemporalActionAdapters.ts`
- **Defect**: Mode A multi-document ACID transactions are implemented only in `taskEngine.completeTask`. Goal, Gym, and Temporal domains always invoke Mode B (`persistWithStandaloneFencing`), even on replica sets.
- **Expected Behavior**: Document that Mode B is the universal convergence protocol for Step 1, or implement `persistWithTransaction` in `goalEngine` and `gymEngine` as a future enhancement.

