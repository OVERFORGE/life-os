# LIFEOS — HARDCODING AND PATTERN-MATCHING INVENTORY
## Global Semantic Architecture Audit | Stages 1–4 & B1–B4

**Project:** LifeOS / Aven  
**Organization:** The Executioners (ExE)  
**Audit Scope:** Stages 1–4, Milestones B1–B4  
**Status:** COMPLETE AUDIT INVENTORY  
**Mode:** Research and Source-Level Inspection Only  

---

## 1. Executive Summary & Inventory Classification

This document provides a line-by-line, source-verified accounting of all hardcoded logic, regular expression semantic parsing, keyword/pattern-matching shortcuts, static assumptions, and legacy decision-making mechanisms across the LifeOS repository.

Every finding is categorized according to its architectural violation type:
1. **`RG-xx`**: Regular Expression used for intent detection, entity parsing, or semantic understanding.
2. **`PM-xx`**: Pattern-matching shortcuts (`.includes()`, `startsWith()`, keyword dictionaries, string equality).
3. **`HC-xx`**: Hardcoded behavioral constants, thresholds, arbitrary weights, or static defaults.
4. **`FB-xx`**: Unjustified fallback behaviors, silent information discard, or synthetic default substitutions.
5. **`LG-xx`**: Legacy, deprecated, or disconnected decision engines remaining in the codebase.

### Classification Taxonomy
- **Critical (P0)**: Directly intercepts or replaces semantic understanding in production runtime, violates core architectural invariants, or breaks system adaptability for new user concepts.
- **Major (P1)**: Significantly biases, restricts, or distorts semantic reasoning, or relies on hardcoded heuristics to make decisions that should be derived from contracts or models.
- **Moderate (P2)**: Non-adaptive numerical thresholds or heuristics that should be parameterized, policy-configured, or learned.
- **Minor / Cleanup (P3)**: Dead code, deprecated legacy files, or cosmetic string normalization.
- **Legitimate Invariant (INV)**: Mathematically necessary or governance-mandated guardrails (e.g., cryptographic checks, schema validations).

---

## 2. Regular Expression Semantic Understanding (`RG-xx`)

| Finding ID | File Path | Class / Function | Lines | Classification | Severity | Runtime Call Path |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`RG-01`** | `packages/execution-kernel/src/orchestration/supervisor/FastPathExecutor.ts` | `FastPathExecutor.canHandle` & `extractProposal` | 32–90, 95–215 | Regex Intent & Entity Parser | **CRITICAL** | `POST /api/conversation` → `ConversationService.executeUserRequest` → `Supervisor.processRequest` → `FastPathExecutor.canHandle` |
| **`RG-02`** | `packages/execution-kernel/src/orchestration/supervisor/DynamicRouter.ts` | `DynamicRouter.route` | 84–86 | Regex Domain Classification | **MAJOR** | `Supervisor.processRequest` → `DynamicRouter.route` |
| **`RG-03`** | `packages/execution-kernel/src/memory/EpistemicVerificationEngine.ts` | `EpistemicVerificationEngine.verifyCandidate` | 38–44, 47–53, 77–87, 124–128 | Regex Noise & Importance Filtering | **MAJOR** | `ConversationService.persistTurnAsync` → `DurableMemoryJobQueue` → `MemoryFormationPipeline` → `EpistemicVerificationEngine` |
| **`RG-04`** | `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` | `Supervisor.processRequest` | 701 | Regex Confirmation Detection | **MAJOR** | `Supervisor.processRequest` (Pending Operation confirmation branch) |
| **`RG-05`** | `packages/execution-kernel/src/dispatch/actionExtractor.ts` | `extractActions` | 39, 48 | Regex Entity Metric Extraction | **MAJOR** | Legacy `Dispatcher.dispatch` → `executionEngine` → `actionExtractor` |

### Detailed Findings for `RG-xx`

