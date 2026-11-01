# LifeOS / Aven — Prioritized Inventory of Genuine Remaining Gaps
## Technical Debt, Integration Blockers & Remediation Blueprint
**Authoritative Baseline**: B1–B4 Whole-System Architecture Audit  
**Audit Date**: October 31, 2026  
**Auditor**: Principal Systems Architect & Independent Verification Auditor (Antigravity)  
**Deliverable**: `documentation/LIFEOS_REMAINING_GAPS.md`

---

## 1. Prioritization Framework

The gaps uncovered during the whole-system audit are prioritized based on their direct impact on **causal consistency, data integrity, runtime reliability, and production deployment**:

- **P0 (Critical Blockers — Data Integrity & Causal Invariants)**: Architectural violations where application mutations bypass the outbox, create unversioned records, or break the downstream event chain. Must be fixed before any production deployment.
- **P1 (High Priority — Runtime Activation & Ingress Routing)**: Fully implemented kernel classes that are not currently running in production due to missing entrypoint processes or missing Next.js API routes.
- **P2 (Medium Priority — Test Infrastructure & Storage Optimization)**: Test harness defects causing false-positive test failures, or orphaned models that consume storage without being queried.
- **P3 (Architecture Hygiene & Legacy Deprecation)**: Dormant legacy classes from Kernel V1 that create architectural confusion and should be safely archived or removed.

---

## 2. Priority 0 — Critical Blockers (Data Integrity & Causal Invariants)

### GAP-P0-01: Goals REST API Bypasses Universal Outbox Closure
- **Severity**: **P0 (Critical)**
- **Subsystem**: Web API $\to$ Goal Management
- **Affected Files**:
  - `apps/web/app/api/goals/create/route.ts` (lines 18–21)
  - `apps/web/app/api/goals/[id]/route.ts` (lines 115–124, 147–159)
- **Root Cause**:
  `POST /api/goals/create` calls `Goal.create({ ...body, userId })` directly. `PUT /api/goals/[id]` calls `Goal.findOneAndUpdate(...)`. `DELETE /api/goals/[id]` calls `Goal.deleteOne(...)`. These endpoints completely bypass `KernelCapabilityService` and `OutboxStorageService.persistWithStandaloneFencing`.
- **System Impact**:
  1. Created/updated goals carry `version: undefined` and `mutationEpoch: undefined`.
  2. Zero canonical outbox events are written to `outboxevents`.
  3. `GoalIntelligenceConsumer` and `BehavioralIntelligenceConsumer` never receive notifications of goal modifications.
  4. Downstream projections and behavioral profiles are starved of goal updates.
- **Remediation Prescription**:
  Refactor `POST /api/goals/create` to invoke `handleCreateGoal` in `packages/execution-kernel/src/orchestration/kernel/DefaultActionAdapters.ts`. Refactor `PUT` and `DELETE` to use kernel adapters wrapped in `persistWithStandaloneFencing`.

---

### GAP-P0-02: Task Engine Status Transitions & Recurring Spawn Bypass Outbox
- **Severity**: **P0 (Critical)**
- **Subsystem**: Web Feature Engine $\to$ Task Engine
- **Affected Files**:
  - `apps/web/features/tasks/engine/taskEngine.ts` (lines 351–364, 380–383, 398–401, 409–414)
- **Root Cause**:
  While `createTask`, `updateTask`, `deleteTask`, and the primary part of `completeTask` use `persistWithStandaloneFencing`:
  1. **Recurring Auto-Spawn** (line 351): When a recurring task completes, auto-spawning the next instance calls `await Task.create(...)` directly.
  2. **Uncomplete Task** (line 382): Calls `task.status = "pending"; await task.save()`.
  3. **Skip Task** (line 399): Calls `task.status = "skipped"; await task.save()`.
  4. **Bulk Skip** (line 409): Calls `await Task.updateMany(..., { $set: { status: "skipped" } })`.
- **System Impact**:
  Auto-spawned tasks enter the system unversioned and unrecorded in the outbox. Task skips and uncompletions produce zero events, meaning behavioral cadence learning cannot observe task deferrals or skips.
- **Remediation Prescription**:
  Update `uncompleteTask`, `skipTask`, and `skipAllForToday` to persist domain changes via `persistWithStandaloneFencing` and emit `domain.task.uncompleted` and `domain.task.skipped`. Update recurring spawn in `completeTask` to call `createTask()`.

