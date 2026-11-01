# LIFEOS — DETERMINISM AND REPLAY AUDIT
## Verification of Boundaries, Causal Consistency, Idempotency & Clock Integrity

**Project:** LifeOS / Aven  
**Organization:** The Executioners (ExE)  
**Audit Scope:** Stages 1–4, Milestones B1–B4  
**Status:** COMPLETE AUDIT REPORT  
**Mode:** Architectural Verification, Invariant Analysis, and Boundary Inspection  

---

## 1. Executive Summary

A core architectural principle of LifeOS is:
> *"The kernel provides truth. Agents provide intelligence."*

This architecture requires a strict, unbreachable boundary between:
1. **Probabilistic Semantic Understanding:** The LLM and reasoning layer that interprets messy, natural-language human intent.
2. **Deterministic Kernel Execution:** The state machine, capability dispatchers, transaction managers, and outbox consumers that execute state transitions idempotently, causally, and deterministically.

This audit evaluates whether this boundary is respected, whether kernel transitions are reproducible and replayable, and identifies critical points of leakage where nondeterminism or broken idempotency threatens system integrity.

---

## 2. The Architectural Boundary: Where Intelligence Ends and Truth Begins

```
+---------------------------------------------------------------------------------------------------+
| PROBABILISTIC INTELLIGENCE LAYER                                                                  |
| (LLM, Embeddings, Semantic Turn, Persona)                                                         |
|                                                                                                   |
|  User Input (Natural Language)                                                                    |
|         │                                                                                         |
|         ▼                                                                                         |
|  SemanticIntentInterpreter (Groq LLM / Temperature 0.0)                                           |
|         │                                                                                         |
|         ▼                                                                                         |
|  Raw SemanticTurn (Operations, Ambiguity Flag, Confidence)                                       |
+---------------------------------------------------------------------------------------------------+
                                          │
                                          ▼
+---------------------------------------------------------------------------------------------------+
| STRUCTURAL VALIDATION & RESOLUTION GATE (Deterministic Gatekeeper)                                |
|                                                                                                   |
|  1. AuthoritativeEntityResolver (Precedence: Pending -> STM Focus -> DB Exact Match)              |
|  2. PlanValidator / Kahn's Topological Sort (Cycle detection, depth <= 5, step count <= 15)       |
|  3. ActionPayloadSchema Validation (Zod Schema type, range, and format enforcement)               |
|  4. CapabilityRegistry Contract Verification (RFC 8785 JCS contractHash check)                   |
+---------------------------------------------------------------------------------------------------+
                                          │  Output: Formally Validated ActionProposal
                                          ▼
+---------------------------------------------------------------------------------------------------+
| SOVEREIGN DETERMINISTIC KERNEL (Milestones B1-B4)                                                  |
|                                                                                                   |
|  KernelCapabilityService / NativeExecutor                                                         |
|         │                                                                                         |
|         ├─► Idempotency Ingress Gate (Monotonic token check)                                      |
|         ├─► State Precondition Verification (Version & existence checks)                          |
|         ├─► Transactional Mutation (Single-document atomic or DWCP 2-phase)                       |
|         ├─► Transactional Outbox Commit (DurableOutboxDispatcher)                                 |
|         │                                                                                         |
|         ▼                                                                                         |
|  Authoritative Mutation Receipt (L1 Ring Buffer + L2 Durable MutationReceiptModel)                |
|         │                                                                                         |
|         ▼                                                                                         |
|  Causal Event Dispatch (WorkerLeaseManager with monotonic leaseGeneration fencing)                |
|         │                                                                                         |
|         ▼                                                                                         |
|  Deterministic Chronicle & Projection Invalidation (WorldModelBridge, SurfaceProjection)        |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Boundary Integrity Evaluation

### 3.1 The Canonical Path: Compliant
When requests flow through `SemanticIntentInterpreter` $\to$ `AuthoritativeEntityResolver` $\to$ `KernelCapabilityService`:
- The LLM's non-deterministic text generation is forced into a strict Zod-validated JSON schema (`SemanticTurn`).
- Unresolved entity names (e.g. `"that task"`) are resolved against canonical MongoDB IDs via `AuthoritativeEntityResolver`.
- Ambiguity halts execution (`ambiguityStatus: "AMBIGUOUS"`), preventing speculative or arbitrary execution.
- Validated proposals enter `KernelCapabilityService.executeAction()`, where state transitions execute deterministically.

### 3.2 The Fast-Path Leakage: NON-COMPLIANT
In `Supervisor.ts` (lines 148–199) and `FastPathExecutor.ts`:
- **The structural validation gate is completely bypassed.**
- Regular expressions extract raw substring captures directly into `ActionProposal` payloads.
- No schema normalization or entity resolution occurs.
- Arbitrary defaults are injected (`priority: "medium"`).
- **Broken Idempotency:** Lines 121, 138, 159, 174, 189 in `FastPathExecutor.ts` generate idempotency keys using:
  ```ts
  idempotencyKey: `fastpath_create_${userId}_${cleanTitle.replace(/\s+/g, "_")}_${Date.now()}`
  ```
  Incorporating `Date.now()` into the idempotency key guarantees that every network retry or replay receives a *different* idempotency key, completely defeating the kernel's idempotency deduplication gate!

---

## 4. Replay and Event Ordering Audit

### 4.1 Causal Event Delivery and Consumer Ordering
- **Mechanism:** `DurableOutboxDispatcher` and `WorkerLeaseManager`.
- **Audit Findings:**
  - `WorkerLeaseManager` uses atomic CAS (`deliveryStatus: "PENDING", $inc: { leaseGeneration: 1 }`) to assign leases to background workers.
  - Workers verify `leaseGeneration` prior to committing acknowledgments. Stalled or partitioned workers cannot overwrite newer leases.
  - Event payloads in `CanonicalEventContracts.ts` preserve monotonic sequence numbers and `causalContext` (`parentEventId`, `correlationId`).
  - Consumers (`CadenceLearningConsumer`, `GoalIntelligenceConsumer`, `ExecutionGraphConsumer`) process events idempotently using the event's `eventId`.

### 4.2 Dual-Write Compensation Protocol (DWCP) Recovery
- **File:** `packages/execution-kernel/src/autonomous/DWCPRecoverySweeper.ts`
- **Audit Findings:**
  - Implements the approved B4 V2.3.0 two-tier receipt architecture:
    1. Checks the aggregate document's L1 ring buffer (`recentMutationReceipts`).
    2. If evicted from L1, queries the durable L2 `MutationReceiptModel` collection.
    3. If absent from both L1 and L2:
       - If `aggregate.version === step.expectedVersion`, the mutation is verified as **definitively unapplied**, and compensation or retry is safely performed.
       - If `aggregate.version > step.expectedVersion`, the step is marked **QUARANTINED** (`detectedVia: "EVICTED_UNKNOWN_ADVANCED_VERSION"`), preventing accidental overwrites.
  - This guarantees that background recovery is 100% deterministic and cannot cause state corruption during worker recovery.

---

## 5. Clock and Timezone Handling Audit

| Subsystem | File Path | Mechanism | Assessment | Flaw / Risk |
| :--- | :--- | :--- | :--- | :--- |
| **API Ingress** | `apps/web/app/api/conversation/route.ts` (lines 66–93) | Headers (`x-timezone`) + DB Settings fallback; passes `referenceTimeMs: Date.now()` | **COMPLIANT** | Properly propagates user timezone and explicit reference timestamp. |
| **Active Date Boundary** | `packages/execution-kernel/src/automation/timeUtils.ts` | `getActiveDate(timezone, dayBoundaryHour = 4)` | **COMPLIANT** | Correctly computes local date with 4 AM circadian boundary offset. |
| **Cadence Learning** | `packages/execution-kernel/src/temporal/cadence/CadenceLearningEngine.ts` | Circular trigonometry modulo 1440 min (`atan2`) | **COMPLIANT** | Continuous math without discrete clock jump errors. |
| **Circadian Strategy** | `packages/execution-kernel/src/autonomous/strategies/CircadianEnergyAlignmentStrategy.ts` | `now.getHours()` (lines 17–18) | **NON-COMPLIANT** | Uses local host system timezone instead of user's timezone! |
| **Schedule Rebalancer** | `packages/execution-kernel/src/autonomous/strategies/ScheduleRebalancerStrategy.ts` | `now.toISOString().slice(0, 10)` (line 70) | **NON-COMPLIANT** | Uses UTC calendar date rather than user's active local date! |

### Specific Timezone Flaws

#### 1. Circadian Strategy Host Time Leakage
- **File:** `packages/execution-kernel/src/autonomous/strategies/CircadianEnergyAlignmentStrategy.ts`
- **Lines:** 17–18
- **Code:**
  ```ts
  const now = input.now ?? new Date();
  const currentHour = (input as any).hour !== undefined ? (input as any).hour : now.getHours();
  ```
- **Flaw:** `now.getHours()` returns the hour in the server process's local timezone (e.g. UTC on AWS, or IST on developer workstation). If the user resides in America/Los_Angeles (UTC-7/8), `currentHour` is completely misaligned with the user's circadian cycle. Peak energy blocks are scheduled at night.
- **Fix:** Must format hour using `Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: userTimezone })`.

#### 2. Schedule Rebalancer UTC Date Leakage
- **File:** `packages/execution-kernel/src/autonomous/strategies/ScheduleRebalancerStrategy.ts`
- **Line:** 70
- **Code:**
  ```ts
  const todayStr = now.toISOString().slice(0, 10);
  const overdueTasks = tasks.filter((t) => t.dueDate && t.dueDate < todayStr && t.status === "pending");
  ```
- **Flaw:** `toISOString().slice(0, 10)` generates a UTC date string. A user at 9:00 PM in California on October 31st will be evaluated against November 1st UTC, causing tasks due today to be incorrectly classified as overdue.
- **Fix:** Use `getActiveDate(userTimezone, 4, now)`.

---

## 6. Uncertainty Representation and Information Loss

| Component | Behavior Under Uncertainty | Violation Type | Architectural Risk |
| :--- | :--- | :--- | :--- |
| **`AuthoritativeEntityResolver.ts`** | Returns `status: "AMBIGUOUS"` with candidates | **None (Compliant)** | Explicit representation of uncertainty to conversational supervisor. |
| **`FastPathExecutor.ts`** | When ID is not matched, returns `null` silently | `FB-02` (Major) | Request falls through without informing user why fast path failed. |
| **`FastPathExecutor.ts`** | Injects `priority: "medium"` | `HC-03` (Critical) | Converts unknown priority into a fabricated default. |
| **`SemanticIntentInterpreter.ts`** | On Groq API failure, returns `CASUAL_DIALOGUE` | `FB-01` (Moderate) | Disguises system outage as casual chatter; drops mutations. |
| **`Supervisor.ts`** | Keyword detection for `"class"`, `"schedule"`, `"block"` | `PM-03` (Critical) | Coerces action types based on prose keywords rather than model confidence. |

---

## 7. Determinism & Replay Verdict

### **Determinism Rating: B (Robust Kernel, Compromised Periphery)**
- **The Core Kernel is Deterministic:** Outbox leasing, DWCP two-tier receipts, topological DAG sorting, and circular cadence calculations are deterministic, idempotent, and replayable.
- **The Periphery Introduces Nondeterminism:** `FastPathExecutor`'s dynamic `Date.now()` idempotency keys, host-timezone clock leakage in autonomous strategies, and keyword-based action type coercion in `Supervisor.ts` inject nondeterminism into what should be an airtight system.

