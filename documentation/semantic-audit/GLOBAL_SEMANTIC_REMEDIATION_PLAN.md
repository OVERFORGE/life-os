# LIFEOS — GLOBAL SEMANTIC ARCHITECTURE REMEDIATION PLAN (V2.1.0)
## Master Implementation Plan: Zero-Tolerance Semantic Engineering Initiative
### Stages 1–4 & Milestones B1–B4 | Loop Engineering Architecture & Automated CI Governance

**Project:** LifeOS / Aven  
**Organization:** The Executioners (ExE)  
**Document Identifier:** `documentation/semantic-audit/GLOBAL_SEMANTIC_REMEDIATION_PLAN.md`  
**Governing Principle:** *The kernel provides truth. Agents provide intelligence.*  
**Authorization Status:** IMPLEMENTATION PLANNING ONLY (Strictly Non-Modifying)  
**Revision:** V2.1.0 (Final Authoritative Correctness Refinement)  

---

## 1. Executive Summary & Audit Correlation

Following the completion of the Global Semantic Architecture Audit across Stages 1–4 and Milestones B1–B4, the system was assigned a final verdict of **`D — NON-COMPLIANT`**. 

This document serves as the **single authoritative, consolidated master implementation plan (V2.1.0)** to systematically eliminate all 26 audited architectural violations (`RG-01` to `RG-05`, `PM-01` to `PM-07`, `HC-01` to `HC-09`, `FB-01` to `FB-02`, and `LG-01` to `LG-03`) without creating new milestones, expanding into unrelated features, or substituting one set of heuristics for another.

### 1.1 Correlation Across Supplied Audit Documents