#### `RG-01`: FastPathExecutor Regular Expression Action Interceptor
- **File:** `packages/execution-kernel/src/orchestration/supervisor/FastPathExecutor.ts`
- **Lines:** 32–90 (`canHandle`), 95–215 (`extractProposal`)
- **Exact Behavior:**
  - `canHandle` evaluates a series of strict regexes to intercept user messages:
    - Task completion: `/^mark\s+(?:task\s+)?([a-zA-Z0-9_\-]+|"[^"]+"|\'[^\']+\')\s+(?:as\s+)?(?:done|completed?)$/i`
    - Task creation: `/^(?:create|add|new)\s+(?:a\s+)?task\s*[:\-]?\s*(.+)$/i` and `/^remind\s+me\s+to\s+(.+)$/i`
    - Task deletion: `/^(?:delete|remove)\s+task\s+(.+)$/i`
    - Meal/Hydration logging: `/^(log|ate|eat)\s+meal\s*[:\-]?\s*(.+)$/i` and `/^(?:log|drank|drink)\s+(\d+)\s*(ml|oz|cups?)(?:\s+(?:of\s+)?water)?$/i`
    - Context modes: `/^(?:start|enable|switch\s+to|set|activate|enter)\s+(sprint|sanctuary|sabbatical|standard)...$/i`
  - `extractProposal` uses capture groups (`trimmed.match(...)`) to pull raw text strings directly into `ActionProposal` objects.
- **Architectural Impact:**
  - Placed at step 0 of `Supervisor.processRequest`, **before** conversational memory hydration, **before** authoritative entity resolution, and **before** `SemanticIntentInterpreter`.
  - Strips all context. If the user says `"remind me to call mom tomorrow at 5pm urgent"`, the entire string `"call mom tomorrow at 5pm urgent"` is dumped into `title`, temporal metadata is lost, and priority is hardcoded to `"medium"`.
- **Recommended Correction:**
  - Remove regex interception from the front door. Route all utterances through `SemanticIntentInterpreter`. If a turn is classified as a single unambiguous atomic mutation, execute it via the fast kernel execution path while preserving full semantic extraction.

#### `RG-02`: DynamicRouter Regex Word Boundary Domain Classification
- **File:** `packages/execution-kernel/src/orchestration/supervisor/DynamicRouter.ts`
- **Lines:** 84–86
- **Exact Behavior:**
  - Uses word boundary regexes:
    - `hasProductivity = /\b(task|tasks|project|projects|deadline|deadlines|work|backlog|schedule|todo|todos|priority|priorities|goal|goals)\b/i.test(lower)`
    - `hasHealth = /\b(health|fitness|workout|workouts|training|train|trained|gym|run|running|jog|jogging|diet|meal|meals|nutrition|weight|calories|hydration|water|sleep|sleeping|swim|swimming|walk|walking|cycling)\b/i.test(lower)`
    - `hasWellness = /\b(exhausted|burnout|stress|stressed|tired|recovery|overwhelmed|rest|mood|energy|mental)\b/i.test(lower)`
- **Architectural Impact:**
  - Routes requests to `SINGLE_SPECIALIST` or `MULTI_AGENT` based on keyword presence rather than semantic intent. If a user asks `"I need to paint my fence"`, none of these keywords match, defaulting to `CONVERSATIONAL_LLM` and taking zero action.
- **Recommended Correction:**
  - Rely exclusively on structured domains identified by `SemanticIntentInterpreter`'s semantic operations.

#### `RG-03`: EpistemicVerificationEngine Transient Noise and Importance Regexes
- **File:** `packages/execution-kernel/src/memory/EpistemicVerificationEngine.ts`
- **Lines:** 38–44 (`TRANSIENT_PATTERNS`), 47–53 (`HIGH_IMPORTANCE_PATTERNS`), 77–87, 124–128
- **Exact Behavior:**
  - Uses regex patterns to reject candidate memories as transient (e.g. `/\b(having|eating|drinking)\s+(coffee|tea...)\b/i`, `/\b(it('s|\s+is)\s+(raining|sunny...))\b/i`).
  - Uses regex patterns to boost memory importance by `+0.25` (e.g. `/\b(diagnosed with|allergic to|injury...)\b/i`, `/\b(prefer|routine|habit...)\b/i`).
- **Architectural Impact:**
  - Fails for non-English utterances, linguistic variations, or novel domains. Important user health disclosures phrased differently (e.g., `"I had a severe anaphylactic reaction"`) receive no importance boost and can be discarded if below threshold.
- **Recommended Correction:**
  - Perform epistemic verification and importance scoring through structured semantic evaluation or lightweight model evaluation, replacing static regex lists.

