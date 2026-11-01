# LifeOS / Aven — Milestone B4
# Master Implementation Plan V1.0.0
**Project:** LifeOS Adaptive Personal Operating System  
**AI Companion:** Aven  
**Architectural Phase:** Milestone B4 — Autonomous Proactive Orchestration & Closed-Loop Adaptive Execution (APO-CLAE)  
**Organization:** The Executioners (ExE)  
**Document Revision:** `B4_MASTER_IMPLEMENTATION_PLAN_V1.0.0`  
**Execution Boundary:** RESEARCH AND PLANNING ONLY — IMPLEMENTATION STRICTLY UNAUTHORIZED  

---

## 1. Executive Summary & Architectural Mandate

### 1.1 The Architectural Mandate: APO-CLAE
Milestones B1 through B3 solved three foundational pillars of LifeOS:
- **Milestone B1 (Truth):** Live, user-scoped canonical Personal World Model (`WorldModelBridge`).
- **Milestone B2 (Causality):** Distributed, lease-fenced transactional Outbox, event ordering, and consumer ledger.
- **Milestone B3 (Behavioral Reality):** Authoritative behavioral observation journal, MECE energy and duration calculators, Bayesian cadence learning, and empirical schedule constraint enforcement.

However, despite these advances, LifeOS remains fundamentally **turn-bound and passive**. Aven only exists when the user types or speaks into a client. If the user oversleeps, enters a high-fatigue state, deviates from an optimal cadence window, or falls behind on a multi-day goal, LifeOS remains completely silent. Furthermore, while task completion and gym logging pass through the B2 Outbox, core mutations (creating tasks, updating tasks, rescheduling calendar occurrences, creating goals) completely bypass the Outbox pipeline, leaving the causal graph fragmented.

**Milestone B4 establishes the fourth pillar: Autonomous Proactive Orchestration & Closed-Loop Adaptive Execution (APO-CLAE).**

B4 transforms Aven from a reactive conversational assistant into an **autonomous, continuously operating, closed-loop companion** that:
1. **Operates Continuously:** Executes distributed, lease-fenced autonomous heartbeat evaluation cycles in the background without requiring user prompt turns.
2. **Maintains Universal Causality:** Closes all causal loopholes across all entity mutations (`Task`, `Goal`, `TemporalOccurrence`, `Habit`, `Signal`) so that every lifecycle change is durably published through the B2 transactional outbox.
3. **Acts in a Closed Loop:** Evaluates user state, behavioral profiles, and circadian cadence to autonomously propose interventions, reschedule conflicting commitments, or trigger Stage 4 DAG workflows.
4. **Governs Consequential Actions Safely:** Implements cryptographic HMAC-signed Human-In-The-Loop (HITL) approval barriers for consequential actions, while executing non-consequential micro-optimizations autonomously.
5. **Streams Reactively Across Surfaces:** Pushes proactive interventions and real-time state deltas across Web, Mobile, and Ambient surfaces via a resilient, acknowledged real-time event pipeline.

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
4. **Zero Open-Loop Interventions:** Interventions must be recorded in durable persistence (`ProactiveActionLogModel`) before delivery, tracking outcome, feedback, and user response to close the learning loop.
5. **Backward Compatibility:** All existing HTTP API routes, conversational chat endpoints, and database models must remain 100% operational with zero breaking schema mutations.

---

## 3. The Missing Core Capability: From Turn-Bound Passive Assistant to Continuously Operating Companion

### 3.1 The Passive Turn-Bound Paradox
Prior to Milestone B4, LifeOS's interaction loop is strictly master-slave:
$$\text{User Event (HTTP/Chat)} \longrightarrow \text{Kernel Hydration} \longrightarrow \text{Supervisor Turn} \longrightarrow \text{Response Stream}$$

If the user is inactive for 14 hours:
- No telemetry is evaluated against behavioral baselines.
- No overdue tasks are flagged or restructured.
- Morning wake-up briefings are not synthesized or pre-computed.
- Focus blocks in optimal circadian windows are lost to procrastination.

