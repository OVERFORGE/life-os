# LIFEOS — STEP 4 ACCEPTANCE CRITERIA
## Measurable Acceptance Gates, Evidence Standards & Pass/Fail Thresholds

**Milestone:** Step 4 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Semantic Architecture  
**Authority:** The Executioners (ExE)  
**Status:** SPECIFICATION ONLY  
**Date:** November 2, 2026  

---

## 1. ACCEPTANCE GATES OVERVIEW

Step 4 implementation will be evaluated against **12 definitive Acceptance Criteria (AC-01 through AC-12)**. Each criterion is classified as either a **Hard Correctness Requirement (HCR)** or a **Resilience Objective (RO)**. 

To achieve milestone certification, 100% of HCRs and ROs must pass with automated, reproducible test evidence.

---

## 2. DETAILED ACCEPTANCE CRITERIA MATRIX (AC-01 TO AC-12)

### AC-01: Durable Kernel Idempotency, Request Fingerprinting & Result Reconstruction
- **Classification**: Hard Correctness Requirement (HCR)
- **Responsible Loop**: Loop 1 (Durable Kernel Idempotency & Audit Store)
- **Target Specification**:
  1. Authoritative Identity: Standardizes database index on compound `{ userId: 1, idempotencyKey: 1 }`.
  2. Fingerprint Mismatch Rejection: Every incoming request computes $FP = \text{SHA256}(\text{userId} + ":" + \text{actionType} + ":" + \text{canonicalJSON}(\text{payload}))$. If an existing record with matching `{userId, idempotencyKey}` has a different $FP$, it is rejected with HTTP 400 (`IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH`).
  3. Process Restart Survival: Replayed envelopes with identical `{userId, idempotencyKey}` return cached execution receipts from MongoDB without re-invoking action adapters.
  4. Abandoned `EXECUTING` Crash Reconciliation & Result Reconstruction: If a request is retried while status is `EXECUTING` and `leaseExpiresAt <= now`:
     - *Aggregate Mutations*: If `MutationReceiptModel` exists for `clientMutationId = action.id`, query aggregate or outbox draft, reconstruct the original result envelope, update `ActionAuditRecordModel.result`, transition to `SUCCEEDED`, and return the cached result. If receipt missing and aggregate version unchanged, reclaim lease and re-execute. If receipt missing and aggregate version advanced ($V_{curr} > V_{pre}$), mark `QUARANTINED`.
     - *Multi-Document Sagas*: Reconcile against primary step receipt.
     - *External Side-Effects*: Mark `QUARANTINED` to prevent duplicate non-idempotent external calls.
     - *Read-Only Operations*: Re-execute safely.
- **Required Database Guarantees**: Compound unique index `{ userId: 1, idempotencyKey: 1 }`, atomic CAS updates with `{ upsert: false }`.
- **Failure Scenarios**: Process crash mid-execution, duplicate key with altered payload, abandoned execution recovery, ghost version advancement, non-aggregate side-effects.
- **Automated Tests**:
  - `test_idempotency_survives_process_restart`
  - `test_idempotency_payload_mismatch_rejected`
  - `test_idempotency_crash_recovery_reconciliation`
  - `test_idempotency_result_reconstruction`
  - `test_idempotency_quarantines_ghost_version`
- **Test Execution Command**: `pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4Loop1IdempotencyStore.test.ts`
- **Expected Evidence**: Execution receipts returned from MongoDB without adapter re-execution; 100% detection of payload tampering; complete reconstructed result envelopes.
- **Pass Definition**: 0 duplicate adapter executions; 0 uncaught crash windows; 100% rejection of altered payloads.

---