#### `RG-04`: Supervisor Confirmation Regex
- **File:** `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts`
- **Line:** 701
- **Exact Behavior:**
  - `/^(?:yes|yep|yeah|sure|confirm|proceed|ok|okay|allow|do it|send it|go ahead)/i.test((req.message || "").trim())`
- **Architectural Impact:**
  - Rejects valid affirmative semantic responses like `"Affirmative"`, `"By all means"`, `"Looks great"`, `"Execute that"`, or multilingual confirmations unless the LLM classification explicitly rescues it.
- **Recommended Correction:**
  - Rely on `semanticTurn.primaryClassification === "CONFIRMATION"` and structured conversational state.

#### `RG-05`: actionExtractor Calorie and Deficit Regexes
- **File:** `packages/execution-kernel/src/dispatch/actionExtractor.ts`
- **Lines:** 39, 48
- **Exact Behavior:**
  - `lower.match(/(\d{2,4})\s*(cal|kcal|calorie)/)`
- **Architectural Impact:**
  - Brittle regex for diet extraction in legacy dispatcher. Fails on `"two thousand calories"` or `"half a deficit"`.
- **Recommended Correction:**
  - Deprecate and route all diet and health actions through canonical semantic action interpreters.

---

## 3. Pattern-Matching Shortcuts (`PM-xx`)

| Finding ID | File Path | Class / Function | Lines | Classification | Severity | Runtime Call Path |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`PM-01`** | `packages/execution-kernel/src/orchestration/supervisor/DynamicRouter.ts` | `DynamicRouter.route` | 40–42 | Hardcoded String Includes Workflow Detection | **CRITICAL** | `Supervisor.processRequest` → `DynamicRouter.route` |
| **`PM-02`** | `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` | `Supervisor.processRequest` | 288–292 | Hardcoded Substring Workflow Trigger | **CRITICAL** | `Supervisor.processRequest` → Multi-step branch |
| **`PM-03`** | `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` | `Supervisor.processRequest` | 473–476 | Response Keyword Heuristic Mutation | **CRITICAL** | `Supervisor.processRequest` → Clarification Handling |
| **`PM-04`** | `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` | `Supervisor.processRequest` | 929–955 | 22-line String Substring Permission Whitelist | **CRITICAL** | `Supervisor.processRequest` → HITL Governance Enforcement |
| **`PM-05`** | `packages/execution-kernel/src/memory/ContradictionResolver.ts` | `ContradictionResolver.checkSemanticDimensionConflict` | 205–238 | Hardcoded String Arrays & Substring Matching | **MAJOR** | `MemoryFormationPipeline` → `ContradictionResolver.resolveContradiction` |
| **`PM-06`** | `packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts` | `SemanticIntentInterpreter.interpret` | 872 | Substring Cancellation Status Branch | **MAJOR** | `SemanticIntentInterpreter.interpret` → `cancel_occurrence` normalization |
| **`PM-07`** | `packages/execution-kernel/src/events/consumers/CadenceLearningConsumer.ts` | `CadenceLearningConsumer.process` | 64, 67, 83 | Event Type Substring Matching | **MODERATE** | `UnifiedEventBus` → `DurableOutboxDispatcher` → `CadenceLearningConsumer` |

### Detailed Findings for `PM-xx`

#### `PM-01` & `PM-02`: Multi-Step Dynamic Workflow Substring Matchers
- **Files:**
  - `packages/execution-kernel/src/orchestration/supervisor/DynamicRouter.ts` (lines 40–42)
  - `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` (lines 288–292)
- **Exact Behavior:**
  - `DynamicRouter`:
    ```ts
    const isCompositeWorkflow =
      (lower.includes("summarize") || lower.includes("synthesize") || lower.includes("briefing") || lower.includes("find and") || lower.includes("search and")) &&
      (lower.includes("save") || lower.includes("write") || lower.includes("file") || lower.includes("calendar"));
    ```
  - `Supervisor`:
    ```ts
    const isMultiStepGoal =
      routingDecision.strategy === "DYNAMIC_WORKFLOW" ||
      ((req.message.toLowerCase().includes("summarize") || req.message.toLowerCase().includes("summary")) &&
        (req.message.toLowerCase().includes("save") || req.message.toLowerCase().includes("write") || req.message.toLowerCase().includes("file") || req.message.toLowerCase().includes("desktop")) &&
        (req.message.toLowerCase().includes("email") || req.message.toLowerCase().includes("unread") || req.message.toLowerCase().includes("failure") || req.message.toLowerCase().includes("incident")));
    ```
