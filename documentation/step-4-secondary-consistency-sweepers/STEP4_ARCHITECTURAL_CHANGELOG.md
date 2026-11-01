# LIFEOS — STEP 4 ARCHITECTURAL CHANGELOG
## Architectural Decisions, Lineage & Decision Records (ADRs)

**Milestone:** Step 4 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Semantic Architecture  
**Authority:** The Executioners (ExE)  
**Status:** SPECIFICATION ONLY  
**Date:** November 2, 2026  

---

## 1. MILESTONE LINEAGE & VERSION HISTORY

```
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| Milestone| Date          | Scope & Milestone Mission                                                 |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| Step 1  | Oct 31, 2026   | Mutation Integration: Universal outbox drafts, L1/L2 receipts, Mode A/B   |
|         |                | transaction boundaries across Tasks, Goals, Gym, and Temporal models.     |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| Step 2  | Nov 01, 2026   | Causal Consistency: Outbox Worker Daemon, 7 canonical consumers,          |
|         |                | partition leases, SHA-256 manifest hash, dead-letter recovery.            |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| Step 3  | Nov 01, 2026   | Application Delivery: 24-event Canonical Delivery Registry, Gate,         |
| (V2.2)  |                | Leased User Delivery Journaling, SSE Server, Web Locks coordination.      |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| Step 4  | Nov 02, 2026   | Secondary Consistency & Sweepers (V1.0.0): Initial planning specification |
| (V1.0)  |                | covering 7 loops, 12 ACs, and dormant component operationalization.       |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| Step 4  | Nov 02, 2026   | Secondary Consistency & Sweepers (V2.0.0): Correctness revision resolving |
| (V2.0)  |                | crash windows, TOCTOU races, revision fences, and zero-task cache hit.    |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| Step 4  | Nov 02, 2026   | Secondary Consistency & Sweepers (V2.1.0): Implementation-readiness       |
| (V2.1)  |                | correction: result reconstruction, DIMIP atomicity, outbox compensation.  |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| Step 4  | Nov 02, 2026   | Secondary Consistency & Sweepers (V2.2.0): Narrowly scoped final patch:   |
| (V2.2)  |                | Temporal staged publication fencing, HITL DIMIP atomic epoch burn fencing,|
|         |                | and Execution Graph revision sandwich DAG rebuild consistency.             |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
```

---

## 2. EVOLUTION SUMMARY: V1.0.0 $\to$ V2.0.0 $\to$ V2.1.0 $\to$ V2.2.0

| Subsystem / Area | V1.0.0 Specification | V2.0.0 Correctness Plan | V2.1.0 Implementation-Ready | V2.2.0 Final Correctness Patch |
| :--- | :--- | :--- | :--- | :--- |
| **Kernel Idempotency (Loop 1)** | Simple in-memory map + single-field index. | Write-through cache + request fingerprinting. | Canonical `{ userId: 1, idempotencyKey: 1 }` compound index, SHA-256 fingerprinting, lease ownership, and exact receipt-based result envelope reconstruction. | Preserved V2.1.0 baseline. Strict adapter classification (aggregate, saga, external side-effect, read-only). |
| **HITL Ingress (Loop 2)** | Route calling `hitlEngine`; claimed "zero timing discrepancy." | Session-bound user identity, timingSafeEqual. | Dual-Mode Atomicity: Mode A `session.withTransaction`; Mode B DIMIP staged intent promotion (`PENDING_COMMIT` $\to$ `PENDING`). | **Worker Lease & Atomic Epoch Burn**: Sweeper burns intervention epoch (`$inc: { mutationEpoch: 1 }`) before aborting intent, fencing delayed worker CAS. Zero lost outbox events. |
| **DWCP Sweeper (Loop 3)** | Read check on `mutationEpoch` + separate rollback write. | Direct write-boundary CAS: `aggregateModel.updateOne()`. | Canonical Outbox Routing: Compensation MUST route through `OutboxStorageService`, preserving version ($V \to V+1$), epoch, receipts, and outbox drafts. | Preserved V2.1.0 baseline. Strictly typed terminal states: `COMMITTED`, `COMPENSATED`, `QUARANTINED`, `FAILED_TERMINAL`. |
| **Schedule Sweeper (Loop 4)** | Discovery via `max(updatedAt)` and count. | Monotonic `TemporalPartitionRevisionModel`. | Multi-Partition Revision Fencing: Rescheduling across dates advances revisions for BOTH Date A and Date B partitions. | **Staged Publication Fencing**: Mode A transaction re-verification; Mode B staged revision locking (`stagedSweepRevision`, CAS conditional on `publishedReportRevision`). |
| **Autonomous Daemon (Loop 5)** | Monolithic background runner script. | Standalone process with generic UTC fallback. | Two-Tier Timezone Safety: Category A (UTC safe); Category B (user-local wall-clock) **suppressed/deferred** on missing timezone. | Preserved V2.1.0 baseline. Graceful shutdown and leased user round-robin. |
| **Graph Read Service (Loop 6)** | Checked freshness via `max(Task.updatedAt)`. | Freshness check via `UserGraphRevisionModel`. | Mutation Boundary Synchronization: `UserGraphRevisionModel` incremented atomically inside `OutboxStorageService`. $< 5\text{ms}$ zero-task query. | **Revision Sandwich Rebuild**: $R_{\text{start}} === R_{\text{end}}$ verification during task reads; aborts mid-read mutations; CAS on `appliedGraphRevision: { $lt: R }`. |
| **AST Compliance (Loop 7)** | Unspecified 947-file scan. | 7-root repository inventory + fixtures. | Monorepo Source Inventory: Formally catalogs 1,358 total files (1,169 audited source files across 12 directories; 947 core files verified in baseline). | Preserved V2.1.0 baseline. Positive/negative fixtures verified; independent generalization battery. |

