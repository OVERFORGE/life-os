# LIFEOS — STEP 4 LOOP BREAKDOWN
## Complete 12-Stage Loop Engineering Specification across Loops 1 to 7

**Milestone:** Step 4 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Semantic Architecture  
**Authority:** The Executioners (ExE)  
**Status:** SPECIFICATION ONLY  
**Date:** November 2, 2026  

---

# LOOP 1: DURABLE KERNEL IDEMPOTENCY & AUDIT STORE

### Stage 1: Repository Discovery
- **Existing Source Files**:
  - `packages/execution-kernel/src/orchestration/kernel/KernelCapabilityService.ts` (contains volatile in-memory maps `auditStore` and `inFlightExecutions`).
  - `apps/web/server/db/models/ActionAuditRecordModel.ts` (Mongoose model currently indexed by single-field `idempotencyKey`).
  - `apps/web/server/db/models/MutationReceiptModel.ts` (authoritative L2 mutation receipt store).
- **Runtime Entry Points**: `KernelCapabilityService.executeAction()`, invoked by agent specialists and API dispatchers.
- **Current State**: Level 2 (Source-Code Only). Deduplication is volatile across restarts; crash after aggregate mutation leaves `ActionAuditRecordModel` in `EXECUTING` without result envelope.

### Stage 2: Dependency Mapping
- **Upstream Dependencies**: Agent specialized dispatchers emitting `ActionProposal` envelopes.
- **Downstream Dependencies**: `OutboxStorageService.persistWithStandaloneFencing`, Domain Action Adapters (`handleCreateGoal`, `handleCompleteTask`, etc.).
- **Shared Models**: `ActionAuditRecordModel`, `MutationReceiptModel`, `OutboxEventModel`.
- **Compound Identity Boundary**: Unique compound index on `{ userId: 1, idempotencyKey: 1 }`.

### Stage 3: Contract Definition
```typescript
export interface StoredActionAudit {
  idempotencyKey: string;
  actionId: string;
  userId: string;
  actionType: string;
  requestFingerprint: string; // SHA-256(userId + ":" + actionType + ":" + canonicalJSON(payload))
  status: "EXECUTING" | "SUCCEEDED" | "FAILED" | "QUARANTINED";
  workerId?: string;
  leaseExpiresAt?: Date;
  fencingEpoch: number;
  result?: any;
  error?: string;
  timestamp: number;
}
```
- **Invariants**:
  - Invariant 1.1: If an incoming request matches `{userId, idempotencyKey}` but has a different `requestFingerprint`, reject with HTTP 400 (`IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH`).
  - Invariant 1.2: If `status === "SUCCEEDED"`, return cached result envelope immediately without invoking action adapter.
  - Invariant 1.3: If `status === "EXECUTING"` and `leaseExpiresAt > now`, return HTTP 409 / 503 retry-after.
  - Invariant 1.4: If `status === "EXECUTING"` and `leaseExpiresAt <= now`, execute crash reconciliation against `MutationReceiptModel`:
    - *Aggregate Mutations*: Query `MutationReceiptModel` (`clientMutationId = action.id`). If receipt found, query aggregate or outbox draft, reconstruct result envelope, update audit to `SUCCEEDED`, and return result. If receipt missing and aggregate version unchanged, safe to reclaim lease and retry. If receipt missing and aggregate version advanced, mark `QUARANTINED`.
    - *Multi-Document Sagas*: Reconcile against primary step receipt.
    - *External Side-Effects*: Mark `QUARANTINED` to prevent duplicate non-idempotent external calls.
    - *Read-Only Operations*: Re-execute safely.

### Stage 4: Architecture Design
1. Request arrives $\to$ calculate $FP$.
2. Check in-memory L1 cache; on miss, query `ActionAuditRecordModel.findOne({ userId, idempotencyKey })`.
3. If document exists:
   - Verify $FP$; if mismatch, throw `IdempotencyPayloadMismatchError` (HTTP 400).
   - If `SUCCEEDED`, populate L1 and return cached result.
   - If `EXECUTING` and unexpired, throw `ConcurrentExecutionError` (HTTP 409).
   - If `EXECUTING` and expired, run crash reconciliation: inspect `MutationReceiptModel`. If receipt exists, reconstruct result from aggregate / outbox, update audit to `SUCCEEDED`, return result. If missing and $V_{curr} === V_{pre}$, reclaim lease. If uncertain ($V_{curr} > V_{pre}$), mark `QUARANTINED`.
4. If document does not exist: insert with `status: "EXECUTING"`, `workerId`, `leaseExpiresAt: now + 15000ms`, `fencingEpoch: 1`.
5. Execute action adapter. On success, update audit to `SUCCEEDED` with result. On failure, update audit to `FAILED` with error.

### Stage 5: Implementation Breakdown
- **Task 1.1**: Update `ActionAuditRecordModel.ts` index to compound `{ userId: 1, idempotencyKey: 1 }` and add `requestFingerprint`, `workerId`, `leaseExpiresAt`, `fencingEpoch`.
- **Task 1.2**: Implement canonical JSON stringification and SHA-256 fingerprint generator in `KernelCapabilityService.ts`.
- **Task 1.3**: Implement write-through CAS state transitions, lease acquisition, and receipt-based result envelope reconstruction in `KernelCapabilityService.ts`.
- **Files Affected**:
  - `packages/execution-kernel/src/orchestration/kernel/KernelCapabilityService.ts`
  - `apps/web/server/db/models/ActionAuditRecordModel.ts`

### Stage 6: Unit Verification
- Test canonical fingerprint determinism regardless of payload key ordering.
- Test rejection of identical `{userId, idempotencyKey}` with altered payload.
- Test in-memory cache hit serving without database query.

