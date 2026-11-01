# LifeOS / Aven — Milestone B4
# Detailed Implementation Roadmap (V2.2.0 Synchronized)
**Project:** LifeOS Adaptive Personal Operating System  
**AI Companion:** Aven  
**Milestone:** B4 — Autonomous Proactive Orchestration & Closed-Loop Adaptive Execution (APO-CLAE)  
**Document:** `B4_IMPLEMENTATION_ROADMAP.md`  
**Revision:** V2.2.0  
**Execution Boundary:** RESEARCH AND PLANNING ONLY — IMPLEMENTATION STRICTLY UNAUTHORIZED  

---

## 1. Roadmap Architecture & Execution Principles

Milestone B4 is structured across **Four Work Packages** and **Eight Sequential Engineering Loops**. Each loop is an atomic, independently verifiable increment. No loop may proceed until its predecessor passes all unit, integration, and regression checks.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   B4 SEQUENTIAL ROADMAP PIPELINE                                       │
│                                                                                                        │
│  WP1: Universal Outbox Closure                                                                         │
│  [Loop 1: Outbox Event Schemas & Registry] ──► [Loop 2: Domain Adapter & Route Causal Wiring]         │
│                                                               │                                        │
│  WP2: Leased Heartbeat Daemon                                 ▼                                        │
│  [Loop 3: Monotonic Fenced Lease & Daemon] ──► [Loop 4: Durable Action Journal & Cost Engine]          │
│                                                               │                                        │
│  WP3: Closed-Loop Adaptive Engine                             ▼                                        │
│  [Loop 5: Dual-Tier Scheduler & Strategies] ─► [Loop 6: Safe Staging & Authoritative DWCP]             │
│                                                               │                                        │
│  WP4: Multi-Surface Delivery & Verification                   ▼                                        │
│  [Loop 7: Reactive Stream & Monotonic Replay] ─► [Loop 8: HITL Governance & 15-Scenario Battery]       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Loop-by-Loop Implementation Plan

### Loop 1: Universal Outbox Event Schemas & Causal Registry Extension
- **Work Package:** WP1 (Universal Causal Outbox Closure)
- **Objective:** Extend the causal event catalog to include all lifecycle mutations for Tasks, Goals, Temporal Occurrences, and Autonomous cycles.
- **Dependencies:** Milestone B2 `OutboxStorageService.ts`, `CausalConsumerRegistry.ts`.
- **Files to Modify / Create:**
  - `packages/execution-kernel/src/events/schemas/TaskCausalEvents.ts` (New)
  - `packages/execution-kernel/src/events/schemas/GoalCausalEvents.ts` (New)
  - `packages/execution-kernel/src/events/schemas/TemporalCausalEvents.ts` (New)
  - `packages/execution-kernel/src/events/schemas/AutonomousCausalEvents.ts` (New)
  - `packages/execution-kernel/src/events/consumers/CausalConsumerRegistry.ts` (Update: register schemas and validation rules)
- **Step-by-Step Implementation Tasks:**
  1. Define TypeScript interfaces and payload schemas for:
     - `task.created`, `task.updated`, `task.deleted`
     - `goal.created`, `goal.updated`, `goal.deleted`
     - `temporal.occurrence_created`, `temporal.occurrence_rescheduled`
     - `autonomous.cycle_evaluated`, `autonomous.intervention_triggered`, `autonomous.action_executed`
  2. Implement schema validators with strict field validation and zero loose typing.
  3. Register schemas in `CausalConsumerRegistry` with aggregate version numbering.
- **Entry Criteria:** B2 and B3 tests passing (42/42 and 41/41).
- **Exit Criteria:** Unit tests verifying schema serialization, validation, and registration pass with 100% coverage.
- **Test File:** `packages/execution-kernel/src/testing/b4UniversalCausalSchemas.test.ts`.

---