---

## 3. ARCHITECTURAL DECISION RECORDS (ADR-26 TO ADR-40)

### ADR-26: Compound Identity `{ userId: 1, idempotencyKey: 1 }` and Result Envelope Reconstruction
- **Context**: In V2.0.0, `ActionAuditRecordModel` still had single-field uniqueness on `idempotencyKey`, and `MutationReceiptModel` did not store adapter return payloads, leaving retried crashed requests with incomplete result envelopes.
- **Decision**: Update `ActionAuditRecordModel` index to compound `{ userId: 1, idempotencyKey: 1 }`. In crash reconciliation, if `MutationReceiptModel` confirms mutation committed, reconstruct original result envelope from the updated aggregate or outbox draft, update `ActionAuditRecordModel.result`, and return cached result without adapter re-execution.
- **Consequence**: Full multi-tenant isolation and complete result envelope replay across server crashes.

### ADR-27: Cryptographic HITL Ingress with Mode A Transaction and Mode B DIMIP Intent Promotion
- **Context**: V2.0.0 specified atomic persistence in replica sets, but standalone MongoDB lacked a concrete crash-consistent outbox publication protocol.
- **Decision**: Author Next.js App Router routes `/api/surface/interventions/respond` and `/api/aven/...`. Extract `userId` strictly from session context. In Mode A, use `session.withTransaction`. In Mode B, implement Step 1's Dual-Intent Monotonic Idempotent Protocol (DIMIP): write outbox event in `PENDING_COMMIT`, execute intervention CAS, then promote outbox event to `PENDING`.
- **Consequence**: Guaranteed no orphaned human decisions across both replica-set and standalone environments.

### ADR-28: Mandatory Canonical Outbox Routing for DWCP Saga Compensation
- **Context**: V2.0.0 proposed direct `aggregateModel.updateOne()` for compensation, which bypassed Step 1 outbox event drafts, mutation receipt persistence, and downstream reactive invalidations.
- **Decision**: Mandate that all DWCP saga compensations MUST execute via canonical `OutboxStorageService`:
  - Mode A: `persistWithTransaction` with `clientMutationId: "comp_" + step.mutationId`, advancing aggregate version ($V \to V+1$), persisting `MutationReceiptModel`, and emitting `domain.saga.step_compensated`.
  - Mode B: `persistWithStandaloneFencing` with monotonic `fencingEpoch` and `version: expectedVersion`.
- **Consequence**: 100% preservation of Step 1 mutation integrity; zero un-audited database bypasses.

