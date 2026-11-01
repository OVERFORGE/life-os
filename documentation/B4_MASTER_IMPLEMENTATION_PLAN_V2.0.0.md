# LifeOS / Aven — Milestone B4
# Master Implementation Plan V2.0.0
**Project:** LifeOS Adaptive Personal Operating System  
**AI Companion:** Aven  
**Architectural Phase:** Milestone B4 — Autonomous Proactive Orchestration & Closed-Loop Adaptive Execution (APO-CLAE)  
**Organization:** The Executioners (ExE)  
**Document Revision:** `B4_MASTER_IMPLEMENTATION_PLAN_V2.0.0`  
**Execution Boundary:** RESEARCH AND PLANNING ONLY — IMPLEMENTATION STRICTLY UNAUTHORIZED  

---

## 1. Executive Summary & Architectural Mandate

### 1.1 The Architectural Mandate: APO-CLAE
Milestones B1 through B3 established the three foundational pillars of LifeOS:
- **Milestone B1 (Truth):** Live, user-scoped canonical Personal World Model (`WorldModelBridge`).
- **Milestone B2 (Causality):** Distributed transactional Outbox, strict aggregate versioning, and consumer ledger.
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
5. **Separation of Cryptographic Integrity & User Authorization:** HMAC tokens verify server-side payload origin and tamper-proofing; user authorization requires independent authenticated sessions.
6. **Kernel-Enforced Autonomy (Default-Deny):** An LLM generates proposals, but the Kernel enforces capability safety contracts. An LLM cannot self-authorize an action by lowering its risk tier.
7. **Conservative Missing-Data Semantics:** If cognitive telemetry or cadence history is missing or `UNKNOWN`, the system prefers suppression or delayed evaluation over risky assumptions.
8. **Backward Compatibility:** All existing HTTP API routes, conversational chat endpoints, and database models must remain 100% operational with zero breaking schema mutations.

---

## 3. Distributed Lease Fencing & Stale-Worker Protection (Correction A)

### 3.1 The Stale-Worker Hazard
Consider a multi-instance distributed deployment:
1. Worker A acquires lease for `userId` at epoch 101.
2. Worker A begins evaluating strategies and staging workflows.
3. Worker A experiences an operating system pause (garbage collection, disk stall, or network blip).
4. Lease TTL expires in MongoDB.
5. Worker B acquires the lease at epoch 102, completes an evaluation, and commits mutations.
6. Worker A unpauses and attempts to commit its stale staged mutations.

**Architectural Law:** A worker that loses lease ownership must be strictly prevented from committing protected mutations. A lease alone does not stop an old process from executing CPU instructions; the commit boundary must enforce atomic fencing.

### 3.2 Fencing Token Definition
Every acquired lease yields a cryptographically and logically unforgeable token:
```typescript
export interface IFencingToken {
  userId: string;
  workerId: string;
  epoch: number;
  acquiredAt: Date;
  expiresAt: Date;
  isValid(): boolean;
  invalidate(): void;
}
```

### 3.3 Durable Epoch Ownership vs Lease Lifecycle
To guarantee that the monotonic epoch counter can never reset across cleanup cycles or restarts:
- `AutonomousExecutionLeaseModel` stores a **permanent singleton document per user**.
- **No TTL index is placed on the lease document itself.** (TTL indexes delete records, which would reset `durableEpoch` to 0 or 1 upon re-upsert).
- Historical execution metrics are stored in a separate collection (`AutonomousExecutionAuditLogModel`) where TTL retention can be safely configured.

### 3.4 Atomic Acquisition Protocol
Worker acquisition is implemented via a single atomic MongoDB `findOneAndUpdate` operation using pipeline updates:
```typescript
public async acquireLease(
  userId: string,
  workerId: string,
  leaseTtlMs: number = 90000
): Promise<IFencingToken | null> {
  const now = new Date();
  const filter = {
    userId,
    $or: [
      { status: { $in: ['IDLE', 'RELEASED', 'EXPIRED'] } },
      { leaseExpiresAt: { $lt: now } }
    ]
  };

  const pipeline = [
    {
      $set: {
        durableEpoch: { $add: [{ $ifNull: ["$durableEpoch", 0] }, 1] },
        activeEpoch: { $add: [{ $ifNull: ["$durableEpoch", 0] }, 1] },
        activeWorkerId: workerId,
        status: "ACTIVE",
        leaseExpiresAt: new Date(now.getTime() + leaseTtlMs),
        heartbeatAt: now,
        acquiredAt: now,
        updatedAt: now
      }
    }
  ];

  const doc = await AutonomousExecutionLeaseModel.findOneAndUpdate(
    filter,
    pipeline,
    { new: true, upsert: true }
  );

  if (!doc || doc.activeWorkerId !== workerId) {
    return null; // Contention loss: another worker won the atomic CAS
  }

  return new FencingToken(userId, workerId, doc.activeEpoch, doc.leaseExpiresAt);
}
```