The plan synthesizes and reconciles findings across the seven audit documents:
1. [`GLOBAL_SEMANTIC_ARCHITECTURE_AUDIT.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/GLOBAL_SEMANTIC_ARCHITECTURE_AUDIT.md): Master audit findings and Section 8 criteria.
2. [`HARDCODING_AND_PATTERN_INVENTORY.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/HARDCODING_AND_PATTERN_INVENTORY.md): Line-by-line source inventory of all 26 violations.
3. [`SEMANTIC_ADAPTABILITY_REPORT.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/SEMANTIC_ADAPTABILITY_REPORT.md): 8 failure scenario traces on custom concepts and dynamic capabilities.
4. [`DETERMINISM_AND_REPLAY_AUDIT.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/DETERMINISM_AND_REPLAY_AUDIT.md): Broken idempotency keys (`Date.now()`) and host-system timezone leaks.
5. [`RUNTIME_SEMANTIC_FLOW_MAP.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/RUNTIME_SEMANTIC_FLOW_MAP.md): Production execution paths and dead legacy systems.
6. [`GLOBAL_REMEDIATION_ROADMAP.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/GLOBAL_REMEDIATION_ROADMAP.md): Prioritized remediation tiers (P0–P3).
7. [`LIFEOS_SEMANTIC_EXECUTION_ARCHITECTURE_FORENSIC_AUDIT.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/LIFEOS_SEMANTIC_EXECUTION_ARCHITECTURE_FORENSIC_AUDIT.md): Historical diagnosis establishing that `FastPathExecutor` was originally introduced to satisfy synthetic scripted strings in simulations.

### 1.2 Reconciled Document Inconsistencies & Corrected Principles
- **Database Disconnection Handling:** The earlier forensic audit documented that `DefaultActionAdapters.ts` mocked database operations. Repository inspection confirms that `assertDatabaseConnected()` was subsequently hardened; adapters connect directly to live MongoDB collections in production unless explicitly running in a test harness with `LIFEOS_ALLOW_TEST_MOCKS="true"`.
- **Dynamic Workflow Planning Disconnection:** Prior Stage 4 documentation claimed dynamic DAG synthesis was active. Source inspection revealed `Supervisor.ts#L297` instantiates `DynamicWorkflowPlanner` with no LLM client (`new DynamicWorkflowPlanner()`), forcing execution into hardcoded benchmark JSON fallbacks.
- **Idempotency Invariant Leakage:** Prior B2 documentation claimed universal idempotency. Source inspection revealed `FastPathExecutor.ts` appends `${Date.now()}` to idempotency keys, breaking retry deduplication.
- **Fast Execution Eligibility Correction:** The V1/V2.0 drafts erroneously required every operation to resolve an existing database entity ID. V2.1 corrects this: creation operations (e.g. `create_task`, `create_goal`, `log_meal`) do not require existing entity IDs, whereas mutations on existing entities (e.g. `complete_task`, `delete_task`, `update_task`) strictly require resolved database entity IDs.
- **Confidence Threshold Elimination:** V2.1 permanently eliminates numerical confidence thresholds (e.g. `confidence > 0.95`) as execution authorization gates. Authoritative execution readiness is a structural binary property grounded in schema validation and contract checks.

---

## 2. Permanent Semantic Architecture Constitution

This Constitution defines the non-negotiable architectural laws governing all future development in LifeOS. These principles are permanent; no coding agent or developer may circumvent them.

### Article I: The Inviolable Core Principle
> **The kernel provides truth. Agents provide intelligence.**

1. Natural language understanding, intent interpretation, entity grounding, and dynamic workflow planning belong exclusively to the **Agent Intelligence Layer**.
2. State validation, permission enforcement, transaction execution, causal event ordering, idempotency, and persistence belong exclusively to the **Deterministic Kernel Infrastructure**.
3. Under no circumstances may an agent mutate state directly, nor may the kernel parse natural language.

### Article II: Authoritative Intelligence Ownership Boundaries
Every semantic responsibility has exactly one authoritative owner. No component may duplicate another owner's responsibility:

| Semantic Responsibility | Authoritative Owner | Forbidden Delegations / Bypass Paths |
| :--- | :--- | :--- |
| **Natural Language Interpretation** | [`SemanticIntentInterpreter`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts) | FORBIDDEN: Front-door regex capture groups in `FastPathExecutor`; keyword parsing in `Supervisor`; secondary intent classifiers in legacy modules. |
| **Entity Resolution & Anaphora** | [`AuthoritativeEntityResolver`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/context/AuthoritativeEntityResolver.ts) | FORBIDDEN: Direct string equality or naive substring matching in dispatchers, supervisors, or adapters. |
| **Routing Strategy Determination** | [`DynamicRouter`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/DynamicRouter.ts) | FORBIDDEN: Regex word boundary tests on raw text; must route based on structured `SemanticTurn` operations. |
| **Workflow DAG Synthesis** | [`DynamicWorkflowPlanner`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/planning/DynamicWorkflowPlanner.ts) | FORBIDDEN: Hardcoded benchmark plan playback in production; static string checks (`includes("email")`). |
| **Capability Catalog & Permissions** | [`CapabilityRegistry`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/capabilities/CapabilityRegistry.ts) | FORBIDDEN: Hardcoded string whitelists in `Supervisor.ts` (`capURN.includes(...)`). |
| **Conversational Orchestration** | [`Supervisor`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts) | FORBIDDEN: Re-interpreting user text; inspecting assistant prose for keywords to alter action types; maintaining internal classification dictionaries. |
| **Deterministic State Mutation** | [`KernelCapabilityService`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/kernel/KernelCapabilityService.ts) / Native Handlers | FORBIDDEN: Executing unvalidated raw model proposals without Zod schema validation and entity checks. |
| **Causal Ordering & Event Delivery** | [`WorkerLeaseManager`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/dispatch/WorkerLeaseManager.ts) / Outbox | FORBIDDEN: Fire-and-forget background execution without monotonic generation fencing. |

### Article III: The Unbreachable Execution Boundary
The lifecycle of every user utterance must adhere to this invariant unidirectional pipeline:

```
Natural-Language Input
         │
         ▼
Probabilistic Semantic Intelligence (LLM / Embeddings)
         │  Output: Untrusted Raw Proposals (SemanticTurn)
         ▼
Structural Validation & Entity Resolution Gate
   ├── AuthoritativeEntityResolver (Pending -> STM Focus -> DB Exact Match)
   ├── PlanValidator (Kahn's DAG cycle detection, depth <= 5, steps <= 15)
   ├── ActionPayloadSchema (Strict Zod validation)
   └── CapabilityRegistry (RFC 8785 contract verification & access modes)
         │  Output: Formally Validated ActionProposal
         ▼
Deterministic Sovereign Kernel Execution (Milestones B1–B4)
   ├── Idempotency Gate (Stable hash-derived tokens; ZERO Date.now())
   ├── Precondition Check (State existence & optimistic version fencing)
   ├── Transactional State Transition (Atomic MongoDB / DWCP 2-Phase)
   ├── Transactional Outbox Commit (DurableOutboxDispatcher)
   └── Authoritative Mutation Receipt Commit (L1 Ring Buffer + L2 Durable Store)
         │
         ▼
Causal Event Dispatch & Continuous Learning
   ├── Monotonic Worker Lease Fencing (WorkerLeaseManager)
   └── Deterministic Chronicle & Cadence Learning (Circular Modulo-1440 Math)
```

### Article IV: Prohibitions on Hidden Heuristics
1. **Zero Regex Semantic Decisions:** Regular expressions may only be used for formal syntax validation (e.g. UUID, email, ISO date). Regex must never determine what a user meant or whether an action should occur.
2. **Zero Assistant-Prose Action Coercion:** The generated text of an assistant must never be inspected via `.includes()`, regex, or string matching to determine or mutate an action type.
3. **No Numerical Confidence Gatekeepers:** Numerical confidence numbers must not independently authorize execution. Execution readiness is a structural binary property (`executionEligibility === "READY"` and `ambiguityStatus === "UNAMBIGUOUS"`).
4. **No Replacement by Hidden Dictionaries:** Eliminating regex must not be replaced by embedding similarity thresholds, keyword dictionaries, or static English word arrays.
5. **No Fabricated Fallbacks:** Missing information must remain explicitly unknown. Systems must not fabricate priorities, durations, or titles.

---

## 3. Permanent Automated Architectural Enforcement Architecture

To ensure this Constitution is permanently enforced and cannot be bypassed by future coding agents or developers ignoring documentation, the repository will enforce architectural compliance through an automated CI test suite, static AST analysis, and strict boundary rules.

### 3.1 Context-Aware AST Architectural Rules

The static analysis engine inspects TypeScript AST nodes and detects prohibited semantic behaviors across module boundaries:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ CONTEXT-AWARE ARCHITECTURAL AST RULES                                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 1: [ARCH-01] FORBIDDEN_REGEX_SEMANTIC_INTERCEPTION                                │
│ Target: packages/execution-kernel/src/orchestration/supervisor/                        │
│ Pattern: CallExpression calling RegExp.test(), .match(), or .exec() on user inputs.   │
│ Invariant: Supervisor and FastPath must never parse natural language with regex.       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 2: [ARCH-02] FORBIDDEN_PROSE_ACTION_COERCION                                      │
│ Target: packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts           │
│ Pattern: CallExpression checking assistant response text (.includes()) and mutating   │
│          actionType or resolvedActionType.                                             │
│ Invariant: Assistant prose must never alter underlying state machine operations.       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 3: [ARCH-03] FORBIDDEN_HARDCODED_PERMISSION_LISTS                                 │
│ Target: packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts           │
│ Pattern: Substring matching (capURN.includes()) on capability names for HITL.          │
│ Invariant: All capability permissions must derive from CapabilityRegistry contracts.   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 4: [ARCH-04] FORBIDDEN_DYNAMIC_TIMESTAMP_IDEMPOTENCY                              │
│ Target: packages/execution-kernel/src/                                                  │
│ Pattern: TemplateLiteral assigning to idempotencyKey incorporating Date.now().         │
│ Invariant: Idempotency keys must be stable, deterministic tokens derived from turn/ID. │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 5: [ARCH-05] FORBIDDEN_PRODUCTION_BENCHMARK_FALLBACK                              │
│ Target: packages/execution-kernel/src/orchestration/planning/DynamicWorkflowPlanner.ts  │
│ Pattern: MethodDeclaration generateDeterministicFallback invoked outside test env.    │
│ Invariant: Production workflow planning must use discovered capability models.         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 6: [ARCH-06] FORBIDDEN_DEPRECATED_INTENT_INTERPRETERS                             │
│ Target: Entire repository (excluding legacy test fixtures)                             │
│ Pattern: ImportDeclaration referencing toolRouter.ts, intentRouter.ts, intentModel.ts. │
│ Invariant: Zero production reachability for decommissioned legacy classifiers.         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 7: [ARCH-07] FORBIDDEN_HOST_TIMEZONE_LEAKAGE                                      │
│ Target: packages/execution-kernel/src/autonomous/strategies/                             │
│ Pattern: Parameterless new Date().getHours() or .toISOString().slice(0, 10).          │
│ Invariant: Autonomous strategies must evaluate circadian state using user timezone.    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 8: [ARCH-08] FORBIDDEN_SUPERVISOR_INTERNAL_CLASSIFIERS                            │
│ Target: packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts           │
│ Pattern: Internal string classification functions, keyword maps, or embedding tests.   │
│ Invariant: Supervisor is an orchestrator only; all semantic understanding is delegated.│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Protecting the Enforcement Itself (CI Protection & Governance)

An architectural enforcement system is useless if an agent or developer can bypass a failing check by simply deleting or weakening the check. The following governance structure guarantees enforcement tamper-resistance:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ CI ENFORCEMENT PROTECTION & TAMPER-RESISTANCE ARCHITECTURE                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. CODEOWNERS PROTECTED PATHS                                                          │
│    The following paths require explicit approval from @exe-architects:                 │
│    - .github/workflows/ci.yml                                                          │
│    - scripts/verify-semantic-architecture.ts                                           │
│    - packages/execution-kernel/src/testing/architecture/                               │
│    - .architectural-exceptions.json                                                    │
│    - .architectural-hash.sha256                                                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. CRYPTOGRAPHIC CHECKSUM INTEGRITY GATE (.architectural-hash.sha256)                  │
│    - The CI pipeline computes SHA-256 hashes of all architectural linter rules and     │
│      architecture tests.                                                               │
│    - Compares computed hash against .architectural-hash.sha256.                        │
│    - If rules were modified without an accompanying signed architectural governance    │
│      approval token, CI aborts immediately with INTEGRITY_TAMPER_DETECTED.             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. IMMUTABLE CI PIPELINE DEFINITION                                                    │
│    - Branch protection on 'master' mandates that 'verify-semantic-architecture' must   │
│      pass before any pull request can merge.                                           │
│    - "Do not allow bypassing the above settings" enabled for all administrators.       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. STRICT EXCEPTION GOVERNANCE (.architectural-exceptions.json)                        │
│    - Max 5 active exceptions permitted across the entire repository at any time.       │
│    - Every exception requires: ruleId, file, line bounds, owner, rationale, ticket,    │
│      and approvedUntil expiration date (max 30 days).                                  │
│    - CI fails automatically if any exception is expired or undocumented.              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Fixed-Value and Behavioral Defaults Classification Inventory

Every fixed threshold, default, score, weight, time window, duration, fallback, and policy value across the repository was inspected and categorized into the **Six-Tier Classification Taxonomy**:

```
Tier 1: [TECH-INV]  Mathematical or technical invariant (Preserve)
Tier 2: [SEC-POL]   Security or governance policy (Preserve)
Tier 3: [PROD-DEF]  Explicit product-wide default (Preserve with explicit documentation)
Tier 4: [USER-PREF] User-configurable preference (Promote to settings)
Tier 5: [LEARNED]   Learned or empirically calibrated parameter (Parameterize)
Tier 6: [ARBITRARY] Arbitrary hardcoded behavioral assumption (ELIMINATE)
```

### Complete Fixed-Value Inventory

| Component & File Path | Line(s) | Value / Expression | Classification | Status & Rationalized Action |
| :--- | :--- | :--- | :--- | :--- |
| `FastPathExecutor.ts` | 135 | `priority: "medium"` | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Must extract priority semantically; default to explicit `"none"` if unstated. |
| `FastPathExecutor.ts` | 121, 138 | `Date.now()` in idempotency keys | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Violates idempotency; derive from `requestId` and `turnId`. |
| `DynamicWorkflowPlanner.ts` | 241, 261 | `query: "important project updates"`, `path: "briefing.md"` | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Production benchmark plan playback; dynamic DAG synthesis required. |
| `DynamicWorkflowPlanner.ts` | 294 | `location: "San Francisco"` | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Fabricated location; must derive from user profile context. |
| `Supervisor.ts` | 473–476 | Words `"class"`, `"schedule"`, `"block"` | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Assistant prose action coercion; derive action type from semantic turn. |
| `Supervisor.ts` | 701 | Regex `/^(?:yes\|yep\|yeah...)/i` | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Replace with structured semantic turn classification `CONFIRMATION`. |
| `Supervisor.ts` | 929–955 | 22-line list of `.includes(...)` strings | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Query authoritative `CapabilityRegistry` descriptor. |
| `actionExtractor.ts` | 58, 72 | Prompt forbidding custom signals | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Remove restriction; support dynamic `SignalDefinitionModel`. |
| `InterventionVerificationEngine.ts` | 268 | `observedDelta >= expected * 0.8` | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Replace with strategy-declared success evaluation functions. |
| `InterventionVerificationEngine.ts` | 226, 227 | `score + 0.15` (up), `score - 0.25` (down) | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Replace with calibrated Bayesian feedback updates. |
| `ScheduleRebalancerStrategy.ts` | 55 | `suggestedShiftMinutes = shift + 15` | **Tier 4: [USER-PREF]** | **PROMOTE.** Derive from `user.settings.calendarPreferences.transitionBufferMinutes`. |
| `CircadianEnergyAlignmentStrategy.ts` | 22, 23 | `peakStartHour ?? 9`, `peakEndHour ?? 12` | **Tier 3: [PROD-DEF]** | **RETAIN AS DEFAULT.** Baseline product default when historical profile has zero samples. |
| `CadenceLearningConsumer.ts` | 76 | `durationMinutes = 30` | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Missing duration must remain explicitly unknown (`undefined`). |
| `CadenceLearningConsumer.ts` | 61, 65 | `title = "Routine"`, `title = "Gym workout"` | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Use authoritative event payload title; preserve unknown if omitted. |
| `EpistemicVerificationEngine.ts` | 132 | `importance >= 0.45 && confidence >= 0.50` | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Epistemic evaluation based on provenance and goal relevance. |
| `EpistemicVerificationEngine.ts` | 126 | `importance + 0.25` (regex match) | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Replace static boost with semantic relevance scoring. |
| `ContradictionResolver.ts` | 205–214 | Static English word arrays (`dimensionSets`) | **Tier 6: [ARBITRARY]** | **ELIMINATE.** Compare structured attribute slots against canonical schema. |
| `LifeStateWeights.ts` | 13–75 | 25+ frozen formula weights | **Tier 5: [LEARNED]** | **PARAMETERIZE.** Maintain baseline defaults; support user-profile calibration. |
| `CadenceLearningEngine.ts` | 21, 28 | `decayHalfLifeDays: 21.0` | **Tier 1: [TECH-INV]** | **PRESERVE.** Mathematical recency decay parameter ($\tau = 21$ days). |
| `CadenceLearningEngine.ts` | 48–56 | Circular trigonometry modulo 1440 | **Tier 1: [TECH-INV]** | **PRESERVE.** Trigonometric averaging for midnight-crossing times. |
| `CapabilityRegistry.ts` | 41–65 | RFC 8785 JSON Canonicalization (JCS) | **Tier 1: [TECH-INV]** | **PRESERVE.** Deterministic SHA-256 contract hashing. |
| `PlanValidator.ts` | 40–80 | Kahn's topological sort (depth $\le 5$) | **Tier 1: [TECH-INV]** | **PRESERVE.** Mathematical cycle detection in workflow DAGs. |
| `HITLGovernanceEngine.ts` | 98–140 | HMAC-SHA256 & `timingSafeEqual` | **Tier 2: [SEC-POL]** | **PRESERVE.** Cryptographic non-repudiation and timing attack defense. |
| `WorkerLeaseManager.ts` | 66–69 | Atomic CAS & monotonic generation | **Tier 2: [SEC-POL]** | **PRESERVE.** Distributed locking and split-brain prevention. |
| `DWCPRecoverySweeper.ts` | 78–120 | L1 ring buffer + L2 store verification | **Tier 2: [SEC-POL]** | **PRESERVE.** Dual-write anti-corruption quarantine. |

---

## 6. Rejection, Refusal & Silent Fallback Evidence Inventory

This inventory documents every early return, rejection, refusal, and fallback path across the production call graph, demonstrating how the repository was searched and verifying that legitimate protections are retained while arbitrary rejections are removed.

### Search Methodology
Searched across `packages/execution-kernel/src/` and `apps/web/` using AST and text queries for:
`return null`, `return false`, `rejectionReason`, `status: "failed"`, `status: "rejected"`, `throw new Error`, `assertDatabaseConnected`, and `apiError`. Every result was traced to its caller.

### Complete Rejection & Fallback Inventory

| Finding ID | File Path & Function | Rejection / Fallback Expression | Owner | Invariant Requiring It | Classification | Action in Remediation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`FB-01`** | `SemanticIntentInterpreter.ts#L1025` | `return { primaryClassification: "CASUAL_DIALOGUE", operations: [] }` | `SemanticIntentInterpreter` | Upstream Outage Resilience | **UNJUSTIFIED SILENT FALLBACK** | **ELIMINATE.** Return explicit `ambiguityStatus: "UPSTREAM_OUTAGE"`, emit error event, and inform user without dropping intent. |
| **`FB-02`** | `FastPathExecutor.ts#L109,L147` | `if (!taskId) return null;` | `FastPathExecutor` | Precondition Verification | **UNJUSTIFIED SILENT REJECTION** | **ELIMINATE.** Route through `AuthoritativeEntityResolver`. Return `status: "NOT_FOUND"` with clarification opportunity. |
| **`HC-04`** | `actionExtractor.ts#L58` | Drops unlisted signals (`"DO NOT invent new signal keys"`) | `actionExtractor` | Legacy Schema Boundary | **UNJUSTIFIED SILENT LOSS** | **ELIMINATE.** Query `SignalDefinitionModel`. Hydrate user-defined signals dynamically. |
| **`PM-01`** | `DynamicRouter.ts#L40` | Rejects `DYNAMIC_WORKFLOW` if message lacks `"summarize"` / `"save"` | `DynamicRouter` | Dynamic Orchestration Gate | **UNJUSTIFIED REJECTION** | **ELIMINATE.** Detect multi-step workflows from `SemanticTurn.operations.length > 1` and step dependencies. |
| **`PM-05`** | `ContradictionResolver.ts#L205` | Ignores contradictions not in 4 English word arrays | `ContradictionResolver` | Epistemic Integrity | **UNJUSTIFIED SILENT LOSS** | **ELIMINATE.** Compare structured schema attribute slots (`attribute === existing.attribute && value !== existing.value`). |
| **`RG-04`** | `Supervisor.ts#L701` | Rejects affirmations not matching regex `/^(?:yes\|yep...)/i` | `Supervisor` | Safety Confirmation | **UNJUSTIFIED REJECTION** | **ELIMINATE.** Rely on `semanticTurn.primaryClassification === "CONFIRMATION"` or explicit client UI tokens. |
| **`SEC-01`** | `apps/web/app/api/conversation/route.ts#L43` | `return apiError("Unauthorized", "UNAUTHORIZED", 401)` | `AuthGateway` | Security Invariant 1 | **LEGITIMATE SECURITY PROTECTION** | **PRESERVE.** Reject unauthenticated API requests. |
| **`SEC-02`** | `HITLGovernanceEngine.ts#L20` | `throw new TamperedInterventionError(...)` | `HITLGovernanceEngine` | Security Invariant 2 | **LEGITIMATE SECURITY PROTECTION** | **PRESERVE.** Reject HMAC-SHA256 signature mismatches via `timingSafeEqual`. |
| **`SEC-03`** | `WorkerLeaseManager.ts#L72` | Returns null if `leaseGeneration` does not match (fenced out) | `WorkerLeaseManager` | Concurrency Invariant | **LEGITIMATE FENCING PROTECTION** | **PRESERVE.** Fenced-out workers must not commit stale event acknowledgments. |
| **`VAL-01`** | `PlanValidator.ts#L60` | Rejects workflow plan if Kahn's sort detects dependency cycle | `PlanValidator` | Mathematical Invariant | **LEGITIMATE VALIDATION PROTECTION** | **PRESERVE.** Cyclic plans must never execute; return `INVALID_PLAN_CYCLE`. |
| **`VAL-02`** | `DefaultActionAdapters.ts#L26` | Throws `[KERNEL_DATABASE_DISCONNECTED]` if MongoDB disconnected | `KernelCapabilityService` | Data Integrity Invariant | **LEGITIMATE STATE PROTECTION** | **PRESERVE.** Never execute mutations against a disconnected database. |
| **`VAL-03`** | `DefaultActionAdapters.ts#L55` | Returns `valid: false, reason: "CONFLICT_REQUIRES_CLARIFICATION"` | `CreateTaskAdapter` | Duplicate Domain Policy | **LEGITIMATE CONTEXT PROTECTION** | **PRESERVE.** Prompts user when identical task is already scheduled for today. |

---

## 7. Corrected Model-Driven Fast Execution Eligibility Gate

The fast execution gate allows atomic, unambiguous operations to execute efficiently without spawning multi-agent ReAct overhead, while maintaining 100% adherence to semantic interpretation, schema validation, and entity resolution.

### 7.1 Separation of Creation vs Mutation vs Clarification vs HITL

The gate explicitly distinguishes four operation categories:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ OPERATION CATEGORY DISPATCH TAXONOMY                                                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CATEGORY 1: NEW-ENTITY CREATION (create_task, create_goal, log_meal, schedule)         │
│ - Requires: Valid Zod payload schema + duplicate policy check (ActionAdapters).        │
│ - Does NOT require existing database targetEntityId.                                   │
│ - Eligible for Fast Execution if unambiguous and non-HITL.                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CATEGORY 2: EXISTING-ENTITY MUTATION (complete_task, delete_task, update_task)         │
│ - Requires: targetEntityId definitively resolved against MongoDB by Entity Resolver.  │
│ - Target entity must exist in user's tenant boundary.                                 │
│ - Eligible for Fast Execution if resolved, unambiguous, and non-HITL.                 │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CATEGORY 3: CLARIFICATION REQUIRED (ambiguous references, missing required fields)     │
│ - Condition: ambiguityStatus === "AMBIGUOUS" OR missing mandatory parameters.          │
│ - INELIGIBLE for execution. Supervisor halts and returns structured clarification turn.│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CATEGORY 4: HUMAN AUTHORIZATION REQUIRED (HITL) (destructive, high-risk, external)    │
│ - Condition: descriptor.requiresApproval === true OR riskClass === "HIGH_IRREVERSIBLE".│
│ - INELIGIBLE for immediate execution. Generates HMAC-signed pending intervention.      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 The Exact Execution Readiness Specification

```typescript
export function evaluateFastExecutionEligibility(
  semanticTurn: SemanticTurn,
  isMultiStepGoal: boolean
): { eligible: boolean; proposal?: ActionProposal; reason: string } {

  // Gate 1: Must be a single atomic operation
  if (semanticTurn.operations.length !== 1) {
    return { eligible: false, reason: "Turn contains zero or multiple operations" };
  }

  // Gate 2: Primary classification must be ACTION_REQUEST
  if (semanticTurn.primaryClassification !== "ACTION_REQUEST") {
    return { eligible: false, reason: "Turn is dialogue, query, or reflection" };
  }

  // Gate 3: Must be completely unambiguous
  if (semanticTurn.ambiguityStatus !== "UNAMBIGUOUS") {
    return { eligible: false, reason: "Semantic ambiguity detected; requires clarification" };
  }

  // Gate 4: Must not be a composite dynamic workflow
  if (isMultiStepGoal) {
    return { eligible: false, reason: "Composite workflow requires DynamicWorkflowPlanner" };
  }

  const op = semanticTurn.operations[0];
  const cap = DOMAIN_CAPABILITIES[op.actionType];

  if (!cap) {
    return { eligible: false, reason: `Unknown actionType: ${op.actionType}` };
  }

  // Gate 5: Entity Resolution check grounded in capability contract
  if (cap.requiresTargetEntity) {
    // Existing-Entity Mutation: MUST have a resolved database entity ID
    if (!op.targetEntityId || op.targetEntityId === "RESOLVE_AT_EXECUTION") {
      return { eligible: false, reason: `Action '${op.actionType}' requires resolved targetEntityId` };
    }
  } else {
    // New-Entity Creation: Must have valid payload fields
    if (!op.payload || Object.keys(op.payload).length === 0) {
      return { eligible: false, reason: `Creation action '${op.actionType}' requires valid payload` };
    }
  }

  // Gate 6: HITL Governance check
  const descriptor = CapabilityRegistry.getInstance().getCapability(op.capabilityURN || op.actionType);
  const requiresHITL =
    descriptor?.requiresApproval === true ||
    op.riskClass === "HIGH_IRREVERSIBLE" ||
    (descriptor?.requiredResources || []).some((r) => r.accessMode === "EXCLUSIVE_LOCK");

  if (requiresHITL) {
    return { eligible: false, reason: "Operation requires explicit human authorization" };
  }

  // Construct validated ActionProposal
  const proposal: ActionProposal = {
    id: generateId("act"),
    domain: op.domain,
    actionType: op.actionType,
    targetEntityId: op.targetEntityId,
    payload: op.payload,
    rationale: op.rationale || "Validated single-turn semantic execution",
    reversibility: descriptor?.isReversible ? "reversible_with_compensation" : "atomic_single_doc",
    idempotencyKey: `turn_${op.operationId}`, // Stable, deterministic token; ZERO Date.now()
  };

  return { eligible: true, proposal, reason: "All structural fast execution invariants satisfied" };
}
```

---

## 8. Semantic Generalization Evaluation Strategy

To ensure LifeOS adapts to concepts it was never explicitly programmed to recognize, the evaluation strategy mandates testing against **unseen variations** using a dynamic permutation engine rather than relying exclusively on fixed static strings.

### 8.1 The Generative Variation Testing Methodology

Each scenario defines:
1. **Core Invariant Contract:** The expected semantic operation, domain, entity grounding, and state transition.
2. **Generative Permutation Matrix:** A combinatorial engine that generates unseen variations across linguistic dimensions:
   - **Syntactic Form:** Imperative (*"Log 4.5h deep work"*), Declarative (*"I spent four and a half hours on deep work today"*), Interrogative (*"Can you add 4.5 hours of deep work?"*), Past-tense reporting (*"Done 4.5h deep work today"*).
   - **Lexical Register:** Technical/formal, conversational slang (*"crushed 4.5 hours of deep focus"*), concise shorthand (*"deep work 4.5h"*), verbose narrative.
   - **Linguistic Perturbation:** Minor typos (*"deep wrk 4.5 hrs"*), filler words (*"hey aven, like, log 4.5 hours"*), mixed-case.
   - **Multilingual Code-Switching:** Spanish (*"Registra 4.5 horas de deep work"*), Hinglish (*"Aaj 4.5 ghante deep work kiya log kardo"*).

### 8.2 The Ten Adversarial Scenario Specifications

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ THE TEN ADVERSARIAL GENERALIZATION TEST SPECIFICATIONS                                 │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 1: Custom User-Defined Signal                                                 │
│ Template: [Report custom metric value]                                                 │
│ Variations: "Blood ketones measured 1.8 mmol/L" | "Ketones: 1.8" | "1.8 mmol ketones"  │
│ Verification: Extracts signal key 'blood_ketones_mmol', value 1.8. Persists to DailyLog.│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 2: Unfamiliar Activity Category                                               │
│ Template: [Novel martial art / sport activity with duration]                          │
│ Variations: "90 min Brazilian Jiu-Jitsu sparring" | "Did BJJ for an hour and a half"   │
│ Verification: Routes to health specialist. CadenceConsumer records exact title & 90 min.│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 3: Novel Goal Phrasing                                                        │
│ Template: [Novel habit objective with cadence and target]                              │
│ Variations: "Read 25 pages of Dune daily" | "I commit to 25 pages of Dune every night" │
│ Verification: Proposes goal with cadence 'daily', target 25, metric 'pages'.           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 4: Colloquial & Indirect Language                                             │
│ Template: [Task completion expressed in idiomatic slang]                               │
│ Variations: "Knocked out the taxes" | "Wrapped up tax filing" | "Taxes are in the bag" │
│ Verification: AuthoritativeEntityResolver matches active task; CompleteTask executes.   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 5: Multilingual Requests                                                      │
│ Template: [Non-English task completion and scheduling]                                 │
│ Variations: "Terminé la tarea de física 101" (ES) | "Kal subah 7 baje gym workout" (HI)│
│ Verification: Correctly resolves task and schedules occurrence at 07:00 tomorrow.      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 6: Ambiguous Instruction with Multi-Candidate Entity Disambiguation           │
│ Template: [Target reference matches multiple active database records]                  │
│ Context: Two active tasks: "Review PR #101" and "Review PR #102".                     │
│ Variations: "Mark review PR done" | "Complete the PR task"                            │
│ Verification: Returns ambiguityStatus: 'AMBIGUOUS' with candidate IDs. Never guesses. │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 7: Multi-Domain Compound Request                                              │
│ Template: [Compound utterance spanning 3 distinct domains]                             │
│ Variations: "Felt exhausted, reschedule heavy lifting to tomorrow and log 8h sleep"    │
│ Verification: Decomposes into 3 operations across wellness, productivity, and health.  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 8: Dynamically Discovered Capability (Unseen MCP Tool)                        │
│ Template: [Invoke capability registered at runtime with requiresApproval: false]       │
│ Setup: Registry registers 'notion.query_database' dynamically.                         │
│ Variations: "Fetch open tickets from my Notion database"                              │
│ Verification: Executes without false HITL block; outputs structured tool result.       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 9: Context-Dependent Temporal Anaphora                                        │
│ Template: [Pronoun reference requiring conversational short-term memory]               │
│ Context: Turn 1: "When is my sync with Sarah?" -> "At 3:00 PM."                       │
│ Variations: Turn 2: "Push it back 45 mins" | "Move that to 3:45"                      │
│ Verification: Resolves 'it' to Sarah meeting; reschedules occurrence to 3:45 PM.       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 10: Explicit Urgency Preservation Without Default Priority Override          │
│ Template: [Task creation with explicit urgency qualifiers]                             │
│ Variations: "Add task: Audit server logs ASAP high priority"                           │
│ Verification: Task title is 'Audit server logs'; priority is 'high' (never 'medium').  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Preservation of Legitimate Deterministic Systems Engineering

Zero tolerance for arbitrary semantic heuristics must **never** weaken legitimate deterministic systems engineering. The following mechanisms are classified as legitimate engineering invariants and are protected:

| Mechanism | Engineering Invariant & Purpose | Location |
| :--- | :--- | :--- |
| **RFC 8785 JSON Canonicalization (JCS)** | Deterministic SHA-256 contract hashing across distributed nodes. | `CapabilityRegistry.ts` |
| **Kahn's Topological Sort** | Mathematical cycle detection and dependency ordering for workflow DAGs. | `PlanValidator.ts` |
| **HMAC-SHA256 & timingSafeEqual** | Cryptographic non-repudiation and side-channel attack prevention. | `HITLGovernanceEngine.ts` |
| **Atomic CAS & Monotonic Fencing** | Concurrency control preventing split-brain execution across worker leases. | `WorkerLeaseManager.ts` |
| **Two-Tier DWCP Receipt Recovery** | Authoritative aggregate reconciliation and anti-corruption quarantine. | `DWCPRecoverySweeper.ts` |
| **Circular Trigonometry Modulo 1440** | Continuous mathematical averaging of clock time crossing midnight. | `CadenceLearningEngine.ts` |
| **Zod Schema Validation** | Structural type safety and payload sanitization at kernel ingress. | `ActionPayloadSchemas.ts` |
| **Optimistic Version Checks** | Prevention of lost updates in high-concurrency document state transitions. | Domain execution handlers |

---

## 10. Updated 6-Phase / 17-Loop Remediation Roadmap

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Stage 1 & Stage 4 Core Semantic Disintermediation [P0]       │
│ (STRICTLY BLOCKS Step 1 V2.2)                                          │
│   ├── Loop 1: Deprecate Fast-Path Regex & Add Model-Driven Fast Path   │
│   ├── Loop 2: Connect LLM Client to DynamicWorkflowPlanner             │
│   ├── Loop 3: Replace 22-Line String Whitelist with CapabilityRegistry │
│   ├── Loop 4: Eliminate Assistant Prose Keyword Action Coercion       │
│   └── Loop 5: Fix Broken Dynamic Idempotency Keys                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ GATE: All 5 Loops Verified
┌────────────────────────────────────────────────────────────────────────┐
│ STEP 1 V2.2 IMPLEMENTATION & APPLICATION MUTATION CLOSURE              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Stage 1 & Stage 4 Domain Adaptability & Routing Hardening [P1]│
│   ├── Loop 6: Replace DynamicRouter Regex Word Boundaries             │
│   ├── Loop 7: Remove Custom Signal Prohibition from Prompt            │
│   └── Loop 8: Structured Semantic Confirmation Detection              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Stage 2 Semantic Memory & Epistemic Verification [P1]         │
│   ├── Loop 9: Structured Epistemic Verification & Importance Scoring   │
│   └── Loop 10: Schema-Grounded Contradiction Resolution                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: Stage 3 & Milestone B4 Autonomous Strategy Calibration [P1/P2]│
│   ├── Loop 11: Eliminate Host System Timezone Leaks in Strategies     │
│   ├── Loop 12: Parameterize Intervention Windows & Success Criteria    │
│   └── Loop 13: Parameterize Schedule Rebalancer Conflict Buffers       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: Milestones B1 & B2 Causal Contracts & Feature Weights [P2]    │
│   ├── Loop 14: Eliminate Event Substring Checks in Cadence Consumer    │
│   └── Loop 15: Parameterize LifeStateWeights into Configurable Profiles│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 6: Legacy Subsystem Decommissioning [P3]                         │
│   ├── Loop 16: Delete Dead toolRouter.ts                               │
│   └── Loop 17: Archive Deprecated intentRouter.ts & intentModel.ts     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Updated Loop-by-Loop Acceptance Criteria & Checkpoints

### The Loop Engineering Execution Cycle
Every loop must follow the standardized six-step protocol:
`IMPLEMENT → INSPECT → VERIFY → REFINE → REPEAT → ACCEPT`.
Inspection includes the entire affected call path, not merely the modified files.

| Loop | Affected Modules | Target Violations | Specific Acceptance Criteria | CI Rule Enforced |
| :--- | :--- | :--- | :--- | :--- |
| **Loop 1** | `Supervisor.ts`, `FastPathExecutor.ts` | `RG-01`, `HC-03` | 1. Zero regex in `canHandle` or `extractProposal`.<br>2. All requests enter `SemanticIntentInterpreter`.<br>3. Fast execution applies only when Section 7 criteria pass. | `ARCH-01` |
| **Loop 2** | `Supervisor.ts`, `DynamicWorkflowPlanner.ts` | `HC-01`, `HC-02` | 1. `DynamicWorkflowPlanner` instantiated with active `groqChat` LLM client.<br>2. Fallback plan disabled in production (`NODE_ENV === "production"`).<br>3. Novel 3-step dynamic workflow executes cleanly. | `ARCH-05` |
| **Loop 3** | `Supervisor.ts`, `CapabilityRegistry.ts` | `PM-04` | 1. 22-line `.includes(...)` list deleted from `Supervisor.ts`.<br>2. Permissions query `CapabilityRegistry`.<br>3. Read-only MCP tools execute without HITL prompts. | `ARCH-03` |
| **Loop 4** | `Supervisor.ts` | `PM-03` | 1. Lines 473–476 deleted.<br>2. Assistant response text never inspected to assign `actionType`.<br>3. Task containing word "block" remains a task. | `ARCH-02` |
| **Loop 5** | `FastPathExecutor.ts` | `HC-03` | 1. `${Date.now()}` removed from idempotency keys.<br>2. Idempotency keys derived deterministically from request/turn.<br>3. Duplicate request returns `REJECTED_IDEMPOTENT_DUPLICATE`. | `ARCH-04` |
| **Loop 6** | `DynamicRouter.ts` | `RG-02`, `PM-01` | 1. Word boundary regexes deleted.<br>2. Routing strategy derived strictly from `SemanticTurn` operations.<br>3. Novel activity routes to health domain. | `ARCH-08` |
| **Loop 7** | `actionExtractor.ts` | `HC-04` | 1. Line 58 restriction removed.<br>2. Novel signal keys registered in `SignalDefinitionModel`.<br>3. Custom signal logged without rejection. | Contract Test |
| **Loop 8** | `Supervisor.ts` | `RG-04` | 1. Regex confirmation matcher deleted.<br>2. Confirmation requires `primaryClassification === "CONFIRMATION"`.<br>3. Multilingual affirmations confirm pending action. | Contract Test |
| **Loop 9** | `EpistemicVerificationEngine.ts` | `RG-03`, `HC-09` | 1. Regex noise and importance arrays deleted.<br>2. Memory candidates verified via provenance and goal relevance.<br>3. Novel health disclosures preserved in LTM. | Adaptability Test |
| **Loop 10** | `ContradictionResolver.ts` | `PM-05` | 1. Static English word sets deleted.<br>2. Contradictions detected via schema attribute-value slot comparison.<br>3. Multilingual contradictions resolved cleanly. | Adaptability Test |
| **Loop 11** | `CircadianEnergyAlignmentStrategy.ts`, `ScheduleRebalancerStrategy.ts` | `TZ-LEAK` | 1. `now.getHours()` and UTC date slice deleted.<br>2. Circadian hours evaluated with user timezone via `Intl.DateTimeFormat`.<br>3. Pacific user on UTC server evaluated correctly. | `ARCH-07` |
| **Loop 12** | `InterventionVerificationEngine.ts` | `HC-05` | 1. Fixed T+4h/T+24h windows parameterized into intervention contracts.<br>2. Strategy-declared evaluation functions replace static 0.8 threshold. | Contract Test |
| **Loop 13** | `ScheduleRebalancerStrategy.ts` | `HC-08` | 1. Hardcoded +15 min buffer replaced by user preference `transitionBufferMinutes`. | Preference Test |
| **Loop 14** | `CadenceLearningConsumer.ts` | `PM-07` | 1. Substring `.includes("workout")` replaced by exact canonical schemas.<br>2. Unmeasured durations remain explicitly unknown (`undefined`). | Causal Test |
| **Loop 15** | `LifeStateWeights.ts` | `HC-06` | 1. Frozen formula weights converted into configurable profile objects.<br>2. Support user calibration profiles. | WorldModel Test |
| **Loop 16** | `toolRouter.ts` | `LG-01` | 1. Delete dead file `toolRouter.ts`.<br>2. Zero imports remain in repository. | `ARCH-06` |
| **Loop 17** | `intentRouter.ts`, `intentModel.ts` | `LG-02`, `LG-03` | 1. Remove from production build paths.<br>2. Archive to legacy test fixtures. | `ARCH-06` |

---

## 12. Risks, Compatibility Implications & Migration Strategy

| Risk Area | Architectural Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Latency Increase on Atomic Turns** | Removing FastPath regex increases turn latency from ~150ms to ~500ms (Groq LLM inference). | Accepted as the necessary cost of semantic correctness. Mitigated by Section 7 single-turn fast execution gate which avoids multi-agent ReAct overhead. |
| **LLM DAG Synthesis Failures** | Dynamic workflow generation may produce invalid DAGs if prompt is under-constrained. | Enforce `PlanValidator.validate()` with Kahn's topological sort and cycle checks. Gracefully fail-closed with clear error explanation. |
| **Unregistered Capability HITL Block** | Removing the 22-line whitelist means capabilities without descriptors default to approval prompt. | Audit all capabilities in `CapabilityRegistry` to guarantee complete `requiresApproval` and `accessMode` declarations. |
| **Database Migrations** | Parameterizing feature weights and cadence profiles requires schema support. | Use non-breaking Mongoose schema extensions with default fallback values. |
| **Backwards Compatibility in Tests** | Older tests that mocked synthetic strings constructed specifically for FastPath regex may fail. | Update test fixtures to provide structured conversational messages; assert semantic grounding. |

---

## 13. Final Authoritative Definition of Done

The Global Semantic Architecture Remediation Initiative will be complete only when:
1. **Zero Regex in Semantic Paths:** No natural-language interpretation, entity extraction, or routing depends on regular expressions.
2. **Zero Keyword Action Coercion:** No generated assistant prose is inspected for keywords to mutate underlying state machine operations.
3. **Contract-Based Governance:** 100% of tool execution permissions are governed by authoritative `CapabilityDescriptor` properties.
4. **Model-Driven Dynamic Planning:** `DynamicWorkflowPlanner` dynamically synthesizes valid DAGs using discovered capabilities, with zero benchmark fallback plans in production.
5. **Universal Idempotency:** All action proposals derive deterministic idempotency keys from turn and request metadata, with zero dynamic timestamps.
6. **Open-Ended Concept Adaptability:** Custom signals, novel goals, and unanticipated activities execute successfully without developer code changes across all 10 adversarial scenarios and their generative variations.
7. **Clean Legacy Boundary:** Dead files (`toolRouter.ts`) and deprecated models (`intentRouter.ts`, `intentModel.ts`) are decommissioned.
8. **Deterministic Kernel Transitions:** Identical validated inputs and canonical state produce identical state transitions and causally ordered outbox events.
9. **Automated CI Enforcement Active:** Static AST analysis (`scripts/verify-semantic-architecture.ts`) and architecture tests pass cleanly in CI with zero unexempted violations.
10. **Tamper-Proof Protection:** CI enforcement scripts and protected paths are locked under cryptographic hash verification and codeowners protection.
11. **Final Repository Audit:** An independent audit confirms zero replacement heuristics were introduced across the entire codebase.

---

## 14. Gating Directive Regarding Step 1 V2.2

**STRICT DIRECTIVE:** Do NOT authorize or begin Step 1 V2.2 until **Phase 1 (Loops 1–5)** is fully implemented, verified, and accepted under automated CI enforcement.

Integrating 26+ application-layer mutation paths while `FastPathExecutor`'s regex interceptor, broken idempotency keys, and hardcoded supervisor permission whitelists remain active would permanently institutionalize architectural violations in the sovereign kernel. Phase 1 provides the required clean, contract-governed foundation for Step 1 V2.2.
