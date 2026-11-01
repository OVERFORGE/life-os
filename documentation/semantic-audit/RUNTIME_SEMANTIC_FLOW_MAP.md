# LIFEOS — RUNTIME SEMANTIC FLOW MAP
## Production Execution Paths, Decision Points, Hardcoding Interceptors & Disconnected Subsystems

**Project:** LifeOS / Aven  
**Organization:** The Executioners (ExE)  
**Audit Scope:** Stages 1–4, Milestones B1–B4  
**Status:** COMPLETE AUDIT DOCUMENT  
**Mode:** Architectural Call-Graph and Flow-Tracing  

---

## 1. Executive Summary

This document maps the real, production-active call paths through LifeOS from **User Ingress** to **Persistence**. It traces:
1. Exactly where semantic intelligence is computed.
2. Exactly where regex and keyword interceptors short-circuit or distort execution.
3. Where hardcoded fallbacks and heuristics substitute for genuine reasoning.
4. Where dead, legacy, or disconnected code paths exist.

---

## 2. Global Execution Architecture Diagram

```
+─────────────────────────────────────────────────────────────────────────────────────────────────+
| USER INGRESS GATES                                                                              |
|                                                                                                 |
|   [Web Client / Voice UI / Chat]                     [Headless Surface / UI Widgets / Watch]    |
|                 │                                                       │                       |
|                 ▼                                                       ▼                       |
|       POST /api/conversation                                  POST /api/kernel/dispatch         |
|                 │                                                       │                       |
|                 ▼                                                       ▼                       |
|   LifeOSApplication.conversation.executeUserRequest         translateEnvelopeToProposal         |
|                 │                                                       │                       |
|                 ▼                                                       │                       |
|       Supervisor.processRequest                                         │                       |
+─────────────────┼───────────────────────────────────────────────────────┼───────────────────────+
                  │                                                       │
                  ├────────────────────────┐                              │
                  │                        │                              │
                  ▼                        ▼                              │
       [1. Fast-Path Regex Gate]  [2. Canonical Semantic Path]            │
        (FastPathExecutor.ts)      (SemanticIntentInterpreter.ts)         │
                  │                        │                              │
                  │ (canHandle === true)   │ (canHandle === false)        │
                  │                        │                              │
                  │                        ▼                              │
                  │               [Groq LLM Interpretation]               │
                  │               SYSTEM_PROMPT_V2 (Temp 0.0)             │
                  │                        │                              │
                  │                        ▼                              │
                  │               [Authoritative Entity Resolver]         │
                  │               (Pending -> STM Focus -> DB)            │
                  │                        │                              │
                  │                        ▼                              │
                  │               [DynamicRouter.route]                   │
                  │               (Word boundaries & string checks)       │
                  │                        │                              │
                  │         ┌──────────────┼──────────────┐               │
                  │         │              │              │               │
                  │         ▼              ▼              ▼               │
                  │     SINGLE_        MULTI_AGENT    DYNAMIC_            │
                  │    SPECIALIST        ReAct        WORKFLOW            │
                  │         │              │              │               │
                  │         │              │              ▼               │
                  │         │              │      DynamicWorkflowPlanner  │
                  │         │              │      (Hardcoded Benchmarks!) │
                  │         │              │              │               │
                  │         └──────────────┼──────────────┘               │
                  │                        │                              │
                  ▼                        ▼                              ▼
+─────────────────────────────────────────────────────────────────────────────────────────────────+
| SOVEREIGN DETERMINISTIC KERNEL DISPATCH                                                         |
| (KernelCapabilityService / NativeExecutor)                                                      |
|                                                                                                 |
|  1. Ingress Idempotency Check (getAuditRecord)                                                  |
|  2. HITL Governance Gate (Supervisor lines 929-955 hardcoded whitelist vs HITLGovernanceEngine) |
|  3. Transactional MongoDB State Transition (handleCompleteTask, handleCreateTask, etc.)         |
|  4. Authoritative Mutation Receipt Commit (L1 Ring Buffer + L2 Durable Store)                    |
|  5. Outbox Event Commit (OutboxStorageService.insertEvent)                                      |
+──────────────────────────────────────────────────┬──────────────────────────────────────────────+
                                                   │
                                                   ▼
+─────────────────────────────────────────────────────────────────────────────────────────────────+
| BACKGROUND CAUSAL PROPAGATION & LEARNING                                                        |
| (DurableOutboxDispatcher -> WorkerLeaseManager -> Consumers)                                    |
|                                                                                                 |
|  ├─► ExecutionGraphConsumer (Maintains DAG dependencies and task nodes)                         |
|  ├─► GoalIntelligenceConsumer (Calculates progress, velocity, and pressure)                     |
|  ├─► CadenceLearningConsumer (CadenceLearningEngine circular trigonometry & 21-day decay)       |
|  └─► CognitiveHistoryConsumer (Life state and emotional stability tracking)                     |
+─────────────────────────────────────────────────────────────────────────────────────────────────+
```