### 3.2 The Closed-Loop Adaptive Transformation
Milestone B4 introduces a background autonomous evaluation heartbeat:
$$\text{Temporal Heartbeat (Leased)} \longrightarrow \text{World & Cadence Delta Eval} \longrightarrow \text{Cost & Policy Gate} \longrightarrow \text{Autonomous Action / HITL Card} \longrightarrow \text{Outcome Journaling}$$

This closes the loop: user behavior shapes the behavioral profile; the behavioral profile guides background schedule optimization; background actions adapt the user's daily reality; and user interaction with those adaptations feeds back into the observation journal.

---

## 4. Target Architecture: APO-CLAE Overview

The APO-CLAE architecture comprises five integrated subsystems:

```
                                  ┌────────────────────────────────────────┐
                                  │      Universal Causal Outbox           │
                                  │  (Tasks, Goals, Schedule, Signals)     │
                                  └───────────────────┬────────────────────┘
                                                      │ Causal Events
                                                      ▼
┌────────────────────────┐        ┌────────────────────────────────────────┐
│  Temporal Heartbeat    │        │       Autonomous Execution Daemon      │
│  (Distributed Leased)  ├───────►│  - Evaluates Cadence & World Model     │
└────────────────────────┘        │  - Triggers Autonomy Policy Manager    │
                                  │  - Evaluates Interruption Cost         │
                                  └───────────────────┬────────────────────┘
                                                      │
                       ┌──────────────────────────────┴──────────────────────────────┐
                       │                                                             │
                       ▼ Non-Consequential                                           ▼ Consequential (HITL)
        ┌─────────────────────────────┐                               ┌─────────────────────────────┐
        │  Autonomous Action Engine   │                               │    HITL Proposal Engine     │
        │  - Auto-reschedule overdue  │                               │  - Generate HMAC Token      │
        │  - Pre-warm morning brief   │                               │  - Multi-Surface Push Card  │
        │  - Stage 4 DAG Execution    │                               │  - Await User Ack/Override  │
        │  - Stage 3 Verification     │                               └──────────────┬──────────────┘
        └──────────────┬──────────────┘                                              │ User Approval
                       │                                                             │
                       └──────────────────────────────┬──────────────────────────────┘
                                                      │
                                                      ▼
                                      ┌───────────────────────────────┐
                                      │   Durable Action & Outcome    │
                                      │    Journal (Proactive Log)    │
                                      └───────────────────────────────┘
```

---

## 5. Universal Causal Outbox Closure Specification

### 5.1 The Causal Gap
Currently, only `/api/tasks/complete`, `/api/gym/session`, and `/api/signals/log` route through `OutboxStorageService`. The remaining core entity mutations write directly to MongoDB collections without publishing events.

### 5.2 Outbox Closure Protocol
All domain writes must be wrapped in `OutboxStorageService.persistWithStandaloneFencing`:
1. **Task Lifecycle:**
   - `task.created`: Emitted upon `POST /api/tasks/create` and `DefaultActionAdapters.create_task`.
   - `task.updated`: Emitted upon `PATCH /api/tasks/update` and `DefaultActionAdapters.update_task`.
   - `task.deleted`: Emitted upon `DELETE /api/tasks/delete` and `DefaultActionAdapters.delete_task`.
2. **Goal Lifecycle:**
   - `goal.created`: Emitted upon `POST /api/goals/create` and `DefaultActionAdapters.create_goal`.
   - `goal.updated`: Emitted upon `PATCH /api/goals/update` and milestone progression.
3. **Temporal Schedule Lifecycle:**
   - `temporal.occurrence_created`: Emitted upon calendar block creation.
   - `temporal.occurrence_rescheduled`: Emitted upon schedule reorganization, conflict resolution, or solver execution.