### 3.5 Atomic Renewal (Heartbeat)
Workers must refresh their lease every 30 seconds while an active cycle executes:
```typescript
public async renewLease(token: IFencingToken, additionalMs: number = 90000): Promise<boolean> {
  const now = new Date();
  const updated = await AutonomousExecutionLeaseModel.findOneAndUpdate(
    {
      userId: token.userId,
      activeWorkerId: token.workerId,
      activeEpoch: token.epoch,
      status: 'ACTIVE',
      leaseExpiresAt: { $gt: now } // Must not have already expired
    },
    {
      $set: {
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + additionalMs),
        updatedAt: now
      }
    },
    { new: true }
  );

  if (!updated) {
    token.invalidate();
    return false; // Fenced out or expired
  }
  return true;
}
```

### 3.6 Conditional Release
Upon clean cycle completion:
```typescript
public async releaseLease(token: IFencingToken): Promise<void> {
  await AutonomousExecutionLeaseModel.updateOne(
    {
      userId: token.userId,
      activeWorkerId: token.workerId,
      activeEpoch: token.epoch,
      status: 'ACTIVE'
    },
    {
      $set: {
        status: 'RELEASED',
        activeWorkerId: null,
        leaseExpiresAt: new Date(0),
        lastCompletedCycleAt: new Date(),
        updatedAt: new Date()
      }
    }
  );
  token.invalidate();
}
```

### 3.7 Commit-Boundary Fencing Validation
Whenever a worker commits domain mutations or outbox events:
1. **Lease Document Validation:** The commit boundary executes an atomic check verifying that `AutonomousExecutionLeaseModel` for `userId` still has `activeEpoch === token.epoch` and `activeWorkerId === token.workerId`.
2. **Aggregate Mutation Guard:** When updating aggregate roots via `persistWithStandaloneFencing`, the aggregate query filter requires `mutationEpoch === token.epoch`.
3. If Worker B acquired epoch 102 while Worker A stalled, Worker A's write matches 0 documents and throws `FencedOutError`. **Worker A cannot successfully commit any protected mutation.**

---

## 4. Safe Autonomous Workflow Execution & Staging Protocol (Correction B)

### 4.1 The Staging vs Domain Truth Invariant
`ExecutionWorkspace` owns orchestration context and scratchpad data, **not domain truth**.
A workspace rollback cannot reverse already-persisted MongoDB documents. Therefore, autonomous workflows must execute in a strictly two-phase manner: **pure in-memory staging and verification first; atomic database commit second.**

### 4.2 The 11-Step Safe Workflow Lifecycle
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        11-STEP SAFE WORKFLOW LIFECYCLE                                 │
│                                                                                        │
│  [1. Plan DAG] ────────► [2. Validate Safety] ──────► [3. Hydrate World Model]         │
│                                                               │                        │
│  [6. Compute State] ◄─── [5. Stage Mutations] ◄────── [4. Check Preconditions]         │
│          │                                                                             │
│          ▼                                                                             │
│  [7. Stage 3 Verification] ──► [8. Revalidate Epoch] ──► [9. Atomic B2 Outbox Commit]  │
│                                                               │                        │
│  [11. Outcome Journal] ◄────────────────────────────── [10. Post-Commit Sanity Check] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Generate Structured Proposed Workflow:** `DynamicWorkflowPlanner` produces a typed DAG of action proposals.
2. **Validate Action Types & Permissions:** `AutonomyPolicyManager` evaluates every node against the capability safety contract. If any node is unauthorized, the workflow is aborted before execution.
3. **Hydrate Authoritative State:** `WorldModelBridge` loads live user context, schedule blocks, and task states.
4. **Check Preconditions:** Each action adapter verifies precondition validity (e.g. task exists, no active incident suspensions).
5. **Stage Proposed Mutations (Zero DB Writes):** Action nodes execute in `stagingMode: true`. Mutations are captured in a shadow projection stored in `ExecutionWorkspace.scratchpad`.
6. **Compute Expected Resulting State:** The shadow projection applies all proposed deltas to the hydrated state in-memory.
7. **Verify Invariants Against Staged Result:** Stage 3 `OutcomeVerificationEngine` evaluates semantic assertions on the staged result (e.g. zero overlapping calendar blocks, task deadline consistency, circadian energy alignment).
8. **Revalidate State & Fencing Token:** Immediately before committing:
   - Check that `fencingToken.isValid()` and lease epoch is still active in MongoDB.
   - Verify aggregate version assumptions have not drifted.
