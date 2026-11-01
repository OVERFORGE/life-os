# LifeOS / Aven — Milestone B4
# Master Implementation Plan V2.3.0
**Project:** LifeOS Adaptive Personal Operating System  
**AI Companion:** Aven  
**Architectural Phase:** Milestone B4 — Autonomous Proactive Orchestration & Closed-Loop Adaptive Execution (APO-CLAE)  
**Organization:** The Executioners (ExE)  
**Document Revision:** `B4_MASTER_IMPLEMENTATION_PLAN_V2.3.0`  
**Execution Boundary:** RESEARCH AND PLANNING ONLY — IMPLEMENTATION STRICTLY UNAUTHORIZED  

---

## 1. Executive Summary & Architectural Mandate

### 1.1 The Architectural Mandate: APO-CLAE
Milestones B1 through B3 established the three foundational pillars of LifeOS:
- **Milestone B1 (Truth):** Live, user-scoped canonical Personal World Model (`WorldModelBridge`).
- **Milestone B2 (Causality):** Distributed transactional Outbox, strict aggregate versioning, durable mutation receipts, and consumer ledger.
- **Milestone B3 (Behavioral Reality):** Authoritative behavioral observation journal, MECE energy and duration calculators, Bayesian cadence learning, and empirical schedule constraint enforcement.

Despite these capabilities, LifeOS remains fundamentally **turn-bound and passive**. Aven only exists when the user types or speaks into a client. If the user oversleeps, enters a high-fatigue cognitive state, deviates from an optimal circadian window, or falls behind on commitments, LifeOS remains completely silent. Furthermore, while task completion and gym logging pass through the B2 Outbox, core mutations (creating tasks, updating tasks, rescheduling calendar occurrences, creating goals) bypass the Outbox pipeline, leaving the causal graph fragmented.

**Milestone B4 establishes the fourth pillar: Autonomous Proactive Orchestration & Closed-Loop Adaptive Execution (APO-CLAE).**

B4 transforms Aven from a reactive conversational assistant into an **autonomous, continuously operating, closed-loop companion** governed by the central cycle:
$$\text{OBSERVE} \longrightarrow \text{UNDERSTAND} \longrightarrow \text{EVALUATE} \longrightarrow \text{DECIDE} \longrightarrow \text{ACT} \longrightarrow \text{VERIFY} \longrightarrow \text{LEARN}$$

Under the unyielding architectural law:
> **"THE KERNEL PROVIDES TRUTH. AGENTS PROVIDE INTELLIGENCE."**

---

## 2. Context, History & Foundational Invariants

### 2.1 The Milestone Lineage
```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Milestone B1  │      │   Milestone B2  │      │   Milestone B3  │      │   Milestone B4  │
│      TRUTH      │ ───► │    CAUSALITY    │ ───► │BEHAVIORAL REALITY│ ───► │  AUTONOMOUS ACT │
│ Canonical World │      │  Durable Outbox │      │  PBI-ACL Engine │      │    APO-CLAE     │
│      Model      │      │ Consumer Ledger │      │ Cadence Learning│      │ Closed-Loop Ops │
└─────────────────┘      └─────────────────┘      └─────────────────┘      └─────────────────┘
```

### 2.2 Foundational Invariants Preserved in B4
1. **The Kernel Provides Truth. Agents Provide Intelligence:** The background daemon and adaptive policy engine do not fabricate state. All evaluations are grounded in the canonical Personal World Model (`WorldModelBridge`) and the authoritative Behavioral Observation Journal (`BehavioralObservationModel`).
2. **Strict User Scoping & Multi-Tenant Isolation:** Every lease, event, policy evaluation, action log, and notification must be explicitly scoped by `userId`. Cross-user data contamination is strictly impossible.
3. **Crash Safety & Distributed Leases:** Background execution must never run concurrently on multiple instances for the same user. All cycles are guarded by atomic MongoDB find-and-modify lease locks with fenced tokens.
4. **Staged Mutation Isolation:** Autonomous workflows never mutate domain models during planning or invariant verification. Only staged, verified changes are committed through transactional boundaries.
5. **Durable L1/L2 Authoritative Recovery Evidence:** DWCP recovery never treats absence from a bounded aggregate ring buffer as proof of non-application. Durable mutation receipts (`MutationReceiptModel`) provide permanent L2 authoritative proof; missing evidence across both tiers produces an `INDETERMINATE` state.
6. **Separation of Cryptographic Integrity & User Authorization:** HMAC tokens verify server-side payload origin and tamper-proofing; user authorization requires independent authenticated sessions.
7. **Kernel-Enforced Autonomy (Default-Deny):** An LLM generates proposals, but the Kernel enforces capability safety contracts. An LLM cannot self-authorize an action by lowering its risk tier.
8. **Conservative Missing-Data Semantics:** If cognitive telemetry or cadence history is missing or `UNKNOWN`, the system prefers suppression or delayed evaluation over risky assumptions.
9. **Emergency-Only Hard Suppression Bypass:** `CRITICAL_EMERGENCY` is the only priority tier permitted to bypass DND and Quiet Hours; ordinary `HIGH` priority events never bypass suppression.
10. **Backward Compatibility:** All existing HTTP API routes, conversational chat endpoints, and database models must remain 100% operational with zero breaking schema mutations.

---

## 3. Concurrency-Safe Distributed Lease Architecture

