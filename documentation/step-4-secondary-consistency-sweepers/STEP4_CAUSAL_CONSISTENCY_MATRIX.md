# LIFEOS — STEP 4 CAUSAL AND CONSISTENCY MATRIX
## State Transitions, Causal Ordering, Failure Modes & Recovery Guarantees

**Milestone:** Step 4 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Semantic Architecture  
**Authority:** The Executioners (ExE)  
**Status:** SPECIFICATION ONLY  
**Date:** November 2, 2026  

---

## 1. STATE TRANSITION MATRICES ACROSS STEP 4 SUBSYSTEMS

### 1.1 Action Audit Record Transitions (`ActionAuditRecordModel`)

```
                         ┌──────────────┐
                         │ (No Record)  │
                         └──────┬───────┘
                                │ (Worker Claims Atomic Execution Lease)
                                ▼
                         ┌──────────────┐
                         │  EXECUTING   │
                         └──────┬───────┘
          ┌──────────────┼──────────────┼──────────────┐
          │ Adapter OK   │ Adapter Error│ Lease Expired│ Ghost Version
          ▼              ▼              ▼              ▼
   ┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐
   │  SUCCEEDED   ││    FAILED    ││Reconciliation││ QUARANTINED  │
   └──────────────┘└──────────────┘└──────────────┘└──────────────┘
```

| Current State | Target State | Triggering Operation | Invariants Enforced | Failure Action |
| :--- | :--- | :--- | :--- | :--- |
| *None* | `EXECUTING` | `executeAction()` initiated | Atomic insert with unique `{ userId, idempotencyKey }`, SHA-256 FP, and lease | If `E11000`: check existing FP; return cached or retry |
| `EXECUTING` | `SUCCEEDED` | Domain adapter succeeded | Write-through update capturing execution result | Retry CAS update up to 3 times |
| `EXECUTING` | `FAILED` | Adapter returned failure or threw | Captures error string and failure code | Aborts execution; returns error envelope |
| `EXECUTING` | `SUCCEEDED` (Recovery) | Retried request with expired lease | `MutationReceiptModel` found for `clientMutationId = action.id` | Reconstructs result from aggregate/outbox, marks `SUCCEEDED`, returns cached |
| `EXECUTING` | `EXECUTING` (Reclaim) | Retried request with expired lease | Receipt missing AND aggregate version equals pre-mutation version | Reclaims lease (`$inc: { fencingEpoch: 1 }`), re-executes |
| `EXECUTING` | `QUARANTINED` | Retried request with expired lease | Receipt missing BUT aggregate version advanced ($V_{curr} > V_{pre}$) | Traps record in `QUARANTINED`; prevents blind replay |

---

### 1.2 HITL Intervention State Transitions (`AutonomousInterventionModel`)

```
                  ┌──────────────┐
                  │   PENDING    │
                  └──────┬───────┘
         ┌───────────────┼───────────────┐
         │ (Accepted)    │ (Rejected)    │ (Dismissed / Expired)
         ▼               ▼               ▼
  ┌──────────────┐┌──────────────┐┌──────────────┐
  │   ACCEPTED   ││   REJECTED   ││  DISMISSED   │
  └──────────────┘└──────────────┘└──────────────┘
```

| Current State | Target State | Triggering Operation | Guard Conditions | Consequence |
| :--- | :--- | :--- | :--- | :--- |
| *None* | `PENDING` | Proactive engine generates proposal | Valid HMAC-SHA256 signature generated | Available for user response |
| `PENDING` | `ACCEPTED` | User clicks Accept on UI | Valid signature + `now <= expiresAt` + auth match | Mode A: `session.withTransaction`; Mode B: DIMIP promotion with atomic epoch burn fencing |
| `PENDING` | `REJECTED` | User clicks Reject on UI | Valid signature + `now <= expiresAt` + auth match | Mode A: `session.withTransaction`; Mode B: DIMIP promotion with atomic epoch burn fencing |
| `PENDING` | `DISMISSED` | User dismisses or timeout expires | CAS condition: `status: "PENDING"` | Prevents future action dispatch |
| `ACCEPTED` | *Any* | Replay / duplicate attempt | **Terminal State**. CAS matches 0 docs | Throws `InvalidInterventionStateError` (HTTP 409) |
| `REJECTED` | *Any* | Replay / duplicate attempt | **Terminal State**. CAS matches 0 docs | Throws `InvalidInterventionStateError` (HTTP 409) |

---

### 1.3 DWCP Workflow Execution Transitions (`WorkflowExecutionIntentModel`)

```
                  ┌──────────────┐
                  │    STAGED    │
                  └──────┬───────┘
                         │ (Execution Starts)
                         ▼
                  ┌──────────────┐
                  │  EXECUTING   │
                  └──────┬───────┘
          ┌──────────────┼──────────────┬──────────────┐
          │ All Steps OK │ Rollback OK  │ TOCTOU / Gap │ Fatal Error
          ▼              ▼              ▼              ▼
   ┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐
   │  COMMITTED   ││ COMPENSATED  ││ QUARANTINED  ││FAILED_TERMINA│
   └──────────────┘└──────────────┘└──────────────┘└──────────────┘
```

