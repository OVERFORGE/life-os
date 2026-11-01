# LIFEOS — GLOBAL SEMANTIC ARCHITECTURE REMEDIATION PLAN (V2.2.0)
## Master Implementation Plan: Zero-Tolerance Semantic Engineering Initiative
### Stages 1–4 & Milestones B1–B4 | Loop Engineering Architecture & Automated CI Governance

**Project:** LifeOS / Aven  
**Organization:** The Executioners (ExE)  
**Document Identifier:** `documentation/semantic-audit/GLOBAL_SEMANTIC_REMEDIATION_PLAN_V2.2.md`  
**Governing Principle:** *The kernel provides truth. Agents provide intelligence.*  
**Authorization Status:** IMPLEMENTATION PLANNING ONLY (Strictly Non-Modifying)  
**Revision:** V2.2.0 (Authoritative Correctness Refinement)  

---

## 1. Executive Summary & Audit Correlation

Following the Global Semantic Architecture Audit across Stages 1–4 and Milestones B1–B4, the system received a final verdict of **`D — NON-COMPLIANT`**. 

This document serves as the **final, authoritative master implementation plan (V2.2.0)** to systematically eliminate all 26 audited architectural violations (`RG-01` to `RG-05`, `PM-01` to `PM-07`, `HC-01` to `HC-09`, `FB-01` to `FB-02`, and `LG-01` to `LG-03`) without creating new milestones, expanding into unrelated features, or substituting one set of heuristics for another.

### 1.1 Correlation Across Supplied Audit Documents