### AC-02: Concurrent In-Flight Action Deduplication
- **Classification**: Hard Correctness Requirement (HCR)
- **Responsible Loop**: Loop 1 (Durable Kernel Idempotency & Audit Store)
- **Target Specification**: Multiple concurrent requests sharing the same `{userId, idempotencyKey}` are deduplicated in-flight via shared promise resolution. Under high concurrency ($N \ge 10$), the underlying domain action adapter executes exactly once.
- **Required Database Guarantees**: Database-enforced compound unique index prevents concurrent execution claims.
- **Failure Scenarios**: 10 simultaneous identical HTTP requests received across worker threads.
- **Automated Tests**: `test_idempotency_concurrent_in_flight_deduplication`
- **Test Execution Command**: `pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4Loop1IdempotencyStore.test.ts`
- **Expected Evidence**: Exactly 1 adapter invocation recorded; all $N$ callers receive identical result envelopes.
- **Pass Definition**: Adapter invocation count $\equiv 1$; zero `VERSION_CONFLICT` thrown to callers.

---

### AC-03: Measurable Cryptographic HITL Signature Verification
- **Classification**: Hard Correctness Requirement (HCR)
- **Responsible Loop**: Loop 2 (HITL Cryptographic Governance Ingress)
- **Target Specification**: Human-in-the-loop intervention responses must be verified using HMAC-SHA256 signatures with measurable cryptographic safety:
  1. Fixed-length digest comparison: Buffer length of incoming signature must match expected digest length (32 bytes / 64 hex characters). Length mismatches are rejected prior to comparison.
  2. `crypto.timingSafeEqual` comparison: Valid-length buffers are compared strictly using `crypto.timingSafeEqual` without early-exit branch evaluation.
  3. Contextual binding: Signature binds `[interventionId, userId, response, keyVersion, actionId, proposalPayloadHash, expiresAt]`.
  4. Tampering rejection: Any alteration of parameters or signature returns HTTP 400 (`TamperedInterventionError`).
- **Required Database Guarantees**: Atomic CAS on `AutonomousInterventionModel` preventing replay.
- **Failure Scenarios**: Tampered signature byte, altered response parameter, mismatched digest length, replay of answered intervention.
- **Automated Tests**:
  - `test_hitl_timing_safe_equal_tamper_rejection`
  - `test_hitl_length_mismatch_rejection`
  - `test_hitl_constant_time_comparison`
- **Test Execution Command**: `pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4Loop2HitlIngress.test.ts`
- **Expected Evidence**: 100% rejection of invalid signatures; length mismatches rejected before timingSafeEqual; zero exceptions thrown.
- **Pass Definition**: 100% rejection rate for altered payloads; constant-time execution for equal-length buffers.

---

### AC-04: Active Key Rotation for Governance Tokens
- **Classification**: Resilience Objective (RO)
- **Responsible Loop**: Loop 2 (HITL Cryptographic Governance Ingress)
- **Target Specification**: `HITLGovernanceEngine` supports versioned key rotation. Tokens signed with an older key version ($K_{v-1}$) remain verifiable and accepted as long as $K_{v-1}$ is retained in the engine's key history map. Interventions signed with retired keys are rejected with `RetiredKeyVersionError`.
- **Required Database Guarantees**: `keyVersion` tracked on `AutonomousInterventionModel`.
- **Failure Scenarios**: Token signed under key v1 verified after server switches to active key v2; token signed under retired key v0.
- **Automated Tests**:
  - `test_hitl_key_rotation_validation`
  - `test_hitl_retired_key_rejection`
- **Test Execution Command**: `pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4Loop2HitlIngress.test.ts`
- **Expected Evidence**: Key v1 signature passes when retained; retired key v0 fails with explicit error code.
- **Pass Definition**: 100% acceptance of valid historical keys; 0 acceptance of retired keys.

---