- **Architectural Impact:**
  - Multi-step dynamic workflow orchestration (Stage 4) is gated by an arbitrary English keyword combination. Any request to `"Export my completed gym sets to Google Sheets"`, `"Analyze my sleep data from Oura and draft a coaching plan"`, or `"Collate unread PRs into a Discord update"` fails to trigger a dynamic workflow because it lacks `"summarize"` + `"save"` + `"email"`.
- **Recommended Correction:**
  - Have `SemanticIntentInterpreter` identify composite goals and operation dependencies natively, setting a structured `workflowType: "COMPOSITE_DAG"`.

#### `PM-03`: Supervisor Response Substring Action Type Coercion
- **File:** `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts`
- **Lines:** 473–476, 478
- **Exact Behavior:**
  ```ts
  const isTemporalClarification =
    op?.actionType === "create_temporal_series" ||
    op?.actionType === "schedule_occurrence" ||
    response.toLowerCase().includes("class") ||
    response.toLowerCase().includes("schedule") ||
    response.toLowerCase().includes("block") ||
    response.toLowerCase().includes("routine");

  const resolvedActionType = op?.actionType || (isTemporalClarification ? "create_temporal_series" : "create_task");
  ```
- **Architectural Impact:**
  - If the generated assistant response mentions the word `"block"` (e.g., *"What is blocking you?"*), `"routine"` (e.g., *"Is this part of your routine?"*), or `"schedule"` (e.g., *"Let's schedule some downtime"*), the pending action type is silently coerced into `"create_temporal_series"` instead of `"create_task"`.
- **Recommended Correction:**
  - The pending operation's action type must be determined strictly by the structured semantic turn contract, never by substring inspection of LLM prose.

#### `PM-04`: Supervisor 22-Line String Substring HITL Governance Whitelist
- **File:** `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts`
- **Lines:** 929–955
- **Exact Behavior:**
  ```ts
  const isReadOperation =
    capURN.includes("storage.list_files") ||
    capURN.includes("storage.read_file") ||
    capURN.includes("calendar.read_events") ||
    capURN.includes("email.search_messages") ||
    capURN.includes("email.read_thread") ||
    capURN.includes("email.read_message") ||
    capURN.includes("email.create_draft") ||
    capURN.includes("contacts.search_contacts") ||
    capURN.includes("contacts.get_contact") ||
    capURN.includes("task.sync_tasks") ||
    capURN.includes("biometrics.read") ||
    capURN.includes("activity.sync_telemetry") ||
    capURN.includes("activity.read_daily_summary") ||
    capURN.includes("activity.read_sleep") ||
    capURN.includes("git.list_prs") ||
    capURN.includes("git.list_repos") ||
    capURN.includes("git.search_code") ||
    capURN.includes("media.read_current_track") ||
    capURN.includes("context.system.search_web") ||
    capURN.includes("context.system.open_url") ||
    capURN.includes("context.system.read_clipboard");
  ```
- **Architectural Impact:**
  - Completely bypasses the authoritative `CapabilityRegistry` descriptor. `CapabilityDescriptor` already defines `requiresApproval: boolean` and `riskClass`. Any new modular MCP tool or external provider that registers read operations (e.g., `notion.read_database` or `jira.list_issues`) is treated as a write mutation and blocked for HITL approval. Conversely, an operation like `email.read_thread_and_delete` would be mistakenly treated as read-only.
- **Recommended Correction:**
  - Query `CapabilityRegistry.getInstance().getCapability(capURN)`. Read `descriptor.requiresApproval` and `descriptor.riskClass`.

#### `PM-05`: ContradictionResolver Hardcoded English Word Sets
- **File:** `packages/execution-kernel/src/memory/ContradictionResolver.ts`
- **Lines:** 205–238
- **Exact Behavior:**
  - Defines static string arrays:
    - Temporal: `["morning", "mornings", "night", "nights", "evening"]`
    - Dietary: `["vegetarian", "vegan", "meat", "beef", "chicken", "omnivore"]`
    - Work mode: `["remote", "wfh", "in-office", "commute"]`
    - Workout: `["running", "cardio", "powerlifting", "heavy lifting"]`
  - Uses `.includes()` and `startsWith()` to detect conflicts.