---

## 3. End-to-End Call Path Analysis

### Path 1: High-Velocity Conversational Ingress (`POST /api/conversation`)

#### Step 1: Ingress & Timezone Normalization
- **File:** `apps/web/app/api/conversation/route.ts` (lines 27–95)
- **Call:** `POST(req)` $\to$ `LifeOSApplication.conversation.executeUserRequest(input)`
- **Data Flow:**
  - Authenticates session via `getAuthSession()`.
  - Extracts `userTimezone` from header `x-timezone`, request body, or `User.settings.timezone`.
  - Sets `referenceTimeMs = Date.now()`.
  - Creates streaming response via `ReadableStreamDefaultController`.

#### Step 2: Supervisor Front Door & Fast-Path Interception
- **File:** `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` (lines 148–199)
- **Code:**
  ```ts
  if (this.fastPath.canHandle(req.message)) {
    const fastResult = await this.fastPath.execute(req.message, req.userId, fastContext);
    if (fastResult.handled) {
      // Direct kernel execution and immediate return!
      return { ... };
    }
  }
  ```
- **Interception Point (`RG-01`, `HC-03`):**
  - Evaluates regexes in `FastPathExecutor.canHandle`.
  - If matched, runs `FastPathExecutor.extractProposal`, which captures raw substrings with regex, assigns `priority: "medium"`, and generates non-idempotent keys with `Date.now()`.
  - Dispatches directly to `KernelCapabilityService.executeAction`.
  - **Result:** Semantic understanding is completely bypassed. The conversation state, short-term memory, and intent interpreter are never invoked.

#### Step 3: Canonical Semantic Interpretation (When Fast-Path Does Not Match)
- **File:** `packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts` (lines 400–890)
- **Code:** `SemanticIntentInterpreter.getInstance().interpret(req.message, context)`
- **Data Flow:**
  - Hydrates short-term memory (`ConversationShortTermMemory`) and active focus.
  - Formulates structured prompt with active schema definitions and user context.
  - Calls Groq API (`llama-3.3-70b-versatile` or configured model) with temperature `0.0`.
  - Validates output against Zod `SemanticTurn` schema.
  - Normalizes temporal dates with `getActiveDate(timezone, 4, refTime)`.
  - **Hardcoded Heuristic Leak (`PM-06`):** Line 872 sets `payload.status = msgLower.includes("skip") ? "SKIPPED" : "CANCELLED"`.
  - Invokes `AuthoritativeEntityResolver.resolveEntity` to match target entities against database state.