9. **Commit Through Canonical B2 Outbox Protocol:**
   - In Replica Set mode: Executes multi-document ACID transaction via `OutboxStorageService.commitModeA`.
   - In Standalone mode: Executes two-phase intent fencing via `OutboxStorageService.persistWithStandaloneFencing`.
   - All domain updates and outbox events commit atomically.
10. **Verify Committed State:** Post-commit sanity check verifies database documents reflect intended versions.
11. **Record Final Outcome:** The executed action, duration, and verification receipt are durably journaled in `ProactiveActionLogModel`.

### 4.3 Handling Failure Scenarios
- **DAG Node Failure During Staging:** The scratchpad is discarded; `ExecutionWorkspace` is marked `ABORTED`. Because zero database writes occurred, **no rollback or compensation is required**.
- **Precondition Drift:** If a task was modified by the user while the workflow was staging, version revalidation at Step 8 fails with `ConcurrencyConflictError`. The commit is aborted cleanly.
- **Worker Fenced Out:** If the worker's lease expired, Step 8 throws `FencedOutError`. No mutations are committed.
- **Process Crash During Commit:**
  - Mode A: MongoDB automatically aborts the uncommitted multi-document transaction.
  - Mode B: Outbox intent recovery sweeper inspects `mutationIntent` and safely resolves or aborts.
- **Non-Compensable External Actions:** External actions (e.g. sending messages, third-party sync) are classified as `HITL REQUIRED` and are never executed autonomously without user authorization. Compensation is only attempted if a genuine inverse operation exists.

---

## 5. Cryptographic HITL Governance & Replay Safety (Correction C)

### 5.1 Separation of Cryptographic Integrity & User Authorization
- **Cryptographic HMAC:** Proves that the proposal payload originated from the server and was not tampered with.
- **User Authentication:** Proves that an authenticated user session authorized the action.
- **Durable State Machine:** Enforces single-use consumption and prevents replay attacks.

### 5.2 The Complete Intervention State Machine
```
                       ┌──────────────┐
                       │   PENDING    │
                       └──────┬───────┘
              ┌───────────────┼───────────────┐
              │ User Accepts  │ User Rejects  │ Expiration
              ▼               ▼               ▼
       ┌──────────────┐┌──────────────┐┌──────────────┐
       │   ACCEPTED   ││   REJECTED   ││   EXPIRED    │
       └──────┬───────┘└──────────────┘└──────────────┘
              │ Worker Claims Execution
              ▼
       ┌──────────────┐
       │  EXECUTING   │
       └──────┬───────┘
       ┌──────┴───────┐
       ▼              ▼
┌─────────────┐ ┌─────────────┐
│  EXECUTED   │ │   FAILED    │
└─────────────┘ └─────────────┘
```

### 5.3 Canonical Serialization & HMAC Structure
The HMAC signature covers the deterministic canonical JSON representation of the proposal:
$$\text{canonicalPayload} = \text{canonicalJson}(\{ \text{interventionId}, \text{userId}, \text{actionTypes}, \text{payloads} \})$$
$$\text{actionsHash} = \text{SHA256}(\text{canonicalPayload})$$
$$\text{signature} = \text{HMAC-SHA256}(\text{userId} + ":" + \text{interventionId} + ":" + \text{actionsHash} + ":" + \text{expiresAtMs}, \text{SECRET})$$

**Verification Protocol:**
1. Constant-time comparison (`crypto.timingSafeEqual`) prevents timing attacks.
2. Supports key rotation: verifies against `CURRENT_SECRET` or `PREVIOUS_SECRET` from the server key ring.

### 5.4 Atomic Single-Use Response Protocol
When the user submits an approval response via `POST /api/aven/interventions/respond`:
1. Authenticate user from session (`session.userId`).
2. Verify ownership: `intervention.userId === session.userId`.
3. Verify signature: recompute HMAC over canonical action payload.
4. **Atomic State Transition (CAS):**
   ```typescript
   const intervention = await AutonomousInterventionModel.findOneAndUpdate(
     {
       _id: interventionId,
       userId: session.userId,
       status: 'PENDING',
       expiresAt: { $gt: new Date() }
     },
     {
       $set: {
         status: 'ACCEPTED',
         userResponse: 'ACCEPTED',
         respondedAt: new Date(),
         respondedByUserId: session.userId
       }
     },
     { new: true }
   );

   if (!intervention) {
     throw new InterventionStateError('Intervention is no longer pending or has expired.');
   }
   ```