### AC-05: Dedicated HITL Governance HTTP Ingress & Mode A/Mode B Atomicity with Atomic Epoch Burn
- **Classification**: Hard Correctness Requirement (HCR)
- **Responsible Loop**: Loop 2 (HITL Cryptographic Governance Ingress)
- **Target Specification**:
  1. Production Next.js App Router endpoints `/api/surface/interventions/respond` and `/api/aven/interventions/respond` validate authenticated user sessions (NextAuth cookie or Bearer JWT).
  2. Identity Guard: Extracts `userId` strictly from session context; rejects or ignores any `userId` in the HTTP body.
  3. Dual-Mode Atomicity:
     - *Mode A (Replica Set)*: `session.withTransaction` commits intervention status update and `OutboxEventModel` creation atomically.
     - *Mode B (Standalone MongoDB)*: Dual-Intent Monotonic Idempotent Protocol (DIMIP): writes outbox event in `PENDING_COMMIT` with worker lease (`leasedByWorkerId`, `leaseExpiresAt: now + 15000ms`, `leaseGeneration: 1`) and `mutationIntent: { clientMutationId, fencingEpoch }`. Then executes CAS on `AutonomousInterventionModel` with `$inc: { mutationEpoch: 1 }` and promotes outbox event to `PENDING`.
  4. Delayed Worker Fencing (Atomic Epoch Burn): If a worker is delayed past outbox intent lease TTL, the recovery sweeper claims the intent lease. If intervention remains `PENDING`, sweeper executes an atomic epoch burn (`$inc: { mutationEpoch: 1 }`) on `AutonomousInterventionModel` and aborts the outbox event. The delayed worker's subsequent CAS fails cleanly. If the worker committed first, sweeper observes `ACCEPTED` and promotes the outbox event to `PENDING`.
- **Required Database Guarantees**: Mode A transaction atomicity; Mode B DIMIP staged intent promotion with atomic epoch burn fencing.
- **Failure Scenarios**: Unauthenticated caller (HTTP 401), body user spoofing, delayed worker resuming after sweeper checks intent.
- **Automated Tests**:
  - `test_hitl_valid_signature_accepted`
  - `test_hitl_rejects_body_user_spoofing`
  - `test_hitl_mode_a_atomic_transaction`
  - `test_hitl_mode_b_dimip_sweeper_promotion`
  - `test_hitl_delayed_worker_epoch_burn_fencing`
- **Test Execution Command**: `pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4Loop2HitlIngress.test.ts`
- **Expected Evidence**: HTTP 200 on valid inputs; HTTP 401 on unauthenticated; HTTP 400 on spoofed; Outbox event present whenever status is `ACCEPTED`; zero orphaned decisions or lost events under delayed worker races.
- **Pass Definition**: 0 orphaned intervention states without matching outbox events; 100% tenant isolation.

---

### AC-06: Stalled Workflow Discovery & Canonical Terminal States in DWCP Sweeper
- **Classification**: Hard Correctness Requirement (HCR)
- **Responsible Loop**: Loop 3 (DWCP Recovery Sweeper Daemon)
- **Target Specification**:
  1. Background DWCP sweeper queries `WorkflowExecutionIntentModel` for workflows stuck in `status: "EXECUTING"` where `updatedAt < now - 30000ms`.
  2. Canonical Terminal States: Every reconciled workflow MUST resolve to exactly one of four canonical terminal states:
     - `COMMITTED`: All step receipts confirmed; saga complete.
     - `COMPENSATED`: Unapplied step detected; completed steps successfully rolled back via canonical outbox persistence.
     - `QUARANTINED`: Ghost version advancement, receipt eviction, or anti-overwrite epoch conflict; halted for human safety.
     - `FAILED_TERMINAL`: Irrecoverable domain schema violation.
- **Required Database Guarantees**: Leased partition access (`${userId}:dwcp:sweeper`); atomic CAS on workflow status.
- **Failure Scenarios**: Worker crashes during multi-step saga; sweeper reclaims and reconciles workflow.
- **Automated Tests**: `test_dwcp_reconciles_stalled_workflow`
- **Test Execution Command**: `pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4Loop3DwcpSweeper.test.ts`
- **Expected Evidence**: Stalled workflows transition cleanly into one of the four terminal states; zero workflows remain stuck in `EXECUTING`.
- **Pass Definition**: 100% resolution of abandoned workflows into valid terminal states.

---

### AC-07: Two-Tier Receipt Verification & Anti-Corruption Quarantine
- **Classification**: Hard Correctness Requirement (HCR)
- **Responsible Loop**: Loop 3 (DWCP Recovery Sweeper Daemon)
- **Target Specification**: Step mutation status verification checks:
  1. Aggregate L1 ring buffer (`recentMutationReceipts`).
  2. L2 durable `MutationReceiptModel` store.
  3. Anti-Corruption Quarantine: If receipt is missing in both L1 and L2, and aggregate version exceeds expected version ($V_{curr} > V_{exp}$), the workflow MUST transition to `QUARANTINED`. Uncertainty must never become permission to compensate.