- **Architectural Impact:**
  - While intended to remove regex, it replaced regex with a hardcoded dictionary. Cannot accommodate multilingual users, new diets (e.g. keto, paleo, pescatarian), or new work models (e.g. hybrid, co-working).
- **Recommended Correction:**
  - Use semantic embedding distance or structured property slot comparison from the world model schema.

#### `PM-06`: SemanticIntentInterpreter Cancellation Substring Fallback
- **File:** `packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts`
- **Line:** 872
- **Exact Behavior:**
  - `payload.status = msgLower.includes("skip") ? "SKIPPED" : "CANCELLED";`
- **Architectural Impact:**
  - `"I couldn't make it to physics class"` is assigned status `"CANCELLED"`. `"Skipped physics class"` is assigned `"SKIPPED"`.
- **Recommended Correction:**
  - Explicitly extract `status` in the structured LLM output schema.

---

## 4. Hardcoded Behavioral Assumptions & Fixed Constants (`HC-xx`)

| Finding ID | File Path | Class / Function | Lines | Classification | Severity | Runtime Call Path |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`HC-01`** | `packages/execution-kernel/src/orchestration/planning/DynamicWorkflowPlanner.ts` | `DynamicWorkflowPlanner.generateDeterministicFallback` | 224–312 | Hardcoded Benchmark Plan Playback | **CRITICAL** | `Supervisor.processRequest` → `DynamicWorkflowPlanner.planWorkflow` |
| **`HC-02`** | `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` | `Supervisor.processRequest` | 297 | Instantiates Planner Without LLM Client | **CRITICAL** | `Supervisor.processRequest` → line 297 |
| **`HC-03`** | `packages/execution-kernel/src/orchestration/supervisor/FastPathExecutor.ts` | `FastPathExecutor.extractProposal` | 135, 121, 138, 159, 174, 189 | Hardcoded Defaults & Broken Idempotency Keys | **CRITICAL** | `FastPathExecutor.execute` |
| **`HC-04`** | `packages/execution-kernel/src/dispatch/actionExtractor.ts` | `actionExtractor` Prompt Definition | 58, 72 | Prohibition of Custom Signals | **CRITICAL** | Legacy Dispatcher |
| **`HC-05`** | `packages/execution-kernel/src/interventions/InterventionVerificationEngine.ts` | `InterventionVerificationEngine` | 28, 58, 61, 219–228, 268–280 | Arbitrary Verification Thresholds & Fixed Scores | **MAJOR** | Closed-loop Intervention Verification |
| **`HC-06`** | `packages/execution-kernel/src/worldv2/LifeStateWeights.ts` | `LIFE_STATE_WEIGHTS` | 13–75 | Static Mathematical Feature Weights | **MODERATE** | `LifeStateEngine` |
| **`HC-07`** | `packages/execution-kernel/src/autonomous/strategies/CircadianEnergyAlignmentStrategy.ts` | `CircadianEnergyAlignmentStrategy.evaluate` | 22–23, 61–65 | Static Cadence Defaults & Fixed Scores | **MAJOR** | B4 Autonomous Execution Daemon |
| **`HC-08`** | `packages/execution-kernel/src/autonomous/strategies/ScheduleRebalancerStrategy.ts` | `ScheduleRebalancerStrategy.evaluate` | 55, 61–63 | Hardcoded Buffer & Static Confidence | **MAJOR** | B4 Autonomous Execution Daemon |
| **`HC-09`** | `packages/execution-kernel/src/memory/EpistemicVerificationEngine.ts` | `EpistemicVerificationEngine.verifyCandidate` | 90–121, 126, 132 | Static Confidence, Boost, and Storage Thresholds | **MAJOR** | Memory Formation Pipeline |

### Detailed Findings for `HC-xx`

#### `HC-01` & `HC-02`: DynamicWorkflowPlanner Production Hardcoded Benchmark Playback
- **Files:**
  - `packages/execution-kernel/src/orchestration/planning/DynamicWorkflowPlanner.ts` (lines 224–312)
  - `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` (line 297)