5. **Persist Before Execution:** The `ACCEPTED` status is committed to MongoDB before any workflow execution begins.
6. **Execution Claim:** The background worker transitions `status: 'ACCEPTED'` to `status: 'EXECUTING'` with its active fencing token, executes the workflow via the 11-step protocol, and marks `status: 'EXECUTED'`.
7. **Replay Protection:** Any duplicate or replayed request fails at Step 4 because `status !== 'PENDING'`.
8. **Modifications:** If the user edits a proposal in the UI, the client submits a `MODIFY` request. The existing intervention is marked `CANCELLED`, and a fresh intervention with a new ID and signature is created.

---

## 6. Kernel-Enforced Autonomy Governance (Correction D)

### 6.1 Capability Safety Contracts & Default-Deny Policy
Every executable capability in LifeOS is governed by a kernel-level safety contract:
```typescript
export interface ICapabilitySafetyContract {
  capabilityURN: string;
  category: 'AUTONOMOUS' | 'CONDITIONALLY_AUTONOMOUS' | 'HITL_REQUIRED';
  isExternalMutation: boolean;
  isReversible: boolean;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  allowsAutonomousExecution: boolean;
  maxDisplacementMinutes?: number;
}
```

### 6.2 Precise Action Classifications

| Classification | Capability URN | Description & Constraints | Autonomy Requirements |
|---|---|---|---|
| **AUTONOMOUS** | `urn:lifeos:action:generate_morning_briefing` | Synthesizes daily overview from calendar & weather. | User setting $\ge \text{L1}$. Read-only / draft. |
| **AUTONOMOUS** | `urn:lifeos:action:analyze_schedule_conflicts` | Detects overlapping commitments; drafts proposals. | User setting $\ge \text{L1}$. Read-only / draft. |
| **AUTONOMOUS** | `urn:lifeos:action:recalculate_task_priorities` | Updates internal priority weights based on cadence. | User setting $\ge \text{L2}$. Reversible. |
| **AUTONOMOUS** | `urn:lifeos:action:stage_draft_workflow` | Plans multi-step DAG into workspace scratchpad. | User setting $\ge \text{L2}$. Zero DB writes. |
| **CONDITIONALLY AUTONOMOUS** | `urn:lifeos:action:reschedule_flexible_task` | Shifts un-started task within same day ($\le 30\text{m}$). | User setting $\ge \text{L3}$; explicit schedule opt-in; slack $> 60\text{m}$. |
| **CONDITIONALLY AUTONOMOUS** | `urn:lifeos:action:adjust_focus_block` | Adjusts internal focus block to align with B3 cadence. | User setting $\ge \text{L4}$; no overlap with fixed events. |
| **CONDITIONALLY AUTONOMOUS** | `urn:lifeos:action:defer_backlog_task` | Rolls uncompleted low-priority task to next day. | User setting $\ge \text{L3}$; task priority = LOW. |
| **HITL REQUIRED** | `urn:lifeos:action:delete_task` | Deletes task from database. | Irreversible domain deletion. HITL mandatory. |
| **HITL REQUIRED** | `urn:lifeos:action:delete_calendar_event` | Deletes calendar occurrence. | External / fixed schedule mutation. HITL mandatory. |
| **HITL REQUIRED** | `urn:lifeos:action:reschedule_fixed_commitment` | Moves meetings, appointments, or classes. | External commitment. HITL mandatory. |
| **HITL REQUIRED** | `urn:lifeos:action:modify_goal_targets` | Changes long-term targets or milestones. | Strategic goal governance. HITL mandatory. |
| **HITL REQUIRED** | `urn:lifeos:action:send_external_communication` | Dispatches emails, SMS, or webhooks. | Externally visible side-effect. HITL mandatory. |

**Constitutional Rule:** Any capability not explicitly listed in the registry defaults to `HITL_REQUIRED` (default-deny). The LLM is strictly prohibited from authoring or overriding capability safety contracts.

---

## 7. Interruption Cost Engine & Missing-Data Semantics (Correction E)

### 7.1 Grounded Cost Formulation
The interruption cost $C_{\text{interrupt}} \in [0.0, 1.5]$ evaluates whether an unsolicited alert is permissible:
$$C_{\text{interrupt}} = C_{\text{base}} + C_{\text{quiet}} + C_{\text{focus}} + C_{\text{cognitive}} + C_{\text{fatigue}}$$