---

### GAP-P0-03: Gym Session REST API Bypasses Outbox
- **Severity**: **P0 (Critical)**
- **Subsystem**: Web API $\to$ Gym Logger
- **Affected Files**:
  - `apps/web/app/api/gym/session/[id]/route.ts` (lines 13, 46–50)
- **Root Cause**:
  `PATCH` calls `WorkoutSession.findOneAndUpdate` and `DELETE` calls `WorkoutSession.findOneAndDelete` directly on MongoDB.
- **System Impact**:
  Workout updates and deletions bypass versioning and outbox events, preventing `PhysicalReadinessConsumer` from maintaining accurate user recovery debt scores.
- **Remediation Prescription**:
  Wrap workout mutations in kernel action adapters backed by `persistWithStandaloneFencing` and emit `domain.physical.workout_logged` / `domain.physical.workout_deleted`.

---

## 3. Priority 1 — High Priority (Runtime Activation & Ingress Routing)

### GAP-P1-01: Missing Background Runner for Outbox Dispatcher & Consumers
- **Severity**: **P1 (High)**
- **Subsystem**: Execution & Orchestration $\to$ Event Infrastructure
- **Affected Files**:
  - `packages/execution-kernel/src/events/dispatch/DurableOutboxDispatcher.ts`
  - `packages/execution-kernel/src/events/consumers/ConsumerRegistry.ts`
  - `apps/web/server/` (missing background worker file)
- **Root Cause**:
  `DurableOutboxDispatcher` and `ConsumerRegistry` are fully implemented and verified in tests, but there is no entrypoint script or container process in `apps/web/server/` that instantiates `ConsumerRegistry`, registers the 7 canonical consumers, and continuously calls `DurableOutboxDispatcher.executeCycle()`.
- **System Impact**:
  All outbox events remain permanently in `outboxevents` with `deliveryStatus: "PENDING"`. Asynchronous consumer propagation is 100% inactive in production runtime.
- **Remediation Prescription**:
  Author a standalone runner (e.g., `apps/web/server/workers/outboxWorker.ts`), initialize `ConsumerRegistry` with all 7 canonical consumers, and run a resilient interval loop (`setInterval` with error recovery and graceful SIGTERM shutdown). Add npm script `pnpm run worker:outbox`.

---

### GAP-P1-02: Missing Background Runner for Autonomous Daemon & Recovery Sweeper
- **Severity**: **P1 (High)**
- **Subsystem**: Autonomous Orchestration $\to$ Daemon & DWCP Sweeper
- **Affected Files**:
  - `packages/execution-kernel/src/autonomous/AutonomousExecutionDaemon.ts`
  - `packages/execution-kernel/src/autonomous/dwcp/DWCPRecoverySweeper.ts`
  - `apps/web/server/` (missing daemon runner file)
- **Root Cause**:
  `AutonomousExecutionDaemon` and `DWCPRecoverySweeper` are fully implemented in the execution kernel, but no Node.js runner process instantiates them in deployment.
- **System Impact**:
  Autonomous proactive strategies (morning briefings, schedule rebalancing, energy alignment) and DWCP crash recovery never run automatically for users in production.
- **Remediation Prescription**:
  Author `apps/web/server/workers/autonomousDaemon.ts`, acquire distributed leases via `AutonomousLeaseManager`, start `AutonomousExecutionDaemon` and `DWCPRecoverySweeper`, and provide health-check logging. Add npm script `pnpm run worker:daemon`.

---

### GAP-P1-03: Missing Next.js Route Handlers for B4 Reactive Surface Delivery
- **Severity**: **P1 (High)**
- **Subsystem**: Application Layer $\to$ Multi-Surface Delivery
- **Affected Files**:
  - `apps/web/app/api/aven/stream/reactive/route.ts` (**MISSING**)
  - `apps/web/app/api/aven/stream/ack/route.ts` (**MISSING**)
  - `apps/web/app/api/surface/events/route.ts` (Legacy)
- **Root Cause**:
  `SurfacePresenceManager` was implemented in `packages/execution-kernel`, but the Next.js App Router route handlers connecting web/mobile clients to it were never authored.
- **System Impact**:
  Client surfaces cannot connect to B4 reactive event streams; sequence cursor tracking and ascending replay cannot function across client surfaces.