### Stage 7: Integration Verification
- Test process restart simulation: clear in-memory cache; assert `findOne` queries `ActionAuditRecordModel` using compound index and returns original receipt.
- Test persistence of `FAILED` status with captured error when adapter throws.

### Stage 8: Concurrency and Fault Injection
- 10 concurrent requests across separate processes with identical key: adapter executes exactly once; 9 receive cached promise/record.
- Crash injection: kill process after domain mutation commits; retry request; assert crash reconciliation checks `MutationReceiptModel`, reconstructs result, and resolves to `SUCCEEDED` without duplicate adapter run.

### Stage 9: Regression Verification
- Run all Step 1 and Step 2 tests to ensure `KernelCapabilityService` changes do not break existing action dispatching.

### Stage 10: Semantic Architecture Verification
- Verify zero regex intent matching in fingerprint generation or idempotency resolution.
- Verify AST scanner reports 0 violations across touched files.

### Stage 11: Evidence Collection
- Record execution logs: `[KERNEL::IDEMPOTENCY] Write-through audit record: ${idempotencyKey} status: SUCCEEDED`.

### Stage 12: Acceptance Review
- Verify AC-01 (survives restart, crash recovery, result reconstruction) and AC-02 (concurrent in-flight deduplication).

---

# LOOP 2: HITL CRYPTOGRAPHIC GOVERNANCE INGRESS & DIMIP ATOMIC EPOCH BURN

### Stage 1: Repository Discovery
- **Existing Source Files**:
  - `packages/execution-kernel/src/autonomous/HITLGovernanceEngine.ts` (contains HMAC-SHA256 verification and CAS state transitions).
  - `apps/web/server/db/models/AutonomousInterventionModel.ts` (Mongoose schema storing intervention parameters).
  - `apps/web/server/db/models/OutboxEventModel.ts` (outbox event store with `leasedByWorkerId`, `leaseExpiresAt`, `leaseGeneration`).
- **Missing Code**: HTTP route handlers in `apps/web/app/api/` for submitting human responses and atomic epoch burn in sweeper recovery.
- **Current State**: Level 3 (Tested in kernel isolation; lacks production HTTP ingress and Mode B DIMIP epoch burn recovery).

### Stage 2: Dependency Mapping
- **Upstream Dependencies**: Next.js client UI (Toast, Modal) and Mobile React Native surface.
- **Downstream Dependencies**: `HITLGovernanceEngine.ts`, `OutboxStorageService` (for `domain.intervention.responded` emission).
- **Security Boundary**: NextAuth session cookie / Bearer JWT validation.

### Stage 3: Contract Definition
```typescript
export interface RespondInterventionPayload {
  interventionId: string;
  response: "ACCEPTED" | "REJECTED" | "DISMISSED";
  signature: string;
  keyVersion?: number;
}
```
- **Invariants**:
  - Invariant 2.1: `userId` is obtained exclusively from verified authentication context (`session.user.id`). Any `userId` in the HTTP body is ignored or rejected.
  - Invariant 2.2: Signature verification binds `[interventionId, userId, response, keyVersion, actionId, proposalPayloadHash, expiresAt]`.
  - Invariant 2.3: Verification enforces buffer length pre-check (32 bytes / 64 hex chars) and `crypto.timingSafeEqual`.
  - Invariant 2.4: Responses to expired or already-answered interventions return HTTP 409.
  - Invariant 2.5: Atomicity guarantee:
    - *Mode A (Replica Set)*: `session.withTransaction` updates intervention document and inserts `OutboxEventModel` atomically.
    - *Mode B (Standalone MongoDB)*: Dual-Intent Monotonic Idempotent Protocol (DIMIP):
      1. Write `domain.intervention.responded` in `deliveryStatus: "PENDING_COMMIT"` with `leasedByWorkerId: workerId`, `leaseExpiresAt: now + 15000ms`, `leaseGeneration: 1`, and `mutationIntent: { clientMutationId, fencingEpoch: intervention.mutationEpoch }`.
      2. Atomic CAS update: `AutonomousInterventionModel.updateOne({ _id: interventionId, userId, status: "PENDING", mutationEpoch: intent.fencingEpoch }, { $set: { status: response, respondedAt: now }, $inc: { mutationEpoch: 1 } })`.
      3. Promote outbox event from `PENDING_COMMIT` to `PENDING`.
    - Delayed Worker & Sweeper Recovery Protocol (Atomic Epoch Burn):
      - Sweeper acquires expired intent lease (`leaseExpiresAt <= now`) via CAS: `$inc: { leaseGeneration: 1 }`.
      - Sweeper inspects `AutonomousInterventionModel`:
        - If status is `PENDING`: sweeper executes atomic epoch burn: `updateOne({ _id: interventionId, userId, status: "PENDING", mutationEpoch: intent.fencingEpoch }, { $inc: { mutationEpoch: 1 } })`.
          - If epoch burn succeeds: sweeper marks outbox event `ABORTED`. When the delayed worker resumes, its CAS fails because `mutationEpoch` has advanced.
          - If epoch burn matches 0 (delayed worker already committed): sweeper observes `ACCEPTED`/`REJECTED` and promotes outbox event to `PENDING`.
        - If status is `ACCEPTED`/`REJECTED`: sweeper promotes outbox event to `PENDING`.