- **Exact Behavior:**
  - In `Supervisor.ts` line 297:
    ```ts
    const planner = new DynamicWorkflowPlanner();
    plan = await planner.planWorkflow({ userRequest: req.message, goal: req.message, context: { ... } });
    ```
  - `DynamicWorkflowPlanner` constructor defaults `options.llmClient` to `undefined`.
  - In `planWorkflow`:
    ```ts
    if (this.llmClient) { ... } // SKIPPED because llmClient is undefined
    if (this.allowBenchmarkFallback) {
      const fallbackPlan = this.generateDeterministicFallback(userRequest, goal);
      if (fallbackPlan) return fallbackPlan;
    }
    throw new Error(`[PLANNING_FAILED]: Unable to generate a valid execution plan...`);
    ```
  - In `generateDeterministicFallback`:
    - Checks `lower.includes("email") && lower.includes("summarize") && lower.includes("write")` → returns hardcoded steps with search query `"important project updates"` and path `"briefing.md"`.
    - Checks `lower.includes("calendar") && lower.includes("weather")` → returns hardcoded steps with location `"San Francisco"`.
- **Architectural Impact:**
  - Dynamic workflow planning does not dynamically plan anything in production. It only executes two hardcoded benchmark plans. Any real user multi-step goal throws a planning failure error.
- **Recommended Correction:**
  - Pass the active LLM client into `DynamicWorkflowPlanner` inside `Supervisor.ts`. Use model-based DAG synthesis backed by `CapabilityRegistry.getDiscoveredCapabilities()`.

#### `HC-03`: FastPathExecutor Hardcoded Defaults & Broken Idempotency Keys
- **File:** `packages/execution-kernel/src/orchestration/supervisor/FastPathExecutor.ts`
- **Lines:** 135, 121, 138, 159, 174, 189
- **Exact Behavior:**
  - Line 135: `payload: { title: cleanTitle, priority: "medium" }` silently assigns `"medium"` priority.
  - Lines 121, 138, 159, 174, 189: `idempotencyKey: \`fastpath_complete_\${userId}_\${taskId}_\${Date.now()}\`` incorporates `Date.now()`.
- **Architectural Impact:**
  - Priority cannot be set to high or low via fast-path.
  - Incorporating `Date.now()` into the idempotency key defeats idempotency protection across immediate retries or network replays.
- **Recommended Correction:**
  - Derive idempotency key deterministically from request metadata (turn ID / client request ID) and extract priority semantically.

#### `HC-04`: Prohibition of Custom Signals in actionExtractor Prompt
- **File:** `packages/execution-kernel/src/dispatch/actionExtractor.ts`
- **Lines:** 58, 72
- **Exact Behavior:**
  - Prompt states: `CRITICAL: For signals, YOU MUST ONLY use keys from the "Existing Tracked Signals" list provided below. DO NOT invent new signal keys. If a user activity roughly matches an existing signal, map it. If it doesn't match anything, do NOT log it as a signal.`
- **Architectural Impact:**
  - Directly blocks user-defined signals (e.g. `deepWorkHours`, `creatineGrams`, `meditationMinutes`).
- **Recommended Correction:**
  - Deprecate prompt constraint and allow dynamic signal registration in `SignalDefinitionModel`.

#### `HC-05`: Arbitrary Intervention Verification Thresholds
- **File:** `packages/execution-kernel/src/interventions/InterventionVerificationEngine.ts`
- **Lines:** 28, 58, 61, 219–228, 268–280
- **Exact Behavior:**
  - Hardcoded `TAU_HALF_LIFE_MS = 21 * 24 * 60 * 60 * 1000`.
  - Windows fixed at exactly T+4h and T+24h.
  - Threshold `observedDelta >= expected * 0.8` hardcodes success criterion.
  - Fixed scores: `EFFECTIVE = 1.0`, `LIKELY_EFFECTIVE = 0.80`, `UNCERTAIN = 0.50`, `INEFFECTIVE = 0.20`, `ADVERSE = 0.0`.
  - Thumbs up `+0.15`, Thumbs down `-0.25`.
- **Architectural Impact:**
  - No domain adaptation. A sleep intervention has different observation windows than a 5-minute stress intervention.
- **Recommended Correction:**
  - Window lengths, decay constants, and success criteria should be declared by the intervention strategy itself.

---

## 5. Fallback and Rejection Behaviors (`FB-xx`)

