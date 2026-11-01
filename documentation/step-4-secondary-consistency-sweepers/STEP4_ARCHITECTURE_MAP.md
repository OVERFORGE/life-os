# LIFEOS — STEP 4 ARCHITECTURE MAP
## Component Topology, Execution Paths, Security & Cross-Engine Boundaries

**Milestone:** Step 4 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Semantic Architecture  
**Authority:** The Executioners (ExE)  
**Status:** ARCHITECTURAL SPECIFICATION  
**Date:** November 2, 2026  

---

## 1. COMPONENT TOPOLOGY

```
+─────────────────────────────────────────────────────────────────────────────────────────────+
|                                    APPLICATION CLIENTS                                      |
|  • Web Browser (Next.js React Client)        • Mobile App (React Native)                    |
|  • Desktop Surface (Tauri IPC)               • Ambient Voice / Orb Surface                  |
+─────────────────────────────────────────────┬───────────────────────────────────────────────+
                                              │ HTTP POST /api/surface/interventions/respond
                                              ▼
+─────────────────────────────────────────────────────────────────────────────────────────────+
|                                APPLICATION DELIVERY INGRESS                                 |
|  • Next.js App Router: /api/surface/interventions/respond & /api/aven/...                   |
|  • Authentication Gate: Session Cookies (Web) / Bearer JWT (Mobile)                          |
|  • Identity Guard: Extracts userId exclusively from session; rejects body userId             |
+─────────────────────────────────────────────┬───────────────────────────────────────────────+
                                              │
                                              ▼
+─────────────────────────────────────────────────────────────────────────────────────────────+
|                           DETERMINISTIC KERNEL & GOVERNANCE ENGINES                          |
|                                                                                             |
|  +─────────────────────────+  +──────────────────────────+  +────────────────────────────+  |
|  | HITLGovernanceEngine    |  | KernelCapabilityService  |  | ExecutionGraphProjection   |  |
|  | • HMAC-SHA256 TimingSafe|  | • Compound {user, key}   |  |   Service                  |  |
|  | • Buffer Length Precheck|  | • SHA-256 FP Fingerprint |  | • Revision Sandwich Rebuild|  |
|  | • Mode A: session Tx    |  | • Result Reconstruction  |  | • Zero-Task-Query Hit      |  |
|  | • Mode B: DIMIP Epoch   |  | • Adapter Classification |  | • Latency < 5ms Target     |  |
|  |   Burn & Worker Leases  |  +──────────────────────────+  | • CAS appliedGraphRevision |  |
|  +─────────────────────────+                                +────────────────────────────+  |
|                                                                                             |
|  +─────────────────────────+  +──────────────────────────+  +────────────────────────────+  |
|  | DWCPRecoverySweeper     |  | TemporalScheduleSweeper  |  | AutonomousExecutionDaemon  |  |
|  | • Two-Tier Receipts     |  | • Multi-Partition Fencing|  | • Standalone Daemon Runner |  |
|  | • OutboxStorage Routing |  | • Mode A: Tx Verification|  | • Category A: UTC Epoch    |  |
|  | • Quarantine Safeguard  |  | • Mode B: Staged Lock CAS|  | • Category B: Defer Unknown|  |
|  | • Strictly Typed States |  | • Human Sovereignty Gate |  | • Leased User Round-Robin |  |
|  +─────────────────────────+  +──────────────────────────+  +────────────────────────────+  |
+─────────────────────────────────────────────┬───────────────────────────────────────────────+
                                              │
                                              ▼
+─────────────────────────────────────────────────────────────────────────────────────────────+
|                                PERSISTENCE & LEASING TOPOLOGY                               |
|  • ActionAuditRecordModel ({userId, key})    • AutonomousInterventionModel                  |
|  • WorkflowExecutionIntentModel              • ScheduleConflictReportModel                  |
|  • TemporalPartitionRevisionModel            • UserGraphRevisionModel (Sync with Outbox)    |
|    (publishedReportRevision, staged lock)    • ExecutionGraphDerivedModel                   |
|  • OutboxEventModel (DIMIP Worker Leases)    • MutationReceiptModel (L2 Store)              |
|  • AutonomousExecutionLeaseModel                                                            |
+─────────────────────────────────────────────────────────────────────────────────────────────+
                                              ▲
                                              │ Periodic Leased Execution Loops
+─────────────────────────────────────────────┴───────────────────────────────────────────────+
|                                BACKGROUND WORKER RUNNER TOPOLOGY                            |
|  • scripts/outbox-worker-daemon.ts     (High-Frequency Event Dispatching & Consumers)       |
|  • scripts/autonomous-worker-daemon.ts (Autonomous Execution, Category A/B Policies, Sweeps)|
+─────────────────────────────────────────────────────────────────────────────────────────────+
```

---

## 2. CROSS-ENGINE INTERACTION MATRIX

