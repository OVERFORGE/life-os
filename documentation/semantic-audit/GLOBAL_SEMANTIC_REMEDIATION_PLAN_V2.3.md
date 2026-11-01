# LIFEOS — GLOBAL SEMANTIC ARCHITECTURE REMEDIATION PLAN (V2.3.0)
## Master Implementation Plan: Zero-Tolerance Semantic Engineering Initiative
### Stages 1–4 & Milestones B1–B4 | Loop Engineering Architecture & Automated CI Governance

**Project:** LifeOS / Aven  
**Organization:** The Executioners (ExE)  
**Document Identifier:** `documentation/semantic-audit/GLOBAL_SEMANTIC_REMEDIATION_PLAN_V2.3.md`  
**Governing Principle:** *The kernel provides truth. Agents provide intelligence.*  
**Authorization Status:** IMPLEMENTATION PLANNING ONLY (Strictly Non-Modifying)  
**Revision:** V2.3.0 (Final Implementation-Readiness Correction)  

---

## 1. Executive Summary & Audit Correlation

Following the Global Semantic Architecture Audit across Stages 1–4 and Milestones B1–B4, the system received a final verdict of **`D — NON-COMPLIANT`**. 

This document serves as the **final, authoritative master implementation plan (V2.3.0)** to systematically eliminate all 26 audited architectural violations (`RG-01` to `RG-05`, `PM-01` to `PM-07`, `HC-01` to `HC-09`, `FB-01` to `FB-02`, and `LG-01` to `LG-03`) without creating new milestones, expanding into unrelated features, or substituting one set of heuristics for another.

### 1.1 Correlation Across Supplied Audit Documents