### 3.1 Permanent Singleton Lease Record & Pre-Initialization Protocol
To guarantee race-free initialization without unsafe upserts:
1. `AutonomousExecutionLeaseModel` stores a **permanent singleton document per user** with `{ userId: 1 }` unique index.
2. **No TTL index is placed on the lease document itself**, preventing monotonic sequence resets.
3. **Safe Initialization Protocol (`ensureLeaseRecord`):**
   ```typescript
   export async function ensureLeaseRecord(userId: string): Promise<void> {
     try {
       await AutonomousExecutionLeaseModel.collection.insertOne({
         userId,
         durableEpoch: 0,
         activeEpoch: 0,
         activeWorkerId: null,
         status: 'IDLE',
         leaseExpiresAt: new Date(0),
         heartbeatAt: new Date(0),
         consecutiveNoopCycles: 0,
         nextScheduledEvaluationAt: new Date(0),
         createdAt: new Date(),
         updatedAt: new Date()
       });
     } catch (err: any) {
       // Duplicate key code 11000 means another worker already initialized the singleton.
       if (err.code !== 11000) {
         throw err;
       }
     }
   }
   ```

### 3.2 Authoritative Server-Time Acquisition Without Upsert
All lease expiry calculations rely on MongoDB server time (`$$NOW`), guaranteeing complete immunity to application-server clock skew:
```typescript
public async acquireLease(
  userId: string,
  workerId: string,
  leaseTtlMs: number = 90000
): Promise<IFencingToken | null> {
  await ensureLeaseRecord(userId);

  // Match only if status is idle/released/expired OR if server-evaluated leaseExpiresAt has elapsed
  const filter = {
    userId,
    $or: [
      { status: { $in: ['IDLE', 'RELEASED', 'EXPIRED'] } },
      { $expr: { $lt: ["$leaseExpiresAt", "$$NOW"] } }
    ]
  };

  const pipeline = [
    {
      $set: {
        durableEpoch: { $add: ["$durableEpoch", 1] },
        activeEpoch: { $add: ["$durableEpoch", 1] },
        activeWorkerId: workerId,
        status: "ACTIVE",
        acquiredAt: "$$NOW",
        heartbeatAt: "$$NOW",
        leaseExpiresAt: { $add: ["$$NOW", leaseTtlMs] },
        updatedAt: "$$NOW"
      }
    }
  ];

  // NOTE: upsert is strictly FALSE. Pre-initialization guarantees document existence.
  const doc = await AutonomousExecutionLeaseModel.findOneAndUpdate(
    filter,
    pipeline,
    { new: true, upsert: false }
  );

  if (!doc || doc.activeWorkerId !== workerId) {
    return null; // Normal contention result: another worker owns the lease
  }

  return new FencingToken(userId, workerId, doc.activeEpoch, doc.leaseExpiresAt);
}
```

### 3.3 Atomic Renewal (Heartbeat) & Conditional Release
- **Renewal:** Atomically validates that worker still holds active epoch and MongoDB server time has not exceeded `leaseExpiresAt`:
  ```typescript
  public async renewLease(token: IFencingToken, additionalMs: number = 90000): Promise<boolean> {
    const filter = {
      userId: token.userId,
      activeWorkerId: token.workerId,
      activeEpoch: token.epoch,
      status: 'ACTIVE',
      $expr: { $gt: ["$leaseExpiresAt", "$$NOW"] }
    };
    const pipeline = [
      {
        $set: {
          heartbeatAt: "$$NOW",
          leaseExpiresAt: { $add: ["$$NOW", additionalMs] },
          updatedAt: "$$NOW"
        }
      }
    ];
    const updated = await AutonomousExecutionLeaseModel.findOneAndUpdate(filter, pipeline, { new: true });
    if (!updated) {
      token.invalidate();
      return false;
    }
    return true;
  }
  ```
- **Conditional Release:** Releases only the exact lease held by the caller (`userId`, `workerId`, `epoch`).

---

## 4. Atomic Fencing Across Persistence Boundaries

### 4.1 Replica-Set Deployment Guarantees (Production Standard)
In MongoDB Replica-Set deployments, multi-document ACID transactions with Snapshot Isolation guarantee linearizable fencing:
1. `session = client.startSession(); session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });`
2. **Atomic Lease Fencing Guard:**
   Within `session`, Worker A executes an update on `AutonomousExecutionLeaseModel`:
   ```typescript
   const leaseCheck = await AutonomousExecutionLeaseModel.findOneAndUpdate(
     {
       userId: token.userId,
       activeWorkerId: token.workerId,
       activeEpoch: token.epoch,
       status: 'ACTIVE',
       $expr: { $gt: ["$leaseExpiresAt", "$$NOW"] }
     },
     { $set: { lastCommitAttemptAt: new Date() } },
     { session, new: true }
   );
   if (!leaseCheck) {
     await session.abortTransaction();
     throw new FencedOutError(`Transaction aborted: Worker ${token.workerId} epoch ${token.epoch} is fenced out.`);
   }
   ```
3. Apply domain mutations with `session` (including new aggregate creations).
4. Insert `OutboxEventModel` records with `session`.
5. `await session.commitTransaction();`

**Concurrency Proof (Replica-Set Mode):**
Because `AutonomousExecutionLeaseModel` is modified inside the transaction, MongoDB's WiredTiger engine locks the lease document. If Worker B acquired epoch 102 concurrently, Worker B modified the lease document. When Worker A executes `leaseCheck`, it matches 0 documents (because `activeEpoch` is 102, not 101), or encounters a `WriteConflict` with Worker B. Worker A's transaction aborts immediately. Zero aggregate mutations and zero outbox events are committed. This guarantee is **mathematically sound and linearizable**.