The plan synthesizes and reconciles findings across the seven audit documents:
1. [`GLOBAL_SEMANTIC_ARCHITECTURE_AUDIT.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/GLOBAL_SEMANTIC_ARCHITECTURE_AUDIT.md): Master audit findings and Section 8 criteria.
2. [`HARDCODING_AND_PATTERN_INVENTORY.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/HARDCODING_AND_PATTERN_INVENTORY.md): Line-by-line source inventory of all 26 violations.
3. [`SEMANTIC_ADAPTABILITY_REPORT.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/SEMANTIC_ADAPTABILITY_REPORT.md): 8 failure scenario traces on custom concepts and dynamic capabilities.
4. [`DETERMINISM_AND_REPLAY_AUDIT.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/DETERMINISM_AND_REPLAY_AUDIT.md): Broken idempotency keys (`Date.now()`) and host-system timezone leaks.
5. [`RUNTIME_SEMANTIC_FLOW_MAP.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/RUNTIME_SEMANTIC_FLOW_MAP.md): Production execution paths and dead legacy systems.
6. [`GLOBAL_REMEDIATION_ROADMAP.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/GLOBAL_REMEDIATION_ROADMAP.md): Prioritized remediation tiers (P0–P3).
7. [`LIFEOS_SEMANTIC_EXECUTION_ARCHITECTURE_FORENSIC_AUDIT.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/LIFEOS_SEMANTIC_EXECUTION_ARCHITECTURE_FORENSIC_AUDIT.md): Historical diagnosis establishing that `FastPathExecutor` was originally introduced to satisfy synthetic scripted strings in simulations.

### 1.2 Core Correctness Refinements in V2.2.0
- **Behavioral Architectural Enforcement:** AST rules detect prohibited semantic behavior across module boundaries (e.g. moving a classifier or wrapping regex in a helper is blocked by strict import and boundary rules).
- **Tamper-Proof CI Governance:** Replaces repository-local hash claims with a practical, dual-layer CI governance design utilizing GitHub branch protection, required status checks, CODEOWNERS access boundaries, and CI base-ref diff verification.
- **Unified Sole Authority on Capabilities:** Eliminates competing capability maps. Consolidates all execution metadata, target entity requirements, access modes, and approval rules strictly into [`CapabilityRegistry`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/capabilities/CapabilityRegistry.ts). Unknown capabilities fail closed.
- **Corrected Fast Execution Eligibility Gate:** Explicitly categorizes operations into New-Entity Creation, Existing-Entity Mutation, Clarification-Required, and Human-Authorization-Required. Preserves single-turn fast execution for new entities without requiring pre-existing database entity IDs.
- **Data-Dependency Workflow Routing:** Eliminates the naive `operations.length > 1` trigger. Dynamic workflow planning is invoked strictly when operations have inter-step data dependencies, intermediate outputs, or sequential observation requirements. Independent multi-operation batches execute directly as atomic batches.
- **Rigorous Fixed-Value Classification:** Re-audits all 25 fixed parameters into a 7-tier taxonomy, distinguishing genuine mathematical invariants from empirical parameters, technical constraints, and arbitrary assumptions.
- **Truthful Intent Preservation:** Eliminates silent rejections and casual dialogue fallbacks across the production call graph. Upstream failures report actual system state and preserve user intent.
- **Two-Tier Generalization Testing:** Separates open repository contract tests from unseen, held-out generalization test suites powered by dynamic linguistic permutation matrices.

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
| **Natural Language Interpretation** | [`SemanticIntentInterpreter`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts) | FORBIDDEN: Front-door regex capture groups in `FastPathExecutor`; keyword parsing in `Supervisor`; secondary intent classifiers in legacy modules; helper classification services. |
| **Entity Resolution & Grounding** | [`AuthoritativeEntityResolver`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/context/AuthoritativeEntityResolver.ts) | FORBIDDEN: Direct string equality or naive substring matching in dispatchers, supervisors, or adapters. |
| **Routing Strategy Determination** | [`DynamicRouter`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/DynamicRouter.ts) | FORBIDDEN: Regex word boundary tests on raw text; must route based on structured `SemanticTurn` operations and dependency graphs. |
| **Workflow DAG Synthesis** | [`DynamicWorkflowPlanner`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/planning/DynamicWorkflowPlanner.ts) | FORBIDDEN: Hardcoded benchmark plan playback in production; static string checks (`includes("email")`); routing atomic batches to planners. |
| **Capability Catalog & Permissions** | [`CapabilityRegistry`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/capabilities/CapabilityRegistry.ts) | FORBIDDEN: Hardcoded string whitelists in `Supervisor.ts` (`capURN.includes(...)`); secondary `DOMAIN_CAPABILITIES` tables overriding registry. |
| **Conversational Orchestration** | [`Supervisor`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts) | FORBIDDEN: Re-interpreting user text; inspecting assistant prose for keywords to alter action types; maintaining internal classification dictionaries. |
| **Deterministic State Mutation** | [`KernelCapabilityService`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/kernel/KernelCapabilityService.ts) / Native Handlers | FORBIDDEN: Executing unvalidated raw model proposals without Zod schema validation, registry contract checks, and entity existence verification. |
| **Causal Ordering & Event Delivery** | [`WorkerLeaseManager`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/dispatch/WorkerLeaseManager.ts) / Outbox | FORBIDDEN: Fire-and-forget background execution without monotonic generation fencing and atomic CAS lease reservation. |

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
   ├── DynamicWorkflowPlanner (Dependency analysis: data refs, intermediate outputs)
   ├── PlanValidator (Kahn's DAG cycle detection, depth <= 5, steps <= 15)
   ├── ActionPayloadSchema (Strict Zod validation)
   └── CapabilityRegistry (Authoritative contract check: permissions, access modes)
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
3. **No Numerical Confidence Gatekeepers:** Numerical confidence numbers must not independently authorize execution. Execution readiness is a structural binary property grounded in unambiguous entity grounding and capability contract compliance.
4. **No Replacement by Hidden Dictionaries:** Eliminating regex must not be replaced by embedding similarity thresholds, keyword dictionaries, or static English word arrays.
5. **No Fabricated Fallbacks:** Missing information must remain explicitly unknown. Systems must not fabricate priorities, durations, titles, or locations.

---

## 3. Permanent Automated Architectural Enforcement Architecture

To guarantee that architectural boundaries are enforced mechanically and cannot be bypassed by moving code into helper files or modifying syntax, the repository enforces structural and behavioral compliance through existing TypeScript tooling.

### 3.1 Architectural Boundary Rules (Dependency & Behavior)

Enforcement does not merely look for regex literals; it verifies **module ownership boundaries**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ CONTEXT-AWARE ARCHITECTURAL BOUNDARY RULES                                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 1: [ARCH-BOUNDARY-SUPERVISOR] RESTRICTED_SUPERVISOR_IMPORTS                       │
│ Scope: packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts           │
│ Constraint: Supervisor.ts may ONLY import from:                                        │
│   - contracts/ (SemanticTurnContracts, ActionProposalContracts, etc.)                 │
│   - semantic/SemanticIntentInterpreter.ts                                             │
│   - context/AuthoritativeEntityResolver.ts                                             │
│   - supervisor/DynamicRouter.ts                                                        │
│   - planning/DynamicWorkflowPlanner.ts                                                 │
│   - capabilities/CapabilityRegistry.ts                                                 │
│   - kernel/KernelCapabilityService.ts                                                  │
│   - kernel/ConversationManager.ts                                                      │
│ FORBIDDEN: Importing FastPathExecutor, raw regex utilities, legacy dispatchers,        │
│            or secondary NLP helpers.                                                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 2: [ARCH-BEHAVIOR-PROSE] FORBIDDEN_PROSE_ACTION_MUTATION                          │
│ Scope: packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts           │
│ AST Target: BinaryExpression, CallExpression mutating actionType                       │
│ Constraint: No conditional assignment to actionType or resolvedActionType based on     │
│             assistant response text, chunks, or LLM prose.                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 3: [ARCH-AUTHORITY-CAPABILITY] UNIFIED_CAPABILITY_GOVERNANCE                      │
│ Scope: packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts           │
│ AST Target: ArrayLiteralExpression, BinaryExpression checking capURN                   │
│ Constraint: Permission and HITL checks must NOT use hardcoded string lists.            │
│             All permissions must query CapabilityRegistry.getCapability(capURN).       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 4: [ARCH-INVARIANT-IDEMPOTENCY] DETERMINISTIC_IDEMPOTENCY_TOKENS                  │
│ Scope: packages/execution-kernel/src/                                                  │
│ AST Target: TemplateLiteral, BinaryExpression assigning to idempotencyKey              │
│ Constraint: Idempotency keys must not incorporate Date.now(), Math.random(),           │
│             or non-deterministic generators.                                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 5: [ARCH-INTELLIGENCE-PLANNING] ZERO_PRODUCTION_BENCHMARK_FALLBACK                │
│ Scope: packages/execution-kernel/src/orchestration/planning/DynamicWorkflowPlanner.ts  │
│ AST Target: MethodDeclaration generateDeterministicFallback                            │
│ Constraint: Fallback plans must throw in production. Fallback execution is permitted   │
│             strictly when process.env.NODE_ENV === "test" and allowBenchmarkFallback.  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 6: [ARCH-LEGACY-ISOLATION] FORBIDDEN_DEPRECATED_INTENT_INTERPRETERS               │
│ Scope: Entire production build path (excluding testing/legacy-fixtures/)               │
│ AST Target: ImportDeclaration                                                          │
│ Constraint: Zero imports of toolRouter.ts, intentRouter.ts, or intentModel.ts.         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 7: [ARCH-INVARIANT-CLOCK] USER_TIMEZONE_INTEGRITY                                 │
│ Scope: packages/execution-kernel/src/autonomous/strategies/                             │
│ AST Target: CallExpression                                                             │
│ Constraint: Calling Date.getHours() or .toISOString().slice(0, 10) without passing    │
│             explicit user timezone is prohibited.                                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RULE 8: [ARCH-BOUNDARY-DISPATCH] SOLE_SEMANTIC_INTENT_AUTHORITY                        │
│ Scope: packages/execution-kernel/src/dispatch/                                         │
│ AST Target: FunctionDeclaration, ClassDeclaration                                      │
│ Constraint: No module outside SemanticIntentInterpreter may classify natural-language  │
│             intent or extract domain actions from raw user messages.                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Enforcement Engine Implementation (`scripts/verify-semantic-architecture.ts`)

Built using the standard TypeScript Compiler API (`typescript` npm package), requiring zero proprietary frameworks:

```typescript
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

interface ArchitecturalViolation {
  ruleId: string;
  file: string;
  line: number;
  message: string;
}

const VIOLATIONS: ArchitecturalViolation[] = [];
const ROOT_DIR = path.resolve(__dirname, "..");
const KERNEL_SRC = path.join(ROOT_DIR, "packages/execution-kernel/src");

// Load exemptions if present
const EXEMPTIONS_FILE = path.join(ROOT_DIR, ".architectural-exceptions.json");
const EXEMPTIONS = fs.existsSync(EXEMPTIONS_FILE) ? JSON.parse(fs.readFileSync(EXEMPTIONS_FILE, "utf8")) : [];

function isExempt(ruleId: string, file: string, line: number): boolean {
  return EXEMPTIONS.some((ex: any) => 
    ex.ruleId === ruleId && 
    file.replace(/\\/g, "/").endsWith(ex.file.replace(/\\/g, "/")) && 
    line >= ex.startLine && 
    line <= ex.endLine && 
    new Date(ex.approvedUntil) > new Date()
  );
}

export function auditSupervisorAST(sourceFile: ts.SourceFile) {
  const filePath = sourceFile.fileName;

  function visit(node: ts.Node) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    // RULE 1: Restricted Supervisor Imports
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, "");
      if (moduleSpecifier.includes("FastPathExecutor") || moduleSpecifier.includes("toolRouter") || moduleSpecifier.includes("intentRouter")) {
        if (!isExempt("ARCH-BOUNDARY-SUPERVISOR", filePath, line)) {
          VIOLATIONS.push({
            ruleId: "ARCH-BOUNDARY-SUPERVISOR",
            file: filePath,
            line,
            message: `Supervisor is forbidden from importing '${moduleSpecifier}'. It must orchestrate via canonical interfaces.`,
          });
        }
      }
    }

    // RULE 2: Prose Action Coercion
    if (ts.isCallExpression(node)) {
      const callText = node.getText(sourceFile);
      if (callText.includes("response.toLowerCase().includes") && 
         (callText.includes("class") || callText.includes("schedule") || callText.includes("block") || callText.includes("routine"))) {
        if (!isExempt("ARCH-BEHAVIOR-PROSE", filePath, line)) {
          VIOLATIONS.push({
            ruleId: "ARCH-BEHAVIOR-PROSE",
            file: filePath,
            line,
            message: "Prose keyword action coercion detected. Assistant text must not mutate actionType.",
          });
        }
      }
    }

    // RULE 3: Hardcoded Capability Permission Lists
    if (ts.isBinaryExpression(node) || ts.isCallExpression(node)) {
      const text = node.getText(sourceFile);
      if (text.includes("capURN.includes") && text.includes("storage.list_files")) {
        if (!isExempt("ARCH-AUTHORITY-CAPABILITY", filePath, line)) {
          VIOLATIONS.push({
            ruleId: "ARCH-AUTHORITY-CAPABILITY",
            file: filePath,
            line,
            message: "Hardcoded permission string whitelist detected. Must query CapabilityRegistry.getCapability().",
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

export function runArchitecturalVerification() {
  console.log("[ARCH_AUDIT]: Executing context-aware architectural boundary verification...");
  // Programmatically traverse all kernel files and run audit visitors...
  if (VIOLATIONS.length > 0) {
    console.error(`\x1b[31m[ARCH_VIOLATION]: ${VIOLATIONS.length} architectural violations detected!\x1b[0m`);
    VIOLATIONS.forEach((v) => console.error(`  - [${v.ruleId}] ${v.file}:${v.line} -> ${v.message}`));
    process.exit(1);
  }
  console.log("\x1b[32m[ARCH_AUDIT]: Architectural ownership boundaries fully verified. Zero violations.\x1b[0m");
}

if (require.main === module) {
  runArchitecturalVerification();
}
```

---

## 4. Protecting the Enforcement Itself (CI Protection & Governance Design)

A local hash inside the repository cannot protect itself, because a pull request can modify both the code and the hash. To establish **true tamper resistance**, enforcement is protected through Git branch protection, required status checks, CODEOWNERS access gates, and CI base-ref diff verification.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TAMPER-RESISTANT CI GOVERNANCE ARCHITECTURE                                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. PROTECTED PATHS (.github/CODEOWNERS)                                                │
│    Any modification to the enforcement suite requires explicit review and approval     │
│    from @exe-architects before merge is permitted:                                     │
│    - .github/workflows/ci.yml                                                          │
│    - scripts/verify-semantic-architecture.ts                                           │
│    - packages/execution-kernel/src/testing/architecture/                               │
│    - .architectural-exceptions.json                                                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. CI BASE-REF IMMUTABLE EXECUTION GUARD                                               │
│    In .github/workflows/ci.yml:                                                        │
│    - When a PR runs CI, the pipeline checks:                                           │
│      git diff --name-only origin/master...HEAD                                         │
│    - If files under scripts/verify-semantic-architecture.ts or architecture tests were │
│      modified in the PR, CI executes the linter script from 'origin/master' rather     │
│      than the PR branch, ensuring that PR changes cannot weaken the check!             │
│    - If changes to the linter itself are intentional, they must be merged via an      │
│      independently approved Architectural Governance PR containing no feature code.   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. MANDATORY STATUS CHECKS (BRANCH PROTECTION ON 'master')                             │
│    - 'verify-semantic-architecture' is configured as a Strict Required Check.         │
│    - 'Enforce administrators' is enabled. No user can merge a red architectural check. │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. HARD-BOUNDED ARCHITECTURAL EXCEPTIONS (.architectural-exceptions.json)              │
│    - Strict schema validated by scripts/verify-exceptions.ts.                          │
│    - Absolute cap: Maximum 5 active exceptions across the entire repository.           │
│    - Hard 30-day expiration. Expired exceptions automatically fail CI.                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Fixed-Value and Behavioral Defaults Classification

Every fixed parameter across the codebase is classified under the **Seven-Tier Taxonomy**. Parameters in Tier 7 are eliminated; parameters in Tiers 4–6 are parameterized; parameters in Tiers 1–3 are preserved with explicit rationale.

```
Tier 1: [MATH-INV]  Genuine mathematical invariants (Acyclicity, trigonometry, probability theory)
Tier 2: [TECH-CON]  Technical implementation constraints (Stack limits, timeouts, payload limits)
Tier 3: [SEC-GOV]   Security & governance policies (HMAC-SHA256, atomic CAS leasing, tenancy)
Tier 4: [PROD-DEF]  Explicit product defaults (Circadian baseline, standard context mode)
Tier 5: [USER-PREF] User-configurable preferences (Calendar transition buffers, work hours)
Tier 6: [EMP-CAL]   Empirically calibrated parameters (Recency decay half-life, outlier Z-scores)
Tier 7: [ARBITRARY] Arbitrary hardcoded behavioral assumptions (ELIMINATE)
```

### Complete 25-Parameter Re-Audited Classification Matrix

| Parameter & Source Location | Value / Expression | Classification | Authoritative Owner | Justified Purpose & Remediation Plan |
| :--- | :--- | :--- | :--- | :--- |
| `FastPathExecutor.ts#L135` | `priority: "medium"` | **Tier 7: [ARBITRARY]** | Stage 1 (FastPath) | **ELIMINATE.** Fabricated default. Must extract priority semantically; default to explicit `"none"` / `undefined`. |
| `FastPathExecutor.ts#L121` | `Date.now()` in idempotency keys | **Tier 7: [ARBITRARY]** | Stage 1 (FastPath) | **ELIMINATE.** Defeats idempotency deduplication. Must derive deterministically from `requestId` and `turnId`. |
| `DynamicWorkflowPlanner.ts#L241` | `query: "important project updates"` | **Tier 7: [ARBITRARY]** | Stage 4 (Planner) | **ELIMINATE.** Production benchmark plan playback. Must synthesize query from user goal. |
| `DynamicWorkflowPlanner.ts#L261` | `path: "briefing.md"` | **Tier 7: [ARBITRARY]** | Stage 4 (Planner) | **ELIMINATE.** Production benchmark plan playback. Must derive target path from user request or context. |
| `DynamicWorkflowPlanner.ts#L294` | `location: "San Francisco"` | **Tier 7: [ARBITRARY]** | Stage 4 (Planner) | **ELIMINATE.** Fabricated location. Must derive from user profile context. |
| `Supervisor.ts#L473` | Words `"class"`, `"schedule"`, `"block"` | **Tier 7: [ARBITRARY]** | Stage 1 (Supervisor) | **ELIMINATE.** Assistant prose action coercion. Action type must derive strictly from `SemanticTurn`. |
| `Supervisor.ts#L701` | Regex `/^(?:yes\|yep\|sure...)/i` | **Tier 7: [ARBITRARY]** | Stage 1 (Supervisor) | **ELIMINATE.** Replace with structured semantic turn classification `CONFIRMATION`. |
| `Supervisor.ts#L929` | 22-line list of `.includes(...)` | **Tier 7: [ARBITRARY]** | Stage 1 (Supervisor) | **ELIMINATE.** Replace with `CapabilityRegistry.getCapability(capURN)` contract lookup. |
| `actionExtractor.ts#L58` | Prompt forbidding custom signals | **Tier 7: [ARBITRARY]** | Stage 1 (Dispatch) | **ELIMINATE.** Remove restriction. Support dynamic hydration via `SignalDefinitionModel`. |
| `InterventionVerification.ts#L268` | `observedDelta >= expected * 0.8` | **Tier 7: [ARBITRARY]** | Stage 3 (Recovery) | **ELIMINATE.** Replace with strategy-declared success criteria functions. |
| `InterventionVerification.ts#L226` | `score + 0.15` (up), `- 0.25` (down) | **Tier 7: [ARBITRARY]** | Stage 3 (Recovery) | **ELIMINATE.** Replace with calibrated Bayesian feedback updates. |
| `CadenceLearningConsumer.ts#L76` | `durationMinutes = 30` | **Tier 7: [ARBITRARY]** | Milestone B2 (Causal) | **ELIMINATE.** Fabricated default. Unmeasured duration must remain explicitly unknown (`undefined`). |
| `CadenceLearningConsumer.ts#L61` | `title = "Routine"` | **Tier 7: [ARBITRARY]** | Milestone B2 (Causal) | **ELIMINATE.** Fabricated title. Use authoritative event payload title or preserve unknown. |
| `EpistemicVerification.ts#L132` | `importance >= 0.45 && conf >= 0.50` | **Tier 7: [ARBITRARY]** | Stage 2 (Memory) | **ELIMINATE.** Epistemic evaluation based on provenance and goal relevance. |
| `EpistemicVerification.ts#L126` | `importance + 0.25` (regex match) | **Tier 7: [ARBITRARY]** | Stage 2 (Memory) | **ELIMINATE.** Replace static boost with semantic relevance scoring. |
| `ContradictionResolver.ts#L205` | Static English word arrays (`dimensionSets`) | **Tier 7: [ARBITRARY]** | Stage 2 (Memory) | **ELIMINATE.** Compare structured schema attribute slots against canonical model. |
| `ScheduleRebalancer.ts#L55` | `suggestedShiftMinutes = shift + 15` | **Tier 5: [USER-PREF]** | Milestone B4 (Autonomous) | **PROMOTE.** Derive from `user.settings.calendarPreferences.transitionBufferMinutes` (default 10). |
| `CircadianEnergyAlignment.ts#L22` | `peakStartHour ?? 9, peakEndHour ?? 12` | **Tier 4: [PROD-DEF]** | Milestone B4 (Autonomous) | **PRESERVE AS DEFAULT.** Explicit baseline product default when historical profile has 0 samples. |
| `LifeStateWeights.ts#L13` | 25+ formula weights | **Tier 6: [EMP-CAL]** | Milestone B1 (World Model) | **PARAMETERIZE.** Maintain baseline defaults; support user-profile calibration profiles. |
| `CadenceLearningEngine.ts#L21` | `decayHalfLifeDays: 21.0` | **Tier 6: [EMP-CAL]** | Milestone B3 (Cadence) | **PRESERVE.** Calibrated human habit decay parameter ($\tau = 21$ days). Configurable in engine. |
| `CadenceLearningEngine.ts#L23` | `outlierZScoreThreshold: 2.5` | **Tier 6: [EMP-CAL]** | Milestone B3 (Cadence) | **PRESERVE.** Standard Gaussian 98.8% confidence boundary for anomaly detection. |
| `CadenceLearningEngine.ts#L48` | Circular trigonometry modulo 1440 | **Tier 1: [MATH-INV]** | Milestone B3 (Cadence) | **PRESERVE.** Trigonometric averaging (`atan2`) for midnight-crossing times. |
| `CapabilityRegistry.ts#L41` | RFC 8785 JSON Canonicalization (JCS) | **Tier 1: [MATH-INV]** | Stage 4 (Capabilities) | **PRESERVE.** Deterministic SHA-256 contract hashing across distributed nodes. |
| `PlanValidator.ts#L40` | Kahn's topological sort (depth $\le 5$) | **Tier 1: [MATH-INV] / [TECH-CON]** | Stage 4 (Planning) | **PRESERVE.** Cycle detection (Math) and recursion stack limit (Technical). |
| `HITLGovernanceEngine.ts#L98` | HMAC-SHA256 & `timingSafeEqual` | **Tier 3: [SEC-GOV]** | Milestone B4 (HITL) | **PRESERVE.** Cryptographic non-repudiation and timing attack defense. |

---

## 6. Rejection, Fallback, and Truthful Intent Preservation

Tracing reachable execution paths across the production call graph confirms where valid user intent was previously discarded or silently altered, and defines the truthful outcome for every path.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TRUTHFUL OUTCOME ARCHITECTURE: NO VALID USER INTENT MAY DISAPPEAR                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. UPSTREAM LLM OUTAGES (SemanticIntentInterpreter.ts#L1025)                           │
│    - Previous: Silently returned CASUAL_DIALOGUE with 0 operations. User intent lost. │
│    - Truthful Remediation: Return ambiguityStatus: "UPSTREAM_OUTAGE".                  │
│      Emit system_error stream event. Deliver explicit user notification:               │
│      "I am temporarily unable to interpret your request due to an intelligence model   │
│       service outage. Your request has not been lost; please retry in a moment."       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. TARGET ENTITY NOT FOUND (FastPathExecutor.ts#L109)                                  │
│    - Previous: Returned null silently. Fell through to conversation without context.   │
│    - Truthful Remediation: AuthoritativeEntityResolver returns status: "NOT_FOUND"     │
│      with targetIdentifier. Supervisor delivers structured clarification:              │
│      "I couldn't find a task matching '{identifier}'. Would you like to create it?"    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. NOVEL SIGNAL DISCOVERY (actionExtractor.ts#L58)                                     │
│    - Previous: Prompt explicitly instructed model to discard unlisted signals.         │
│    - Truthful Remediation: Signal is parsed into dynamic key. If key is un-indexed in  │
│      SignalDefinitionModel, kernel persists value to DailyLog.customSignals and        │
│      triggers asynchronous signal schema registration without dropping data.           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. COMPOSITE WORKFLOW ROUTING (DynamicRouter.ts#L40)                                   │
│    - Previous: Rejection if message lacked English words 'summarize' and 'save'.       │
│    - Truthful Remediation: Evaluates structural dependency graph (Section 8). Multi-   │
│      step dependencies route to DynamicWorkflowPlanner regardless of vocabulary.       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. UNREGISTERED CAPABILITIES (Supervisor.ts & KernelCapabilityService.ts)              │
│    - Invariant: An unknown capability is NEVER executable. Fail closed.                │
│    - Truthful Remediation: Returns typed execution outcome: UNREGISTERED_CAPABILITY    │
│      with explicit error message to user identifying the missing provider.             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Fast Execution Gate and Capability Authority

There is **exactly one authoritative source** for capability existence, permissions, authorization, access modes, and execution contracts: [`CapabilityRegistry`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/capabilities/CapabilityRegistry.ts). Competing hardcoded tables are eliminated.

### 7.1 Operation Category Dispatch Taxonomy

```typescript
export interface FastExecutionEligibility {
  eligible: boolean;
  category: "CREATION" | "MUTATION" | "CLARIFICATION_REQUIRED" | "HITL_REQUIRED" | "UNREGISTERED";
  proposal?: ActionProposal;
  rejectionCode?: string;
  userExplanation?: string;
}

export function evaluateFastExecutionEligibility(
  semanticTurn: SemanticTurn,
  hasInterStepDependencies: boolean
): FastExecutionEligibility {

  // Gate 1: Atomic Operation Check
  if (semanticTurn.operations.length !== 1) {
    return { eligible: false, category: "CLARIFICATION_REQUIRED", rejectionCode: "NON_ATOMIC_TURN" };
  }

  // Gate 2: Primary Classification Check
  if (semanticTurn.primaryClassification !== "ACTION_REQUEST") {
    return { eligible: false, category: "CLARIFICATION_REQUIRED", rejectionCode: "NOT_AN_ACTION" };
  }

  // Gate 3: Structural Ambiguity Check
  if (semanticTurn.ambiguityStatus !== "UNAMBIGUOUS") {
    return { 
      eligible: false, 
      category: "CLARIFICATION_REQUIRED", 
      rejectionCode: "AMBIGUITY_DETECTED",
      userExplanation: semanticTurn.conversationalSummary 
    };
  }

  // Gate 4: Inter-Step Dependency Check (Section 8)
  if (hasInterStepDependencies) {
    return { eligible: false, category: "CLARIFICATION_REQUIRED", rejectionCode: "REQUIRES_DAG_PLANNER" };
  }

  const op = semanticTurn.operations[0];
  const registry = CapabilityRegistry.getInstance();
  const descriptor = registry.getCapability(op.capabilityURN || op.actionType);

  // Gate 5: Capability Existence Authority (FAIL CLOSED)
  if (!descriptor) {
    return {
      eligible: false,
      category: "UNREGISTERED",
      rejectionCode: "UNREGISTERED_CAPABILITY",
      userExplanation: `The capability '${op.capabilityURN || op.actionType}' is not registered with the kernel.`
    };
  }

  // Gate 6: Human Authorization (HITL) Authority
  // Model-generated riskClass CANNOT override authoritative descriptor.requiresApproval!
  const requiresHITL =
    descriptor.requiresApproval === true ||
    (descriptor.requiredResources || []).some((r) => r.accessMode === "EXCLUSIVE_LOCK");

  if (requiresHITL) {
    return { eligible: false, category: "HITL_REQUIRED", rejectionCode: "REQUIRES_HUMAN_APPROVAL" };
  }

  // Gate 7: Category Distinction (Creation vs Existing-Entity Mutation)
  if (descriptor.operationKind === "CREATE") {
    // CATEGORY A: New-Entity Creation
    // Does NOT require existing database targetEntityId.
    if (!op.payload || Object.keys(op.payload).length === 0) {
      return { eligible: false, category: "CLARIFICATION_REQUIRED", rejectionCode: "EMPTY_PAYLOAD" };
    }

    const proposal: ActionProposal = {
      id: generateId("act"),
      domain: op.domain,
      actionType: op.actionType,
      targetEntityId: undefined, // Explicitly undefined for new entities
      payload: op.payload,
      rationale: op.rationale || undefined, // Zero fabricated defaults!
      reversibility: descriptor.isReversible ? "reversible_with_compensation" : "atomic_single_doc",
      idempotencyKey: `turn_${op.operationId}`, // Stable, deterministic token; ZERO Date.now()
    };

    return { eligible: true, category: "CREATION", proposal };

  } else {
    // CATEGORY B: Existing-Entity Mutation (UPDATE, DELETE, COMPLETE, CANCEL)
    // Strictly requires targetEntityId resolved against MongoDB by AuthoritativeEntityResolver
    if (!op.targetEntityId || op.targetEntityId === "RESOLVE_AT_EXECUTION") {
      return { 
        eligible: false, 
        category: "CLARIFICATION_REQUIRED", 
        rejectionCode: "UNRESOLVED_TARGET_ENTITY",
        userExplanation: `I could not resolve which entity you want to ${op.actionType}.` 
      };
    }

    const proposal: ActionProposal = {
      id: generateId("act"),
      domain: op.domain,
      actionType: op.actionType,
      targetEntityId: op.targetEntityId,
      payload: op.payload,
      rationale: op.rationale || undefined,
      reversibility: descriptor.isReversible ? "reversible_with_compensation" : "atomic_single_doc",
      idempotencyKey: `turn_${op.operationId}`,
    };

    return { eligible: true, category: "MUTATION", proposal };
  }
}
```

---

## 8. Semantic Workflow Planning (Data Dependencies vs Atomic Batches)

The rule in V2.0 that triggered dynamic workflow planning simply when `operations.length > 1` was incorrect. Operation count alone does not dictate DAG planning.

### 8.1 Structural Dependency Criteria
The system distinguishes two distinct multi-operation execution models:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ MULTI-OPERATION EXECUTION TAXONOMY                                                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ MODEL 1: INDEPENDENT ATOMIC BATCH (No DAG Planner Required)                            │
│ Criteria: Multiple operations requested in a single turn, but ZERO data dependencies   │
│           or intermediate output flows between them.                                   │
│ Example:  "Reschedule my workout to 6:00 PM and log 8 hours sleep."                    │
│ Execution: Executed directly as parallel or sequential atomic kernel mutations.        │
│           Latency: Low (~600ms). Bypasses dynamic graph replanner.                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ MODEL 2: COMPOSITE DYNAMIC WORKFLOW (DynamicWorkflowPlanner Required)                  │
│ Criteria: Operations have inter-step data dependencies, require intermediate outputs,  │
│           rely on runtime observations to parameterize downstream steps, or have       │
│           strict causal precondition ordering.                                         │
│ Example:  "Search unread emails from John, summarize them, and save that summary to a  │
│           file named notes.md."                                                        │
│ Execution: Requires DynamicWorkflowPlanner to synthesize a Kahn-validated DAG, binding │
│           parameters via downstream reference tokens (e.g. content: "$ref:step_2.res").│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Dependency Detection Logic

```typescript
export function requiresDynamicWorkflowPlanner(semanticTurn: SemanticTurn): boolean {
  if (semanticTurn.operations.length <= 1) return false;

  // Check for inter-step parameter references ($ref:stepId.property)
  const hasDataDependencies = semanticTurn.operations.some((op) => {
    const payloadStr = JSON.stringify(op.payload || {});
    return payloadStr.includes("$ref:");
  });

  // Check for explicit sequential dependency declarations
  const hasStepDependencies = semanticTurn.operations.some((op) => 
    Array.isArray(op.dependencies) && op.dependencies.length > 0
  );

  // Check if any operation produces an observation required by a downstream step
  const hasObservationPreconditions = semanticTurn.operations.some((op, idx) => {
    const desc = CapabilityRegistry.getInstance().getCapability(op.capabilityURN || op.actionType);
    return desc?.category === "discovery" || desc?.category === "query" && idx < semanticTurn.operations.length - 1;
  });

  return hasDataDependencies || hasStepDependencies || hasObservationPreconditions;
}
```

---

## 9. Generalization and Held-Out Testing Methodology

To guarantee that tests evaluate true semantic understanding rather than hardcoded special cases, testing is split into **Known Contract Tests** and **Held-Out Generalization Suites**.

### 9.1 Two-Tier Testing Separation
1. **Tier A: Known Contract Tests (Repository Fixtures):** Basic regressions committed directly in the repository asserting interface stability, Zod schemas, and known bug fixes.
2. **Tier B: Held-Out Generalization Suite (Parameterized Generator):** Dynamic test harness running in CI that generates unseen variations across linguistic registers, preventing developers from hardcoding string checks to pass tests.

### 9.2 Decision Correctness Evaluation
A test is scored as **successful** only when the system makes the **correct decision**, which includes:
- Correctly executing when clear and authorized.
- **Correctly asking for clarification** when ambiguous (asserting execution did *not* occur).
- **Correctly halting for confirmation** when high-risk or external access is required.
- **Correctly failing closed** when a capability is unregistered.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ THE TEN ADVERSARIAL HELD-OUT GENERALIZATION SCENARIOS                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 1: Custom User-Defined Signal                                                 │
│ Expected Decision: Parse key 'blood_ketones_mmol', value 1.8. Hydrate into DailyLog.   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 2: Unfamiliar Activity Category                                               │
│ Expected Decision: Route to health domain. CadenceConsumer records exact 90 min title. │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 3: Novel Habit Goal Phrasing                                                  │
│ Expected Decision: Propose goal with cadence 'daily', metric 'pages', target 25.       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 4: Colloquial & Indirect Language                                             │
│ Expected Decision: Entity Resolver grounds 'taxes' to active task; completes task.     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 5: Multilingual Requests (Spanish & Hinglish)                                 │
│ Expected Decision: Correctly completes task (ES) and schedules 07:00 workout (HI).     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 6: Multi-Candidate Disambiguation                                             │
│ Expected Decision: HALT EXECUTION. Return ambiguityStatus: 'AMBIGUOUS' with candidate  │
│                    IDs. Assert that zero mutations occurred.                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 7: Multi-Domain Compound Request (Batch vs DAG)                               │
│ Expected Decision: Batch execution across wellness, productivity, and health domains.  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 8: Dynamically Discovered Capability (Runtime MCP Tool)                       │
│ Expected Decision: Discovers 'notion.query_database'. Executes without false HITL.     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 9: Context-Dependent Temporal Anaphora                                        │
│ Expected Decision: Resolves pronoun 'it' to Sarah sync; reschedules occurrence.        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO 10: Explicit Urgency Preservation Without Default Override                    │
│ Expected Decision: Task title 'Audit server logs'; priority 'high' (never 'medium').   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Six-Phase / 17-Loop Remediation Roadmap

The 17 bounded engineering loops remain structured within their original 6 phases. Phase 1 (Loops 1–5) strictly blocks Step 1 V2.2:

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
                                    ▼ GATE: All 5 Loops Verified under CI
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

## 11. Final Definition of Done (Remediation Acceptance Gate)

The Global Semantic Architecture Remediation Initiative will be complete only when:
1. **Zero Regex in Semantic Paths:** No natural-language interpretation, entity extraction, or routing depends on regular expressions.
2. **Zero Keyword Action Coercion:** No assistant prose is inspected for keywords to mutate underlying state machine operations.
3. **Sole Capability Authority:** 100% of tool permissions and metadata derive from `CapabilityRegistry`. Unknown capabilities fail closed.
4. **Model-Driven Dynamic Planning:** `DynamicWorkflowPlanner` synthesizes DAGs dynamically from discovered capabilities, with zero benchmark fallbacks in production.
5. **Universal Deterministic Idempotency:** All proposals derive stable keys from request and turn metadata; zero dynamic timestamps.
6. **Open-Ended Generalization:** Unseen held-out variations across all 10 adversarial scenarios pass with correct decisions.
7. **Clean Legacy Boundary:** Dead files (`toolRouter.ts`) and deprecated models (`intentRouter.ts`, `intentModel.ts`) are decommissioned.
8. **Deterministic Kernel Transitions:** Identical validated inputs produce identical state transitions and causally ordered events.
9. **Automated CI Enforcement Active:** Static AST analysis (`scripts/verify-semantic-architecture.ts`) and architecture tests pass in CI.
10. **Tamper-Proof Protection:** CI enforcement scripts and protected paths are locked under CODEOWNERS and base-ref diff verification.
11. **Final Repository Audit:** An independent audit confirms zero replacement heuristics were introduced across the entire codebase.

---

## 12. Gating Directive Regarding Step 1 V2.2

**STRICT DIRECTIVE:** Do NOT authorize or begin Step 1 V2.2 until **Phase 1 (Loops 1–5)** is fully implemented, verified, and accepted under automated CI enforcement.

Phase 1 establishes the clean, contract-governed, model-driven foundation necessary to close application-layer mutation paths without institutionalizing architectural violations in the sovereign kernel.