- **Required Database Guarantees**: L2 `MutationReceiptModel` lookup; aggregate version comparison.
- **Failure Scenarios**: Ring buffer evicted receipt; ghost version advancement without receipt.
- **Automated Tests**:
  - `test_dwcp_reconciles_step_via_l2_durable_store`
  - `test_dwcp_quarantines_on_evicted_unknown_version`
- **Test Execution Command**: `pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4Loop3DwcpSweeper.test.ts`
- **Expected Evidence**: Evicted receipts recovered from L2; ghost versions trapped in `QUARANTINED`.
- **Pass Definition**: 0 destructive rollbacks on untracked advanced aggregate versions.

---

### AC-08: Canonical Outbox Routing for DWCP Compensation
- **Classification**: Hard Correctness Requirement (HCR)
- **Responsible Loop**: Loop 3 (DWCP Recovery Sweeper Daemon)
- **Target Specification**:
  1. DWCP compensation writes MUST route through `OutboxStorageService`:
     - Mode A: `persistWithTransaction` with `clientMutationId: "comp_" + step.mutationId`, incrementing aggregate version ($V \to V+1$), persisting `MutationReceiptModel`, and emitting `domain.saga.step_compensated`.
     - Mode B: `persistWithStandaloneFencing` with monotonic `fencingEpoch` and `version: expectedVersion`.
  2. Anti-Overwrite Protection: If aggregate version or epoch has changed, `OutboxStorageService` throws `ConcurrencyConflictError` or `FencedOutError`, cleanly aborting compensation and trapping the workflow in `QUARANTINED`.
- **Required Database Guarantees**: Canonical `OutboxStorageService` execution; version and epoch conditional writes.
- **Failure Scenarios**: Concurrent user mutation advances `mutationEpoch` while recovery sweeper is evaluating rollback; direct un-audited `updateOne` bypass.
- **Automated Tests**:
  - `test_dwcp_compensation_routes_via_outbox`
  - `test_dwcp_anti_overwrite_halts_compensation`
- **Test Execution Command**: `pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4Loop3DwcpSweeper.test.ts`
- **Expected Evidence**: Compensation commits version $V+1$ with receipt and outbox event; concurrent user writes trigger `QUARANTINED`.
- **Pass Definition**: Exactly 0 direct database bypasses; 0 overwrites of newer aggregate state.

---

### AC-09: Multi-Partition Revision Fencing & Staged Publication in Schedule Sweeper
- **Classification**: Hard Correctness Requirement (HCR)
- **Responsible Loop**: Loop 4 (Secondary Consistency Temporal Schedule Sweeper)
- **Target Specification**:
  1. Dedicated `TemporalPartitionRevisionModel` (`{ userId, dateStr, partitionRevision, publishedReportRevision, stagedSweepRevision, sweepWorkerId, sweepLeaseExpiresAt }`) advances monotonically on EVERY occurrence mutation path.
  2. Multi-Partition Date Shifts: Rescheduling an occurrence from Date A to Date B atomically increments revisions for BOTH Date A and Date B partitions (`dateStr: { $in: [sourceDate, targetDate] }`).
  3. Pre-Commit Publication Fencing:
     - Mode A: Inside `session.withTransaction`, re-verify `TemporalPartitionRevisionModel.partitionRevision === R_calculated`. If unchanged, update `ScheduleConflictReportModel` and set `publishedReportRevision = R_calculated`.
     - Mode B: Acquire staged sweep lock on `TemporalPartitionRevisionModel` via CAS (`findOneAndUpdate({ userId, dateStr, partitionRevision: R }, { stagedSweepRevision: R, sweepWorkerId, sweepLeaseExpiresAt })`), update `ScheduleConflictReportModel` with `sourcePartitionRevision: R`, and commit `publishedReportRevision = R`. If source occurrences mutate during calculation, staged lock fails and sweep is discarded cleanly.
  4. Human Sovereignty: Detected conflicts remain strictly `PENDING_CONFIRMATION`; sweeper never alters occurrence times.