### 4.2 Standalone Deployment Guarantees & Inherent Boundaries (Mode B)
In Standalone deployments without multi-document transactions, MongoDB cannot atomically cross-validate separate collections in a single write.
LifeOS establishes the following strict guarantees and boundaries for Standalone mode:
1. **The Standalone Lease Verification Protocol:**
   Before mutating any aggregate, Worker A must execute an atomic find-and-modify on `AutonomousExecutionLeaseModel`:
   ```typescript
   const verified = await AutonomousExecutionLeaseModel.findOneAndUpdate(
     {
       userId: token.userId,
       activeWorkerId: token.workerId,
       activeEpoch: token.epoch,
       status: 'ACTIVE',
       $expr: { $gt: ["$leaseExpiresAt", "$$NOW"] }
     },
     {
       $set: {
         pendingCommitTarget: {
           aggregateId: params.aggregateId,
           stagedEpoch: token.epoch,
           timestamp: new Date()
         }
       }
     },
     { new: true }
   );
   if (!verified) {
     throw new FencedOutError(`Standalone commit rejected: Worker ${token.workerId} epoch ${token.epoch} lease is invalid or expired.`);
   }
   ```
2. **Aggregate-Level Monotonic Epoch Guard:**
   The aggregate mutation filter enforces:
   `filter = { _id: params.aggregateId, version: params.expectedVersion, mutationEpoch: { $lt: token.epoch } }` (or exact match).
   Updates set `mutationEpoch: token.epoch`.
3. **First-Time Aggregate Creation Fencing:**
   For new aggregate creation (e.g. creating a new task), the document is inserted with `mutationEpoch: token.epoch`. Immediately after insertion, Worker A re-verifies the lease.
4. **Post-Write Verification & Self-Compensation:**
   Immediately following the aggregate write, Worker A checks `AutonomousExecutionLeaseModel`. If `activeEpoch !== token.epoch`:
   Worker A detects that it was preempted during the write! It immediately applies the inverse compensation patch to revert the aggregate write, and suppresses outbox promotion.
5. **Outbox Quarantine:**
   The corresponding outbox event remains in `PENDING_COMMIT` until post-write lease verification passes. If preempted, the intent is deleted. No downstream consumer ever processes the event.
6. **Explicit Statement of Standalone Limitation:**
   In Standalone MongoDB, there is an unavoidable non-zero window between separate single-document operations where an OS freeze could allow a stale aggregate write before self-fencing compensation executes.
   **Production deployments MUST use MongoDB Replica-Set mode** (even a single-node replica set `rs0` provides multi-document transactions with zero overhead). Standalone mode is strictly a development/testing fallback.

---

## 5. Multi-Aggregate Workflow Consistency & Durable Mutation Receipt Retention (DWCP Issue Corrected)

### 5.1 The Bounded Ring Buffer Eviction Problem
In previous specifications, aggregate mutation receipts were solely stored in the aggregate root's `recentMutationReceipts` ring buffer ($slice: -50).
If a workflow mutation committed to Aggregate X, the worker stalled or crashed, and Aggregate X subsequently underwent 50 unrelated mutations, the receipt was evicted from the ring buffer.
Recovery could search `recentMutationReceipts`, find nothing, and **incorrectly conclude that the mutation was NEVER APPLIED**. This would lead to invalid retries, skipped compensations, or corrupted state.

### 5.2 Two-Tier Authoritative Receipt Architecture (L1 Cache + L2 Journal)
LifeOS establishes a two-tier authoritative receipt-retention mechanism reusing B2 infrastructure:
1. **L1 In-Document Fast Cache (`recentMutationReceipts`):**
   - Embedded directly on aggregate roots (`Task`, `Goal`, `TemporalOccurrence`).
   - Stored atomically with domain updates via `$push` ($slice: -50).
   - Provides fast, zero-query-overhead receipt checks for immediate sequential recovery.
2. **L2 Durable Authoritative Journal (`MutationReceiptModel`):**
   - Authoritative, permanent MongoDB collection (`apps/web/server/db/models/MutationReceiptModel.ts`).
   - Stored per step mutation with unique compound key:
     $$\text{receiptId} = \text{userId} + ":" + \text{aggregateId} + ":" + \text{stepMutationId}$$
   - **Never bounded by ring buffer eviction.**
   - Retained permanently while workflow is active; retained for 14 days after terminal completion.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      TWO-TIER AUTHORITATIVE RECEIPT ARCHITECTURE                       │
│                                                                                        │
│  Domain Mutation ──► Atomically writes:                                                │
│                      1. L1 In-Doc Ring Buffer (recentMutationReceipts, max 50)         │
│                      2. L2 Durable Collection (MutationReceiptModel, permanent)        │
│                                                                                        │
│  Recovery Check ───► Step 1: Check L1 Ring Buffer (Fast Hit)                           │
│                      Step 2: If Miss, Check L2 Durable Journal (Authoritative Hit)     │
│                      Step 3: If Miss in Both:                                          │
│                              - If aggregate.version <= expectedVersion ──► UNAPPLIED   │
│                              - If aggregate.version > expectedVersion  ──► INDETERMINATE│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Mutation Identity & Receipt Schema
Every individual step mutation in a workflow is assigned a globally unique, deterministic identity:
$$\text{stepMutationId} = \text{workflowExecutionId} + ":" + \text{aggregateType} + ":" + \text{aggregateId} + ":" + \text{stepIndex} + ":" + \text{expectedVersion}$$