- **Remediation Prescription**:
  Implement `/api/aven/stream/reactive` (SSE stream handler registering `surfaceId` with `SurfacePresenceManager`) and `/api/aven/stream/ack` (POST endpoint invoking `recordSurfaceAck`).

---

### GAP-P1-04: Missing Next.js Route Handler for B4 HITL Governance
- **Severity**: **P1 (High)**
- **Subsystem**: Application Layer $\to$ Governance Ingress
- **Affected Files**:
  - `apps/web/app/api/aven/interventions/respond/route.ts` (**MISSING**)
- **Root Cause**:
  `HITLGovernanceEngine` was implemented in the kernel, but the corresponding Next.js endpoint to receive user approvals/rejections was not created.
- **System Impact**:
  Users have no HTTP API path to respond to human interventions or submit cryptographic approval tokens.
- **Remediation Prescription**:
  Implement `/api/aven/interventions/respond` verifying session user, token validation, and invoking `HITLGovernanceEngine.respondToIntervention`.

---

### GAP-P1-05: Missing Canonical Event in Temporal Rescheduling
- **Severity**: **P1 (High)**
- **Subsystem**: Execution Kernel $\to$ Temporal Adapters
- **Affected Files**:
  - `packages/execution-kernel/src/temporal/adapters/TemporalActionAdapters.ts` (lines 167–220)
- **Root Cause**:
  `RescheduleOccurrenceAdapter.execute()` directly mutates `TemporalOccurrence` models (`existing.save()`, `TemporalOccurrence.create({...})`) without routing through `OutboxStorageService.persistWithStandaloneFencing`.
- **System Impact**:
  `domain.temporal.rescheduled` is never emitted. Both `TemporalConflictConsumer` (for conflict reports) and `CadenceLearningConsumer` (for schedule habit adjustments) are starved of rescheduling signals.
- **Remediation Prescription**:
  Update `RescheduleOccurrenceAdapter` to call `outboxService.persistWithStandaloneFencing` and emit canonical event `domain.temporal.rescheduled`.

---

## 4. Priority 2 — Medium Priority (Test Infrastructure & Storage Optimization)

### GAP-P2-01: B2 Mock Collection Incompatible with `$lte` Numeric Operator
- **Severity**: **P2 (Medium)**
- **Subsystem**: Test Infrastructure $\to$ B2 Test Suite
- **Affected Files**:
  - `packages/execution-kernel/src/testing/b2OutboxStorage.test.ts` (lines 125–139)
  - `packages/execution-kernel/src/testing/b2EndToEndCausalReality.test.ts`
- **Root Cause**:
  `MockMongoCollection.matchesQuery` evaluates `doc[k] !== v` directly. When B4 introduced `mutationEpoch: { $lte: params.fencingEpoch }` into `OutboxStorageService.ts`, the mock compared `0 !== { $lte: 0 }`, which evaluated to true, failing queries in 4 tests (`OUTBOX-01`, `OUTBOX-04`, `E2E-01`, `E2E-02`).
- **System Impact**:
  Causes 4 false-positive failures in the B2 regression suite when running against in-memory mocks, even though real MongoDB WiredTiger evaluates this query natively.
- **Remediation Prescription**:
  Update `MockMongoCollection.matchesQuery` to evaluate MongoDB query operators (`$lte`, `$gte`, `$in`) on numeric fields.

---

### GAP-P2-02: Execution Graph Derived Model is an Orphaned Data Sink
- **Severity**: **P2 (Medium)**
- **Subsystem**: Database Models $\to$ Execution Graph
- **Affected Files**:
  - `apps/web/server/db/models/ExecutionGraphDerivedModel.ts`
  - `packages/execution-kernel/src/events/consumers/ExecutionGraphConsumer.ts`
- **Root Cause**:
  `ExecutionGraphDerivedModel` was created during B2 to store derived graph projections. However, `TaskService`, `GoalService`, and `DashboardService` do not read from it, choosing instead to invoke `ExecutionGraph.buildFromDatabase(userId)`.
- **System Impact**:
  Storage and compute are expended updating a model that is never queried by any application read path.
- **Remediation Prescription**:
  Either refactor `TaskService` and `DashboardService` to read the cached `ExecutionGraphDerivedModel` for sub-millisecond graph queries, or deprecate the model and consumer if dynamic graph reconstruction remains the desired architecture.