| Current State | Target State | Verification Method | Condition | Safety Guarantee |
| :--- | :--- | :--- | :--- | :--- |
| `EXECUTING` | `COMMITTED` | L1 Ring Buffer or L2 Store | Receipt found for all steps | Entire saga authoritatively applied |
| `EXECUTING` | `COMPENSATED` | Canonical `OutboxStorageService` | Step unapplied + outbox compensation succeeds ($V \to V+1$) | Safe rollback with outbox event and receipt |
| `EXECUTING` | `QUARANTINED` | Evicted receipt detection | Aggregate $V_{curr} > V_{exp}$ without receipts | Halts compensation to prevent split-brain |
| `EXECUTING` | `QUARANTINED` | Outbox compensation error | `ConcurrencyConflictError` or `FencedOutError` thrown | Refuses to clobber newer mutations |
| `EXECUTING` | `FAILED_TERMINAL` | Terminal failure check | Irrecoverable domain schema invariant violation | Halts workflow; logs fatal error |

---

## 2. DISTRIBUTED FAILURE MODES & RECOVERY MATRIX

| Failure Mode | Subsystem Affected | Detection Mechanism | Immediate Fencing Action | Recovery Path |
| :--- | :--- | :--- | :--- | :--- |
| **Worker Crash During Action** | Kernel Idempotency | `ActionAuditRecordModel` remains in `EXECUTING` past lease TTL | Retried request checks `MutationReceiptModel` (`clientMutationId = action.id`) | If receipt found: reconstruct result, mark `SUCCEEDED`, return result; if unapplied: safe to retry; if ghost version: `QUARANTINED` |
| **Tampered Request Payload on Key Reuse** | Kernel Idempotency | Request FP mismatch against existing audit record | Reject immediately with HTTP 400 (`IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH`) | Zero mutation performed; security audit logged |
| **Tampered HITL Response** | Governance Ingress | Fixed-length mismatch or `crypto.timingSafeEqual` false | Route throws `TamperedInterventionError` (HTTP 400) | Zero state change; security audit logged |
| **Delayed Worker vs Sweeper Race in Mode B** | Governance Ingress | Worker delayed past outbox lease TTL; sweeper reclaims intent | Sweeper burns intervention epoch (`$inc: { mutationEpoch: 1 }`) before aborting outbox event | Delayed worker CAS matches 0 docs and fails cleanly; if worker committed first, sweeper promotes outbox event; zero lost outbox events |
| **TOCTOU Race on Compensation** | DWCP Sweeper | Aggregate version or `mutationEpoch` advanced by user | `OutboxStorageService` throws `ConcurrencyConflictError` / `FencedOutError` | Compensation aborts immediately; workflow marked `QUARANTINED` |
| **Receipt Eviction with Ghost Version** | DWCP Sweeper | Aggregate version $> V_{exp}$ but receipt missing in L1 and L2 | Sweeper traps step into `QUARANTINED` | Human review required; zero destructive rollback write |
| **Multi-Partition Reschedule Race** | Temporal Sweeper | Reschedule advances Date A and Date B partition revisions | Mode A: transaction re-verifies revision; Mode B: staged revision locking CAS matches 0 docs | Sweeper discards stale calculation cleanly; re-sweeps both partitions |
| **Missing or Invalid User Timezone** | Autonomous Daemon | `user.settings.timezone` null, empty, or invalid IANA string | Category B tasks suppressed/deferred; logs `TIMEZONE_RESOLUTION_REQUIRED` | Category A tasks (sweepers) continue under UTC; no silent UTC fallback for wall-clock actions |
| **Autonomous Daemon Preemption** | Worker Leasing | Monotonic fencing epoch mismatch on heartbeat renewal | Lease renewal returns `null`; tick execution aborted | Stale worker halts immediately; winning worker continues |
| **Execution Graph Cache Corruption** | Graph Read Path | `appliedGraphRevision` mismatch or corrupted JSON | Catch block in `ExecutionGraphProjectionService` | Triggers authoritative DAG rebuild using Revision Sandwich verification |
| **Concurrent Mutation During DAG Rebuild** | Graph Rebuilder | $R_{\text{start}} !== R_{\text{end}}$ in revision sandwich check | Rebuild detects source mutated during read window | Aborts rebuild calculation cleanly and retries with fresh state |
| **Concurrent DAG Rebuild Race** | Graph Rebuilder | CAS matches 0 docs on `appliedGraphRevision: { $lt: R }` | Loser discards its rebuild calculation | Re-reads winning worker's fresh projection |
| **10+ Concurrent Identical Requests** | Kernel Idempotency | In-flight promise map deduplication + compound DB index | First request executes; 9 await shared promise | Exactly 1 execution count; all receive identical envelopes |
| **Database Outage During Sweeper Tick** | All Daemons | MongoDB connection disconnect event / timeout | Daemon catches error, logs warning, backs off 5000ms | Resumes cleanly on database reconnection |
| **Replay of Expired HITL Token** | Governance Ingress | `now > intervention.expiresAt` | Route throws `ExpiredInterventionError` (HTTP 409) | Zero state transition; user prompted to request fresh proposal |
| **Non-Aggregate Adapter Crash** | Kernel Idempotency | Action adapter with external side-effects stalls in `EXECUTING` | Reconciler detects non-aggregate action type | Traps in `QUARANTINED` to prevent duplicate external side-effects |