- **Required Database Guarantees**: Atomic multi-partition increments; conditional publication locking on `TemporalPartitionRevisionModel`.
- **Failure Scenarios**: Multi-partition date rescheduling, mid-sweep occurrence update, occurrence deletion.
- **Automated Tests**:
  - `test_temporal_sweeper_multi_partition_reschedule`
  - `test_temporal_sweeper_detects_deletions`
  - `test_temporal_sweeper_aborts_on_mid_sweep_mutation`
  - `test_temporal_sweeper_staged_publication_fencing`
  - `test_temporal_sweeper_resolves_to_pending_confirmation`
- **Test Execution Command**: `pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4Loop4ScheduleSweeper.test.ts`
- **Expected Evidence**: Both origin and destination partition revisions increment; mid-sweep changes abort publication write; conflicts enter `PENDING_CONFIRMATION`.
- **Pass Definition**: 0 stale conflict report overwrites; 0 autonomous occurrence interval mutations.

---

### AC-10: Leased Autonomous Daemon Runner & Safe Timezone Classification
- **Classification**: Hard Correctness Requirement (HCR)
- **Responsible Loop**: Loop 5 (Autonomous Execution Daemon & Leased Proactive Loop)
- **Target Specification**:
  1. `scripts/autonomous-worker-daemon.ts` starts as an independent Node.js process, completely separated from `scripts/outbox-worker-daemon.ts`.
  2. Acquires distributed partition leases (`${userId}:autonomous:daemon`) with monotonic fencing epochs; renews lease on heartbeat; halts if preempted.
  3. Two-Tier Timezone Classification:
     - *Category A (Timezone-Agnostic)*: DWCP recovery sweeps, schedule sweeps, dead-letter recovery execute safely under UTC epochs.
     - *Category B (Timezone-Sensitive)*: Daily rollover, quiet hours, morning briefings.
     - If `user.settings.timezone` is missing or invalid, Category B actions are **DEFERRED / SUPPRESSED** with a `TIMEZONE_RESOLUTION_REQUIRED` audit warning. Silent UTC fallback is strictly barred.
  4. DST Transitions: Local date idempotency (`${userId}:rollover:${localDateStr}`); spring-forward nonexistent hours map to next valid instant; fall-back repeated hours execute strictly once.
  5. Graceful Shutdown: `SIGINT`/`SIGTERM` traps drain active ticks and release held leases within 5000ms.
- **Required Database Guarantees**: Monotonic epoch leasing in `AutonomousExecutionLeaseModel`.
- **Failure Scenarios**: Daemon crash, lease preemption, missing user timezone, DST boundary shifts, `SIGTERM` signal.
- **Automated Tests**:
  - `test_autonomous_daemon_process_separation`
  - `test_autonomous_daemon_fences_stale_worker`
  - `test_autonomous_daemon_defers_category_b`
  - `test_autonomous_daemon_dst_transitions`
  - `test_autonomous_daemon_graceful_shutdown`
- **Test Execution Command**: `pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4Loop5AutonomousDaemon.test.ts`
- **Expected Evidence**: Independent process execution; stale worker renewal rejected; Category B deferred on invalid timezone; leases released on SIGTERM.
- **Pass Definition**: Clean daemon lifecycle; 0 silent UTC fallbacks for wall-clock actions; 0 thread starvation.

---