---

### GAP-P2-03: Action Idempotency Audit Store is Ephemeral in Central Kernel
- **Severity**: **P2 (Medium)**
- **Subsystem**: Orchestration Kernel $\to$ Idempotency
- **Affected Files**:
  - `packages/execution-kernel/src/orchestration/kernel/KernelCapabilityService.ts` (lines 45–70, 160–225)
  - `apps/web/server/db/models/ActionAuditRecordModel.ts`
- **Root Cause**:
  `KernelCapabilityService` stores action audit records in an in-memory `Map<string, StoredActionAudit>` (`this.auditStore`). The comment states `// mirrors durable KernelActionAudit collection`, but durable MongoDB writes were never implemented for internal kernel actions.
- **System Impact**:
  If the application server restarts, the in-memory idempotency cache resets. A duplicate action envelope submitted after a server restart will not be caught by the in-memory cache (though aggregate version fencing in the outbox will still reject it).
- **Remediation Prescription**:
  Add an asynchronous write to `ActionAuditRecordModel.findOneAndUpdate` inside `KernelCapabilityService.executeAction`.

---

## 5. Priority 3 — Architecture Hygiene & Legacy Deprecation

### GAP-P3-01: Deprecate Dormant V1 KernelEngine & Brain Pipeline
- **Severity**: **P3 (Low)**
- **Subsystem**: Kernel V1 Legacy Pipeline
- **Affected Files**:
  - `packages/execution-kernel/src/kernel/KernelEngine.ts`
  - `packages/execution-kernel/src/kernel/KernelRuntime.ts`
  - `packages/execution-kernel/src/brain/Brain.ts`
  - `packages/execution-kernel/src/reasoning/Reasoner.ts`
  - `packages/execution-kernel/src/planning/Planner.ts`
  - `packages/execution-kernel/src/reflection/ReflectionEngine.ts`
- **Root Cause**:
  These classes formed the original V1 kernel pipeline. They were superseded by `Supervisor.ts` (V3 Chief of Staff), `WorldModelBridge.ts`, and `KernelCapabilityService.ts`. They are never invoked in production.
- **System Impact**:
  Increases codebase size, creates architectural confusion for developers, and duplicates concepts (e.g. `Brain.world` vs `WorldModelV2`).
- **Remediation Prescription**:
  Mark these classes with `@deprecated`, archive legacy documentation, and schedule safe removal in a future cleanup milestone.

---

## 6. Gap Summary & Action Priority Table

| Gap ID | Priority | Category | Component / Area | Estimated Remediation Effort |
| :--- | :---: | :--- | :--- | :---: |
| **GAP-P0-01** | **P0** | Data Integrity | Goals REST API Outbox Enclosure | 2–3 hours |
| **GAP-P0-02** | **P0** | Data Integrity | Task Engine Complete/Skip/Recurring Outbox Enclosure | 2–3 hours |
| **GAP-P0-03** | **P0** | Data Integrity | Gym REST API Outbox Enclosure | 1–2 hours |
| **GAP-P1-01** | **P1** | Runtime Activation | Outbox Dispatcher & Consumer Worker Script | 3–4 hours |
| **GAP-P1-02** | **P1** | Runtime Activation | Autonomous Daemon & Sweeper Worker Script | 3–4 hours |
| **GAP-P1-03** | **P1** | Routing / SSE | Next.js B4 Reactive SSE Stream & Ack Routes | 3–4 hours |
| **GAP-P1-04** | **P1** | Routing / HITL | Next.js B4 HITL Intervention Response Route | 1–2 hours |
| **GAP-P1-05** | **P1** | Event Propagation | Temporal Reschedule Canonical Event Emission | 1–2 hours |
| **GAP-P2-01** | **P2** | Test Harness | B2 Mock Collection `$lte` Operator Normalization | 1 hour |
| **GAP-P2-02** | **P2** | Storage Optimization | Align `ExecutionGraphDerivedModel` Consumption | 2 hours |
| **GAP-P2-03** | **P2** | Idempotency | Durable MongoDB Backing for Kernel Action Audit | 1–2 hours |
| **GAP-P3-01** | **P3** | Architecture Hygiene| Deprecate Dormant V1 KernelEngine & Brain Classes | 1 hour |