### Loop 2: Domain Adapter and API Route Outbox Closure
- **Work Package:** WP1 (Universal Causal Outbox Closure)
- **Objective:** Rewire all domain mutations across kernel action adapters and web API routes to atomically publish through `OutboxStorageService.persistWithStandaloneFencing`.
- **Dependencies:** Loop 1 completion.
- **Files to Modify / Create:**
  - `apps/web/features/tasks/engine/taskEngine.ts` (Update: wrap `createTask`, `updateTask`, `deleteTask` in `persistWithStandaloneFencing`)
  - `packages/execution-kernel/src/orchestration/kernel/DefaultActionAdapters.ts` (Update: wire `create_task`, `update_task`, `delete_task`, `create_goal`, `delete_goal`, `schedule_occurrence`)
  - `apps/web/app/api/tasks/create/route.ts` (Verify outbox write propagation)
  - `apps/web/app/api/tasks/update/route.ts` (Verify outbox write propagation)
  - `apps/web/app/api/calendar/mutate/route.ts` (Update: outbox transactional wrap)
  - `apps/web/app/api/goals/create/route.ts` (Update: outbox transactional wrap)
- **Step-by-Step Implementation Tasks:**
  1. Refactor `taskEngine.ts` CRUD methods to invoke `OutboxStorageService.persistWithStandaloneFencing` atomically.
  2. Refactor `DefaultActionAdapters.ts` to route domain mutations through `OutboxStorageService`.
  3. Refactor calendar mutation and goal creation handlers to ensure causal sequence compliance (`aggregateVersion * 1000 + ordinal`).
  4. Verify consumer ledger receives and acknowledges events idempotently.
- **Entry Criteria:** Loop 1 certified.
- **Exit Criteria:** Every Task, Goal, and Calendar mutation via API or adapter emits a verified `OutboxEventModel` document with aggregate version increments.
- **Test File:** `packages/execution-kernel/src/testing/b4OutboxClosure.test.ts`.

---

### Loop 3: Distributed Lease Lock & Autonomous Heartbeat Daemon Core
- **Work Package:** WP2 (Leased Autonomous Execution Daemon & Temporal Heartbeat)
- **Objective:** Implement distributed lease locking with safe pre-initialization, MongoDB server-time atomic pipeline CAS, monotonic durable epochs, and commit-boundary fencing validation.
- **Dependencies:** Loop 2 completion.
- **Files to Modify / Create:**
  - `apps/web/server/db/models/AutonomousExecutionLeaseModel.ts` (New: singleton per user, non-resetting `durableEpoch`)
  - `packages/execution-kernel/src/autonomous/AutonomousLeaseManager.ts` (New: `ensureLeaseRecord`, atomic acquisition without upsert, heartbeat renewal, conditional release)
  - `packages/execution-kernel/src/autonomous/FencingToken.ts` (New: token representation and validation logic)
  - `packages/execution-kernel/src/autonomous/AutonomousExecutionDaemon.ts` (New: daemon state machine and worker loop)
- **Step-by-Step Implementation Tasks:**
  1. Author `AutonomousExecutionLeaseModel` schema with `{ userId: 1 }` unique index and NO TTL index on the lease document.
  2. Implement `ensureLeaseRecord(userId)` catching E11000 duplicate key errors cleanly.
  3. Implement `AutonomousLeaseManager.acquireLease` using MongoDB server-time pipeline updates without upsert:
     - Atomically increments `durableEpoch` and assigns `activeEpoch`.
     - Returns `FencingToken`.
  4. Implement commit-boundary fencing check in `OutboxStorageService`:
     - In Replica-Set mode: verifies/locks lease within multi-document ACID transaction.
     - In Standalone mode: verifies lease before mutation and re-verifies post-write with self-compensation.
- **Entry Criteria:** Loop 2 certified.
- **Exit Criteria:** Concurrent workers contending for the same user lease guarantee strictly one winner; stalled workers attempting to commit after expiration are rejected with `FencedOutError`.
- **Test File:** `packages/execution-kernel/src/testing/b4AutonomousLeaseDaemon.test.ts`.

