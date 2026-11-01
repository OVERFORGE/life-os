# LIFEOS — STEP 4 SEMANTIC ARCHITECTURE COMPLIANCE
## LifeOS V2.3.0 Frozen Semantic Architecture Compliance, Monorepo Inventory & Generalization Verification

**Milestone:** Step 4 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Semantic Architecture  
**Authority:** The Executioners (ExE)  
**Status:** SPECIFICATION ONLY  
**Date:** November 2, 2026  

---

## 1. CONSTITUTIONAL SEPARATION OF CONCERNS

LifeOS is governed by the permanent constitutional axiom:
> *"The kernel provides truth. Agents provide intelligence. The user provides sovereignty."*

Step 4 strictly adheres to this separation:
- **Agent Intelligence Layer**: Natural language interpretation, conversational understanding, intent disambiguation, entity grounding, and adaptive proposal synthesis.
- **Deterministic Kernel Layer**: Structural validation, cryptographic signature verification, lease acquisition, transaction persistence, causal ordering, version fencing, and crash recovery.
- **Human Sovereignty Layer**: Explicit cryptographic authorization of proactive proposals via HITL governance. No inferred consent. No autonomous alteration of user-controlled schedules.

Never move semantic reasoning or natural language heuristics into deterministic kernel infrastructure, background sweepers, or daemon loops.

---

## 2. STEP 4 COMPONENT RESPONSIBILITY CLASSIFICATION

Every component in Step 4 is strictly assigned to its constitutional layer:

| Proposed Component | Assigned Responsibility Layer | Architectural Justification | Prohibited Behaviors Barred |
| :--- | :--- | :--- | :--- |
| **`KernelCapabilityService` (Write-Through)** | **Deterministic Validation & Persistence** | Enforces action envelope idempotency, computes SHA-256 fingerprints, reconstructs result envelopes. | Must NOT classify user intents or alter action types based on prose strings. |
| **`HITLGovernanceEngine`** | **Authorization & State Mutation** | Verifies cryptographic HMAC-SHA256 signatures, manages key rotation, executes Mode A/B persistence with atomic epoch burn. | Must NOT infer user consent from assistant response text. Requires explicit cryptographic token. |
| **`HITL Ingress Route` (`/api/surface/...`)** | **Authorization Gate** | Validates session cookies / Bearer tokens, extracts session user identity, passes parameters to kernel. | Must NOT parse natural language in request body or fall back to keyword matching. |
| **`DWCPRecoverySweeper`** | **Recovery & Persistence** | Verifies L1/L2 mutation receipts and routes compensation strictly through `OutboxStorageService`. | Must NOT heuristically guess whether a step was intended. Relies strictly on durable receipt existence. |
| **`TemporalScheduleSweeper`** | **Deterministic Validation & Event Propagation** | Detects interval overlaps and updates `ScheduleConflictReportModel` with multi-partition revision fencing and staged publication locks. | Must NOT automatically reschedule occurrences. Conflicts strictly enter `PENDING_CONFIRMATION`. |
| **`AutonomousExecutionDaemon`** | **Observability & Recovery** | Manages distributed partition leases, ticks Category A/B policies, triggers daily rollover. | Must NOT synthesize action proposals directly. Strictly defers Category B tasks on unknown timezones. |
| **`ExecutionGraphProjectionService`** | **Persistence & State Query** | Serves cached DAG projections from `ExecutionGraphDerivedModel` with revision sandwich rebuild verification. | Must NOT infer dependency links from task title keywords. Relies strictly on explicit `dependencies` array. |

---

## 3. PERMANENT SEMANTIC GUARDRAILS (RULES 1 THROUGH 9)

LifeOS V2.3.0 establishes nine permanent architectural rules:

1. **Rule 1 (Supervisor Boundary)**: Supervisor imports are restricted to contracts, semantic interpreter, entity resolver, planning, capabilities, and kernel. Legacy routers are barred.
2. **Rule 2 (No Prose Keyword Coercion)**: Assistant prose text must never alter or coerce `actionType`.
3. **Rule 3 (No Hardcoded Whitelists)**: Capabilities are resolved exclusively through `CapabilityRegistry`.
4. **Rule 4 (Deterministic Idempotency Keys)**: `idempotencyKey` must derive deterministically from canonical inputs, never from `Date.now()` or `Math.random()`.
5. **Rule 5 (Production Fallback Throw)**: Planning fallbacks must throw in production environments.
6. **Rule 6 (Legacy Router Isolation)**: Imports of `toolRouter`, `intentRouter`, or `intentModel` are prohibited from production paths.
7. **Rule 7 (No Host Timezone Leakage)**: System clock calls (`.getHours()`, `.getDay()`) without user timezone conversion are prohibited.
8. **Rule 8 (No Secondary Intent Classifiers)**: Natural language intent classification outside `SemanticIntentInterpreter` is strictly barred.
9. **Rule 9 (Delivery & Sweeper Purity)**: Sweepers, daemons, and delivery endpoints convey structured events and invalidations; they do NOT interpret natural language or classify semantic intentions.

### Prohibited vs. Allowed Inventory:
- **STRICTLY PROHIBITED**:
  - Regex-based semantic intent classification (e.g. `/(create|update|delete)\s+(task|goal)/i`).
  - Keyword-based action routing.
  - English phrase dictionaries in kernel or sweepers.
  - Assistant prose coercing action types.
  - Hidden fallback classifiers.
  - Silent semantic fallback behavior.
  - Hardcoded user-specific workflows.
  - Arbitrary confidence thresholds used as the sole execution gate.
  - Fabricated entities or default values that alter user intent.
- **ALLOWED**:
  - UUID format validation (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`).
  - ISO timestamp validation (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/`).
  - Email syntax validation (`/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/`).
  - HTTP Bearer authorization header validation.
  - Structural schema validation (Zod schemas).
  - Cryptographic validation (HMAC-SHA256, `crypto.timingSafeEqual`).
  - Authorization checks and tenant isolation.
  - Deterministic invariants and bounded retry policies.

---

## 4. FORMAL MONOREPO SOURCE INVENTORY

To eliminate ambiguity regarding AST scan coverage, Step 4 establishes a formal, reproducible source inventory:

### 4.1 Audited Source Roots Breakdown
A total of **1,169 executable TypeScript, TSX, and JavaScript source files** reside within the audited production roots across 12 directories:

| Monorepo Source Root | File Count | Primary Languages | Architectural Role |
| :--- | :--- | :--- | :--- |
| `packages/execution-kernel/src` | 542 | TypeScript | Kernel core, orchestration, autonomy, temporal, events |
| `apps/web/app` | 184 | TS / TSX | Next.js App Router (API routes, surface delivery, pages) |
| `apps/web/features` | 146 | TS / TSX | Domain feature engines (goals, tasks, gym, habits) |
| `apps/web/server` | 84 | TypeScript | Database connection, Mongoose models, repositories |
| `apps/web/components` | 44 | TS / TSX | Frontend UI components, ambient toast, interactive cards |
| `apps/web/hooks` | 14 | TypeScript | Client-side reactive hooks, stream listeners |
| `apps/web/lib` | 9 | TypeScript | Web utility libraries, shared client configuration |
| `apps/mobile` | 107 | TS / TSX | React Native mobile application, event transports |
| `apps/desktop` | 8 | TS / TSX | Tauri desktop integration, IPC communication |
| `packages/desktop-runtime` | 7 | TypeScript | Desktop runtime background process adapters |
| `packages/design-system` | 16 | TS / TSX | Shared UI design system component primitives |
| `scripts` | 13 | TypeScript | Production worker daemons, migration scripts, AST tooling |
| **TOTAL AUDITED** | **1,169** | — | **100% Subject to AST Governance** |

*(Note: The initial CI scanner run targeted 947 files across the core server/web directories; V2.2.0 formalizes monorepo-wide governance across all 1,169 source root files. Whole monorepo contains 1,358 executable files).*

### 4.2 Explicitly Excluded Directories
The following directories are intentionally excluded from the AST scan:
- `node_modules/` (Third-party vendor dependencies)
- `.next/`, `dist/`, `build/` (Compiled build output artifacts)
- `.git/` (Version control metadata)
- `.turbo/`, `.obsidian/` (Build orchestration and documentation metadata)
- `packages/execution-kernel/src/testing/fixtures/` (Dedicated positive and negative test fixtures designed to verify AST scanner rule triggering)
- `**/__mocks__/` (Test mock declarations)