The plan synthesizes and reconciles findings across the seven audit documents:
1. [`GLOBAL_SEMANTIC_ARCHITECTURE_AUDIT.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/GLOBAL_SEMANTIC_ARCHITECTURE_AUDIT.md): Master audit findings and Section 8 criteria.
2. [`HARDCODING_AND_PATTERN_INVENTORY.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/HARDCODING_AND_PATTERN_INVENTORY.md): Line-by-line source inventory of all 26 violations.
3. [`SEMANTIC_ADAPTABILITY_REPORT.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/SEMANTIC_ADAPTABILITY_REPORT.md): 8 failure scenario traces on custom concepts and dynamic capabilities.
4. [`DETERMINISM_AND_REPLAY_AUDIT.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/DETERMINISM_AND_REPLAY_AUDIT.md): Broken idempotency keys (`Date.now()`) and host-system timezone leaks.
5. [`RUNTIME_SEMANTIC_FLOW_MAP.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/RUNTIME_SEMANTIC_FLOW_MAP.md): Production execution paths and dead legacy systems.
6. [`GLOBAL_REMEDIATION_ROADMAP.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/semantic-audit/GLOBAL_REMEDIATION_ROADMAP.md): Prioritized remediation tiers (P0–P3).
7. [`LIFEOS_SEMANTIC_EXECUTION_ARCHITECTURE_FORENSIC_AUDIT.md`](file:///d:/PROGRAMMING/Projects/life-os/documentation/LIFEOS_SEMANTIC_EXECUTION_ARCHITECTURE_FORENSIC_AUDIT.md): Historical diagnosis establishing that `FastPathExecutor` was originally introduced to satisfy synthetic scripted strings in simulations.

### 1.2 Core Correctness Refinements in V2.3.0

- **Multi-Operation & Fast Execution Disambiguation:** Resolves the critical contradiction in V2.2 where `operations.length !== 1` was rejected as `CLARIFICATION_REQUIRED`. Distinguishes six mutually exclusive operational categories: Single Atomic Operations, Independent Operation Batches, Composite Dynamic Workflows, Clarification Turns, Human Authorization (HITL), and Unregistered Capabilities.
- **Structural Workflow Dependency Detection:** Eliminates fragile payload string searches (`$ref:`) and category-based assumptions (`category === "query"`). Replaces them with deterministic, typed dependency graph inspection over producer/consumer contracts and explicit `$ref` tokens.
- **Authoritative End-to-End Execution Pipeline:** Formally maps every verification stage (semantic interpretation, entity resolution, schema validation, capability governance, tenant authorization, resource locking, preconditions, and transactional kernel execution) to its single authoritative owner. Model-generated metadata is treated as untrusted raw input.
- **Accurate Architectural Enforcement Alignment:** Aligns the AST linter implementation with all eight architectural rules. Distinguishes what is statically verifiable via AST, what requires dependency graph analysis, what requires behavioral architecture tests, and what requires external GitHub branch protection and CODEOWNERS settings.
- **Rigorous Verification & Evidence Standards:** Delineates inspected code, proposed architecture, implemented static checks, executed unit/integration tests, verified end-to-end behavior, and external CI governance. Re-audits empirical claims against empirical evidence. Clarifies upstream outage retry idempotency and custom signal persistence.

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
   ├── AuthoritativeEntityResolver (Grounds target references against active DB/STM state)
   ├── Dependency Analyzer (Categorizes into Single Atomic, Independent Batch, or Dynamic DAG)
   ├── ActionPayloadSchemas (Strict Zod parameter validation)
   └── CapabilityRegistry (Authoritative descriptor check: permissions, access locks, reversibility)
         │  Output: Formally Validated & Authorized ActionProposal(s)
         ▼
Deterministic Sovereign Kernel Execution (Milestones B1–B4)
   ├── Idempotency Gate (Stable hash tokens derived from requestId + turnId; ZERO Date.now())
   ├── Precondition Check (Optimistic concurrency version fencing __v)
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

To guarantee that architectural boundaries are enforced mechanically and cannot be bypassed by moving code into helper files or modifying syntax, the repository enforces structural and behavioral compliance through existing TypeScript tooling and repository testing infrastructure.

### 3.1 Comprehensive Architectural Boundary Rules

The following eight architectural rules protect specific system boundaries across the codebase:

| Rule ID & Identifier | Boundary Protected | Repository Scope | AST Feasible? | Dependency / Behavioral Check Needed? | CI Execution Method |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **RULE 1:** `[ARCH-BOUNDARY-SUPERVISOR]` | Orchestrator Isolation: Prevents parsing or legacy dispatch leakage into Supervisor | `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` | **YES** | Strict Import Whitelist checking `ImportDeclaration` | `scripts/verify-semantic-architecture.ts` |
| **RULE 2:** `[ARCH-BEHAVIOR-PROSE]` | Intent Integrity: Blocks mutating actionType based on assistant text | `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` | **YES** | AST BinaryExpression inspection + Behavioral test | `scripts/verify-semantic-architecture.ts` & Architecture Test |
| **RULE 3:** `[ARCH-AUTHORITY-CAPABILITY]` | Sole Capability Authority: Forbids hardcoded string whitelists for tools/permissions | `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` | **YES** | AST CallExpression / ArrayLiteral check for `capURN.includes` | `scripts/verify-semantic-architecture.ts` |
| **RULE 4:** `[ARCH-INVARIANT-IDEMPOTENCY]` | Deterministic Replay: Forbids dynamic timestamps/randomness in idempotency keys | `packages/execution-kernel/src/orchestration/` | **YES** | AST AssignmentExpression inspection on `idempotencyKey` | `scripts/verify-semantic-architecture.ts` & Replay Test |
| **RULE 5:** `[ARCH-INTELLIGENCE-PLANNING]` | Dynamic Planning: Prohibits fallback to benchmark plans in production | `packages/execution-kernel/src/orchestration/planning/DynamicWorkflowPlanner.ts` | **YES** | AST check ensuring `generateDeterministicFallback` throws in prod | `scripts/verify-semantic-architecture.ts` & Planner Unit Test |
| **RULE 6:** `[ARCH-LEGACY-ISOLATION]` | Legacy Decommissioning: Blocks imports of deprecated regex routers | Entire production build path (`packages/execution-kernel/src/`) | **YES** | Global AST ImportDeclaration scanner barring legacy files | `scripts/verify-semantic-architecture.ts` |
| **RULE 7:** `[ARCH-INVARIANT-CLOCK]` | Timezone Integrity: Forbids un-parameterized local clock inspection in strategies | `packages/execution-kernel/src/autonomous/strategies/`, `temporal/` | **PARTIAL** | AST flags `Date.getHours()`/`Date.getDay()` without timezone argument | `scripts/verify-semantic-architecture.ts` & Timezone Test Suite |
| **RULE 8:** `[ARCH-BOUNDARY-DISPATCH]` | Intent Authority: Forbids modules outside `SemanticIntentInterpreter` parsing intent | `packages/execution-kernel/src/dispatch/`, `apps/web/app/api/` | **YES** | AST checks prohibiting regex/NLP evaluation on user request text | `scripts/verify-semantic-architecture.ts` & Architecture Test |

### 3.2 Four-Layer CI Protection & Governance Model

To prevent any pull request from tampering with the linter or disabling checks to pass CI, enforcement is divided cleanly across four explicit layers:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FOUR-LAYER ARCHITECTURAL GOVERNANCE MODEL                                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ LAYER 1: STATIC AST LINTER (scripts/verify-semantic-architecture.ts)                   │
│ - Executed via TypeScript Compiler API on every PR and commit.                         │
│ - Verifies syntax, forbidden imports, prohibited assignments, and whitelist adherence. │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ LAYER 2: BEHAVIORAL ARCHITECTURE TESTS (src/testing/architecture/)                     │
│ - Unit & integration tests asserting runtime invariants under dynamic inputs.          │
│ - Validates that Supervisor never coerces prose, that planner throws in production on   │
│   outage, that replay yields identical idempotency keys, and timezone mocks hold.      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ LAYER 3: CI BASE-REF IMMUTABLE EXECUTION GUARD (.github/workflows/ci.yml)              │
│ - Evaluates: git diff --name-only origin/master...HEAD                                  │
│ - If a PR modifies linter scripts, architecture tests, or exceptions, the CI runner    │
│   executes the linter code checked out from 'origin/master' against the PR branch.     │
│ - Prevents a PR from weakening the rules evaluating its own code.                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ LAYER 4: EXTERNAL REPOSITORY GOVERNANCE & BRANCH PROTECTION (GitHub Settings)          │
│ - Protected Paths via .github/CODEOWNERS requiring review from @exe-architects.       │
│ - 'Strict Required Status Check' on master for 'verify-semantic-architecture'.         │
│ - 'Do not allow bypassing the above settings' (Enforce Administrators) enabled.        │
│ - Hard-capped exceptions in .architectural-exceptions.json (Max 5, 30-day TTL).       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Trust Boundary Notice:** Files like `.github/CODEOWNERS` and `.github/workflows/ci.yml` residing in the repository cannot enforce branch rules on their own. They require **external repository configuration** in GitHub: "Require pull request reviews before merging (with Code Owners enabled)", "Require status checks to pass before merging (with Strict branches)", and "Include administrators". These settings must be configured in repository administration.

### 3.3 Concrete AST Linter Implementation (`scripts/verify-semantic-architecture.ts`)

Built using the standard TypeScript Compiler API (`typescript` package already in the project workspace), this script implements the checks for Rules 1–8:

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

// Load exceptions if present
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

export function auditSourceFile(sourceFile: ts.SourceFile) {
  const filePath = sourceFile.fileName.replace(/\\/g, "/");
  const isSupervisor = filePath.endsWith("orchestration/supervisor/Supervisor.ts");
  const isPlanner = filePath.endsWith("orchestration/planning/DynamicWorkflowPlanner.ts");
  const isDispatch = filePath.includes("/dispatch/") || filePath.includes("/app/api/");
  const isAutonomousOrTemporal = filePath.includes("/autonomous/strategies/") || filePath.includes("/temporal/");

  function visit(node: ts.Node) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    // RULE 1: Restricted Supervisor Imports
    if (isSupervisor && ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, "");
      const isAllowed = 
        moduleSpecifier.startsWith("../contracts/") ||
        moduleSpecifier.startsWith("./") ||
        moduleSpecifier.startsWith("../semantic/") ||
        moduleSpecifier.startsWith("../context/") ||
        moduleSpecifier.startsWith("../planning/") ||
        moduleSpecifier.startsWith("../capabilities/") ||
        moduleSpecifier.startsWith("../kernel/") ||
        moduleSpecifier.startsWith("../events/") ||
        moduleSpecifier.startsWith("node:") ||
        moduleSpecifier === "zod";
      
      const isForbidden = 
        moduleSpecifier.includes("FastPathExecutor") || 
        moduleSpecifier.includes("toolRouter") || 
        moduleSpecifier.includes("intentRouter") ||
        moduleSpecifier.includes("intentModel");

      if (!isAllowed || isForbidden) {
        if (!isExempt("ARCH-BOUNDARY-SUPERVISOR", filePath, line)) {
          VIOLATIONS.push({
            ruleId: "ARCH-BOUNDARY-SUPERVISOR",
            file: filePath,
            line,
            message: `Supervisor import boundary violation: '${moduleSpecifier}' is prohibited.`
          });
        }
      }
    }

    // RULE 2: Prose Keyword Action Coercion
    if (isSupervisor && ts.isCallExpression(node)) {
      const callText = node.getText(sourceFile);
      if (callText.includes(".toLowerCase().includes") && 
         (callText.includes("class") || callText.includes("schedule") || callText.includes("block") || callText.includes("routine"))) {
        if (!isExempt("ARCH-BEHAVIOR-PROSE", filePath, line)) {
          VIOLATIONS.push({
            ruleId: "ARCH-BEHAVIOR-PROSE",
            file: filePath,
            line,
            message: "Prose keyword action coercion detected. Assistant response text must not alter actionType."
          });
        }
      }
    }

    // RULE 3: Hardcoded Capability String Whitelists
    if (isSupervisor && (ts.isBinaryExpression(node) || ts.isCallExpression(node))) {
      const text = node.getText(sourceFile);
      if (text.includes("capURN.includes") || text.includes("actionType.includes")) {
        if (!isExempt("ARCH-AUTHORITY-CAPABILITY", filePath, line)) {
          VIOLATIONS.push({
            ruleId: "ARCH-AUTHORITY-CAPABILITY",
            file: filePath,
            line,
            message: "Hardcoded capability string check detected. Must query CapabilityRegistry.getCapability()."
          });
        }
      }
    }

    // RULE 4: Non-Deterministic Idempotency Keys
    if (ts.isPropertyAssignment(node) || ts.isBinaryExpression(node)) {
      const text = node.getText(sourceFile);
      if (text.includes("idempotencyKey") && (text.includes("Date.now()") || text.includes("Math.random()"))) {
        if (!isExempt("ARCH-INVARIANT-IDEMPOTENCY", filePath, line)) {
          VIOLATIONS.push({
            ruleId: "ARCH-INVARIANT-IDEMPOTENCY",
            file: filePath,
            line,
            message: "Idempotency key derives from dynamic clock or random generator. Must derive deterministically."
          });
        }
      }
    }

    // RULE 5: Production Benchmark Plan Fallback
    if (isPlanner && ts.isMethodDeclaration(node)) {
      const methodName = node.name.getText(sourceFile);
      if (methodName === "generateDeterministicFallback") {
        const bodyText = node.body ? node.body.getText(sourceFile) : "";
        if (!bodyText.includes("process.env.NODE_ENV") || !bodyText.includes("throw")) {
          if (!isExempt("ARCH-INTELLIGENCE-PLANNING", filePath, line)) {
            VIOLATIONS.push({
              ruleId: "ARCH-INTELLIGENCE-PLANNING",
              file: filePath,
              line,
              message: "DynamicWorkflowPlanner.generateDeterministicFallback must throw in production environment."
            });
          }
        }
      }
    }

    // RULE 6: Deprecated Intent Router Imports
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, "");
      if (moduleSpecifier.includes("toolRouter") || moduleSpecifier.includes("intentRouter") || moduleSpecifier.includes("intentModel")) {
        if (!filePath.includes("/testing/") && !isExempt("ARCH-LEGACY-ISOLATION", filePath, line)) {
          VIOLATIONS.push({
            ruleId: "ARCH-LEGACY-ISOLATION",
            file: filePath,
            line,
            message: `Import of deprecated legacy router '${moduleSpecifier}' is barred from production paths.`
          });
        }
      }
    }

    // RULE 7: Local System Timezone Leakage
    if (isAutonomousOrTemporal && ts.isCallExpression(node)) {
      const text = node.getText(sourceFile);
      if (text.includes("new Date().getHours()") || text.includes("new Date().getDay()")) {
        if (!isExempt("ARCH-INVARIANT-CLOCK", filePath, line)) {
          VIOLATIONS.push({
            ruleId: "ARCH-INVARIANT-CLOCK",
            file: filePath,
            line,
            message: "Host system clock inspected without user timezone conversion. Use user.timezone context."
          });
        }
      }
    }

    // RULE 8: Secondary Intent Classification Outside Interpreter
    if (isDispatch && (ts.isRegularExpressionLiteral(node) || ts.isCallExpression(node))) {
      const text = node.getText(sourceFile);
      if (text.includes("intentClassifier") || (text.includes(".match(") && text.includes("request.body"))) {
        if (!isExempt("ARCH-BOUNDARY-DISPATCH", filePath, line)) {
          VIOLATIONS.push({
            ruleId: "ARCH-BOUNDARY-DISPATCH",
            file: filePath,
            line,
            message: "Secondary natural language intent classification detected in dispatch/API layer."
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}
```

---

## 4. Authoritative End-to-End Execution Pipeline

To eliminate competing authorities and prevent Supervisor from duplicating kernel responsibilities, every stage of the utterance lifecycle is assigned strictly to its single authoritative owner. Model-generated metadata is **never trusted** as proof of authorization, entity resolution, or reversibility.

### 4.1 Authoritative Responsibility Ownership Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ END-TO-END EXECUTION STAGE BOUNDARIES                                                                                  │
├──────────────────────────────┬─────────────────────────────────────┬───────────────────────────────────────────────────┤
│ Pipeline Stage               │ Authoritative Owner                 │ Invariant Contract & Responsibility Boundary      │
├──────────────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
│ 1. Semantic Interpretation   │ SemanticIntentInterpreter           │ Parses text to SemanticTurn. Untrusted proposal.  │
│ 2. Entity Resolution         │ AuthoritativeEntityResolver         │ Grounds entity references against DB/STM state.   │
│ 3. Structural Routing        │ DynamicRouter & Dependency Analyzer │ Inspects typed dependencies; routes A, B, C, D, E.│
│ 4. Schema Validation         │ ActionPayloadSchemas (Zod)          │ Validates parameter types, required fields.       │
│ 5. Capability Governance     │ CapabilityRegistry                  │ Authoritative catalog: permissions, locks, revert.│
│ 6. Tenant Authorization      │ ExecutionContext / SecurityContext  │ Validates userId, tenant boundary isolation.      │
│ 7. Concurrency & Locks       │ WorkerLeaseManager / ResourceLocks  │ Validates EXCLUSIVE_LOCK vs SHARED_READ conflicts.│
│ 8. State Fencing             │ Native Execution Handlers           │ Fences optimistic version __v, validates state.   │
│ 9. Kernel Execution & Outbox │ KernelCapabilityService / Outbox    │ Executes atomic DB mutation; writes outbox event. │
└──────────────────────────────┴─────────────────────────────────────┴───────────────────────────────────────────────────┘
```

### 4.2 Explicit Invariant Rules

1. **Reversibility is Authoritative:** A capability's reversibility (`atomic_single_doc`, `reversible_with_compensation`, or `irreversible_external`) is defined strictly in `CapabilityDescriptor.reversibility`. An action is **never** classified as `atomic_single_doc` simply because it is non-reversible; external actions like sending an email or booking a ride are strictly `irreversible_external`.
2. **Supervisor Does Not Duplicate Validation:** Supervisor does not inspect database collections, does not validate MongoDB schemas, and does not perform token authorization. Supervisor strictly orchestrates validated proposals into kernel calls.
3. **Fail-Closed on Unregistered:** If a capability is not present in `CapabilityRegistry`, the request fails closed immediately with `UNREGISTERED_CAPABILITY`. It is never executed or passed through to casual dialogue.

---

## 5. Multi-Operation and Fast Execution Routing Architecture

The contradiction in V2.2—where `evaluateFastExecutionEligibility()` rejected any turn with `operations.length !== 1` as `CLARIFICATION_REQUIRED`—is permanently eliminated. The routing gate categorizes every turn into one of six mutually exclusive categories based on structural properties.

### 5.1 Six-Category Operational Dispatch Taxonomy

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ SIX-CATEGORY OPERATIONAL DISPATCH TAXONOMY                                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CATEGORY A: SINGLE ATOMIC OPERATION (Fast Path Direct Execution)                       │
│ - Condition: operations.length === 1, UNAMBIGUOUS, capability registered, no HITL,     │
│              valid creation payload OR verified resolved targetEntityId.               │
│ - Dispatch:  Direct execution via KernelCapabilityService. Single transaction receipt. │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CATEGORY B: MULTIPLE INDEPENDENT OPERATIONS (Independent Atomic Batch)                 │
│ - Condition: operations.length > 1, UNAMBIGUOUS, ZERO cross-step data dependencies,    │
│              all capabilities registered, no HITL, all entities resolved.              │
│ - Dispatch:  Atomic multi-document batch or sequential independent execution without   │
│              invoking DynamicWorkflowPlanner. Low latency (~600ms).                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CATEGORY C: MULTIPLE OPERATIONS WITH DATA DEPENDENCIES (Composite Dynamic Workflow)    │
│ - Condition: operations.length > 1, with inter-step data references ($ref:), explicit  │
│              dependencies, intermediate outputs, or dynamic parameter bindings.       │
│ - Dispatch:  Routes to DynamicWorkflowPlanner to synthesize a Kahn DAG and execute via │
│              ExecutionWorkspace and StepDataResolver.                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CATEGORY D: AMBIGUOUS OR INCOMPLETE OPERATIONS (Clarification Required)                │
│ - Condition: ambiguityStatus !== "UNAMBIGUOUS", missing required parameters, or        │
│              AuthoritativeEntityResolver returned NOT_FOUND or AMBIGUOUS_CANDIDATES.   │
│ - Dispatch:  HALT execution entirely. Emit structured conversational clarification     │
│              prompt with candidate IDs. ZERO state mutations occur.                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CATEGORY E: OPERATIONS REQUIRING HUMAN AUTHORIZATION (HITL Required)                   │
│ - Condition: CapabilityRegistry declares requiresApproval === true OR requires         │
│              EXCLUSIVE_LOCK on shared resources.                                       │
│ - Dispatch:  Freeze execution, generate HMAC-SHA256 signature commitment, persist      │
│              PendingOperation record, and surface interactive confirmation card.       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CATEGORY F: UNREGISTERED CAPABILITIES (Fail-Closed)                                    │
│ - Condition: One or more operations request a capabilityURN missing from registry.     │
│ - Dispatch:  HALT execution. Return typed UNREGISTERED_CAPABILITY error identifying    │
│              the missing capability. ZERO state mutations occur.                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Corrected Routing and Eligibility Implementation

```typescript
import { SemanticTurn, SemanticOperation } from "../contracts/SemanticTurnContracts";
import { ActionProposal } from "../contracts/ActionProposalContracts";
import { CapabilityRegistry, CapabilityDescriptor } from "../capabilities/CapabilityRegistry";
import { hasStructuralDataDependencies } from "./StructuralDependencyAnalyzer";

export type RoutingCategory =
  | "SINGLE_ATOMIC_OPERATION"
  | "INDEPENDENT_OPERATION_BATCH"
  | "COMPOSITE_WORKFLOW_DAG"
  | "CLARIFICATION_REQUIRED"
  | "HUMAN_AUTHORIZATION_REQUIRED"
  | "UNREGISTERED_CAPABILITY";

export interface RoutingEvaluationResult {
  category: RoutingCategory;
  eligibleForImmediateExecution: boolean;
  proposals?: ActionProposal[];
  rejectionCode?: string;
  userExplanation?: string;
  clarificationQuestion?: string;
  candidateEntities?: Array<{ entityId: string; displayName: string }>;
}

export function evaluateOperationalRouting(semanticTurn: SemanticTurn): RoutingEvaluationResult {
  // Gate 1: Non-Action Turns (Casual dialogue, queries, observations)
  if (semanticTurn.primaryClassification !== "ACTION_REQUEST") {
    return {
      category: "CLARIFICATION_REQUIRED",
      eligibleForImmediateExecution: false,
      rejectionCode: "NON_ACTION_TURN",
      userExplanation: semanticTurn.conversationalSummary
    };
  }

  // Gate 2: Semantic Ambiguity Check
  if (semanticTurn.ambiguityStatus !== "UNAMBIGUOUS") {
    return {
      category: "CLARIFICATION_REQUIRED",
      eligibleForImmediateExecution: false,
      rejectionCode: `AMBIGUITY_${semanticTurn.ambiguityStatus}`,
      userExplanation: semanticTurn.conversationalSummary,
      clarificationQuestion: semanticTurn.clarification?.questionToUser
    };
  }

  // Gate 3: Empty Operations Array
  if (!semanticTurn.operations || semanticTurn.operations.length === 0) {
    return {
      category: "CLARIFICATION_REQUIRED",
      eligibleForImmediateExecution: false,
      rejectionCode: "ZERO_OPERATIONS",
      userExplanation: "No actionable operations were extracted from your request."
    };
  }

  const registry = CapabilityRegistry.getInstance();

  // Gate 4: Capability Existence Check (Fail Closed)
  for (const op of semanticTurn.operations) {
    const urn = op.capabilityURN || op.actionType;
    const desc = registry.getCapability(urn);
    if (!desc) {
      return {
        category: "UNREGISTERED_CAPABILITY",
        eligibleForImmediateExecution: false,
        rejectionCode: "UNREGISTERED_CAPABILITY",
        userExplanation: `The capability '${urn}' is not registered in the LifeOS capability catalog.`
      };
    }
  }

  // Gate 5: Structural Data Dependency Evaluation
  const hasDependencies = hasStructuralDataDependencies(semanticTurn.operations);
  if (hasDependencies) {
    return {
      category: "COMPOSITE_WORKFLOW_DAG",
      eligibleForImmediateExecution: false,
      rejectionCode: "REQUIRES_DYNAMIC_WORKFLOW_PLANNER"
    };
  }

  // Gate 6: Entity Resolution and Human Authorization Verification
  const proposals: ActionProposal[] = [];

  for (const op of semanticTurn.operations) {
    const urn = op.capabilityURN || op.actionType;
    const desc = registry.getCapability(urn)!;

    // Check Human Authorization Requirement (HITL)
    const requiresApproval = 
      desc.requiresApproval === true || 
      (desc.requiredResources || []).some((r) => r.accessMode === "EXCLUSIVE_LOCK");

    if (requiresApproval) {
      return {
        category: "HUMAN_AUTHORIZATION_REQUIRED",
        eligibleForImmediateExecution: false,
        rejectionCode: "REQUIRES_HUMAN_APPROVAL",
        userExplanation: `The action '${desc.displayName || urn}' requires your explicit authorization.`
      };
    }

    // Check Entity Grounding for Mutations
    if (desc.operationKind !== "CREATE") {
      const targetId = op.targetReference?.resolvedEntityId || (op.payload as any)?.taskId || (op.payload as any)?.id;
      if (!targetId || targetId === "RESOLVE_AT_EXECUTION") {
        return {
          category: "CLARIFICATION_REQUIRED",
          eligibleForImmediateExecution: false,
          rejectionCode: "UNRESOLVED_TARGET_ENTITY",
          userExplanation: `I could not resolve which entity you want to ${op.actionType}.`,
          candidateEntities: op.targetReference?.candidateIds?.map(id => ({ entityId: id, displayName: id }))
        };
      }
    }

    // Validate Required Payload Fields
    if (!op.payload || (desc.operationKind === "CREATE" && Object.keys(op.payload).length === 0)) {
      return {
        category: "CLARIFICATION_REQUIRED",
        eligibleForImmediateExecution: false,
        rejectionCode: "MISSING_REQUIRED_PAYLOAD",
        userExplanation: `Required parameters for '${op.actionType}' are missing.`
      };
    }

    proposals.push({
      id: `act_${op.operationId}`,
      domain: op.domain,
      actionType: op.actionType,
      targetEntityId: op.targetReference?.resolvedEntityId || undefined,
      payload: op.payload,
      rationale: op.targetReference?.rawExpression || undefined,
      reversibility: desc.reversibility || (desc.isReversible ? "reversible_with_compensation" : "irreversible_external"),
      idempotencyKey: `turn_${semanticTurn.turnId}_${op.operationId}`
    });
  }

  // Gate 7: Partition Single Operation vs Independent Batch
  if (proposals.length === 1) {
    return {
      category: "SINGLE_ATOMIC_OPERATION",
      eligibleForImmediateExecution: true,
      proposals
    };
  } else {
    return {
      category: "INDEPENDENT_OPERATION_BATCH",
      eligibleForImmediateExecution: true,
      proposals
    };
  }
}
```

---

## 6. Structural Workflow Dependency Detection Architecture

Dynamic workflow planning is reserved strictly for requests where operations have inter-step data dependencies or intermediate output flows. Dependency detection is entirely structural, typed, and deterministic.

### 6.1 Formal Representation of Structural Dependencies

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STRUCTURAL DEPENDENCY CONTRACTS                                                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. DATA PRODUCER: An operation whose execution yields observable output state in       │
│    StepOutputRecord (e.g. storage.read_file, email.search_messages, calendar.read).    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. DATA CONSUMER: An operation whose parameter map contains a forward-only $ref token  │
│    referencing an upstream step's output (e.g. content: "$ref:step1.body").            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. EXPLICIT DEPENDENCY: An operation whose op.dependencies array lists one or more     │
│    prior operationIds that must complete before execution can begin.                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. RUNTIME OBSERVATION: An operation whose targetEntityId or parameter cannot be known │
│    until an upstream query executes (e.g. targetEntityId: "$ref:step1.foundId").       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. PARALLELIZABLE OPERATIONS: Operations in a turn with disjoint dependency sets and   │
│    non-conflicting shared resource access modes.                                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Structural Dependency Analyzer (`StructuralDependencyAnalyzer.ts`)

Eliminates fragile `payloadStr.includes("$ref:")` string searches and broad `category === "query"` heuristics. Uses typed inspection and recursive token extraction:

```typescript
import { SemanticOperation } from "../contracts/SemanticTurnContracts";

/**
 * Recursively inspects a parameter object to find structural $ref tokens.
 * Supports both string format ("$ref:stepId.path") and object format ({"$ref": { stepId, path }}).
 */
export function extractStepReferences(value: any): string[] {
  const referencedStepIds: string[] = [];

  function traverse(val: any) {
    if (val === null || val === undefined) return;

    if (typeof val === "string") {
      if (val.startsWith("$ref:")) {
        const token = val.slice(5).trim();
        const stepId = token.split(".")[0];
        if (stepId) referencedStepIds.push(stepId);
      }
      return;
    }

    if (typeof val === "object") {
      if ("$ref" in val) {
        const refVal = val["$ref"];
        if (typeof refVal === "string") {
          const stepId = refVal.split(".")[0];
          if (stepId) referencedStepIds.push(stepId);
        } else if (typeof refVal === "object" && refVal?.stepId) {
          referencedStepIds.push(refVal.stepId);
        }
        return;
      }

      if (Array.isArray(val)) {
        for (const item of val) traverse(item);
      } else {
        for (const v of Object.values(val)) traverse(v);
      }
    }
  }

  traverse(value);
  return referencedStepIds;
}

/**
 * Deterministically determines whether operations in a turn have inter-step dependencies.
 * Zero string searches on raw JSON; zero category heuristics.
 */
export function hasStructuralDataDependencies(operations: SemanticOperation[]): boolean {
  if (operations.length <= 1) return false;

  const operationIds = new Set(operations.map((op) => op.operationId));

  for (let i = 0; i < operations.length; i++) {
    const currentOp = operations[i];

    // 1. Check explicit dependency declarations
    if (Array.isArray(currentOp.dependencies) && currentOp.dependencies.length > 0) {
      for (const depId of currentOp.dependencies) {
        if (operationIds.has(depId)) {
          return true; // Explicit causal dependency within this turn
        }
      }
    }

    // 2. Check parameter references to upstream steps
    const refs = extractStepReferences(currentOp.payload);
    for (const refStepId of refs) {
      if (operationIds.has(refStepId)) {
        return true; // Structural parameter data dependency
      }
    }

    // 3. Check target reference dynamic binding
    if (currentOp.targetReference?.resolvedEntityId?.startsWith("$ref:")) {
      return true;
    }
  }

  return false;
}
```

---

## 7. Fixed-Value and Behavioral Defaults Classification

Every fixed parameter across the codebase is classified under the **Eight-Tier Taxonomy**. Claims of "empirical calibration" are restricted strictly to parameters backed by repository telemetry. Parameters based on literature or statistical convention are labeled accurately.

```
Tier 1: [MATH-INV]  Genuine mathematical invariants (Acyclicity, trigonometry, probability theory)
Tier 2: [TECH-CON]  Technical implementation constraints (Stack limits, timeouts, payload limits)
Tier 3: [SEC-GOV]   Security & governance policies (HMAC-SHA256, atomic CAS leasing, tenancy)
Tier 4: [STAT-CONV] Standard statistical conventions (Normal distribution Z-scores)
Tier 5: [LIT-BASE]  Literature-derived baseline parameters (Habit formation decay rates)
Tier 6: [PROD-DEF]  Explicit product defaults (Circadian energy baselines, formula weights)
Tier 7: [USER-PREF] User-configurable preferences (Transition buffers, working hours)
Tier 8: [ARBITRARY] Arbitrary hardcoded behavioral assumptions (ELIMINATE)
```

### Complete 25-Parameter Re-Audited Classification Matrix

| Parameter & Source Location | Value / Expression | Classification | Authoritative Owner | Justified Purpose & Remediation Plan |
| :--- | :--- | :--- | :--- | :--- |
| `FastPathExecutor.ts#L135` | `priority: "medium"` | **Tier 8: [ARBITRARY]** | Stage 1 (FastPath) | **ELIMINATE.** Fabricated default. Must extract priority semantically; default to explicit `"none"` / `undefined`. |
| `FastPathExecutor.ts#L121` | `Date.now()` in idempotency keys | **Tier 8: [ARBITRARY]** | Stage 1 (FastPath) | **ELIMINATE.** Defeats idempotency deduplication. Must derive deterministically from `requestId` and `turnId`. |
| `DynamicWorkflowPlanner.ts#L241` | `query: "important project updates"` | **Tier 8: [ARBITRARY]** | Stage 4 (Planner) | **ELIMINATE.** Production benchmark plan playback. Must synthesize query from user goal. |
| `DynamicWorkflowPlanner.ts#L261` | `path: "briefing.md"` | **Tier 8: [ARBITRARY]** | Stage 4 (Planner) | **ELIMINATE.** Production benchmark plan playback. Must derive target path from user request or context. |
| `DynamicWorkflowPlanner.ts#L294` | `location: "San Francisco"` | **Tier 8: [ARBITRARY]** | Stage 4 (Planner) | **ELIMINATE.** Fabricated location. Must derive from user profile context. |
| `Supervisor.ts#L473` | Words `"class"`, `"schedule"`, `"block"` | **Tier 8: [ARBITRARY]** | Stage 1 (Supervisor) | **ELIMINATE.** Assistant prose action coercion. Action type must derive strictly from `SemanticTurn`. |
| `Supervisor.ts#L701` | Regex `/^(?:yes\|yep\|sure...)/i` | **Tier 8: [ARBITRARY]** | Stage 1 (Supervisor) | **ELIMINATE.** Replace with structured semantic turn classification `CONFIRMATION`. |
| `Supervisor.ts#L929` | 22-line list of `.includes(...)` | **Tier 8: [ARBITRARY]** | Stage 1 (Supervisor) | **ELIMINATE.** Replace with `CapabilityRegistry.getCapability(capURN)` contract lookup. |
| `actionExtractor.ts#L58` | Prompt forbidding custom signals | **Tier 8: [ARBITRARY]** | Stage 1 (Dispatch) | **ELIMINATE.** Remove restriction. Support dynamic hydration via `SignalDefinitionModel`. |
| `InterventionVerification.ts#L268` | `observedDelta >= expected * 0.8` | **Tier 8: [ARBITRARY]** | Stage 3 (Recovery) | **ELIMINATE.** Replace with strategy-declared success criteria functions. |
| `InterventionVerification.ts#L226` | `score + 0.15` (up), `- 0.25` (down) | **Tier 8: [ARBITRARY]** | Stage 3 (Recovery) | **ELIMINATE.** Replace with calibrated Bayesian feedback updates. |
| `CadenceLearningConsumer.ts#L76` | `durationMinutes = 30` | **Tier 8: [ARBITRARY]** | Milestone B2 (Causal) | **ELIMINATE.** Fabricated default. Unmeasured duration must remain explicitly unknown (`undefined`). |
| `CadenceLearningConsumer.ts#L61` | `title = "Routine"` | **Tier 8: [ARBITRARY]** | Milestone B2 (Causal) | **ELIMINATE.** Fabricated title. Use authoritative event payload title or preserve unknown. |
| `EpistemicVerification.ts#L132` | `importance >= 0.45 && conf >= 0.50` | **Tier 8: [ARBITRARY]** | Stage 2 (Memory) | **ELIMINATE.** Epistemic evaluation based on provenance and goal relevance. |
| `EpistemicVerification.ts#L126` | `importance + 0.25` (regex match) | **Tier 8: [ARBITRARY]** | Stage 2 (Memory) | **ELIMINATE.** Replace static boost with semantic relevance scoring. |
| `ContradictionResolver.ts#L205` | Static English word arrays (`dimensionSets`) | **Tier 8: [ARBITRARY]** | Stage 2 (Memory) | **ELIMINATE.** Compare structured schema attribute slots against canonical model. |
| `ScheduleRebalancer.ts#L55` | `suggestedShiftMinutes = shift + 15` | **Tier 7: [USER-PREF]** | Milestone B4 (Autonomous) | **PROMOTE.** Derive from `user.settings.calendarPreferences.transitionBufferMinutes` (default 10). |
| `CircadianEnergyAlignment.ts#L22` | `peakStartHour ?? 9, peakEndHour ?? 12` | **Tier 6: [PROD-DEF]** | Milestone B4 (Autonomous) | **PRESERVE AS DEFAULT.** Explicit baseline product default when historical profile has 0 samples. |
| `LifeStateWeights.ts#L13` | 25+ formula weights | **Tier 6: [PROD-DEF]** | Milestone B1 (World Model) | **PARAMETERIZE.** Developer baseline defaults; must support configurable profile calibration. |
| `CadenceLearningEngine.ts#L21` | `decayHalfLifeDays: 21.0` | **Tier 5: [LIT-BASE]** | Milestone B3 (Cadence) | **PRESERVE.** Literature baseline (Lally et al., 2010 habit formation study; $\tau = 21$ days). |
| `CadenceLearningEngine.ts#L23` | `outlierZScoreThreshold: 2.5` | **Tier 4: [STAT-CONV]** | Milestone B3 (Cadence) | **PRESERVE.** Standard Gaussian 98.8% confidence boundary for anomaly detection. |
| `CadenceLearningEngine.ts#L48` | Circular trigonometry modulo 1440 | **Tier 1: [MATH-INV]** | Milestone B3 (Cadence) | **PRESERVE.** Trigonometric averaging (`atan2`) for midnight-crossing times. |
| `CapabilityRegistry.ts#L41` | RFC 8785 JSON Canonicalization (JCS) | **Tier 1: [MATH-INV]** | Stage 4 (Capabilities) | **PRESERVE.** Deterministic SHA-256 contract hashing across distributed nodes. |
| `PlanValidator.ts#L40` | Kahn's topological sort (depth $\le 5$) | **Tier 1: [MATH-INV] / [TECH-CON]** | Stage 4 (Planning) | **PRESERVE.** Cycle detection (Math) and recursion stack limit (Technical). |
| `HITLGovernanceEngine.ts#L98` | HMAC-SHA256 & `timingSafeEqual` | **Tier 3: [SEC-GOV]** | Milestone B4 (HITL) | **PRESERVE.** Cryptographic non-repudiation and timing attack defense. |

---

## 8. Rejection, Fallback, and Truthful Intent Preservation

Tracing reachable execution paths across the production call graph confirms where valid user intent was previously discarded or silently altered, and defines the truthful outcome for every path.

### 8.1 Upstream LLM Outage Preservation & Idempotent Retry

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ UPSTREAM OUTAGE PRESERVATION LIFECYCLE                                                 │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. INGRESS CAPTURE: At HTTP route ingress, request is tagged with deterministic        │
│    requestId (UUIDv4) and turnId.                                                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. FAILURE DETECTION: If LLM client throws (HTTP 429, 503, or network timeout):        │
│    - SemanticIntentInterpreter returns ambiguityStatus: "UPSTREAM_OUTAGE".             │
│    - Supervisor creates an OutagePreservationRecord in MongoDB session state:          │
│      { requestId, turnId, rawInput, timestamp, retryCount: 0, state: "AWAITING_RETRY" }│
│    - Returns explicit user message: "Intelligence service is temporarily unavailable.   │
│      Your request has been preserved. Please retry."                                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. IDEMPOTENT RETRY: When user clicks Retry or re-submits:                             │
│    - Ingress preserves the original requestId / turnId.                                │
│    - Idempotency Gate checks whether a mutation receipt already exists for turnId.     │
│    - If previously committed, returns receipt immediately without duplicate mutation.  │
│    - If uncommitted, re-dispatches to LLM and clears preservation record on success.   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Dynamic Custom Signal Preservation & Asynchronous Schema Registration

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ DYNAMIC CUSTOM SIGNAL LIFECYCLE                                                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. PARSING: actionExtractor parses novel signal into structured key, value, and unit:  │
│    e.g. { signalKey: "blood_ketones_mmol", value: 1.8, unit: "mmol/L" }.               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. PERSISTENCE INVARIANT (ZERO DATA LOSS):                                             │
│    - Kernel immediately writes observation to DailyLog.customSignals[signalKey].       │
│    - State mutation commits immediately regardless of whether schema is indexed.       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. ASYNCHRONOUS SCHEMA REGISTRATION:                                                   │
│    - Kernel emits SignalObservedEvent to the outbox.                                   │
│    - Background consumer checks SignalDefinitionModel for signalKey definition.        │
│    - If missing, registers dynamic schema definition without blocking user response.   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. FAULT TOLERANCE & RE-INGESTION:                                                     │
│    - If schema registration fails (e.g. DB index collision), DailyLog data is NOT      │
│      rolled back. Data remains safely recorded in user's daily record.                 │
│    - Re-ingestion uses deterministic key 'log_signal_${date}_${signalKey}' to prevent │
│      duplicate entries.                                                                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Generalization and Held-Out Testing Methodology

To guarantee that tests evaluate true semantic understanding rather than hardcoded special cases, testing is split into **Known Contract Tests** and **Held-Out Generalization Suites**.

### 9.1 Two-Tier Testing Separation
1. **Tier A: Known Contract Tests (Repository Fixtures):** Basic regressions committed directly in the repository asserting interface stability, Zod schemas, and known bug fixes.
2. **Tier B: Held-Out Generalization Suite (Parameterized Generator):** Dynamic test harness running in CI that generates unseen variations across linguistic registers, preventing developers from hardcoding string checks to pass tests.

### 9.2 Decision Correctness Evaluation Matrix
A test is scored as **successful** only when the system makes the **correct decision**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ DECISION CORRECTNESS MATRIX: PREVENTING EAGER EXECUTION                                │
├───────────────────────────────┬────────────────────────────┬───────────────────────────┤
│ Input Scenario                │ Required System Decision   │ Scored Failure Modes      │
├───────────────────────────────┼────────────────────────────┼───────────────────────────┤
│ Unambiguous Valid Action      │ Execute Target Capability  │ Clarification Prompt,     │
│                               │                            │ Silent Fallback           │
├───────────────────────────────┼────────────────────────────┼───────────────────────────┤
│ Multi-Candidate Ambiguity     │ HALT & Return Ambiguity    │ Eager Execution of Any    │
│ (e.g. 2 tasks match "taxes")  │ with Candidate IDs         │ Candidate (CRITICAL FAIL) │
├───────────────────────────────┼────────────────────────────┼───────────────────────────┤
│ High-Risk / External Action   │ HALT & Generate HMAC       │ Direct Execution Without  │
│ (e.g. Delete, send email)     │ Pending Intervention       │ User Approval (CRIT FAIL) │
├───────────────────────────────┼────────────────────────────┼───────────────────────────┤
│ Unregistered Capability       │ Fail Closed with           │ Execution Guess, Fallback │
│                               │ UNREGISTERED_CAPABILITY    │ to Casual Dialogue Banter │
├───────────────────────────────┼────────────────────────────┼───────────────────────────┤
│ Casual Dialogue / Banter      │ Conversational Reply       │ Generating Any Action     │
│                               │                            │ Proposal (CRITICAL FAIL)  │
└───────────────────────────────┴────────────────────────────┴───────────────────────────┘
```

### 9.3 The Ten Adversarial Generalization Scenarios
1. **Custom User-Defined Signal:** Parses `blood_ketones_mmol: 1.8`. Hydrates into `DailyLog.customSignals` without dropping data.
2. **Unfamiliar Activity Category:** Routes to health domain. `CadenceConsumer` records exact 90 min title without fabricating `"Routine"`.
3. **Novel Habit Goal Phrasing:** Proposes goal with cadence `'daily'`, metric `'pages'`, target `25`.
4. **Colloquial & Indirect Language:** Entity Resolver grounds `'taxes'` to active task; completes task.
5. **Multilingual Requests (Spanish & Hinglish):** Correctly completes task in Spanish and schedules 07:00 workout in Hinglish.
6. **Multi-Candidate Disambiguation:** HALT execution. Returns `ambiguityStatus: 'ENTITY_AMBIGUOUS'` with candidate IDs. Zero mutations occur.
7. **Multi-Domain Compound Request (Batch vs DAG):** Direct batch execution across wellness, productivity, and health domains without planner overhead.
8. **Dynamically Discovered Capability (Runtime MCP Tool):** Discovers `notion.query_database`. Executes without false HITL.
9. **Context-Dependent Temporal Anaphora:** Resolves pronoun `'it'` to Sarah sync; reschedules occurrence.
10. **Explicit Urgency Preservation Without Default Override:** Task title `'Audit server logs'`; priority `'high'` (never `'medium'`).

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
10. **Tamper-Proof Protection:** CI enforcement scripts and protected paths are locked under CODEOWNERS, base-ref diff verification, and GitHub branch protection.
11. **Final Repository Audit:** An independent audit confirms zero replacement heuristics were introduced across the entire codebase.

---

## 12. Gating Directive Regarding Step 1 V2.2

**STRICT DIRECTIVE:** Do NOT authorize or begin Step 1 V2.2 until **Phase 1 (Loops 1–5)** is fully implemented, verified, and accepted under automated CI enforcement.

Phase 1 establishes the clean, contract-governed, model-driven foundation necessary to close application-layer mutation paths without institutionalizing architectural violations in the sovereign kernel.