---

### Loop 4: Durable Proactive Action Journal & Interruption Cost Engine
- **Work Package:** WP2 (Leased Autonomous Execution Daemon & Temporal Heartbeat)
- **Objective:** Replace in-memory `Map<string, IProactiveActionLog[]>` with ACID-compliant MongoDB model and author interruption cost evaluator with bounded $[0.0, 1.0]$ range, emergency-only DND bypass, and conservative missing-data semantics.
- **Dependencies:** Loop 3 completion.
- **Files to Modify / Create:**
  - `apps/web/server/db/models/ProactiveActionLogModel.ts` (New: persistent action log)
  - `packages/execution-kernel/src/proactive/ProactiveActionJournal.ts` (New: journal manager with cooldown queries)
  - `packages/execution-kernel/src/proactive/InterruptionCostEvaluator.ts` (Refactor: bounded $[0.0, 1.0]$ formula, strict emergency bypass, conservative `UNKNOWN` handling)
  - `packages/execution-kernel/src/proactive/AutonomyPolicyManager.ts` (Refactor: query durable journal directly)
- **Step-by-Step Implementation Tasks:**
  1. Author `ProactiveActionLogModel` with compound indexes for cooldown checks and user scoping.
  2. Implement `ProactiveActionJournal` providing atomic rate-limiting checks and outcome journaling.
  3. Refactor `InterruptionCostEvaluator` to apply conservative penalty ($0.15$) when `CognitiveState === UNKNOWN`, and enforce quiet hours/focus block hard suppressions with `CRITICAL_EMERGENCY` as the sole bypass tier.
  4. Remove all process-local in-memory maps from `ProactivePolicyDaemon`.
- **Entry Criteria:** Loop 3 certified.
- **Exit Criteria:** Container restarts preserve all cooldowns and action histories; rate-limiting is enforced across distributed instances.
- **Test File:** `packages/execution-kernel/src/testing/b4DurableActionJournal.test.ts`.

---

### Loop 5: Closed-Loop Adaptive Strategies & Dual-Tier Scheduler
- **Work Package:** WP3 (Closed-Loop Adaptive Policy & Dynamic Re-planning Engine)
- **Objective:** Implement Tier 1 lightweight scheduling with adaptive backoff, and connect B1 World Model and B3 Cadence Profiles to concrete autonomous strategies.
- **Dependencies:** Loop 4 completion.
- **Files to Modify / Create:**
  - `packages/execution-kernel/src/autonomous/DualTierScheduler.ts` (New: Tier 1 $<5$ms check + adaptive backoff)
  - `packages/execution-kernel/src/autonomous/strategies/MorningBriefingStrategy.ts` (New)
  - `packages/execution-kernel/src/autonomous/strategies/ScheduleRebalancerStrategy.ts` (New)
  - `packages/execution-kernel/src/autonomous/strategies/CircadianEnergyAlignmentStrategy.ts` (New)
  - `packages/execution-kernel/src/autonomous/AutonomousStrategyRegistry.ts` (New)
- **Step-by-Step Implementation Tasks:**
  1. Implement `DualTierScheduler`: runs lightweight index check; skips full hydration unless evaluation is due or high-priority event arrived.
  2. Implement adaptive backoff after no-op cycles: $15\text{m} \to 30\text{m} \to 60\text{m}$ (resets on domain mutations).
  3. Author `MorningBriefingStrategy`: checks wake time, weather, and schedule; drafts concise morning briefing.
  4. Author `ScheduleRebalancerStrategy` and `CircadianEnergyAlignmentStrategy`.
- **Entry Criteria:** Loop 4 certified.
- **Exit Criteria:** Daemon tick evaluates Tier 1 in $<5$ms; full hydration only occurs when due; strategies produce structured action proposals.
- **Test File:** `packages/execution-kernel/src/testing/b4ClosedLoopStrategies.test.ts`.

---