### Stage 4: Architecture Design
1. Route handler receives HTTP POST at `/api/surface/interventions/respond`.
2. Authenticate caller via NextAuth `getServerSession` or JWT Bearer. If unauthenticated, return HTTP 401.
3. Validate request schema using Zod; extract `userId` strictly from session.
4. Delegate to `HITLGovernanceEngine.respondIntervention()`.
5. Engine queries `AutonomousInterventionModel.findOne({ _id: interventionId, userId })`.
6. Validate `expiresAt > now` and `status === "PENDING"`.
7. Compute expected HMAC-SHA256 signature using `keyVersion` secret.
8. Perform length pre-check; compare signatures using `crypto.timingSafeEqual`.
9. In Mode A: `session.withTransaction` sets `status: response` and inserts `OutboxEventModel`.
   In Mode B: writes `PENDING_COMMIT` outbox event with worker lease $\to$ executes CAS with `$inc: { mutationEpoch: 1 }` $\to$ promotes outbox to `PENDING`.
10. Return HTTP 200 `{ success: true, status: response }`.

### Stage 5: Implementation Breakdown
- **Task 2.1**: Author `apps/web/app/api/surface/interventions/respond/route.ts` with session authentication and identity guard.
- **Task 2.2**: Author alias route `apps/web/app/api/aven/interventions/respond/route.ts`.
- **Task 2.3**: Implement Mode A (`session.withTransaction`) and Mode B (DIMIP intent promotion with atomic epoch burn and lease fencing) persistence in `HITLGovernanceEngine.ts`.
- **Task 2.4**: Strengthen `crypto.timingSafeEqual` signature verification with length pre-check.
- **Files Affected**:
  - `apps/web/app/api/surface/interventions/respond/route.ts`
  - `apps/web/app/api/aven/interventions/respond/route.ts`
  - `packages/execution-kernel/src/autonomous/HITLGovernanceEngine.ts`

### Stage 6: Unit Verification
- Test signature generation and verification with active and retained keys.
- Test rejection of modified signature byte, altered response, or expired timestamp.
- Test rejection of retired key version (`RetiredKeyVersionError`).

### Stage 7: Integration Verification
- Test full HTTP route invocation with mock NextAuth session cookie: assert HTTP 200 and document transition to `ACCEPTED`.
- Test cross-tenant isolation: user A attempting to respond to user B's intervention returns HTTP 404/403.

### Stage 8: Concurrency and Fault Injection
- Simultaneous accept and reject requests on identical intervention: exactly 1 wins; 1 receives HTTP 409 (`InvalidInterventionStateError`).
- **Delayed Worker vs Sweeper Epoch Burn Race**:
  1. Worker A creates `PENDING_COMMIT` outbox event with `fencingEpoch: 1` and stalls before the intervention CAS.
  2. Lease expires (`leaseExpiresAt <= now`).
  3. Recovery Sweeper claims lease, observes intervention is `PENDING`, and executes atomic epoch burn: `mutationEpoch: 1 -> 2`. Sweeper marks outbox event `ABORTED`.
  4. Worker A resumes and attempts CAS: `status: "PENDING", mutationEpoch: 1`. CAS matches 0 docs because `mutationEpoch` is now 2! Worker A's mutation fails cleanly.
  5. Assert zero orphaned decisions and outbox consistency is completely preserved.

### Stage 9: Regression Verification
- Run Step 3 Loop 6 reversal tests and surface delivery tests to confirm compatibility.

### Stage 10: Semantic Architecture Verification
- Verify route does not parse natural language text to infer user consent; requires explicit typed response.
- Verify AST scanner reports 0 violations across touched route files.

### Stage 11: Evidence Collection
- Record HTTP status codes and structured logs: `[HITL::INGRESS] Intervention ${interventionId} responded: ${response}`.

### Stage 12: Acceptance Review
- Verify AC-03 (constant-time cryptographic verification), AC-04 (key rotation), and AC-05 (dedicated ingress routes & Mode A/Mode B DIMIP epoch burn atomicity).

---

# LOOP 3: DWCP RECOVERY SWEEPER DAEMON

### Stage 1: Repository Discovery
- **Existing Source Files**:
  - `packages/execution-kernel/src/autonomous/DWCPRecoverySweeper.ts` (contains two-tier receipt verification and quarantine trap).
  - `apps/web/server/db/models/WorkflowExecutionIntentModel.ts` (Mongoose schema for multi-step sagas).
  - `packages/execution-kernel/src/events/persistence/OutboxStorageService.ts` (authoritative mutation persistence service).
- **Gaps**: V2.0.0's direct aggregate update bypassed Step 1 outbox persistence; lacks background runner.
- **Current State**: Level 3 (Unit tested with in-memory mocks; not executed by background daemon).

### Stage 2: Dependency Mapping
- **Upstream Dependencies**: `scripts/autonomous-worker-daemon.ts` (Loop 5 runner).
- **Downstream Dependencies**: `OutboxStorageService`, Primary aggregate collections (`Task`, `Goal`, `WorkoutSession`), `MutationReceiptModel`.
- **Lease Boundary**: Exclusive per-user partition lease `${userId}:dwcp:sweeper`.

### Stage 3: Contract Definition
```typescript
export type WorkflowRecoveryStatus = 
  | "COMMITTED" 
  | "COMPENSATED" 
  | "QUARANTINED" 
  | "FAILED_TERMINAL";

export interface ReconcileWorkflowResult {
  workflowId: string;
  finalStatus: WorkflowRecoveryStatus;
  reconciledSteps: number;
  quarantineReason?: string;
}
```
- **Invariants**:
  - Invariant 3.1: Sweeper acquires `${userId}:dwcp:sweeper` lease before touching workflow records.
  - Invariant 3.2: Two-tier receipt lookup: aggregate L1 ring buffer $\to$ L2 `MutationReceiptModel`.
  - Invariant 3.3: If receipt missing and aggregate version equals pre-mutation version ($V_{curr} === V_{exp}$), step is definitively `NOT_APPLIED`. Safe to compensate completed steps.
  - Invariant 3.4: If receipt missing and aggregate version exceeds expected version ($V_{curr} > V_{exp}$), step is definitively `QUARANTINED`. Uncertainty must never become permission to compensate.
  - Invariant 3.5: Compensation writes MUST route through `OutboxStorageService`:
    - Mode A: `persistWithTransaction` with `clientMutationId: "comp_" + step.mutationId`, incrementing version ($V \to V+1$), persisting receipt, and emitting `domain.saga.step_compensated`.
    - Mode B: `persistWithStandaloneFencing` with monotonic `fencingEpoch` and `version: expectedVersion`.
    If aggregate version or epoch changed, compensation aborts and marks workflow `QUARANTINED`.