Where:
- $C_{\text{base}} = 0.20$ (baseline friction of any unsolicited context switch).
- $C_{\text{quiet}} = 0.80$ if within user quiet hours (default: 22:00–08:00 local time).
- $C_{\text{focus}} = 0.40$ if user is inside an active focus block or calendar meeting.
- $C_{\text{cognitive}} = 0.35 \times (1.0 - \text{CognitiveRecoveryScore})$ based on B1 biometric telemetry.
- $C_{\text{fatigue}} = 0.15 \times \min(\text{DailyInterventionsSentToday}, 5)$.

### 7.2 Missing-Data & UNKNOWN State Semantics
**Critical Law:** The system must never assume that an `UNKNOWN` state represents low interruption cost!
- **`CognitiveState === UNKNOWN`:** If wearable biometric telemetry is unavailable or stale ($> 12$ hours), $C_{\text{cognitive}}$ defaults to a **conservative penalty of 0.30**. The system will not interrupt unless action urgency is `HIGH` or `CRITICAL`.
- **`CadenceProfile === UNKNOWN`:** If the user has fewer than 7 days of behavioral history, circadian peak confidence is marked `LOW`, and schedule shifts are suppressed until confidence exceeds 0.65.
- **`Presence === UNKNOWN`:** If no client heartbeat was received in the last 5 minutes, delivery defaults to asynchronous queuing rather than audible/vibrating alerts.

### 7.3 Hard Suppression Rules
An intervention is unconditionally suppressed ($C_{\text{interrupt}} = \infty$) if:
1. `UserMode === DO_NOT_DISTURB` (unless action priority is `CRITICAL_EMERGENCY`).
2. `QuietHours === true` $\land$ priority is not `CRITICAL`.
3. `DailyInterventionCount >= 3` (daily notification budget exhausted).
4. `TimeSinceLastIntervention < 45 minutes` (cooldown active).
5. Operational circuit breaker is tripped due to consecutive failures.

---

## 8. Event-Aware Autonomous Scheduling & Resource Budgets (Correction F)

### 8.1 Dual-Tier Evaluation Architecture
To avoid wasteful database hydration every 60 seconds across thousands of users, B4 establishes a dual-tier scheduler:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DUAL-TIER SCHEDULER                             │
│                                                                        │
│  [Tick (60s) or Causal Event] ──► [Tier 1: Lightweight Evaluation]     │
│                                                   │                    │
│                        ┌──────────────────────────┴────────┐           │
│                        ▼ Due / Triggered                   ▼ Not Due   │
│         [Tier 2: Full Evaluation Cycle]                 [Skip / Sleep] │
│         - Hydrate B1 World Model                                       │
│         - Retrieve B3 Profiles                                         │
│         - Evaluate Strategies                                          │
└────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Tier 1: Lightweight Evaluation (Budget: $< 5\text{ms}$)
Runs every 60s tick or upon receipt of a domain causal event:
- Checks:
  1. `nextScheduledEvaluationAt <= now`?
  2. Did a high-priority domain event arrive (`task.created`, `temporal.occurrence_rescheduled`)?
  3. Is user currently awake based on scheduled wake boundary?
  4. Is an existing cycle currently running for this user?
- Operates entirely against an indexed query on `AutonomousExecutionLeaseModel`. Zero World Model hydration!

### 8.3 Tier 2: Full Evaluation Cycle (Budget: $< 250\text{ms}$)
Triggered only when Tier 1 evaluates to `true`:
- Hydrates B1 `WorldModelBridge` and B3 `BehavioralProfile` / `CadenceProfile`.
- Evaluates active strategies (`MorningBriefing`, `ScheduleRebalancer`, `EnergyAlignment`).
- Runs policy and interruption cost gates.
- Executes or proposes actions.

### 8.4 Adaptive Backoff After No-Op Cycles
If a full evaluation cycle produces zero actions (no-op cycle):
$$\text{nextScheduledEvaluationAt} = \text{now} + \min(15\text{m} \times 2^{\text{consecutiveNoops}}, 120\text{m})$$
Any incoming domain mutation event immediately resets `consecutiveNoops = 0` and schedules an immediate Tier 1 check at the next tick.

---

## 9. Durable Multi-Surface Delivery & Presence Tracking (Correction G)

### 9.1 Separation of Transport from Durable State
- **MongoDB Collections (`autonomous_interventions`, `proactive_action_logs`):** Authoritative persistent truth.
- **SSE Stream (`/api/aven/stream/reactive`):** Ephemeral delivery transport. Dropped connections never lose state.