#### Step 4: Routing Strategy Classification
- **File:** `packages/execution-kernel/src/orchestration/supervisor/DynamicRouter.ts` (lines 29–120)
- **Code:** `this.router.route(req.message, semanticTurn)`
- **Decision Points:**
  - **Hardcoded String Check (`PM-01`):** Lines 40–42 check:
    ```ts
    const isCompositeWorkflow =
      (lower.includes("summarize") || lower.includes("synthesize") || ...) &&
      (lower.includes("save") || lower.includes("write") || ...);
    ```
  - If structured `semanticTurn` has 2+ domains $\to$ `MULTI_AGENT`.
  - If structured `semanticTurn` has 1 domain $\to$ `SINGLE_SPECIALIST`.
  - **Regex Domain Keyword Fallback (`RG-02`):** Lines 84–86 evaluate `hasProductivity`, `hasHealth`, `hasWellness` with word-boundary regexes.

#### Step 5: Multi-Step Dynamic Workflow Execution
- **File:** `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` (lines 287–330)
- **Code:**
  ```ts
  const isMultiStepGoal =
    routingDecision.strategy === "DYNAMIC_WORKFLOW" ||
    ((req.message.toLowerCase().includes("summarize") || ...) &&
     (req.message.toLowerCase().includes("save") || ...) &&
     (req.message.toLowerCase().includes("email") || ...)); // PM-02
  ```
- **Disaster Point (`HC-01`, `HC-02`):**
  - Line 297 instantiates `const planner = new DynamicWorkflowPlanner();` with **no LLM client**.
  - `planner.planWorkflow()` fails to run model-based planning and calls `generateDeterministicFallback`.
  - If the prompt matches benchmark keywords (`email` + `summarize` + `write`), it returns a hardcoded 3-step plan (`productivity.email.search_messages` $\to$ `synthesis` $\to$ `productivity.storage.write_file`).
  - If it does not match the two hardcoded benchmarks, it throws `[PLANNING_FAILED]`!

#### Step 6: HITL Governance Check & Execution
- **File:** `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` (lines 906–960)
- **Code:** Evaluates each operation before dispatching to kernel.
- **Interception Point (`PM-04`):**
  - Lines 929–950 evaluate `isReadOperation` using a 22-line list of `.includes(...)` strings.
  - If not in the whitelist, treated as a write mutation and intercepted for human confirmation.
  - Dispatches approved operations to `KernelCapabilityService.executeAction`.
  - Appends turn to conversation history and triggers asynchronous memory formation via `DurableMemoryJobQueue`.

---

### Path 2: Headless Surface Action Ingress (`POST /api/kernel/dispatch`)

- **File:** `apps/web/app/api/kernel/dispatch/route.ts` (lines 17–151)
- **Call Path:** `POST(req)` $\to$ `translateEnvelopeToProposal(envelope)` $\to$ `KernelCapabilityService.executeAction(proposal)`
- **Characteristics:**
  - Bypasses all NLP layers (designed for direct UI interaction, such as clicking "Complete Task" on a dashboard widget).
  - Enforces idempotency via `kernel.getAuditRecord(envelope.idempotencyKey)`.
  - Translates `SurfaceActionType` to canonical `ActionProposal`.
  - Executes deterministically in the sovereign kernel.
  - Computes and returns fresh authoritative surface projection (`fetchAuthoritativeSurfaceProjection`).
- **Audit Assessment:** **Compliant and deterministic.** Operates through explicit typed envelopes.

---

### Path 3: Background Causal Event Processing

- **Pipeline:**
  1. Kernel mutation saves entity to MongoDB and creates an `OutboxEventModel` record inside the same logical boundary.
  2. `DurableOutboxDispatcher.ts` polls for pending events.
  3. `WorkerLeaseManager.ts` acquires leases using atomic CAS and monotonic generation increments (`leaseGeneration: +1`).
  4. Events are dispatched to registered consumers in `ConsumerRegistry.ts`:
     - `CadenceLearningConsumer.ts`: Extracts duration and title (`PM-07`), invokes `CadenceLearningEngine.deriveDayCadenceProfiles()` with circular math, and writes to `CadenceProfileRepository`.
     - `GoalIntelligenceConsumer.ts`: Recalculates velocity and goal pressure.
     - `ExecutionGraphConsumer.ts`: Updates execution graph nodes and unblocks downstream tasks.
  5. Upon success, outbox status is updated to `DELIVERED`. If lease generation does not match, acknowledgment is rejected.