### AC-11: Execution Graph Projection Read Service (< 5ms Latency, Zero Task Queries, Revision Sandwich Rebuild)
- **Classification**: Resilience Objective (RO)
- **Responsible Loop**: Loop 6 (Execution Graph Projection Read Service & Rebuilder)
- **Target Specification**:
  1. `ExecutionGraphProjectionService.getGraph(userId)` serves cached DAG projections from `ExecutionGraphDerivedModel`.
  2. Zero-Task-Query Cache Hit: Cache freshness is verified by comparing `ExecutionGraphDerivedModel.appliedGraphRevision` against `UserGraphRevisionModel.graphRevision`. On a valid cache hit, exactly ZERO queries are made to the `tasks` collection.
  3. Latency Target: Valid cache hits return in $< 5\text{ms}$.
  4. Revision Sandwich Rebuild Protocol:
     - Rebuild reads $R_{\text{start}} = \text{UserGraphRevisionModel.findOne({ userId }).graphRevision}$.
     - Rebuild reads active `Task` and `Goal` documents.
     - Rebuild reads $R_{\text{end}} = \text{UserGraphRevisionModel.findOne({ userId }).graphRevision}$.
     - If $R_{\text{start}} !== R_{\text{end}}$, a source mutation occurred during the read window; abort rebuild and retry.
     - If $R_{\text{start}} === R_{\text{end}} = R$, build DAG, detect cycles, find unblocked tasks, and publish via CAS: `appliedGraphRevision: { $lt: R }`.
     - Stale concurrent rebuilds match 0 docs and are discarded cleanly.
- **Required Database Guarantees**: Synchronized `UserGraphRevisionModel` inside `OutboxStorageService`; CAS on `appliedGraphRevision`.
- **Failure Scenarios**: Cache hit path query count check, revision staleness detection, concurrent mutation during read window, concurrent DAG rebuild race.
- **Automated Tests**:
  - `test_graph_projection_zero_task_query_hit`
  - `test_graph_projection_latency_under_5ms`
  - `test_graph_projection_rebuilds_on_cache_miss`
  - `test_graph_projection_revision_sandwich_consistency`
  - `test_graph_projection_rebuild_toctou_revision_fencing`
- **Test Execution Command**: `pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4Loop6GraphProjection.test.ts`
- **Expected Evidence**: MongoDB query log proves 0 queries to `tasks` collection on cache hit; latency timer $< 5\text{ms}$; revision sandwich aborts rebuild on mid-read mutation; rebuild commits revision $R$.
- **Pass Definition**: Exactly 0 task queries on cache hit; latency $< 5\text{ms}$; 100% DAG snapshot consistency.

---

### AC-12: Monorepo Semantic Architecture AST Compliance & Generalization
- **Classification**: Hard Correctness Requirement (HCR)
- **Responsible Loop**: Loop 7 (End-to-End Concurrency Chaos, Fault Injection & Rule 9 AST Audit)
- **Target Specification**:
  1. Monorepo Source Inventory: AST scanner (`scripts/verify-semantic-architecture.ts`) audits all executable source files across the monorepo source roots (1,169 files across 12 directories: `packages/execution-kernel/src`, `apps/web/app`, `apps/web/features`, `apps/web/server`, `apps/web/components`, `apps/web/hooks`, `apps/web/lib`, `apps/mobile`, `apps/desktop`, `packages/desktop-runtime`, `packages/design-system`, and `scripts/`). Whole monorepo contains 1,358 executable files. Baseline AST scanner verified 947 core files with 0 violations.
  2. Positive and Negative Fixture Verification: Confirms scanner correctly permits structural regexes (`structuralRegexAllowed.fixture.ts`) and flags prohibited semantic classifications (`semanticRegexProhibited.fixture.ts`).
  3. Structural AST Compliance: Reports exactly 0 violations across Rules 1 through 9.
  4. Semantic Behavioral Generalization: Independent test battery verifies agent generalizes to held-out categories and unfamiliar user entities without keyword shortcuts.
- **Required Database Guarantees**: N/A (Static Code & Behavioral Analysis).
- **Failure Scenarios**: AST scan of codebase, positive/negative fixture execution, held-out entity resolution.
- **Automated Tests**:
  - `step4AstCompliance.test.ts`
  - `step4SemanticGeneralization.test.ts`
  - `scripts/verify-semantic-architecture.ts`
- **Test Execution Command**: `npx tsx scripts/verify-semantic-architecture.ts && pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4AstCompliance.test.ts`
- **Expected Evidence**: 0 violations reported across all audited source files; positive fixtures PASS; negative fixtures FAIL with expected codes; generalization tests PASS.
- **Pass Definition**: 100% compliance across all 9 rules; 0 false positives on structural regex; 100% generalization pass.