### 9.2 The Seven-State Delivery Lifecycle
$$\text{CREATED} \longrightarrow \text{QUEUED} \longrightarrow \text{SENT} \longrightarrow \text{RECEIVED} \longrightarrow \text{ACKNOWLEDGED} \longrightarrow \text{VIEWED} \longrightarrow \text{USER\_RESPONDED}$$

### 9.3 Client Reconnect & Recovery Protocol
1. When a client connects to `/api/aven/stream/reactive`, it sends a `lastDeliveredCursor` query parameter.
2. The server queries `AutonomousInterventionModel` for all records where `userId === session.userId`, `status === 'PENDING'`, and `createdAt > lastDeliveredCursor`.
3. All pending interventions are immediately replayed to the reconnected client.
4. Clients send explicit ACK pings to `/api/aven/stream/ack` upon receiving messages, updating `SurfaceDeliveryReceiptModel`.

### 9.4 Surface Presence Awareness
- Clients report heartbeat pings every 30 seconds (`desktop_web`, `mobile_app`, `ambient_display`).
- Presence records expire after 60 seconds of silence.
- Interventions target the user's currently active surface:
  - Active on desktop $\to$ subtle in-app notification badge.
  - Active on mobile $\to$ native mobile notification.
  - Offline on all surfaces $\to$ non-urgent interventions remain queued; critical alerts trigger push notification.

---

## 10. Universal Causal Outbox Coverage Matrix (Correction H)

The following evidence-backed matrix accounts for 100% of domain mutations across production routes, adapters, and services:

| Domain Entity | Mutation Type | Production Route / Adapter | Existing Persistence Method | Outbox Status | Required Event Type | Aggregate Type | Consumer & Projection Side-Effect |
|---|---|---|---|---|---|---|---|
| **Task** | Create | `POST /api/tasks/create`<br>`CreateTaskAdapter` | `Task.create` | **MISSING** | `task.created` | `Task` | `BehavioralObservationConsumer`: updates creation-to-due timeline. |
| **Task** | Update | `PATCH /api/tasks/update`<br>`UpdateTaskAdapter` | `task.save` | **MISSING** | `task.updated` | `Task` | `BehavioralObservationConsumer`: records duration / priority shifts. |
| **Task** | Delete | `DELETE /api/tasks/delete`<br>`DeleteTaskAdapter` | `task.deleteOne` | **MISSING** | `task.deleted` | `Task` | `BehavioralObservationConsumer`: clears orphan dependencies. |
| **Task** | Complete | `POST /api/tasks/complete`<br>`CompleteTaskAdapter` | `persistWithStandaloneFencing` | **COMPLETED (B3)** | `task.completed` | `Task` | `BehavioralObservationConsumer`: updates velocity, MECE costs. |
| **Goal** | Create | `POST /api/goals/create`<br>`CreateGoalAdapter` | `Goal.create` | **MISSING** | `goal.created` | `Goal` | `GoalCausalConsumer`: updates goal graph & active targets. |
| **Goal** | Update | `PATCH /api/goals/update` | `Goal.findByIdAndUpdate` | **MISSING** | `goal.updated` | `Goal` | `GoalCausalConsumer`: recalculates milestone progress. |
| **Calendar** | Create | `POST /api/calendar/mutate` | `TemporalOccurrence.create` | **MISSING** | `temporal.occurrence_created` | `TemporalOccurrence` | `ScheduleConflictConsumer`: checks collision graph. |
| **Calendar** | Reschedule | `POST /api/calendar/mutate` | `updateOne` | **MISSING** | `temporal.occurrence_rescheduled` | `TemporalOccurrence` | `CadenceLearningConsumer`: learns user rescheduling friction. |
| **Signal** | Log | `POST /api/signals/log` | `persistWithStandaloneFencing` | **COMPLETED (B3)** | `signal.logged` | `DailyLog` | `BehavioralObservationConsumer`: logs metric observations. |
| **Gym** | Log Session | `POST /api/gym/session` | `persistWithStandaloneFencing` | **COMPLETED (B3)** | `gym.session_logged` | `WorkoutSession` | `BehavioralObservationConsumer`: updates physical strain state. |
| **Autonomous** | Evaluated | Background Daemon | `AutonomousExecutionLeaseModel` | **NEW (B4)** | `autonomous.cycle_evaluated` | `AutonomousCycle` | `AutonomousAuditConsumer`: records cycle execution metrics. |
| **Autonomous** | Proposed | Background Daemon | `AutonomousInterventionModel` | **NEW (B4)** | `autonomous.intervention_triggered` | `AutonomousIntervention` | `SurfaceNotificationConsumer`: dispatches real-time SSE push. |
| **Autonomous** | Executed | Autonomous Workflow | `ProactiveActionLogModel` | **NEW (B4)** | `autonomous.action_executed` | `AutonomousAction` | `BehavioralProfileConsumer`: adjusts autonomous acceptance rate. |