### ADR-29: Anti-Corruption Quarantine Trap for Ghost Version Advancement
- **Context**: If a primary aggregate version advanced beyond step expectation ($V_{curr} > V_{exp}$) but neither L1 nor L2 contains a receipt, naive rollback or commit risks database corruption.
- **Decision**: Classify such steps definitively as `QUARANTINED`, halting automated saga execution.
- **Consequence**: Protects database against silent split-brain state or third-party write overwrites.

### ADR-30: Multi-Partition Source Revision Fencing for Temporal Schedule Sweeper
- **Context**: V2.0.0 did not account for rescheduling occurrences across date boundaries, which affects two date partitions simultaneously.
- **Decision**: Introduce `TemporalPartitionRevisionModel` (`{ userId, dateStr, partitionRevision }`). Ensure date-shift mutations advance revisions for BOTH origin and destination partitions. Commit conflict reports using conditional CAS against `sourcePartitionRevision`. Conflicts enter `status: "PENDING_CONFIRMATION"`.
- **Consequence**: Complete elimination of stale conflict reports across multi-partition schedule changes.

### ADR-31: Leased Autonomous Worker Daemon with Category A/B Timezone Safety
- **Context**: V2.0.0 used a generic UTC fallback when user timezone was missing or invalid. For user-local wall-clock actions (e.g. morning briefings), UTC defaults cause middle-of-the-night user wakeups.
- **Decision**: Author `scripts/autonomous-worker-daemon.ts` as an independent process. Classify operations into Category A (UTC safe) and Category B (user-local wall-clock). If `user.settings.timezone` is missing or invalid, Category B tasks are **DEFERRED / SUPPRESSED** with a `TIMEZONE_RESOLUTION_REQUIRED` audit warning.
- **Consequence**: Complete user sleep and quiet hours protection; zero silent UTC fallbacks.

### ADR-32: Synchronized Graph Revision Fencing for Sub-5ms Zero-Task-Query Read Service
- **Context**: In V2.0.0, `UserGraphRevisionModel` risked lagging behind committed domain writes if updated asynchronously.
- **Decision**: Synchronize `UserGraphRevisionModel` directly inside `OutboxStorageService` as part of the authoritative mutation boundary for all task/goal mutations. Serve cached DAGs in $< 5\text{ms}$ with zero queries to `tasks`. Execute snapshot-consistent rebuilds with revision CAS.
- **Consequence**: Predictable sub-5ms graph reads with absolute causal freshness.

### ADR-33: Monorepo AST Governance and Independent Semantic Generalization Testing
- **Context**: V2.0.0 reported an unspecified 947-file count without cataloging the broader monorepo.
- **Decision**: Formally catalog 1,358 total repository executable files (auditing all 1,169 files in 12 source directories). Verify positive and negative fixtures in CI. Introduce `step4SemanticGeneralization.test.ts` to test agent generalization across held-out categories and unfamiliar user entities.
- **Consequence**: Comprehensive, reproducible AST compliance paired with behavioral AI generalization verification.

### ADR-34: Dual-Mode Ingress Persistence Atomicity in HITL Dispatch
- **Context**: Single-operation assumption in HITL response dispatch created potential event loss under standalone MongoDB.
- **Decision**: Standardize on Mode A transactions for replica sets and Mode B DIMIP intent promotion for standalone MongoDB.
- **Consequence**: Deterministic human decision delivery across all supported deployment topologies.

### ADR-35: Canonical Recovery Terminal States
- **Context**: Inconsistent terminal states across earlier documentation versions created observability confusion.
- **Decision**: Standardize on four canonical terminal states across all models, services, and tests:
  1. `COMMITTED`: All step receipts confirmed; saga complete.
  2. `COMPENSATED`: Completed steps safely rolled back via canonical outbox persistence.
  3. `QUARANTINED`: Trapped due to ghost versions, missing receipts, or epoch CAS conflict.
  4. `FAILED_TERMINAL`: Irrecoverable domain schema invariant violation.
- **Consequence**: Uniform cross-system state machine semantics and deterministic observability.