### Stage 4: Architecture Design
1. Sweeper polls `WorkflowExecutionIntentModel` for documents with `status: "EXECUTING"` and `updatedAt < now - 30000ms`.
2. For each stalled workflow, acquire partition lease.
3. Iterate workflow steps in sequence:
   - Check L1 ring buffer (`recentMutationReceipts` on aggregate).
   - If missing, check L2 `MutationReceiptModel.findOne({ mutationId: step.mutationId })`.
   - If receipt found: step is `COMMITTED`. Advance to next step.
   - If receipt missing: check aggregate version. If $V_{curr} === V_{exp}$, step is `NOT_APPLIED`; initiate compensation. If $V_{curr} > V_{exp}$, mark `QUARANTINED`.
4. If compensation is initiated:
   - Roll back completed steps in reverse order using `OutboxStorageService`.
   - If `persistWithStandaloneFencing` or `persistWithTransaction` throws conflict, abort immediately and mark workflow `QUARANTINED`.
   - If all completed steps rolled back successfully, mark workflow `COMPENSATED`.

### Stage 5: Implementation Breakdown
- **Task 3.1**: Refactor `DWCPRecoverySweeper.ts` to route compensation writes through `OutboxStorageService.persistWithStandaloneFencing` / `persistWithTransaction`.
- **Task 3.2**: Implement formal recovery terminal states (`COMMITTED`, `COMPENSATED`, `QUARANTINED`, `FAILED_TERMINAL`).
- **Task 3.3**: Author `DWCPRecoveryService.ts` providing the background polling interface for Loop 5.
- **Files Affected**:
  - `packages/execution-kernel/src/autonomous/DWCPRecoverySweeper.ts`
  - `packages/execution-kernel/src/autonomous/DWCPRecoveryService.ts`
  - `apps/web/server/db/models/WorkflowExecutionIntentModel.ts`

### Stage 6: Unit Verification
- Test two-tier receipt lookup: receipt found in L1 ring buffer returns `COMMITTED`.
- Test L1 eviction fallback: receipt found in L2 `MutationReceiptModel` returns `COMMITTED`.
- Test definitive unapplied detection: receipt missing + version equality returns `NOT_APPLIED`.
- Test ghost version trap: receipt missing + version advanced returns `QUARANTINED`.

### Stage 7: Integration Verification
- Test end-to-end reconciliation of stalled workflow in real MongoDB: assert workflow transitions from `EXECUTING` to `COMMITTED` when receipts exist.

### Stage 8: Concurrency and Fault Injection
- **TOCTOU Chaos**: Recovery Worker A reads aggregate; Worker B commits legitimate mutation advancing `mutationEpoch` and `version`; Worker A calls `OutboxStorageService.persistWithStandaloneFencing` for compensation; assert `ConcurrencyConflictError` or `FencedOutError` thrown and workflow marks `QUARANTINED`.
- Worker lease expiration during sweep: second worker reclaims lease; original worker is rejected.

### Stage 9: Regression Verification
- Verify Step 1 mutation fencing and Step 2 consumer idempotency suites pass.

### Stage 10: Semantic Architecture Verification
- Verify zero semantic classification; sweeper relies exclusively on cryptographic hashes and integer versions.
- Verify AST scanner reports 0 violations.

### Stage 11: Evidence Collection
- Record sweeper logs: `[DWCP::RECOVERY] Workflow ${id} reconciled to ${finalStatus}`.

### Stage 12: Acceptance Review
- Verify AC-06 (stalled workflow discovery & terminal states), AC-07 (two-tier receipt verification & quarantine), and AC-08 (anti-overwrite compensation via canonical outbox).

---

# LOOP 4: SECONDARY CONSISTENCY TEMPORAL SCHEDULE SWEEPER & STAGED REVISION FENCING

### Stage 1: Repository Discovery
- **Existing Source Files**:
  - `packages/execution-kernel/src/automation/automationEngine.ts` (contains `reconcileStaleScheduleReports`).
  - `apps/web/server/db/models/TemporalOccurrence.ts` (occurrence model).
  - `apps/web/server/db/models/ScheduleConflictReportModel.ts` (conflict report projection).
- **Gaps**: Missing cross-document publication revision atomicity; multi-partition date shifts must advance both Date A and Date B revisions.
- **Current State**: Level 3 (Tested in isolation; lacks multi-partition revision fencing and staged publication lock).

### Stage 2: Dependency Mapping
- **Upstream Dependencies**: `scripts/autonomous-worker-daemon.ts` (Loop 5).
- **Downstream Dependencies**: `ScheduleConflictReportModel`, `TemporalConflictConsumer`.
- **Model Addition**: `TemporalPartitionRevisionModel` (`{ userId, dateStr, partitionRevision, publishedReportRevision, stagedSweepRevision, sweepWorkerId, sweepLeaseExpiresAt }`).