### Loop 6: Autonomous Workflow Execution & Authoritative Multi-Aggregate DWCP
- **Work Package:** WP3 (Closed-Loop Adaptive Policy & Dynamic Re-planning Engine)
- **Objective:** Implement the 11-step safe staging workflow lifecycle and Durable Workflow Commit Protocol with in-aggregate atomic receipts, anti-overwrite protection, and crash recovery sweeper.
- **Dependencies:** Loop 5 completion.
- **Files to Modify / Create:**
  - `packages/execution-kernel/src/autonomous/AutonomousWorkflowExecutor.ts` (New: implements 11-step lifecycle)
  - `packages/execution-kernel/src/autonomous/models/WorkflowExecutionIntentModel.ts` (New: intent coordinator model)
  - `packages/execution-kernel/src/autonomous/DWCPRecoverySweeper.ts` (New: authoritative recovery sweeper inspecting aggregate receipts)
  - `packages/execution-kernel/src/orchestration/workspace/ExecutionWorkspace.ts` (Update: support isolated staging mode)
  - `packages/execution-kernel/src/orchestration/verification/OutcomeVerificationEngine.ts` (Update: support background semantic assertions)
- **Step-by-Step Implementation Tasks:**
  1. Implement `AutonomousWorkflowExecutor` executing steps 1–11:
     - Plan DAG $\to$ Check safety permissions $\to$ Hydrate state $\to$ Check preconditions $\to$ Stage mutations in scratchpad $\to$ Compute staged state $\to$ Verify Stage 3 invariants $\to$ Revalidate versions & lease epoch $\to$ Atomic commit (Replica-Set transaction or Standalone DWCP) $\to$ Post-commit verification $\to$ Journal outcome.
  2. In DWCP, ensure each aggregate mutation atomically `$push`es an `IWorkflowMutationReceipt` into `recentMutationReceipts`.
  3. Implement `DWCPRecoverySweeper` querying aggregate receipts directly to determine actual applied status and execute conditional inverse compensation with anti-overwrite protection.
- **Entry Criteria:** Loop 5 certified.
- **Exit Criteria:** Multi-step schedule rebalancing runs from start to finish with verified invariant assertions; failed staged workflows leave zero partial database mutations.
- **Test File:** `packages/execution-kernel/src/testing/b4AutonomousWorkflowExecution.test.ts`.

---

### Loop 7: Reactive Multi-Surface Stream & Monotonic Cursor Replay
- **Work Package:** WP4 (Multi-Surface Delivery, HITL Governance & Verification)
- **Objective:** Deliver real-time autonomous interventions to Web, Mobile, and Ambient clients with delivery receipts, monotonic `deliverySeq` cursor replay on reconnect, and surface presence tracking.
- **Dependencies:** Loop 6 completion.
- **Files to Modify / Create:**
  - `apps/web/app/api/aven/stream/reactive/route.ts` (New: SSE endpoint with cursor replay)
  - `apps/web/app/api/aven/stream/ack/route.ts` (New: client ACK endpoint)
  - `apps/web/server/db/models/SurfaceDeliveryReceiptModel.ts` (New: unique index `{ userId: 1, surfaceId: 1, deliverySeq: 1 }`)
  - `packages/execution-kernel/src/surface/SurfacePresenceManager.ts` (New)
- **Step-by-Step Implementation Tasks:**
  1. Implement Server-Sent Events (SSE) route `/api/aven/stream/reactive` supporting authenticated user subscriptions.
  2. Implement client cursor replay: upon connect with `lastAckSeq`, query MongoDB for pending receipts where `deliverySeq > lastAckSeq` and replay in order.
  3. Implement client presence tracking (`desktop_web`, `mobile_app`, `ambient_display`) with 60s silence timeout.
  4. Store delivery receipts and track user dismissal or interaction in `SurfaceDeliveryReceiptModel`.
- **Entry Criteria:** Loop 6 certified.
- **Exit Criteria:** Background interventions stream to connected clients in real time; reconnected clients receive missed interventions; receipts recorded in MongoDB.
- **Test File:** `packages/execution-kernel/src/testing/b4ReactiveSurfaceStream.test.ts`.