---

## 11. Security, Concurrency, and Isolation Guarantees

1. **Distributed Lease Fencing:** MongoDB atomic aggregation pipeline CAS guarantees strictly one active daemon worker per user with strictly monotonic epoch tokens.
2. **Commit-Boundary Token Validation:** Stale workers that lose lease ownership are rejected at the database and outbox commit boundary.
3. **Cryptographic HMAC Signatures:** HITL action cards are signed with `HMAC-SHA256(userId + interventionId + actionsHash + expiresAt, SECRET)` with constant-time verification.
4. **Tenant Isolation:** All queries, subscriptions, outbox events, and action logs require an exact match on `userId`.
5. **Idempotency Keys:** Every autonomous mutation carries a unique deterministic key (`auto:userId:cycleId:ordinal`), preventing duplicate execution during crash recovery.

---

## 12. Backward Compatibility & Non-Breaking Invariants

1. **Zero Database Drops / Breaking Migrations:** New collections (`autonomous_execution_leases`, `proactive_action_logs`, `autonomous_interventions`, `surface_delivery_receipts`) are strictly additive.
2. **Existing APIs Untouched:** `/api/tasks/*`, `/api/calendar/*`, `/api/aven/chat` retain identical request/response signatures.
3. **Graceful Degradation:** If the autonomous daemon is disabled or MongoDB leases are locked, LifeOS functions identically to Milestone B3 in full reactive mode.

---

## 13. Data Model & Schema Specifications

### 13.1 `AutonomousExecutionLeaseModel` (`autonomous_execution_leases`)
```typescript
export interface IAutonomousExecutionLease {
  userId: string;
  durableEpoch: number;               // Monotonic strictly increasing counter (NEVER reset)
  activeEpoch: number;                // Epoch granted to current lease holder
  activeWorkerId: string | null;
  status: 'IDLE' | 'ACTIVE' | 'EXPIRED' | 'RELEASED';
  acquiredAt: Date;
  expiresAt: Date;
  heartbeatAt: Date;
  lastCompletedCycleAt?: Date;
  nextScheduledEvaluationAt: Date;
  consecutiveNoopCycles: number;
  updatedAt: Date;
}
// Indexes:
// { userId: 1 }, unique
// { nextScheduledEvaluationAt: 1, status: 1 }
```

### 13.2 `ProactiveActionLogModel` (`proactive_action_logs`)
```typescript
export interface IProactiveActionLog {
  userId: string;
  actionId: string;
  actionType: string;
  capabilityURN: string;
  cooldownKey: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PROPOSED' | 'DELIVERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'EXECUTED' | 'FAILED';
  interruptionCost: number;
  payload: Record<string, unknown>;
  userResponse?: 'ACCEPTED' | 'REJECTED' | 'MODIFIED' | 'DISMISSED';
  executionResult?: Record<string, unknown>;
  error?: string;
  executedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
// Indexes:
// { userId: 1, cooldownKey: 1, createdAt: -1 }
// { userId: 1, actionType: 1, createdAt: -1 }
// { userId: 1, status: 1 }
```

### 13.3 `AutonomousInterventionModel` (`autonomous_interventions`)
```typescript
export interface IAutonomousIntervention {
  userId: string;
  interventionId: string;
  title: string;
  description: string;
  rationale: string;
  actions: Array<{
    capabilityURN: string;
    payload: Record<string, unknown>;
  }>;
  requiresHITL: boolean;
  hmacSignature: string;
  actionsHash: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'EXECUTING' | 'EXECUTED' | 'FAILED';
  userResponse?: 'ACCEPTED' | 'REJECTED' | 'MODIFIED';
  respondedAt?: Date;
  respondedByUserId?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
// Indexes:
// { userId: 1, interventionId: 1 }, unique
// { userId: 1, status: 1, expiresAt: 1 }
```

---

## 14. The Four Work Packages & Eight Engineering Loops