### Stage 3: Contract Definition
```typescript
export interface TemporalPartitionRevision {
  userId: string;
  dateStr: string; // YYYY-MM-DD
  partitionRevision: number;
  publishedReportRevision: number;
  stagedSweepRevision?: number;
  sweepWorkerId?: string;
  sweepLeaseExpiresAt?: Date;
  lastModifiedAt: Date;
}

export interface SweepPartitionResult {
  userId: string;
  targetDate: string;
  status: "CLEAN" | "CONFLICTS_DETECTED" | "ABORTED_MID_SWEEP";
  conflictCount: number;
  sourcePartitionRevision: number;
}
```
- **Invariants**:
  - Invariant 4.1: `TemporalPartitionRevisionModel.partitionRevision` is monotonically incremented on every occurrence mutation path (create, update, reschedule, archive, delete, restore).
  - Invariant 4.2: Rescheduling across dates atomically increments revisions for both origin and destination date partitions (`dateStr: { $in: [sourceDate, targetDate] }`).
  - Invariant 4.3: Partition manifest is canonically computed over sorted occurrence tuples `(occurrenceId, version, startAt, endAt, status, titleHash)`.
  - Invariant 4.4: Stale Report Prevention Protocol:
    - *Mode A (Replica Set / Transaction)*: Inside `session.withTransaction`, re-verify `TemporalPartitionRevisionModel.partitionRevision === R_calculated`. If unchanged, update `ScheduleConflictReportModel` and set `TemporalPartitionRevisionModel.publishedReportRevision = R_calculated`. If an occurrence mutated, transaction encounters write conflict / assertion failure and aborts cleanly.
    - *Mode B (Standalone Staged Revision Locking)*:
      1. Acquire staged sweep lock on `TemporalPartitionRevisionModel`: `findOneAndUpdate({ userId, dateStr, partitionRevision: R }, { $set: { stagedSweepRevision: R, sweepWorkerId: workerId, sweepLeaseExpiresAt: now + 5000ms } })`. If `matchedCount === 0`, concurrent occurrence mutation occurred mid-sweep; abort cleanly.
      2. Update `ScheduleConflictReportModel` with `sourcePartitionRevision: R`.
      3. Commit staged state on `TemporalPartitionRevisionModel`: set `publishedReportRevision: R` and clear worker lock. Concurrent mutation advances `partitionRevision: R+1`, immediately flagging partition for re-sweep.
  - Invariant 4.5: Detected conflicts strictly enter `status: "PENDING_CONFIRMATION"`; sweeper never shifts occurrence times (human sovereignty).

### Stage 4: Architecture Design
1. Sweep triggered for user partition `(userId, dateStr)`.
2. Read current `partitionRevision` from `TemporalPartitionRevisionModel` ($R_{\text{expected}}$).
3. Read all active `TemporalOccurrence` documents for `(userId, dateStr)` sorted by `_id ASC`.
4. Compute deterministic SHA-256 manifest hash $H_{\text{source}}$.
5. Compare with existing `ScheduleConflictReportModel.sourceManifestHash`.
   - If matching and report exists: partition is clean; skip.
   - If mismatch or missing: evaluate interval overlaps.
6. Commit conflict report using publication fencing:
   - Mode A: Re-verify `partitionRevision === R_expected` in transaction and update both report and `publishedReportRevision`.
   - Mode B: Acquire staged lock on `TemporalPartitionRevisionModel` with CAS $\to$ update `ScheduleConflictReportModel` $\to$ commit `publishedReportRevision: R_expected`. If source mutated mid-sweep, abort cleanly.

### Stage 5: Implementation Breakdown
- **Task 4.1**: Create `apps/web/server/db/models/TemporalPartitionRevisionModel.ts` with publication fencing fields (`publishedReportRevision`, `stagedSweepRevision`, `sweepWorkerId`, `sweepLeaseExpiresAt`).
- **Task 4.2**: Increment `partitionRevision` in temporal mutation adapters, ensuring multi-partition increments on date changes (`dateStr: { $in: [sourceDate, targetDate] }`).
- **Task 4.3**: Author `packages/execution-kernel/src/temporal/sweeper/TemporalScheduleSweeper.ts` with manifest calculation, Mode A transaction fencing, and Mode B staged publication locking.
- **Files Affected**:
  - `apps/web/server/db/models/TemporalPartitionRevisionModel.ts`
  - `packages/execution-kernel/src/temporal/sweeper/TemporalScheduleSweeper.ts`
  - `apps/web/server/db/models/ScheduleConflictReportModel.ts`

### Stage 6: Unit Verification
- Test manifest hash determinism: identical occurrences produce identical SHA-256 hash.
- Test interval overlap detection algorithm with overlapping, adjacent, and discrete occurrences.

### Stage 7: Integration Verification
- Test full partition sweep in MongoDB: occurrences with overlapping times generate `ScheduleConflictReportModel` with `status: "PENDING_CONFIRMATION"`.

### Stage 8: Concurrency and Fault Injection
- **Multi-Partition Reschedule Chaos**: Reschedule occurrence from Date A to Date B; assert both Date A and Date B partition revisions advance monotonically.
- **Mid-Sweep Mutation Chaos**:
  1. Sweeper reads revision $R=5$ and begins overlap calculation.
  2. Concurrent worker updates occurrence advancing revision to $R=6$.
  3. In Mode A: Sweeper transaction detects `partitionRevision !== 5` and aborts cleanly.
  4. In Mode B: Sweeper staged lock CAS on `partitionRevision: 5` matches 0 docs and aborts cleanly without updating `ScheduleConflictReportModel`.
  5. Assert stale conflict report is NEVER published over a newer partition revision.

### Stage 9: Regression Verification
- Verify Step 1 temporal integration and Step 2 temporal conflict consumer suites pass.

### Stage 10: Semantic Architecture Verification
- Verify zero semantic rescheduling or heuristic prioritization.
- Verify AST scanner reports 0 violations.

### Stage 11: Evidence Collection
- Record sweeper logs: `[TEMPORAL::SWEEPER] Partition ${userId}/${dateStr} swept: ${status}`.