### ADR-36: Multi-Partition Revision Advancement on Occurrence Rescheduling
- **Context**: When an occurrence is rescheduled from Date A to Date B, only incrementing Date A's revision leaves Date B's conflict report obsolete.
- **Decision**: Mandate that all temporal mutations moving occurrences between dates must increment `partitionRevision` for BOTH Date A and Date B partitions within the mutation boundary (`dateStr: { $in: [sourceDate, targetDate] }`).
- **Consequence**: Guarantees that both affected dates are swept and evaluated for conflicts.

### ADR-37: Suppression of Category B User-Local Wall-Clock Actions on Missing Timezone
- **Context**: Operating under a fallback timezone (such as UTC) when the user's actual timezone is unknown can cause proactive agents to interrupt users during their sleep.
- **Decision**: For all Category B actions, an unconfigured or invalid timezone results in immediate deferral of the action and logging of a `TIMEZONE_RESOLUTION_REQUIRED` audit warning, prompting the user for configuration without executing unprompted actions.
- **Consequence**: Absolute human sovereignty and protection against intrusive autonomous actions.

### ADR-38 (New V2.2.0): Temporal Staged Publication Fencing Protocol
- **Context**: In V2.1.0, updating `ScheduleConflictReportModel` with conditional CAS on `sourcePartitionRevision: { $lt: R }` alone did NOT cross-fence `TemporalPartitionRevisionModel` across documents in standalone MongoDB, creating a risk where mid-sweep occurrence mutations could allow a stale sweeper calculation to overwrite a newer partition report.
- **Decision**: Mode A re-verifies `partitionRevision === R_calculated` inside `session.withTransaction` and sets `publishedReportRevision = R_calculated`. Mode B acquires a staged sweep lock on `TemporalPartitionRevisionModel` (`stagedSweepRevision: R`, worker lease) via CAS, updates `ScheduleConflictReportModel`, and commits `publishedReportRevision: R`. If an occurrence mutates mid-sweep, staged lock acquisition fails cleanly.
- **Consequence**: Guaranteed cross-document publication fencing; zero stale conflict reports published over newer revisions.

### ADR-39 (New V2.2.0): HITL DIMIP Atomic Epoch Burn Sweeper Recovery Fencing
- **Context**: In V2.1.0 Mode B, if an HTTP worker stalls after writing a `PENDING_COMMIT` outbox event, the recovery sweeper could observe the intervention still `PENDING`, abort the outbox intent, and then the delayed worker could resume and execute its CAS, resulting in an `ACCEPTED` intervention with a permanently `ABORTED` outbox event.
- **Decision**: Bind outbox intent with worker lease (`leasedByWorkerId`, `leaseExpiresAt: now + 15000ms`, `leaseGeneration: 1`) and `mutationIntent: { clientMutationId, fencingEpoch: intervention.mutationEpoch }`. If the sweeper claims an expired lease while the intervention is still `PENDING`, the sweeper executes an atomic epoch burn (`$inc: { mutationEpoch: 1 }`) on `AutonomousInterventionModel` before marking the outbox event `ABORTED`. When the delayed worker resumes, its CAS on `mutationEpoch` matches 0 docs and fails cleanly. If the worker already committed, the sweeper observes `ACCEPTED` and promotes the outbox event to `PENDING`.
- **Consequence**: Complete elimination of delayed worker commit races; zero lost outbox events.

### ADR-40 (New V2.2.0): Execution Graph Snapshot Consistency via Revision Sandwich
- **Context**: In V2.1.0, rebuilding the DAG by reading `Task` and `Goal` models while concurrent mutations occur could read Task A at revision 5 and Task B at revision 6, building an inconsistent DAG and publishing it stamped with revision 6.
- **Decision**: The cold rebuild protocol executes Revision Sandwich Verification:
  1. $R_{\text{start}} = \text{UserGraphRevisionModel.findOne({ userId }).graphRevision}$.
  2. Fetch active `Task` and `Goal` documents.
  3. $R_{\text{end}} = \text{UserGraphRevisionModel.findOne({ userId }).graphRevision}$.
  4. If $R_{\text{start}} !== R_{\text{end}}$, abort rebuild and retry with fresh state.
  5. If $R_{\text{start}} === R_{\text{end}} = R$, build DAG and publish via CAS: `appliedGraphRevision: { $lt: R }`.
- **Consequence**: Complete snapshot consistency for execution DAG projections; zero stale DAGs or mid-read tearing.