### Work Package 1: Universal Causal Outbox Closure (WP1)
- **Loop 1: Universal Outbox Event Schemas & Causal Registry Extension:** Author event schemas for Tasks, Goals, Calendar Occurrences, and Autonomous cycles; register in `CausalConsumerRegistry`.
- **Loop 2: Domain Adapter & Route Outbox Closure:** Rewire `taskEngine.ts`, `DefaultActionAdapters.ts`, and API routes (`tasks/create`, `tasks/update`, `calendar/mutate`, `goals/create`) to commit through `persistWithStandaloneFencing`.

### Work Package 2: Leased Autonomous Execution Daemon & Temporal Heartbeat (WP2)
- **Loop 3: Distributed Lease Lock & Autonomous Heartbeat Daemon Core:** Implement `AutonomousExecutionLeaseModel`, pipeline CAS lease acquisition, 30s heartbeat renewal, conditional release, and commit-boundary token fencing.
- **Loop 4: Durable Action Journal & Interruption Cost Engine:** Implement `ProactiveActionLogModel`, replace in-memory maps, and author `InterruptionCostEvaluator` with conservative missing-data semantics.

### Work Package 3: Closed-Loop Adaptive Policy & Workflow Execution (WP3)
- **Loop 5: Closed-Loop Adaptive Strategies & Dual-Tier Scheduler:** Implement Tier 1 lightweight scheduling with adaptive backoff; author `MorningBriefingStrategy`, `ScheduleRebalancerStrategy`, and `CircadianEnergyAlignmentStrategy`.
- **Loop 6: Autonomous Workflow Execution & Stage 3 Verification Bridge:** Implement the 11-step safe staging workflow lifecycle (`DynamicWorkflowPlanner` $\to$ staging scratchpad $\to$ Stage 3 invariant verification $\to$ atomic B2 commit).

### Work Package 4: Multi-Surface Delivery, HITL Governance & Verification (WP4)
- **Loop 7: Reactive Multi-Surface Stream & Presence Tracking:** Build `/api/aven/stream/reactive` SSE endpoint with client cursor replay, delivery acknowledgment receipts, and surface presence tracking.
- **Loop 8: Cryptographic HITL Governance & 14-Scenario Failure Battery:** Implement HMAC validation, single-use atomic state machine, and execute the comprehensive 14-scenario failure resilience battery.

---

## 15. Performance and Resource Budgets

| Operation | Target Budget (Local Test) | Production Target (P95) | Scaling Strategy |
|---|---|---|---|
| **Tier 1 Lightweight Check** | $< 2\text{ms}$ | $< 5\text{ms}$ | Single MongoDB index scan `{ nextScheduledEvaluationAt: 1 }`. Scales to 100,000 users. |
| **Tier 2 World Model Hydration** | $< 40\text{ms}$ | $< 120\text{ms}$ | Parallel `Promise.allSettled` queries across Task, Schedule, and Telemetry. |
| **Adaptive Strategy Evaluation** | $< 15\text{ms}$ | $< 35\text{ms}$ | In-memory evaluation of deterministic cadence heuristics. |
| **Stage 4 Workflow Staging** | $< 50\text{ms}$ | $< 150\text{ms}$ | In-memory DAG execution into scratchpad; zero disk I/O. |
| **Stage 3 Invariant Verification** | $< 20\text{ms}$ | $< 60\text{ms}$ | Deterministic conflict check on staged array. |
| **Atomic Outbox Commit** | $< 25\text{ms}$ | $< 50\text{ms}$ | Atomic MongoDB transaction or two-phase standalone fencing. |
| **SSE Replay on Reconnect** | $< 10\text{ms}$ | $< 30\text{ms}$ | Indexed query `{ userId: 1, status: 'PENDING', createdAt: { $gt: cursor } }`. |

---

## 16. Definition of Done & Success Criteria

Milestone B4 will be certified complete when:
1. **100% Causal Coverage:** Zero entity mutations bypass the Outbox. Every creation, update, and deletion produces a verified causal event.
2. **Lease Fencing Proved:** A stale worker that lost lease ownership cannot successfully commit protected mutations.
3. **Safe Staged Workflows:** Failed workflows leave zero partial database mutations.
4. **HITL Replay Resilience:** Approvals are single-use, atomic, and authenticated; payload tampering is rejected by HMAC.
5. **Durable Intervention History:** 100% of proactive decisions and user feedback are stored in MongoDB; zero in-memory maps.
6. **14/14 Failure Scenarios Pass:** All 14 failure injection tests execute cleanly in automated test runs.
7. **Zero Regression:** All existing test batteries (B1: 33/33, B2: 42/42, B3: 41/41, Stage 1–4: 148/148) pass without regression.