### Stage 12: Acceptance Review
- Verify AC-09 (multi-partition revision-fenced temporal schedule sweeper with Mode A/Mode B publication fencing).

---

# LOOP 5: AUTONOMOUS EXECUTION DAEMON & LEASED PROACTIVE LOOP

### Stage 1: Repository Discovery
- **Existing Source Files**:
  - `packages/execution-kernel/src/autonomous/AutonomousExecutionDaemon.ts` (contains `step()` execution tick).
  - `packages/execution-kernel/src/autonomous/AutonomousLeaseManager.ts` (contains lease acquisition and heartbeat renewal).
  - `packages/execution-kernel/src/proactive/ProactivePolicyDaemon.ts` (contains quiet hours and cognitive load policies).
  - `packages/execution-kernel/src/automation/dailyLoop.ts` and `missedDayRecovery.ts`.
- **Gaps**: Unsafe silent UTC fallback for unknown user timezone; lacks dedicated runner script.
- **Current State**: Level 3 (Kernel classes exist; no persistent background runner).

### Stage 2: Dependency Mapping
- **Upstream Dependencies**: Host process manager (systemd / PM2 / Docker).
- **Downstream Dependencies**: `ProactivePolicyDaemon`, `DWCPRecoveryService`, `TemporalScheduleSweeper`, `dailyLoop`.
- **Separation Boundary**: Standalone process `scripts/autonomous-worker-daemon.ts` running independently from `scripts/outbox-worker-daemon.ts`.

### Stage 3: Contract Definition
```typescript
export interface AutonomousDaemonConfig {
  workerId: string;
  pollIntervalMs: number; // default: 15000ms
  leaseDurationMs: number; // default: 30000ms
  maxUsersPerTick: number; // default: 5
  shutdownTimeoutMs: number; // default: 5000ms
}

export interface UserLifecycleContext {
  userId: string;
  userTimezone: string | null;
  timezoneValid: boolean;
  userLocalDate: string; // YYYY-MM-DD
  userLocalHour: number;
}
```
- **Invariants**:
  - Invariant 5.1: Daemon process operates in an independent OS process from outbox worker.
  - Invariant 5.2: Per-user partition lease `${userId}:autonomous:daemon` enforces monotonic fencing epoch.
  - Invariant 5.3: Operation classification:
    - *Category A (Timezone-Agnostic)*: DWCP sweeps, outbox retries, dead-letter recovery. Executed under UTC.
    - *Category B (Timezone-Sensitive)*: Daily rollover, quiet hours, morning briefings.
    - If user timezone in `user.settings.timezone` is missing or invalid, Category B actions MUST be **DEFERRED / SUPPRESSED** with an operational audit warning. The system never silently executes user-local actions using UTC.
  - Invariant 5.4: Daily lifecycle events enforce user-local date idempotency (`${userId}:rollover:${localDateStr}`).
  - Invariant 5.5: Graceful `SIGINT`/`SIGTERM` shutdown drains in-flight evaluations and releases leases within 5000ms.

### Stage 4: Architecture Design
1. Daemon process starts via `scripts/autonomous-worker-daemon.ts`.
2. Connect to MongoDB and initialize `AutonomousLeaseManager`.
3. Register signal traps for `SIGINT` and `SIGTERM`.
4. Enter polling loop:
   - Discover active users (fair round-robin scheduling, max 5 per tick).
   - For each user:
     - Attempt to acquire partition lease `${userId}:autonomous:daemon`.
     - If acquired: validate `user.settings.timezone`.
     - Run Category A tasks (DWCP sweeps, schedule sweeps).
     - If timezone valid: evaluate Category B tasks (quiet hours, morning briefing, rollover).
     - If timezone invalid/missing: log `TIMEZONE_RESOLUTION_REQUIRED` audit warning; defer Category B tasks.
     - Renew lease heartbeat with fencing token check.
     - Release lease cleanly on tick completion.
5. On `SIGTERM`: set stopping flag, await active user ticks, release all held leases, exit 0.

### Stage 5: Implementation Breakdown
- **Task 5.1**: Author `scripts/autonomous-worker-daemon.ts` with complete lifecycle and graceful shutdown.
- **Task 5.2**: Implement timezone validation, Category A/B classification, and deferral protocol in `AutonomousExecutionDaemon.ts`.
- **Task 5.3**: Wire `ProactivePolicyDaemon` and secondary sweepers into daemon tick execution.
- **Files Affected**:
  - `scripts/autonomous-worker-daemon.ts` (new file)
  - `packages/execution-kernel/src/autonomous/AutonomousExecutionDaemon.ts`
  - `packages/execution-kernel/src/proactive/ProactivePolicyDaemon.ts`

### Stage 6: Unit Verification
- Test Category B action deferral when `user.settings.timezone` is null or invalid.
- Test user-local timezone calculation across UTC, EST, PST, IST, and DST boundary transitions.

### Stage 7: Integration Verification
- Test daemon tick execution against MongoDB: acquires lease, executes Category A tasks, defers Category B tasks on missing timezone, renews heartbeat.

### Stage 8: Concurrency and Fault Injection
- Competing daemons: Worker A and Worker B attempt to claim same user; Worker A wins; Worker B skips.
- Lease preemption: Worker A stalls; lease expires; Worker B claims lease with epoch $E+1$; Worker A wakes up and attempts renewal; renewal rejected.
- Graceful shutdown: send `SIGTERM` while tick is running; assert active user finishes and lease is deleted.

### Stage 9: Regression Verification
- Verify `outbox-worker-daemon.ts` runs unaffected in parallel without lease contention.

### Stage 10: Semantic Architecture Verification
- Verify Rule 7 compliance: zero raw `new Date().getHours()` calls without user timezone conversion.
- Verify AST scanner reports 0 violations.