4. **Autonomous Lifecycle:**
   - `autonomous.cycle_evaluated`: Emitted upon completion of a background evaluation cycle.
   - `autonomous.intervention_triggered`: Emitted when an intervention is dispatched.
   - `autonomous.action_executed`: Emitted when an autonomous action finishes verification.

### 5.3 Causal Sequence Generation
Every entity uses the standard B2 causal sequence formula:
$$\text{causalSequence} = \text{aggregateVersion} \times 1000 + \text{eventOrdinal}$$
Cross-aggregate tracking across the consumer ledger maintains `[aggregateType, aggregateId, lastProcessedSequence]`.

---

## 6. Durable Autonomous Execution Daemon Specification

### 6.1 Daemon Lifecycle & Architecture
The daemon operates as an autonomous background worker running within the server process (or dedicated worker container):
- **Tick Interval:** Configurable default: 60,000ms (1 minute).
- **Lease Ownership:** Distributed lease stored in MongoDB `autonomous_execution_leases`.
- **Lease Duration (TTL):** 90,000ms.
- **Heartbeat Refresh:** Every 30,000ms while active.
- **Fenced Execution:** Every cycle checks lease epoch/token to prevent split-brain execution across multiple server instances.

### 6.2 Lease State Machine & Atomic Acquisition
```
       ┌──────────────┐
       │     IDLE     │
       └──────┬───────┘
              │ Atomic findOneAndUpdate(status == EXPIRED || EXPIRED_AT < NOW)
              ▼
       ┌──────────────┐
       │   ACQUIRED   │ ──(Heartbeat refresh every 30s)
       └──────┬───────┘
              │
      ┌───────┴───────┐
      ▼               ▼
┌───────────┐   ┌───────────┐
│ COMPLETED │   │  CRASHED  │ (Lease expires via TTL; next worker recovers)
└───────────┘   └───────────┘
```

### 6.3 Autonomous Evaluation Loop Protocol
For each active user:
1. **Lease Guard:** Acquire user-scoped autonomous execution lease.
2. **State Hydration:** Hydrate `PersonalWorldModel` (B1), `BehavioralProfile` (B3), `CadenceProfile` (B3).
3. **Cadence Phase Detection:** Compute current hour-of-week, circadian energy curve, and user cognitive state.
4. **Policy & Interruption Evaluation:**
   - Check user mode (Do Not Disturb, Focus Block, Sleep, Idle).
   - Evaluate `AutonomyPolicyManager` (is intervention permitted?).
   - Evaluate `InterruptionCostEvaluator` (is cognitive cost $< \text{threshold}$?).
5. **Rule & Strategy Evaluation:**
   - *Morning Briefing:* Wake detected $\land$ brief not generated today $\to$ Generate brief.
   - *Schedule Drift:* Task overdue $> 30\text{m} \land$ active focus block $\to$ Propose auto-reschedule.
   - *Energy Misalignment:* High-cognitive task scheduled during low-energy cadence trough $\to$ Propose realignment.
   - *Backlog Hygiene:* Uncompleted tasks from prior day $\to$ Triage or defer.
6. **Execution / Dispatch:**
   - If non-consequential $\to$ Execute directly via `IterativeAgencyEngine` or `DefaultActionAdapters` and record in `ProactiveActionLogModel`.
   - If consequential $\to$ Create `AutonomousInterventionModel` with HMAC token and dispatch to multi-surface event stream.
7. **Release / Refresh Lease:** Update lease heartbeat and record cycle completion.

---

## 7. Closed-Loop Adaptive Policy & Interruption Management

### 7.1 Durable Proactive Action Journal (`ProactiveActionLogModel`)
Replaces the volatile in-memory `Map<string, IProactiveActionLog>` with an ACID-compliant MongoDB collection.
- **Compound Indexes:** `[userId, actionType, timestamp]`, `[userId, cooldownKey, timestamp]`.
- **Rate-Limiting Invariants:**
  - Maximum 3 proactive interventions per 4-hour window.
  - Minimum 45-minute cooldown between non-urgent interventions.
  - Hard suppression during active Focus Blocks (unless classification is `CRITICAL_INTERRUPT`).