#### `MutationReceiptModel` Document Schema
```typescript
export interface IMutationReceiptDoc extends Document {
  receiptId: string;                     // userId:aggregateId:stepMutationId
  userId: string;                        // Strict tenant scoping
  aggregateId: string;                   // Target aggregate root ID
  clientMutationId: string;              // stepMutationId
  workflowExecutionId: string;           // Parent workflow ID
  stepIndex: number;                     // 1-based ordinal step
  version: number;                       // Resulting aggregate version
  priorVersion: number;                  // Pre-mutation version
  fencingEpoch: number;                  // Worker lease epoch
  diffHash: string;                      // SHA-256 payload checksum
  status: 'COMMITTED' | 'COMPENSATED' | 'ABORTED_BY_RECOVERY';
  appliedAt: Date;
  compensatedAt?: Date;
  retentionExpiresAt: Date | null;       // Null while workflow active; 14-day TTL post-completion
  createdAt: Date;
  updatedAt: Date;
}
```

### 5.4 Exact Recovery Inspection Algorithm
When the `DWCPRecoverySweeper` evaluates whether step $i$ was applied:
1. **Tier 1 (L1 Cache Check):** Inspect Aggregate X's `recentMutationReceipts`:
   - If receipt has `status: 'COMPENSATED'` $\to$ **ALREADY COMPENSATED**.
   - If receipt has `status: 'APPLIED'` $\to$ **APPLIED SUCCESSFULLY**.
2. **Tier 2 (L2 Durable Journal Check):** If missing from L1 (due to ring buffer eviction), query `MutationReceiptModel`:
   ```typescript
   const receipt = await MutationReceiptModel.findOne({
     userId: intent.userId,
     aggregateId: staged.aggregateId,
     clientMutationId: staged.stepMutationId
   });
   ```
   - If `receipt.status === 'COMPENSATED'` $\to$ **ALREADY COMPENSATED**.
   - If `receipt.status === 'COMMITTED'` $\to$ **APPLIED SUCCESSFULLY** (eviction successfully bypassed!).
3. **Tier 3 (Authoritative Negative Proof vs Indeterminacy):** If missing from BOTH L1 and L2:
   - **Case A (Strict Positive Non-Commit Proof):**
     If `aggregate.version <= staged.expectedVersion`:
     The aggregate has not progressed to the version this mutation would have produced ($expectedVersion + 1$). It is mathematically impossible for the mutation to have committed. Result: **POSITIVELY UNAPPLIED**.
   - **Case B (Indeterminate Outcome):**
     If `aggregate.version > staged.expectedVersion` AND durable receipt storage is unavailable or receipt is missing:
     The system **CANNOT** prove non-application. Result: **INDETERMINATE_REQUIRING_INVESTIGATION**.
     The sweeper DOES NOT retry and DOES NOT blind-compensate. It transitions the intent to `FAILED_TERMINAL`, logs an incident in `IncidentService`, and creates an urgent HITL intervention card for human triage.

### 5.5 Dual-Receipt Precedence Rule (APPLIED vs COMPENSATED)
If both an `APPLIED` receipt and a later `COMPENSATED` receipt exist for the same `stepMutationId` (e.g. from a prior recovery run that crashed after compensation):
**Authoritative Rule:** The `COMPENSATED` state takes absolute precedence. The final authoritative status is **COMPENSATED**. No further compensation is attempted.

### 5.6 Safe Conditional Compensation & Anti-Overwrite Protection
When compensating an applied step:
1. **Conditional Version & Epoch Guard:**
   Compensation MUST NOT blindly overwrite the aggregate. If a user or another legitimate process modified the aggregate after the workflow stalled, blind compensation would destroy user data!
   ```typescript
   const filter = {
     _id: staged.aggregateId,
     version: receipt.version,              // Must still match the version produced by the workflow!
     mutationEpoch: intent.fencingEpoch      // Must match the workflow's fencing epoch!
   };

   const updateDoc = {
     $set: {
       ...staged.inverseUpdates,
       version: receipt.version + 1,
       mutationEpoch: recoveryEpoch
     },
     $push: {
       recentMutationReceipts: {
         $each: [{
           workflowExecutionId: intent.workflowExecutionId,
           stepMutationId: staged.stepMutationId,
           stepIndex: staged.stepIndex,
           aggregateType: staged.aggregateType,
           aggregateId: staged.aggregateId,
           priorVersion: receipt.version,
           resultingVersion: receipt.version + 1,
           fencingEpoch: recoveryEpoch,
           appliedAt: new Date(),
           diffHash: 'compensation',
           status: 'COMPENSATED'
         }],
         $slice: -50
       }
     }
   };

   const res = await aggregateModel.updateOne(filter, updateDoc);
   ```
2. **Atomic Durable Journal Update:**
   Upon successful aggregate compensation, update `MutationReceiptModel`:
   ```typescript
   await MutationReceiptModel.updateOne(
     { receiptId: `${intent.userId}:${staged.aggregateId}:${staged.stepMutationId}` },
     {
       $set: {
         status: 'COMPENSATED',
         compensatedAt: new Date()
       }
     }
   );
   ```
3. **Handling Superseded Mutations:**
   If `matchedCount === 0`, the aggregate version moved past `receipt.version` (e.g. user manually rescheduled the meeting). Recovery recognizes that the mutation was **SUPERSEDED BY A NEWER LEGITIMATE MUTATION**. It records an audit log and leaves the user's newer change untouched.

### 5.7 Durable Receipt Retention and Archival Rules
1. **Active Workflow Guarantee:**
   While a workflow is `PREPARED`, `APPLYING`, `RECOVERING`, or `COMPENSATING`, all its `MutationReceiptModel` documents have `retentionExpiresAt: null`. No TTL cleanup will delete them.
2. **Terminal Archival Policy:**
   When a workflow reaches a terminal state (`COMMITTED` or `ABORTED`):
   ```typescript
   const archivalTtl = new Date(Date.now() + 14 * 86400000); // 14-day retention
   await MutationReceiptModel.updateMany(
     { workflowExecutionId: intent.workflowExecutionId },
     { $set: { retentionExpiresAt: archivalTtl } }
   );
   ```
   MongoDB's background TTL index on `{ retentionExpiresAt: 1 }` automatically cleans up records 14 days after terminal resolution.