| Finding ID | File Path | Class / Function | Lines | Classification | Severity | Runtime Call Path |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`FB-01`** | `packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts` | `heuristicInterpretation` | 1025–1032 | Silent Fallback to Casual Dialogue | **MODERATE** | `SemanticIntentInterpreter.interpret` (on Groq API failure) |
| **`FB-02`** | `packages/execution-kernel/src/orchestration/supervisor/FastPathExecutor.ts` | `FastPathExecutor.extractProposal` | 109, 147 | Silent Null Return on Unresolved ID | **MAJOR** | `FastPathExecutor.extractProposal` |

### Detailed Findings for `FB-xx`

#### `FB-01`: Silent Fallback to Casual Dialogue on LLM Outage
- **File:** `packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts`
- **Lines:** 1025–1032
- **Behavior:** Returns `primaryClassification: "CASUAL_DIALOGUE"`, `operations: []`.
- **Assessment:** While intended to fail-safe without guessing, it silently drops user mutation intent during upstream LLM errors rather than signaling a temporary service degradation.

#### `FB-02`: Silent Null Return on Unresolved Task ID
- **File:** `packages/execution-kernel/src/orchestration/supervisor/FastPathExecutor.ts`
- **Lines:** 109, 147
- **Behavior:** When `resolveTaskId` returns null, `extractProposal` returns null. `FastPathExecutor.execute` returns `handled: false`.
- **Assessment:** Request silently falls through to `Supervisor` conversational layer without notifying the user that their task identifier was not found.

---

## 6. Legacy & Disconnected Decision Engines (`LG-xx`)

| Finding ID | File Path | Status | Impact / Call Path |
| :--- | :--- | :--- | :--- |
| **`LG-01`** | `packages/execution-kernel/src/dispatch/toolRouter.ts` | Dead Code | Exports `shouldCallTool` with 4 hardcoded intents; completely unreferenced in codebase. |
| **`LG-02`** | `packages/execution-kernel/src/dispatch/intentRouter.ts` | Deprecated | Pre-Phase 9 intent classifier; marked deprecated but still present. |
| **`LG-03`** | `packages/execution-kernel/src/reasoning/intentModel.ts` | Deprecated | Legacy 13-intent classifier; referenced only in certain autonomous testing files. |

---

## 7. Legitimate Engineering Invariants (`INV`)

The following audited components contain fixed constants that were inspected and verified as **legitimate engineering invariants**:

1. **`WorkerLeaseManager.ts` & `AutonomousLeaseManager.ts`**:
   - Monotonic epoch/generation increments (`$inc: { leaseGeneration: 1 }`).
   - Lease expiry timestamps for distributed locking.
   - *Justification:* Fundamental distributed systems concurrency invariants.
2. **`HITLGovernanceEngine.ts`**:
   - HMAC-SHA256 signature construction and timing-safe comparison (`crypto.timingSafeEqual`).
   - *Justification:* Cryptographic non-repudiation and security against timing attacks.
3. **`CapabilityRegistry.ts` (canonicalize & computeContractHash)**:
   - RFC 8785 JSON Canonicalization Scheme (JCS) sorting and hashing.
   - *Justification:* Deterministic contract verification across distributed worker boundaries.
4. **`DWCPRecoverySweeper.ts`**:
   - Version equality comparison (`aggregate.version === step.expectedVersion`) and quarantine logic.
   - *Justification:* Dual-write causal consistency and anti-corruption fence.
5. **`CadenceLearningEngine.ts` (circular mean)**:
   - Trigonometric modulo-1440 minute averaging (`Math.atan2(meanSin, meanCos)`).
   - *Justification:* Circular statistical truth for clock time crossing midnight.

---

## 8. Summary Count by Category

| Category | Finding Prefix | Count | Critical (P0) | Major (P1) | Moderate (P2) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Regular Expression Parsing | `RG-xx` | 5 | 1 | 4 | 0 |
| Pattern-Matching Shortcuts | `PM-xx` | 7 | 4 | 2 | 1 |
| Hardcoded Behavioral Assumptions | `HC-xx` | 9 | 4 | 4 | 1 |
| Fallback & Rejection Behaviors | `FB-xx` | 2 | 0 | 1 | 1 |
| Legacy & Dead Systems | `LG-xx` | 3 | 0 | 0 | 3 |
| **Total Violations** | — | **26** | **9** | **11** | **6** |