### 7.2 Interruption Cost Formula
The interruption cost $C_{\text{interrupt}} \in [0.0, 1.0]$ is computed deterministically:
$$C_{\text{interrupt}} = w_1 \cdot (1 - \text{CognitiveState}) + w_2 \cdot \text{InFocusBlock} + w_3 \cdot \text{RecentInterventionPenalty} + w_4 \cdot \text{CircadianDowntime}$$
An intervention is rejected if $C_{\text{interrupt}} > \text{MaxAllowedCost}(\text{InterventionPriority})$.

---

## 8. Autonomous Workflow Orchestration & Verification Bridge

### 8.1 Headless Autonomous Execution Bridge
When the background daemon determines that a multi-step adaptation is required (e.g. restructuring an entire day's schedule after a 2-hour flight delay):
1. Instantiates `DynamicWorkflowPlanner` with synthetic user context and goal: `"Rebalance schedule post-delay"`.
2. Creates an `ExecutionWorkspaceModel` in background execution mode (`mode: 'autonomous'`).
3. Executes nodes deterministically through `FastPathExecutor` and `DefaultActionAdapters`.
4. Passes generated state to Stage 3 `OutcomeVerificationEngine`.
5. Only upon `verification.passed === true` are the mutations committed to the database and outbox.

---

## 9. Multi-Surface Notification & Reactive Real-Time Streaming

### 9.1 Unified Reactive Event Stream
Provides a single, durable, authenticated real-time stream (`/api/aven/stream/reactive` via Server-Sent Events / WebSockets):
- Emits real-time state deltas (`intervention.proposed`, `task.mutated`, `briefing.ready`, `schedule.updated`).
- Requires client heartbeat acknowledgment (`/api/aven/stream/ack`).
- Tracks surface presence (`desktop_web`, `mobile_app`, `ambient_display`).

### 9.2 Human-In-The-Loop (HITL) Interactive Cards
Consequential actions (rescheduling >2 tasks, deleting commitments, contacting external parties) generate an `AutonomousInterventionCard`:
- **Card Data:** `interventionId`, `title`, `rationale`, `proposedActions`, `expiresAt`, `hmacSignature`.
- **HMAC Signature:** $\text{HMAC-SHA256}(\text{userId} + \text{interventionId} + \text{actionsHash}, \text{SECRET})$. Prevents client-side tampering of action payloads.
- **Action Buttons:** `[Accept]`, `[Modify]`, `[Reject]`.
- **Timeout Fallback:** If unacknowledged within `expiresAt` (default 30 mins), the intervention automatically expires or reverts to safe default behavior.

---

## 10. Security, Concurrency, and Isolation Guarantees

1. **Distributed Lease Fencing:** MongoDB atomic operators (`findOneAndUpdate` with `$lt` on lease expiration) guarantee strictly one active daemon worker per user at any given millisecond.
2. **HMAC Cryptographic Validation:** All user approvals of autonomous proposals are validated against an HMAC token before execution.
3. **Idempotency Keys:** Every autonomous action carries an `idempotencyKey = "auto:" + userId + ":" + cycleId + ":" + actionOrdinal`. Prevents double execution on crash recovery.
4. **Tenant Isolation:** All queries, subscriptions, outbox events, and action logs require an exact match on `userId`.

---

## 11. Backward Compatibility & Non-Breaking Invariants

1. **Zero Database Drops / Breaking Migrations:** New collections (`autonomous_execution_leases`, `proactive_action_logs`, `autonomous_interventions`) are strictly additive.
2. **Existing APIs Untouched:** `/api/tasks/*`, `/api/calendar/*`, `/api/aven/chat` retain identical request/response signatures.
3. **Graceful Degradation:** If the autonomous daemon is disabled or MongoDB leases are locked, LifeOS functions identically to Milestone B3 (fully operational reactive mode).

---

## 12. Data Model & Schema Specifications

### 12.1 `AutonomousExecutionLeaseModel` (`autonomous_execution_leases`)
```typescript
export interface IAutonomousExecutionLease {
  userId: string;
  workerId: string;
  leaseEpoch: number;
  acquiredAt: Date;
  expiresAt: Date;
  heartbeatAt: Date;
  status: 'ACTIVE' | 'RELEASED' | 'EXPIRED';
  metadata?: Record<string, unknown>;
}
// Indexes:
// { userId: 1 }, unique
// { expiresAt: 1 }, expireAfterSeconds: 0 (TTL)
```

### 12.2 `ProactiveActionLogModel` (`proactive_action_logs`)
```typescript
export interface IProactiveActionLog {
  userId: string;
  actionId: string;
  actionType: 'MORNING_BRIEFING' | 'SCHEDULE_REALIGNMENT' | 'OVERDUE_NUDGE' | 'FATIGUE_INTERVENTION' | 'HABIT_PROMPT';
  cooldownKey: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PROPOSED' | 'DELIVERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'EXECUTED';
  interruptionCost: number;
  payload: Record<string, unknown>;
  userResponse?: 'ACCEPTED' | 'DISMISSED' | 'MODIFIED';
  executedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
// Indexes:
// { userId: 1, cooldownKey: 1, createdAt: -1 }
// { userId: 1, actionType: 1, createdAt: -1 }
// { userId: 1, status: 1 }
```

### 12.3 `AutonomousInterventionModel` (`autonomous_interventions`)
```typescript
export interface IAutonomousIntervention {
  userId: string;
  interventionId: string;
  title: string;
  description: string;
  rationale: string;
  actions: Array<{
    actionType: string;
    payload: Record<string, unknown>;
  }>;
  requiresHITL: boolean;
  hmacSignature: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'EXECUTED';
  expiresAt: Date;
  createdAt: Date;
}
// Indexes:
// { userId: 1, interventionId: 1 }, unique
// { userId: 1, status: 1, expiresAt: 1 }
```

---

## 13. Causal Event Schema Additions

The B2 Outbox system will now capture the following events across all domain mutations:
- `task.created`: `{ taskId, title, priority, estimatedDuration, energyCost, dueDate }`
- `task.updated`: `{ taskId, changes: { status, priority, estimatedDuration } }`
- `task.deleted`: `{ taskId }`
- `goal.created`: `{ goalId, title, targetDate, category }`
- `goal.updated`: `{ goalId, progressDelta, status }`
- `temporal.occurrence_created`: `{ occurrenceId, title, startTime, endTime, isFocusBlock }`
- `temporal.occurrence_rescheduled`: `{ occurrenceId, oldStart, newStart, oldEnd, newEnd, reason }`
- `autonomous.cycle_evaluated`: `{ cycleId, durationMs, evaluationsCount, actionsTriggered }`
- `autonomous.intervention_triggered`: `{ interventionId, actionType, requiresHITL }`
- `autonomous.action_executed`: `{ actionId, actionType, success, verificationPassed }`

---

## 14. The Four Work Packages (WP1 — WP4)

### Work Package 1: Universal Causal Outbox Closure & Event Graph Completion
- **Scope:** Route all entity mutations (`Task`, `Goal`, `TemporalOccurrence`, `Habit`) through `OutboxStorageService.persistWithStandaloneFencing`.
- **Deliverables:**
  - Update `packages/execution-kernel/src/iterative/DefaultActionAdapters.ts` (`create_task`, `update_task`, `delete_task`, `create_goal`, `schedule_occurrence`).
  - Update Web API routes (`tasks/create`, `tasks/update`, `calendar/mutate`, `goals/create`).
  - Author and register causal schemas in `CausalConsumerRegistry`.

### Work Package 2: Leased Autonomous Execution Daemon & Temporal Heartbeat
- **Scope:** Implement the distributed, lease-locked background evaluation engine and durable action logging.
- **Deliverables:**
  - Create `AutonomousExecutionLeaseModel` and `ProactiveActionLogModel`.
  - Implement `AutonomousExecutionDaemon` with atomic lease acquisition, TTL heartbeat, and recovery logic.
  - Implement `TemporalHeartbeatService` running recurring evaluation ticks across active users.

### Work Package 3: Closed-Loop Adaptive Policy & Dynamic Re-planning Engine
- **Scope:** Connect B1 World Model and B3 Behavioral/Cadence Profiles to autonomous decision-making.
- **Deliverables:**
  - Upgrade `ProactivePolicyDaemon`, `AutonomyPolicyManager`, and `InterruptionCostEvaluator` to use durable persistence.
  - Implement adaptive intervention strategies: Morning Briefing Auto-Generation, Overdue Schedule Re-balancer, Circadian Energy Alignment.
  - Implement Headless Autonomous Workflow Bridge connecting to `DynamicWorkflowPlanner` and `OutcomeVerificationEngine`.

### Work Package 4: Multi-Surface Delivery, HITL Governance & Verification
- **Scope:** Deliver interventions to Web/Mobile/Ambient surfaces with cryptographic HITL gating and verification.
- **Deliverables:**
  - Implement `AutonomousInterventionModel` with HMAC generation and validation.
  - Implement reactive real-time SSE stream endpoint (`/api/aven/stream/reactive`) with client acknowledgment ledger.
  - Create interactive HITL intervention card UI components.
  - Complete 100% end-to-end verification battery covering all 10 failure scenarios.

---

## 15. The Eight Engineering Loops (Loops 1 — 8)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              THE 8 ENGINEERING LOOPS                                   │
│                                                                                        │
│  [Loop 1: Outbox Event Completion] ────────► [Loop 2: Domain Adapter Wiring]           │
│                         │                                      │                       │
│                         ▼                                      ▼                       │
│  [Loop 3: Distributed Lease & Daemon] ────► [Loop 4: Durable Action Logging]           │
│                         │                                      │                       │
│                         ▼                                      ▼                       │
│  [Loop 5: Closed-Loop Policy Strategies] ──► [Loop 6: Autonomous Workflow Bridge]      │
│                         │                                      │                       │
│                         ▼                                      ▼                       │
│  [Loop 7: Reactive Multi-Surface Stream] ─► [Loop 8: HITL Governance & E2E Battery]    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Loop 1:** Universal Outbox Event Schemas & Causal Registry Extension.
- **Loop 2:** Adapter and API Route Outbox Closure (`Task`, `Goal`, `Schedule`).
- **Loop 3:** Distributed Lease Lock & Autonomous Heartbeat Daemon Core.
- **Loop 4:** Durable Action Log Persistence & Interruption Cost Engine.
- **Loop 5:** Closed-Loop Adaptive Strategies (Briefing, Re-balancing, Energy Match).
- **Loop 6:** Headless Autonomous DAG Execution & Stage 3 Outcome Verification Bridge.
- **Loop 7:** Multi-Surface Reactive Event Stream & Presence Tracking.
- **Loop 8:** Cryptographic HITL Governance & 10-Scenario Failure Verification Battery.

---

## 16. Definition of Done & Success Criteria

Milestone B4 will be formally certified as complete when:
1. **100% Causal Coverage:** Zero entity mutations bypass the Outbox. Every creation, update, and deletion produces a verified causal event.
2. **Lease Fencing Reliability:** Distributed lease lock handles concurrent instances without duplicate execution or split-brain cycles.
3. **Crash Recovery Resilience:** Background daemon recovers within 90 seconds of process termination with zero double-execution of actions.
4. **Durable Intervention History:** 100% of proactive decisions and user feedback are stored in MongoDB; zero in-memory volatility.
5. **HMAC Integrity:** No consequential action can be triggered without a valid HMAC signature.
6. **Full Test Battery Passing:** All newly authored B4 tests pass, and zero regressions occur across B1 (33/33), B2 (42/42), and B3 (41/41) test suites.