---

### Loop 8: Cryptographic HITL Governance & 15-Scenario Failure Verification Battery
- **Work Package:** WP4 (Multi-Surface Delivery, HITL Governance & Verification)
- **Objective:** Implement cryptographic HMAC signature verification, authenticated user session approval, atomic CAS single-use state machine, and execute the comprehensive 15-scenario failure resilience battery.
- **Dependencies:** Loop 7 completion.
- **Files to Modify / Create:**
  - `apps/web/server/db/models/AutonomousInterventionModel.ts` (New: intervention state machine)
  - `packages/execution-kernel/src/autonomous/HITLGovernanceEngine.ts` (New: HMAC generation and validation)
  - `apps/web/app/api/aven/interventions/respond/route.ts` (New: authenticated response route with atomic CAS)
  - `packages/execution-kernel/src/testing/b4EndToEndFailureBattery.test.ts` (New: 15 mandatory failure scenario tests)
- **Step-by-Step Implementation Tasks:**
  1. Implement `HITLGovernanceEngine`: generates `HMAC-SHA256` over canonical payload hash with constant-time verification and key rotation.
  2. Implement `POST /api/aven/interventions/respond`: verifies session auth, matches intervention owner, verifies HMAC, and atomically transitions status `PENDING` $\to$ `ACCEPTED`.
  3. Implement the exhaustive 15-scenario failure test battery (initialization races, lease contention, stale lease rejection, epoch survival, DWCP compensation, aggregate receipt recovery, cost bounds, conservative UNKNOWN suppression, emergency DND bypass, same-timestamp replay, duplicate-safe reconnect, status-change replay, HMAC tampering, unauthorized user rejection, and outbox inventory coverage).
  4. Run full regression battery across B1 (33/33), B2 (42/42), B3 (41/41), and Stage 1–4 (148/148).
- **Entry Criteria:** Loops 1 through 7 certified.
- **Exit Criteria:** All 15 failure tests pass; 100% regression verification across all milestones.
- **Test File:** `packages/execution-kernel/src/testing/b4EndToEndFailureBattery.test.ts`.

---

## 3. Risk Mitigation & Pre-Flight Checklist

| Risk | Probability | Severity | Mitigation Architecture (V2.2.0) |
|---|---|---|---|
| **Stale Lease Holder Commit** | Medium | Critical | Replica-Set transactions check/lock lease document in session. Standalone mode uses pre-commit server-time lock, aggregate epoch guard, and post-write verification with self-compensation. |
| **Monotonic Epoch Reset on TTL** | Low | Critical | Singleton lease document per user; NO TTL index on lease document. Epoch counter never resets. |
| **Crash Mid-DWCP Commit** | Medium | Critical | In-aggregate atomic receipts (`IWorkflowMutationReceipt`) act as sole source of truth; DWCP sweeper queries aggregates directly and applies conditional compensation with anti-overwrite checks. |
| **Partial Database Mutation on Abort** | Medium | Critical | 11-step lifecycle stages all changes in workspace scratchpad. Zero DB writes until Stage 3 invariant verification passes. |
| **HITL Payload Tampering / Replay** | Medium | Critical | Server HMAC-SHA256 signature + user session authentication + atomic CAS state machine transition (`PENDING` $\to$ `ACCEPTED`). |
| **Notification Storm on Container Restart** | Medium | Critical | In-memory maps eliminated; durable `ProactiveActionLogModel` enforces cooldowns across restarts. |
| **Emergency Bypass Misclassification** | Medium | High | `CRITICAL_EMERGENCY` is the sole priority tier permitted to bypass DND/Quiet Hours. Ordinary `HIGH` events are strictly suppressed. |
| **Same-Timestamp Event Replay Loss** | Medium | High | Monotonic 64-bit integer cursor (`deliverySeq`) per user-surface channel eliminates timestamp clustering issues. |