| Caller Component | Target Component | Protocol / Interface | Interaction Purpose | Concurrency Control / Failure Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Client UI** | `HITL Ingress Route` | HTTP POST (HMAC token) | Submit user approval / rejection of proposal | Returns HTTP 401 (Unauth), 400 (Tampered), or 409 (Expired) |
| **HITL Ingress Route** | `HITLGovernanceEngine` | TypeScript Method Call | Verify signature with length pre-check & atomic update | Mode A: `session.withTransaction`; Mode B: DIMIP intent promotion with atomic epoch burn and worker lease fencing |
| **Agent / Client** | `KernelCapabilityService` | `executeAction()` | Action envelope dispatch with idempotencyKey | Computes SHA-256 request FP; checks `{ userId, idempotencyKey }` |
| **KernelCapabilityService**| `ActionAuditRecordModel` | Mongoose CAS / Lease | Durable write-through persistence and lease ownership | Enforces cross-process leasing; crash reconciliation on retry |
| **Autonomous Daemon**| `AutonomousLeaseManager` | CAS Lease Acquisition | Exclusive per-user daemon execution lease | Backs off if held; rejects stale worker on heartbeat renewal |
| **Autonomous Daemon**| `ProactivePolicyDaemon` | `evaluateUserProactivity()`| Evaluates quiet hours, fatigue, cognitive cost | Category B task: defers action if `user.settings.timezone` missing |
| **Autonomous Daemon**| `automationEngine` | `runAutomation()` | Triggers daily loop, rollover, missed day sweep | Enforces user-local date idempotency (`${userId}:rollover:${date}`) |
| **DWCP Sweeper** | `WorkflowExecutionIntent`| MongoDB find / CAS | Queries stalled workflows past lease TTL | Reconciles each step via two-tier receipts (L1 $\to$ L2) |
| **DWCP Sweeper** | `OutboxStorageService` | Canonical Persistence | Executes saga compensation rollback | Routes through `OutboxStorageService` (version, epoch, receipt, outbox) |
| **Schedule Sweeper** | `TemporalPartitionRevision`| Monotonic Counter Read | Reads partition revision before computing manifest | Incremented on all mutations (both Date A & B on reschedule) |
| **Schedule Sweeper** | `ScheduleConflictReport`| Fenced CAS Commit | Writes detected overlaps as PENDING_CONFIRMATION| Mode A: transaction re-verification; Mode B: staged revision locking (`stagedSweepRevision`); aborts if mutated mid-sweep |
| **Application Reads**| `ExecutionGraphProjection`| `getGraph(userId)` | Serves cached DAG from `ExecutionGraphDerived` | Compares against `UserGraphRevisionModel`; $< 5\text{ms}$; 0 task queries; revision sandwich rebuild ($R_{\text{start}} === R_{\text{end}}$) |

---

## 3. DATA OWNERSHIP & BOUNDARIES

1. **Authoritative Primary Aggregates**:
   - `Goal`, `Task`, `WorkoutSession`, `TemporalOccurrence`.
   - Mutated exclusively through `OutboxStorageService.persistWithStandaloneFencing` with monotonic aggregate versions and mutation receipts.
2. **Durable Idempotency & Audit Ledger**:
   - `ActionAuditRecordModel`: Owned exclusively by `KernelCapabilityService`.
   - Indexed uniquely by compound `{ userId: 1, idempotencyKey: 1 }`. Stores execution state, request fingerprint, lease ownership (`workerId`, `leaseExpiresAt`, `fencingEpoch`), and result envelope.
3. **Governance & Human Authorization Records**:
   - `AutonomousInterventionModel`: Owned exclusively by `HITLGovernanceEngine`.
   - Stores cryptographic HMAC-SHA256 signature, token version, expiration timestamp, and user response. State update commits atomically with `OutboxEventModel` in Mode A or via DIMIP in Mode B.
   - Recovery Sweeper implements atomic epoch burn (`$inc: { mutationEpoch: 1 }`) and worker lease fencing, eliminating races with delayed HTTP workers.
4. **Source Revision & Derived Projection State**:
   - `TemporalPartitionRevisionModel`: Owned by `TemporalScheduleSweeper` and temporal mutation adapters. Monotonically tracks partition mutation generation across single and multi-partition operations. Tracks `publishedReportRevision` and `stagedSweepRevision` to prevent stale report overwrites.
   - `UserGraphRevisionModel`: Owned by `ExecutionGraphProjectionService` and synchronized atomically inside `OutboxStorageService` on all task/goal mutations.
   - `ExecutionGraphDerivedModel`: Projected from primary tasks and goals. Serves cached DAGs with zero `tasks` queries. Rebuilds use revision sandwich verification ($R_{\text{start}} === R_{\text{end}}$).
   - `ScheduleConflictReportModel`: Projected from `TemporalOccurrence`. Stores conflicts in `PENDING_CONFIRMATION`.
5. **Execution Leases**:
   - `PartitionLeaseModel`: Used by delivery streams and consumer partitions.
   - `AutonomousExecutionLeaseModel`: Used by `AutonomousExecutionDaemon` (`${userId}:autonomous:daemon`) and `DWCPRecoverySweeper` (`${userId}:dwcp:sweeper`).

---

## 4. SECURITY, DEPLOYMENT & PROCESS ISOLATION BOUNDARIES

1. **Strict Process Separation**:
   - `scripts/outbox-worker-daemon.ts`: High-frequency event dispatching ($1\text{s}$ poll interval).
   - `scripts/autonomous-worker-daemon.ts`: Standalone process for proactive policies, daily lifecycles, and secondary sweepers ($15\text{s}$–$30\text{s}$ interval).
   - Neither daemon runs within Next.js serverless route handlers.
2. **Cryptographic Ingress Protection**:
   - Caller identity extracted strictly from authenticated session context (`session.user.id` or JWT claims).
   - Digest comparison uses fixed-length buffer pre-check and `crypto.timingSafeEqual`.
3. **Safe Timezone Boundaries (Category A vs Category B)**:
   - Category A operations (DWCP sweeps, outbox dispatch) execute safely under absolute UTC epochs.
   - Category B operations (daily rollover, quiet hours, briefings) require a verified user-local timezone (`user.settings.timezone`).
   - If invalid or unconfigured, Category B operations are **suppressed or deferred**; host server clock and silent UTC fallbacks are strictly prohibited.