- **Audit Assessment:** **Causally sound and deterministic.**

---

### Path 4: Autonomous Daemon & Proactive Interventions

- **Pipeline:**
  1. `AutonomousExecutionDaemon.ts` runs on a scheduled interval.
  2. Acquires lease via `AutonomousLeaseManager.ts`.
  3. Evaluates strategies (`CircadianEnergyAlignmentStrategy`, `ScheduleRebalancerStrategy`, etc.).
  4. Heuristic thresholds evaluate state:
     - Peak hour check (`now.getHours()`, leaking server timezone).
     - Static score assignments (`0.88`, `0.90`).
  5. If candidate action requires human approval:
     - `HITLGovernanceEngine.ts` constructs an HMAC-SHA256 signature and stores `AutonomousInterventionModel`.
     - Pushes proactive alert via SSE stream (`sendEvent({ type: "proactive_intervention", ... })`).
  6. When user approves:
     - `HITLGovernanceEngine.respondIntervention` validates HMAC signature using `crypto.timingSafeEqual` and executes atomic CAS state update.
- **Audit Assessment:** **Cryptographically and causally sound, but burdened with static scoring heuristics in strategies.**

---

## 4. Dead, Deprecated, and Disconnected Code Subsystems

The following components were audited and found to be disconnected or legacy remnants that create architectural confusion:

```
+─────────────────────────────────────────────────────────────────────────────+
| DISCONNECTED & LEGACY SUBSYSTEMS                                            |
|                                                                             |
| 1. toolRouter.ts (packages/execution-kernel/src/dispatch/toolRouter.ts)     |
|    - Contains shouldCallTool(intent: string) with 4 hardcoded intents.      |
|    - ZERO active references anywhere in the repository.                      |
|    - Status: DEAD CODE.                                                     |
|                                                                             |
| 2. intentRouter.ts (packages/execution-kernel/src/dispatch/intentRouter.ts) |
|    - Pre-Phase 9 Groq classifier with 8-intent enum.                        |
|    - Explicitly marked @deprecated; referenced only by legacy tests.        |
|    - Status: DEPRECATED / INACTIVE.                                         |
|                                                                             |
| 3. intentModel.ts (packages/execution-kernel/src/reasoning/intentModel.ts)  |
|    - Legacy 13-intent enum classifier.                                      |
|    - Explicitly marked @deprecated; referenced only by B4 test mocks.       |
|    - Status: DEPRECATED / INACTIVE.                                         |
|                                                                             |
| 4. actionExtractor.ts (packages/execution-kernel/src/dispatch/)             |
|    - Contains diet regexes and explicit rule forbidding custom signals.     |
|    - Still referenced by legacy NativeExecutor and PlanMapper.              |
|    - Status: DANGEROUS LEGACY COMPONENT.                                    |
+─────────────────────────────────────────────────────────────────────────────+
```

---

## 5. Summary of Critical Interception Points

1. **Front-Door Interception (`RG-01`):** `FastPathExecutor` captures user commands before the semantic interpreter or short-term memory can run.
2. **Prose Action Coercion (`PM-03`):** `Supervisor` inspects LLM assistant prose for keywords (`class`, `schedule`, `block`) to change the underlying mutation type.
3. **Hardcoded Governance Whitelist (`PM-04`):** `Supervisor` evaluates tool permissions with a static string list instead of reading `CapabilityRegistry` contracts.
4. **Planning Disconnection (`HC-01`, `HC-02`):** `DynamicWorkflowPlanner` runs without an LLM client in production, falling back to static benchmark scripts.