### Stage 11: Evidence Collection
- Record daemon lifecycle logs: `[AUTONOMOUS::DAEMON] Worker ${workerId} ticked user ${userId} in ${elapsedMs}ms`.

### Stage 12: Acceptance Review
- Verify AC-10 (leased autonomous daemon runner with Category A/B timezone safety).

---

# LOOP 6: EXECUTION GRAPH PROJECTION READ SERVICE & REVISION SANDWICH REBUILDER

### Stage 1: Repository Discovery
- **Existing Source Files**:
  - `apps/web/server/db/models/ExecutionGraphDerivedModel.ts` (derived DAG projection updated by Step 2 consumer).
  - `packages/execution-kernel/src/events/consumers/ExecutionGraphConsumer.ts` (Step 2 consumer).
  - `packages/execution-kernel/src/kernel/ExecutionGraph.ts` (DAG builder).
- **Gaps**: Application read paths bypass derived model; mutation boundary must advance `UserGraphRevisionModel` atomically.
- **Current State**: Level 3 (Model maintained on write; read path orphaned).

### Stage 2: Dependency Mapping
- **Upstream Dependencies**: `OutboxStorageService`, Task/Goal mutation adapters.
- **Downstream Dependencies**: Web Dashboard, Task List API (`/api/tasks`, `/api/dashboard`).
- **Model Addition**: `UserGraphRevisionModel` (`{ userId, graphRevision, lastUpdatedAt }`).

### Stage 3: Contract Definition
```typescript
export interface UserGraphRevision {
  userId: string;
  graphRevision: number;
  lastUpdatedAt: Date;
}

export interface GraphProjectionReadResult {
  graph: IExecutionGraphDerived;
  source: "CACHE_HIT" | "COLD_REBUILD";
  latencyMs: number;
}
```
- **Invariants**:
  - Invariant 6.1: `UserGraphRevisionModel.graphRevision` is monotonically incremented inside `OutboxStorageService` for all task and goal mutations (create, update, complete, reopen, delete, archive, restore, dependency change).
  - Invariant 6.2: Cache hit path queries `ExecutionGraphDerivedModel` and `UserGraphRevisionModel`; exactly ZERO queries to `tasks`.
  - Invariant 6.3: Valid cache hit latency is bounded to $< 5\text{ms}$.
  - Invariant 6.4: Snapshot-Consistent DAG Rebuild (Revision Sandwich Protocol):
    1. Read initial graph revision: $R_{\text{start}} = \text{UserGraphRevisionModel.findOne({ userId }).graphRevision}$.
    2. Read active `Task` and `Goal` documents.
    3. Read final graph revision: $R_{\text{end}} = \text{UserGraphRevisionModel.findOne({ userId }).graphRevision}$.
    4. If $R_{\text{start}} !== R_{\text{end}}$, a source mutation occurred during the read window; abort rebuild and retry.
    5. If $R_{\text{start}} === R_{\text{end}} = R$, build DAG, detect cycles, find unblocked tasks, and publish via CAS: `appliedGraphRevision: { $lt: R }`.
    - Stale concurrent rebuilds match 0 docs and are discarded cleanly.
    - Failed rebuilds preserve the last valid projection.

### Stage 4: Architecture Design
1. Caller calls `ExecutionGraphProjectionService.getGraph(userId)`.
2. Query `ExecutionGraphDerivedModel.findOne({ userId })` and `UserGraphRevisionModel.findOne({ userId })`.
3. If document found and `derived.appliedGraphRevision === revision.graphRevision`:
   - Return cached graph immediately. (ZERO queries to `tasks` collection; latency $< 5\text{ms}$).
4. If document missing or `appliedGraphRevision < revision.graphRevision`:
   - Execute Revision Sandwich Rebuild:
     1. Read $R_{\text{start}} = \text{UserGraphRevisionModel.findOne({ userId }).graphRevision}$.
     2. Fetch active `Task` and `Goal` documents for `userId`.
     3. Read $R_{\text{end}} = \text{UserGraphRevisionModel.findOne({ userId }).graphRevision}$.
     4. If $R_{\text{start}} !== R_{\text{end}}$, abort and re-evaluate.
     5. Build DAG using `ExecutionGraph.buildFromTasks()`.
     6. Calculate unblocked tasks and topological sort.
     7. Commit to `ExecutionGraphDerivedModel` via CAS on `appliedGraphRevision: { $lt: R }`.
     8. Return newly built graph. On failure, preserve last valid projection.

### Stage 5: Implementation Breakdown
- **Task 6.1**: Create `apps/web/server/db/models/UserGraphRevisionModel.ts`.
- **Task 6.2**: Atomically increment `graphRevision` in `OutboxStorageService` on task/goal mutations.
- **Task 6.3**: Implement `packages/execution-kernel/src/events/projections/ExecutionGraphProjectionService.ts` with revision sandwich verification.
- **Files Affected**:
  - `apps/web/server/db/models/UserGraphRevisionModel.ts`
  - `packages/execution-kernel/src/events/projections/ExecutionGraphProjectionService.ts`
  - `apps/web/server/db/models/ExecutionGraphDerivedModel.ts`

### Stage 6: Unit Verification
- Test DAG serialization and deserialization from derived model.
- Test cycle detection and unblocked task calculation in rebuilder.

### Stage 7: Integration Verification
- Test cache hit path: assert result returned in $< 5\text{ms}$ with zero `Task` collection queries.
- Test cache miss path: assert missing document triggers complete DAG rebuild.