3. **Unresolved / Indeterminate Workflow Archival:**
   If a workflow transitions to `FAILED_TERMINAL`, receipts are retained for **30 days** (`30 * 86400000`) to guarantee an exhaustive window for human investigation and audit.

---

## 6. Interruption Cost, Priority Taxonomy & Emergency Suppression Rules

### 6.1 Unified Priority Taxonomy
LifeOS defines a strict 4-tier priority hierarchy:
1. `CRITICAL_EMERGENCY`: Life-safety events, severe biometric alarms, imminent irreversible external collisions.
2. `HIGH`: Urgent schedule conflicts within $< 60$ minutes, immediate deadline breaches.
3. `MEDIUM`: Daily schedule reorganizations, morning briefings, circadian energy alignments.
4. `LOW`: Backlog grooming, ambient recommendations, non-urgent habit reminders.

### 6.2 Bounded Mathematical Cost Formula
The interruption cost $C_{\text{interrupt}}$ is strictly bounded within $[0.0, 1.0]$:
$$C_{\text{interrupt}} = \min(1.0, C_{\text{base}} + C_{\text{quiet}} + C_{\text{focus}} + C_{\text{cognitive}} + C_{\text{fatigue}})$$

Where component weights are deterministically assigned:
- $C_{\text{base}} = 0.10$ (unsolicited context switch friction).
- $C_{\text{quiet}} = 0.40$ (active quiet hours: default 22:00–08:00 local time).
- $C_{\text{focus}} = 0.25$ (active focus block or scheduled calendar event).
- $C_{\text{cognitive}} = 0.15 \times (1.0 - \text{CognitiveRecoveryScore})$ from B1 telemetry.
- $C_{\text{fatigue}} = 0.02 \times \min(\text{DailyInterventionsSentToday}, 5)$.
*(Maximum possible theoretical sum: $0.10 + 0.40 + 0.25 + 0.15 + 0.10 = 1.00$)*.

### 6.3 Missing-Data & UNKNOWN State Semantics
**Constitutional Rule:** An `UNKNOWN` state must never result in a low interruption cost!
- **`CognitiveState === UNKNOWN`:** If biometric telemetry is missing or stale ($> 12$h), $C_{\text{cognitive}}$ defaults to its **maximum penalty of 0.15**.
- **`CadenceHistory < 7 days`:** Circadian confidence is marked `LOW`; autonomous schedule shifts are suppressed until confidence $\ge 0.65$.
- **`Presence === UNKNOWN`:** Delivery queues for ambient display; audible alerts suppressed.

### 6.4 Hard Suppression Gates & Strict Emergency Bypass Rules
```
[Candidate Proposal]
       │
       ▼
[Stage 1: Hard Suppression Gates]
       │
       ├─► Is Circuit Breaker Active? ──► SUPPRESS (CIRCUIT_BREAKER_ACTIVE)
       │
       ├─► Is Daily Budget Exhausted (>= 3)? ──► If priority != CRITICAL_EMERGENCY ──► SUPPRESS (DAILY_BUDGET)
       │
       ├─► Is Cooldown Active (< 45m)? ───────► If priority not in [HIGH, CRITICAL_EMERGENCY] ──► SUPPRESS (COOLDOWN)
       │
       ├─► Is User in DND Mode? ──────────────► If priority != CRITICAL_EMERGENCY ──► SUPPRESS (DND_ACTIVE)
       │
       ├─► Is Quiet Hours Active? ────────────► If priority != CRITICAL_EMERGENCY ──► SUPPRESS (QUIET_HOURS)
       │
       └─► Is Focus Block Active? ────────────► If priority not in [HIGH, CRITICAL_EMERGENCY] ──► SUPPRESS (FOCUS_BLOCK)
       │
       ▼ (Passed Hard Suppression)
[Stage 2: Missing-Data Evaluation] ──► Apply Conservative Default Penalties
       │
       ▼
[Stage 3: Calculate C_interrupt] ──► Bounded in [0.0, 1.0]
       │
       ▼
[Stage 4: Priority Threshold Comparison]
       │ - CRITICAL_EMERGENCY: Always passes (C_max = 1.00)
       │ - HIGH: Passes if Net Value >= -0.20 (C_max = 0.85)
       │ - MEDIUM: Passes if Net Value >= 0.15 (C_max = 0.50)
       │ - LOW: Passes if Net Value >= 0.35 (C_max = 0.30)
       ▼
[Stage 5: Action Dispatch / HITL Card Push]
```

**Strict Emergency Bypass Invariant:**
- `CRITICAL_EMERGENCY` is the **ONLY** priority level permitted to bypass DND and Quiet Hours.
- Ordinary `HIGH` priority events (urgent schedule conflicts, approaching deadlines) **MUST NEVER** bypass DND or Quiet Hours. They are queued durably and delivered upon wake boundary or DND deactivation.

---

## 7. Lossless Durable SSE Replay & Surface Presence Architecture

### 7.1 Separation of Transport from Storage
- MongoDB `surface_delivery_receipts` and `autonomous_interventions` are authoritative truth.
- Server-Sent Events (SSE) `/api/aven/stream/reactive` is an ephemeral delivery transport.