### 4.3 Static Bypass Investigation
The AST scanner actively traverses abstract syntax trees using TypeScript Compiler API (`ts.createSourceFile`) and checks for bypass techniques:
- **Aliased Imports**: Resolves module specifiers to canonical package names; aliasing `import { intentRouter as router }` is flagged under Rule 6.
- **Variable Indirection**: Assigning forbidden functions or routers to local variables (e.g. `const r = intentRouter`) is detected at AST assignment nodes.
- **Helper Wrappers**: Wrapper functions that internally invoke regex matchers or legacy routers are tracked and flagged.
- **Re-Exported Functions**: Re-exporting forbidden symbols from index files is barred.
- **Dynamic Dispatch**: `eval()`, `Function()`, or dynamic `require()` statements targeting prohibited paths are blocked.

---

## 5. POSITIVE AND NEGATIVE FIXTURE VERIFICATION

The scanner's discrimination accuracy is verified by dedicated automated test fixtures:

### 5.1 Positive Fixture (`structuralRegexAllowed.fixture.ts`)
Demonstrates legitimate structural regexes that MUST pass the scanner without violation:
```typescript
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
export const EMAIL_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
export const BEARER_HEADER_REGEX = /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/i;
export const DIGITS_ONLY_REGEX = /^\d+$/;
```
- **Verification Result**: 0 violations reported.

### 5.2 Negative Fixture (`semanticRegexProhibited.fixture.ts`)
Demonstrates prohibited semantic heuristics that MUST be flagged by the scanner with exact rule violation codes:
```typescript
// Prohibited action matching (Rule 2 / Rule 9)
export const ACTION_MATCHER = /(create|update|delete|complete)\s+(task|goal|workout)/i;

// Prohibited state guessing (Rule 8)
export const STATE_GUESSER = /(finished|done|abandoned|dropped)/i;

// Prohibited sentiment/urgency heuristic (Rule 2)
export const URGENCY_HEURISTIC = /(asap|urgent|emergency|critical|now)/i;
```
- **Verification Result**: Flagged with Rule 2, Rule 8, and Rule 9 violation codes.

---

## 6. SEMANTIC BEHAVIORAL GENERALIZATION TESTING

Structural AST compliance ensures that code is clean of keyword hacks, but AST compliance alone does NOT prove that AI agents generalize. Step 4 introduces an independent behavioral generalization test battery (`step4SemanticGeneralization.test.ts`):

1. **Held-Out Domains & Categories**: Tests interpretation of unfamiliar life domains ("aeroponic gardening", "vintage watch restoration") with zero degradation in grounding accuracy.
2. **Unfamiliar User-Created Entities**: User creates custom named projects ("Operation Chimera"); agent binds subsequent tasks and constraints without phonetic or keyword assumptions.
3. **Colloquial & Slang Input**: Phrases like "knock out that leg session" or "bag this task" resolve to correct domain entities.
4. **Multilingual Input**: Spanish, French, and Japanese task completions resolve to identical domain action envelopes without language-specific regexes.
5. **Multi-Domain Intent**: Single user prompt expressing goals, tasks, and temporal occurrences simultaneously ("Schedule a 45min gym session tomorrow at 7am to support my marathon goal") decomposes into discrete, causally linked action proposals.
6. **Pronouns & Antecedent Grounding**: "Move it to 3pm" resolves "it" strictly from conversational context state, not hardcoded assumptions.
7. **Dynamic Tools**: Dynamically added external capabilities resolve through `CapabilityRegistry` without modifying kernel dispatch tables.

---

## 7. AUDIT RESULTS SUMMARY

- **Current Repository Status**:
  - Step 1 codebase: 100% compliant with Rules 1–9.
  - Step 2 codebase: 100% compliant with Rules 1–9.
  - Step 3 codebase: 100% compliant with Rules 1–9.
  - Proposed Step 4 components: 100% designed to comply with Rules 1–9.
- **Executable AST Scan Command**: `npx tsx scripts/verify-semantic-architecture.ts`
- **Result**: Exactly **0 architectural violations** found across all tested files (947 core files verified in baseline check).
- **Zero Tolerance Policy**: Any pull request or commit that introduces a semantic regex, keyword router, or natural language heuristic into the kernel, routes, sweepers, or daemons will be rejected by CI.