### Stage 8: Concurrency and Fault Injection
- **Revision Sandwich Abort & Retry**: Worker begins rebuild reading $R_{\text{start}}=3$; concurrent task mutation commits and increments $R \to 4$; worker reads $R_{\text{end}}=4$; worker aborts rebuild because $R_{\text{start}} !== R_{\text{end}}$ and re-reads fresh state.
- **Concurrent Rebuild Race**: Two workers rebuild simultaneously from revision 4; Worker A commits CAS first (`appliedGraphRevision: 4`); Worker B attempts CAS with `appliedGraphRevision: { $lt: 4 }`; Worker B matches 0 docs, discards calculation, and reads Worker A's projection.

### Stage 9: Regression Verification
- Verify Step 2 `ExecutionGraphConsumer` tests pass.

### Stage 10: Semantic Architecture Verification
- Verify dependency edges derive strictly from explicit `task.dependencies` arrays, never from title keywords.
- Verify AST scanner reports 0 violations.

### Stage 11: Evidence Collection
- Record query latencies: `[GRAPH::PROJECTION] Read userId=${userId} source=${source} latency=${latencyMs}ms`.

### Stage 12: Acceptance Review
- Verify AC-11 (zero Task queries on cache hit, $< 5\text{ms}$ latency target, revision-sandwich snapshot-consistent rebuild).

---

# LOOP 7: END-TO-END CONCURRENCY CHAOS, FAULT INJECTION & RULE 9 AST AUDIT

### Stage 1: Repository Discovery
- **Existing Source Files**:
  - `scripts/verify-semantic-architecture.ts` (AST scanner for Rules 1–9).
  - `packages/execution-kernel/src/testing/fixtures/structuralRegexAllowed.fixture.ts`.
  - `packages/execution-kernel/src/testing/fixtures/semanticRegexProhibited.fixture.ts`.
  - Monorepo source inventory: 1,358 total executable files, auditing all 1,169 files across included 12 source directories (947 core files verified in baseline AST check).
- **Gaps**: Complete 15-scenario concurrency chaos battery and independent semantic behavioral generalization testing.
- **Current State**: Level 3 (Scanner audits 947 core files; chaos suite not yet assembled for Step 4).

### Stage 2: Dependency Mapping
- **Upstream Dependencies**: All components implemented in Loops 1 through 6.
- **Testing Scope**: Repository-wide source code, real MongoDB test instance, single-concurrency runner.

### Stage 3: Contract Definition
- **15 Chaos Scenarios**:
  1. Process crash between action adapter execution and audit write (reconstructed from receipts).
  2. Server restart during multi-step autonomous saga execution.
  3. Worker lease expiration during long-running DWCP sweep.
  4. Competing autonomous daemons attempting simultaneous lease takeover.
  5. Replay of expired HITL response tokens over high-latency networks.
  6. Tampered intervention response payloads with forged signatures.
  7. Concurrent primary aggregate updates during secondary schedule sweep (Mode A transaction abort & Mode B staged lock rejection).
  8. Un-evicted L1 receipts with database index corruption simulation.
  9. Evicted L1 receipts with corrupted L2 collection simulation.
  10. Ghost version advancement triggering anti-corruption quarantine.
  11. Stale worker attempting CAS write after lease epoch increment.
  12. Parallel graph rebuild races on shared user account (resolved via revision sandwich and CAS).
  13. Delayed worker vs sweeper epoch burn race in Mode B HITL response dispatch.
  14. Rapid-fire duplicate action envelopes with identical `{userId, idempotencyKey}`.
  15. Quiet hours evaluation under missing user timezone (Category B deferral).

### Stage 4: Architecture Design
Loop 7 builds a dedicated test harness:
1. `step4ConcurrencyChaos.test.ts`: Implements the 15 chaos scenarios using synchronization barriers (`Promise.all`, rendezvous latches) and real MongoDB transactions/CAS.
2. `step4AstCompliance.test.ts`: Runs `scripts/verify-semantic-architecture.ts` against positive fixtures, negative fixtures, and the full repository source inventory.
3. `step4SemanticGeneralization.test.ts`: Runs held-out behavioral tests with unseen categories and user-defined entities.

### Stage 5: Implementation Breakdown
- **Task 7.1**: Author `packages/execution-kernel/src/testing/step4/step4ConcurrencyChaos.test.ts`.
- **Task 7.2**: Author `packages/execution-kernel/src/testing/step4/step4AstCompliance.test.ts`.
- **Task 7.3**: Author `packages/execution-kernel/src/testing/step4/step4SemanticGeneralization.test.ts`.
- **Files Affected**:
  - `packages/execution-kernel/src/testing/step4/step4ConcurrencyChaos.test.ts`
  - `packages/execution-kernel/src/testing/step4/step4AstCompliance.test.ts`
  - `packages/execution-kernel/src/testing/step4/step4SemanticGeneralization.test.ts`

### Stage 6: Unit Verification
- Test positive fixture: assert structural regexes pass scanner.
- Test negative fixture: assert prohibited semantic patterns fail scanner with exact rule violation codes.

### Stage 7: Integration Verification
- Execute AST audit across all included repository source roots: assert 0 violations reported.

### Stage 8: Concurrency and Fault Injection
- Run all 15 chaos scenarios in `step4ConcurrencyChaos.test.ts`: assert 100% pass rate with zero invariant violations.

### Stage 9: Regression Verification
- Run full regression suite across all existing milestone tests (Steps 1–3 + B1–B4) with `--test-concurrency=1`.

### Stage 10: Semantic Architecture Verification
- Execute `step4SemanticGeneralization.test.ts`: verify agents generalize to held-out categories without keyword shortcuts.

### Stage 11: Evidence Collection
- Record full command outputs, test counts, execution durations, and AST scan totals.

### Stage 12: Acceptance Review
- Verify AC-12 (Rule 9 AST compliance across all source roots) and milestone completion criteria.