### 7.2 Monotonic Per-Surface Delivery Cursor
To prevent duplicate deliveries or lost events sharing the same millisecond timestamp:
- Each user-surface channel maintains a strictly increasing 64-bit integer cursor: `deliverySeq: number`.
- `SurfaceDeliveryReceiptModel` records every delivery item:
  ```typescript
  export interface ISurfaceDeliveryReceipt {
    userId: string;
    surfaceId: string;
    deliverySeq: number;                 // Strictly increasing per user-surface
    interventionId: string;
    eventType: string;
    payload: Record<string, unknown>;
    status: 'QUEUED' | 'TRANSMITTED' | 'ACKNOWLEDGED' | 'SEEN' | 'EXPIRED';
    queuedAt: Date;
    transmittedAt?: Date;
    acknowledgedAt?: Date;
    expiresAt: Date;
  }
  // Compound Index:
  // { userId: 1, surfaceId: 1, deliverySeq: 1 }, unique: true
  // { userId: 1, status: 1, expiresAt: 1 }
  ```

### 7.3 Lossless Replay on Reconnect
1. Client connects to `/api/aven/stream/reactive?surfaceId=...&lastAckSeq=1042`.
2. Server queries MongoDB:
   ```typescript
   const missed = await SurfaceDeliveryReceiptModel.find({
     userId: session.userId,
     surfaceId: req.surfaceId,
     deliverySeq: { $gt: req.lastAckSeq },
     expiresAt: { $gt: new Date() }
   }).sort({ deliverySeq: 1 });
   ```
3. All unacknowledged items are replayed in exact `deliverySeq` order.
4. **Independent Delivery Lifecycle:** Even if the underlying intervention's business status changed from `PENDING` to `EXPIRED` or `CANCELLED`, the delivery receipt remains recoverable until acknowledged.
5. Client sends `POST /api/aven/stream/ack` with `{ surfaceId, ackSeq }` to advance acknowledgment.

---

## 8. Evidence-Backed Universal Outbox Coverage Inventory

The following evidence-backed inventory covers 100% of domain mutations verified across actual production routes, adapters, and domain engines:

| Domain Entity | Mutation Type | Exact Source File | Exact Mutation Function | Actual DB Persistence Operation | Existing Outbox Status | Required Event Type | Aggregate Type | Aggregate Versioning & Epoch Behavior | Consumer & Projection Side-Effect | Verification Test |
|---|---|---|---|---|---|---|---|---|---|---|
| **Task** | Create | `apps/web/features/tasks/engine/taskEngine.ts` | `createTask()` | `Task.create(...)` | **MISSING** | `task.created` | `Task` | `version`: 0 $\to$ 1; `mutationEpoch`: token.epoch | `BehavioralObservationConsumer`: updates creation-to-due timeline. | `b4OutboxClosure.test.ts` |
| **Task** | Update | `apps/web/features/tasks/engine/taskEngine.ts` | `updateTask()` | `task.save()` | **MISSING** | `task.updated` | `Task` | `version` increments; `mutationEpoch`: token.epoch | `BehavioralObservationConsumer`: records duration / priority shifts. | `b4OutboxClosure.test.ts` |
| **Task** | Delete | `apps/web/features/tasks/engine/taskEngine.ts` | `deleteTask()` | `task.deleteOne()` | **MISSING** | `task.deleted` | `Task` | `version` increments; terminal receipt stored | `BehavioralObservationConsumer`: clears orphan dependencies. | `b4OutboxClosure.test.ts` |
| **Task** | Complete | `apps/web/features/tasks/engine/taskEngine.ts` | `completeTask()` | `persistWithStandaloneFencing` | **COMPLETED (B3)** | `task.completed` | `Task` | `version` increments; `mutationEpoch` checked | `BehavioralObservationConsumer`: updates velocity, MECE costs. | `b3Loop1ApiOutbox.test.ts` |
| **Goal** | Create | `packages/execution-kernel/src/dispatch/executionHandlers/handleCreateGoal.ts` | `handleCreateGoal()` | `Goal.create(...)` | **MISSING** | `goal.created` | `Goal` | `version`: 0 $\to$ 1; `mutationEpoch`: token.epoch | `GoalCausalConsumer`: updates goal graph & active targets. | `b4OutboxClosure.test.ts` |
| **Goal** | Delete | `packages/execution-kernel/src/dispatch/executionHandlers/handleDeleteGoal.ts` | `handleDeleteGoal()` | `Goal.findByIdAndDelete(...)` | **MISSING** | `goal.deleted` | `Goal` | `version` increments; terminal receipt stored | `GoalCausalConsumer`: cleans dependencies. | `b4OutboxClosure.test.ts` |
| **Calendar** | Create / Reschedule | `apps/web/app/api/calendar/mutate/route.ts` | `POST` $\to$ `KernelCapabilityService.executeAction` | `TemporalOccurrence.updateOne` | **MISSING** | `temporal.occurrence_created`, `temporal.occurrence_rescheduled` | `TemporalOccurrence` | `version` increments; `mutationEpoch` checked | `ScheduleConflictConsumer`: updates collision graph. | `b4OutboxClosure.test.ts` |
| **Signal** | Log | `apps/web/app/api/signals/log/route.ts` | `POST` | `persistWithStandaloneFencing` | **COMPLETED (B3)** | `signal.logged` | `DailyLog` | `version` increments; `mutationEpoch` checked | `BehavioralObservationConsumer`: logs metric observations. | `b3Loop1ApiOutbox.test.ts` |
| **Gym** | Log Session | `apps/web/app/api/gym/session/route.ts` | `POST` | `persistWithStandaloneFencing` | **COMPLETED (B3)** | `gym.session_logged` | `WorkoutSession` | `version` increments; `mutationEpoch` checked | `BehavioralObservationConsumer`: updates physical strain state. | `b3Loop1ApiOutbox.test.ts` |
| **Autonomous** | Evaluated | `packages/execution-kernel/src/autonomous/AutonomousExecutionDaemon.ts` | `executeCycle()` | `AutonomousExecutionLeaseModel.updateOne` | **NEW (B4)** | `autonomous.cycle_evaluated` | `AutonomousCycle` | Monotonic cycle sequence | `AutonomousAuditConsumer`: records cycle execution metrics. | `b4AutonomousLeaseDaemon.test.ts` |
| **Autonomous** | Proposed | `packages/execution-kernel/src/autonomous/HITLGovernanceEngine.ts` | `proposeIntervention()` | `AutonomousInterventionModel.create` | **NEW (B4)** | `autonomous.intervention_triggered` | `AutonomousIntervention` | Single-use CAS transition | `SurfaceNotificationConsumer`: dispatches real-time SSE push. | `b4EndToEndFailureBattery.test.ts` |
| **Autonomous** | Executed | `packages/execution-kernel/src/autonomous/AutonomousWorkflowExecutor.ts` | `executeWorkflow()` | `ProactiveActionLogModel.create` | **NEW (B4)** | `autonomous.action_executed` | `AutonomousAction` | Verified DWCP commit | `BehavioralProfileConsumer`: adjusts autonomous acceptance rate. | `b4EndToEndFailureBattery.test.ts` |

---

## 9. Kernel-Enforced Autonomy Governance & HITL Validation

### 9.1 Autonomy Tiers (L1–L4)
- **L1 (Advisory):** Read-only analysis, morning briefings, schedule conflict detection. Zero autonomous domain mutations.
- **L2 (Assisted):** Internal draft generation and staging into workspace scratchpads. Zero database mutations without HITL approval.
- **L3 (Conditional Autonomous):** Micro-optimizations permitted for non-consequential, flexible tasks (shifting unstarted tasks $\le 30$ mins within same day; slack $> 60$ mins).
- **L4 (Full Autonomous):** Automatic focus block reorganization and low-priority backlog roll-over according to B3 cadence profiles. Fixed commitments, meetings, external communications, and deletions strictly remain `HITL REQUIRED`.

### 9.2 Cryptographic HMAC & Authenticated Session
- Proposal cards are signed with:
  $$\text{signature} = \text{HMAC-SHA256}(\text{userId} + ":" + \text{interventionId} + ":" + \text{actionsHash} + ":" + \text{expiresAtMs}, \text{SECRET})$$
- Verification verifies constant-time HMAC comparison AND matches authenticated `session.userId`.
- Transitions atomically via CAS: `status: 'PENDING' \to 'ACCEPTED'`. Replays or expired attempts are rejected with HTTP 409 Conflict.
- If user modifies actions, status becomes `CANCELLED`, and a fresh proposal with a new signature is generated.

---

## 10. The Four Work Packages & Eight Engineering Loops

### Work Package 1: Universal Causal Outbox Closure (WP1)
- **Loop 1: Universal Outbox Event Schemas & Causal Registry Extension:** Author event schemas for Tasks, Goals, Calendar Occurrences, and Autonomous cycles; register in `CausalConsumerRegistry`.
- **Loop 2: Domain Adapter & Route Outbox Closure:** Rewire `taskEngine.ts`, `DefaultActionAdapters.ts`, and API routes (`tasks/create`, `tasks/update`, `calendar/mutate`, `goals/create`) to commit through `persistWithStandaloneFencing`.

### Work Package 2: Leased Autonomous Execution Daemon & Temporal Heartbeat (WP2)
- **Loop 3: Concurrency-Safe Distributed Lease Fencing & Heartbeat Core:** Implement `AutonomousExecutionLeaseModel`, safe initialization protocol, MongoDB server-time atomic CAS, 30s heartbeat renewal, and commit-boundary fencing for Replica-Set and Standalone modes.
- **Loop 4: Durable Action Journal & Bounded Interruption Cost Engine:** Implement `ProactiveActionLogModel`, author `InterruptionCostEvaluator` with $[0.0, 1.0]$ bounded range, strict emergency bypass rules, and conservative missing-data semantics.

### Work Package 3: Closed-Loop Adaptive Policy & Workflow Execution (WP3)
- **Loop 5: Closed-Loop Adaptive Strategies & Dual-Tier Scheduler:** Implement Tier 1 lightweight scheduling with adaptive backoff; author `MorningBriefingStrategy`, `ScheduleRebalancerStrategy`, and `CircadianEnergyAlignmentStrategy`.
- **Loop 6: Autonomous Workflow Execution & Authoritative Multi-Aggregate DWCP:** Implement the 11-step safe staging workflow lifecycle and Durable Workflow Commit Protocol with L1/L2 durable mutation receipts, anti-overwrite protection, and crash recovery sweeper.

### Work Package 4: Multi-Surface Delivery, HITL Governance & Verification (WP4)
- **Loop 7: Reactive Multi-Surface Stream & Monotonic Cursor Replay:** Build `/api/aven/stream/reactive` SSE endpoint with `deliverySeq` cursor replay, delivery acknowledgment receipts, and surface presence tracking.
- **Loop 8: Cryptographic HITL Governance & 15-Scenario Failure Battery:** Implement HMAC validation, single-use atomic state machine, and execute the comprehensive 15-scenario failure resilience battery.

---

## 11. Performance Targets vs Measured Benchmarks

| Metric / Operation | Design Performance Target | Status / Validation Method |
|---|---|---|
| **Tier 1 Lightweight Check** | Target: $< 5\text{ms}$ | Design Target (Indexed query `{ userId: 1, nextScheduledEvaluationAt: 1 }`). To be benchmarked in Loop 5. |
| **Tier 2 World Model Hydration** | Target: $< 120\text{ms}$ | Design Target (Parallel `Promise.allSettled`). To be benchmarked in Loop 5. |
| **Strategy & Policy Evaluation** | Target: $< 35\text{ms}$ | Design Target (Pure in-memory computation). To be benchmarked in Loop 5. |
| **11-Step Workflow Staging** | Target: $< 150\text{ms}$ | Design Target (Workspace scratchpad execution). To be benchmarked in Loop 6. |
| **Stage 3 Invariant Verification** | Target: $< 60\text{ms}$ | Design Target (Deterministic conflict checks). To be benchmarked in Loop 6. |
| **Atomic Outbox Commit (Replica-Set)** | Target: $< 50\text{ms}$ | Design Target (Multi-document ACID transaction). To be benchmarked in Loop 2/6. |
| **DWCP Sequential Commit (Standalone)** | Target: $< 85\text{ms}$ | Design Target (Sequential fenced updates + in-aggregate receipts). To be benchmarked in Loop 6. |
| **SSE Replay on Reconnect** | Target: $< 30\text{ms}$ | Design Target (Indexed query `{ userId: 1, surfaceId: 1, deliverySeq: { $gt: seq } }`). To be benchmarked in Loop 7. |

---

## 12. Testing and Verification Plan (15 Mandatory Failure Scenarios)

The test battery must pass all 15 failure injection scenarios using deterministic fake clocks and concurrency barriers:
1. **Concurrent Lease Initialization Race:** 10 concurrent workers run `ensureLeaseRecord(userId)`; exactly 1 document created; zero unhandled `E11000` errors.
2. **Concurrent Lease Acquisition Contention:** 5 workers race to `acquireLease()`; exactly 1 worker acquires token; 4 receive `null`.
3. **Stale Lease Holder Commit Rejection (Replica-Set & Standalone):** Worker A (epoch 101) stalls; Worker B acquires epoch 102; Worker B does not touch Aggregate X; Worker A resumes and commits $\to$ rejected with `FencedOutError`.
4. **Lease Epoch Persistence Across Restart:** Server restarts multiple times; `durableEpoch` monotonically advances and never resets.
5. **DWCP Recovery After L1 Ring Buffer Eviction (Issue Corrected):** Step 1 commits to Aggregate X; 60 subsequent mutations evict receipt from L1 ring buffer; recovery queries L2 `MutationReceiptModel`, proves commit, and resolves cleanly without re-executing.
6. **Authoritative Anti-Overwrite Compensation:** Step 1 applies to Occurrence A; step 2 fails; user manually reschedules Occurrence A; recovery sweeper detects version drift, skips overwrite, and preserves user edit.
7. **Both APPLIED and COMPENSATED Receipts Resolution:** Stored receipts show both `COMMITTED` and `COMPENSATED`; recovery establishes `COMPENSATED` as authoritative final state; skips duplicate compensation.
8. **Conservative UNKNOWN State Suppression:** Telemetry disconnected; `CognitiveState === UNKNOWN`; verify maximum penalty applied and non-critical alert suppressed.
9. **Emergency-Only DND/Quiet Hours Bypass:** Verify `CRITICAL_EMERGENCY` alerts bypass DND/Quiet Hours; verify ordinary `HIGH` priority alerts are strictly suppressed.
10. **Lossless Same-Timestamp SSE Replay:** 5 events emitted in same millisecond; verified ordered delivery and replay via `deliverySeq`.
11. **Duplicate-Safe Client Reconnect:** Client disconnects and reconnects with `lastAckSeq`; missed events replayed; zero duplicates.
12. **Replay After Intervention Business Status Change:** Intervention transitions to `EXPIRED`; unacknowledged delivery receipt remains recoverable.
13. **Cryptographic HMAC Tampering & Replay Rejection:** Altered action payload or replayed acceptance token rejected with HTTP 409 / 401.
14. **Unauthorized User Approval Rejection:** User B attempts to approve User A's intervention card; rejected with HTTP 403 Forbidden.
15. **Full Evidence-Backed Outbox Coverage:** 100% of routes in Section 8 verified to emit transactional outbox events with incremented versions.

---

## 13. Definition of Done & Success Criteria

Milestone B4 will be certified complete when:
1. **100% Causal Coverage:** Zero entity mutations bypass the Outbox across all production Task, Goal, and Calendar routes.
2. **Authoritative Lease Fencing Proved:** A stale worker that lost lease ownership cannot successfully commit protected mutations, even if newer workers have not modified the target aggregate.
3. **Multi-Aggregate Consistency via L1/L2 Receipts:** Multi-aggregate workflows guarantee all-or-nothing consistency via Replica-Set transactions or DWCP with durable L2 mutation receipts surviving L1 ring buffer evictions.
4. **Anti-Overwrite Protection:** DWCP compensation never overwrites a newer legitimate mutation.
5. **Emergency Bypass Rigor:** Only `CRITICAL_EMERGENCY` alerts bypass DND/Quiet Hours; `HIGH` alerts are held.
6. **HITL Integrity:** Approvals are single-use, atomic, and authenticated; payload tampering is rejected by HMAC.
7. **Lossless SSE Replay:** Disconnected clients recover 100% of missed interventions via monotonic `deliverySeq`.
8. **Bounded Cost Formula:** Interruption cost is mathematically verified in $[0.0, 1.0]$ with conservative missing-data fallbacks.
9. **15/15 Failure Scenarios Pass:** All 15 automated failure injection tests pass cleanly.
10. **Zero Regression:** All existing test batteries (B1: 33/33, B2: 42/42, B3: 41/41, Stage 1–4: 148/148) pass without regression.

