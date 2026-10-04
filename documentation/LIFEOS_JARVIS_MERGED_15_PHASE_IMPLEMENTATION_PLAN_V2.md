# LIFEOS — JARVIS TRANSFORMATION: MASTER 15-PHASE MERGED IMPLEMENTATION PLAN (V2)
## Hardened Architecture, Epistemic Rigor, and Sovereign Closed-Loop Personal Operating System
## Synthesized Blueprint: Constitutional LifeOS + Closed-Loop Jarvis + Antigravity 15-Phase Plan

> **DOCUMENT VERSION**: V2.0.0 (ARCHITECTURALLY HARDENED / READY FOR IMPLEMENTATION REVIEW)  
> **STATUS**: PROPOSED IMPLEMENTATION BLUEPRINT (PLAN-FIRST / ZERO CODE MODIFIED)  
> **AUTHORITY BOUNDARY**: KernelCapabilityService.ts / Supervisor.ts / WorldModelV2.ts  
> **DATE**: October 2026

---

## 1. EXECUTIVE SUMMARY & ARCHITECTURAL FOUNDATIONS

### 1.1 The Merged Strategic Imperative
LifeOS is engineered to be a **Sovereign Personal Operating System for Human Execution and Life Management**, with Aven functioning as a persistent executive chief of staff. It is not an autonomous browser agent and not a commodity chatbot wrapper.

Forensic codebase analysis established a foundational gap: **Two Disjointed Brains**:
- **Brain A (Analytical Intelligence)**: [WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts), [LifeStateEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/LifeStateEngine.ts), [GoalIntelligenceEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/GoalIntelligenceEngine.ts), and [TelemetryIngestionService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/telemetry/TelemetryIngestionService.ts). This subsystem compiles a 5-axis tension model, goal pressure, and health data, but operates in total isolation from the user's conversational interface.
- **Brain B (Conversational Intelligence)**: [Supervisor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts), [FastPathExecutor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/FastPathExecutor.ts), [SemanticIntentInterpreter.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts), and [ConversationService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/services/ConversationService.ts). When the user talks to Aven, the Supervisor loads short-term memory (STM) and recent dialogue, completely bypassing WorldModelV2. It is context-blind to sleep debt, meeting density, and physical recovery.

Moreover, the existing codebase contains **false completeness**: [ProactiveEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/proactive/ProactiveEngine.ts) is a 79-line dead stub with zero background workers; [RelationshipContextEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/RelationshipContextEngine.ts) returns a hardcoded stub array; [BehaviorProfile.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/BehaviorProfile.ts) is an ephemeral in-memory singleton; [ExternalCapabilityAdapter.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/external/ExternalCapabilityAdapter.ts) is a 3,838-line monolith; and [v3RealityAudit.test.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/v3RealityAudit.test.ts) relies on regex-based mock LLM routers.

This V2 plan hardens the V1 blueprint by resolving all architectural contradictions, eliminating pretend benchmark numbers, strictly bounding semantic ownership, formalizing event taxonomies, and enforcing closed-loop intervention attribution.

---

### 1.2 Non-Negotiable Constitutional Architecture
Every line of code across all 15 phases must strictly respect these 9 Constitutional Rules:

1. **Zero Regex as Semantic Intelligence**: Regular expressions must NEVER be used to infer semantic intent, entity meaning, confirmation, contradiction, temporal anchors, user preferences, or action selection. Regex is strictly quarantined to syntax checking and protocol parsing. (All regex polarity pairs in [ContradictionResolver.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/memory/ContradictionResolver.ts) are eliminated in Phase 4).
2. **Zero Pattern Matching as Intelligence**: No keyword maps, token overlap scoring, substring matching, fuzzy token distance, or hardcoded linguistic phrase lists may serve as semantic authority. Language interpretation belongs exclusively to model-driven semantic interpreters.
3. **Zero Hardcoded Semantic Routing**: Deterministic code enforces schemas, invariants, authorization, capability policy, state transitions, risk classes, and idempotency; it never decides human language meaning.
4. **No Second Brain**: We will not build `WorldModelV3`, secondary entity resolvers, parallel memory stores, or duplicate execution authorities. We will evolve [WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts) into the single authoritative world representation.
5. **Kernel Sovereignty**: Aven proposes; the Supervisor orchestrates; Specialists deliberate; but **ONLY** [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts) executes and mutates state. The kernel is the sovereign execution boundary.
6. **MCP is Not the Architecture**: The Model Context Protocol (MCP) is an optional provider transport mechanism behind the kernel capability boundary. Core cloud services remain native REST adapters.
7. **LangGraph is an Experiment, Not the Brain**: LangGraph TypeScript is evaluated strictly as a cognitive state machine pilot for complex deliberative reasoning. It must never own MongoDB truth, execute side effects directly, or bypass the kernel.
8. **Mental State is Probabilistic Estimation**: Cognitive and mental states are represented as `Evidence + Features + Estimate + Confidence + Provenance + Freshness`. LifeOS never claims medical diagnosis and never treats inferences as unquestionable facts.
9. **No Fake Success & Unknown External State**: Aven must never claim an action succeeded unless the authoritative execution ledger confirms committed execution. External ambiguity must remain explicit uncertainty (`UNKNOWN_EXTERNAL_STATE`).

---

### 1.3 The Sovereign Closed Loop
LifeOS operates on a continuous, closed-loop execution lifecycle:

```
  OBSERVE (Continuous Passive Telemetry & Context Ingestion)
     ↓
  UNDERSTAND (Canonical World Model Compilation: WorldModelV2)
     ↓
  ESTIMATE (Cognitive Load, Physical Recovery, Focus Capacity)
     ↓
  DECIDE (Multi-Domain Cross-Factor Reasoning)
     ↓
  PROPOSE (Policy-Bounded Action Proposals)
     ↓
  AUTHORIZE (Deterministic Autonomy Tier & Risk Matrix)
     ↓
  EXECUTE (Sovereign Kernel Capability Service Boundary)
     ↓
  OBSERVE OUTCOME (T+4h and T+24h Telemetry Measurement Windows)
     ↓
  VERIFY (Attribution Model: Baseline vs Delta vs Confounders)
     ↓
  LEARN (Exponential Decay Behavioral Update: τ = 21 days)
     ↓
  ADAPT (Calibrated Policy & Candidate Preference Promotion)
     ↓
  UPDATE WORLD MODEL (Recomputed Baseline & Fresh Projections)
     ↓
  CONTINUE (Continuous Operational Awareness)
```

---

## 2. THE 14 NEW ARCHITECTURAL SPECIFICATIONS & HARDENING ARTIFACTS

---

### ARTIFACT A: Canonical Life State Contract (`ILifeContextProjection`)

The canonical world representation is owned by [WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts). However, LLMs and orchestrators must never receive the entire unbounded world model. We introduce the **Canonical Life Context Projection**: a bounded, strongly typed, immutable projection designed for context injection (strictly $\le 250\text{ tokens}$).

```typescript
export type FreshnessState = "FRESH" | "STALE" | "EXPIRED" | "UNKNOWN";

export interface IProjectionMetadata {
  projectionId: string;
  userId: string;
  sourceSnapshotVersion: number;
  computedAt: number;      // Epoch ms when projection was assembled
  observedAt: number;      // Epoch ms of latest underlying observation
  validUntil: number;      // Epoch ms after which projection is EXPIRED
  freshness: FreshnessState;
  provenance: string;      // e.g. "WorldModelBridge:v2"
  confidence: number;      // 0.0 to 1.0 aggregate confidence
}

export interface IIdentitySlice {
  userId: string;
  name: string;
  timezone: string;
  activeRole: string;
}

export interface IPreferenceSlice {
  explicitRules: Array<{ key: string; value: string | number | boolean; authority: "EXPLICIT_HARD" | "EXPLICIT_SOFT" }>;
  learnedHabits: Array<{ key: string; value: string | number | boolean; confidence: number; authority: "LEARNED" }>;
}

export interface IExecutionSlice {
  activeLifeState: "FOCUSED_FLOW" | "BALANCED_EXECUTION" | "OVERLOADED" | "DEPLETED_RECOVERY" | "DRIFTING";
  taskVelocityScore: number;       // 0.0 - 1.0 (7-day normalized)
  activeBacklogCount: number;
  criticalPathLength: number;
  topGoalPressures: Array<{ goalId: string; title: string; pressureScore: number }>;
}

export interface ICognitiveSlice {
  overallReadiness: number;        // 0.0 - 1.0
  stressTier: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  focusCapacityMinutes: number;
  cognitiveLoadEstimate: number;   // 0.0 - 1.0
  evidenceConfidence: number;      // 0.0 - 1.0
  requiresUserConfirmation: boolean;
}

export interface IPhysicalSlice {
  sleepDurationHours: number;
  sleepRecoveryScore: number;      // 0.0 - 1.0
  physicalStrainTier: "RESTED" | "MODERATE" | "HIGH" | "EXHAUSTED";
  lastWorkoutTimestamp?: number;
}

export interface IScheduleSlice {
  firstCommitmentTimestamp?: number;
  totalMeetingMinutesToday: number;
  meetingFragmentationScore: number; // 0.0 (continuous) to 1.0 (shredded)
  availableDeepWorkWindows: Array<{ startTimestamp: number; endTimestamp: number; durationMinutes: number }>;
}

export interface IOperationalConstraintsSlice {
  activeConstraints: string[];
  activeIncidentIds: string[];
  quietHoursActive: boolean;
}

export interface ILifeContextProjection {
  metadata: IProjectionMetadata;
  identity: IIdentitySlice;
  preferences: IPreferenceSlice;
  execution: IExecutionSlice;
  cognitive: ICognitiveSlice;
  physical: IPhysicalSlice;
  schedule: IScheduleSlice;
  constraints: IOperationalConstraintsSlice;
}
```

---

### ARTIFACT B: Strict Semantic Ownership Boundary

To eliminate hidden secondary semantic interpreters, LifeOS establishes an inviolable 7-layer pipeline:

```
  [ LAYER 1: USER NATURAL LANGUAGE ] (Voice audio, typed text, UI click)
                  │
                  ▼
  [ LAYER 2: AVEN / SEMANTIC INTENT INTERPRETER ] (SOLE Language Authority)
    - Groq / Qwen / Claude model-driven parsing
    - Zero regex, zero keyword tables
    - Produces structured SemanticTurn
                  │
                  ▼
  [ LAYER 3: STRUCTURED SEMANTIC CONTRACTS ]
    - SemanticOperation[], TargetEntityRef, SomaticAffectiveEvidence
    - Normalized parameters, temporal anchors, entity descriptors
                  │
                  ▼
  [ LAYER 4: DOMAIN INTELLIGENCE & REASONING ]
    - CognitiveStateEngine, GoalIntelligenceEngine, CrossDomainEngine
    - Consumes ONLY structured observations and metrics
    - NEVER parses raw conversation strings
    - Emits ActionProposal[] with expected outcomes
                  │
                  ▼
  [ LAYER 5: DETERMINISTIC POLICY & GOVERNANCE ]
    - AutonomyPolicyManager, NotificationFatigueFilter, RiskMatrix
    - Enforces Quiet Hours, Max Alerts, Permission Tiers
    - Evaluates reversibility and safety ceilings
                  │
                  ▼
  [ LAYER 6: KERNEL CAPABILITY SERVICE ] (SOVEREIGN EXECUTION BOUNDARY)
    - Capability Registry resolution
    - Idempotency locking, cryptographic audit ledger
    - Pre-condition and post-condition verification
                  │
                  ▼
  [ LAYER 7: PROVIDER ADAPTERS & EXTERNAL WORLD ]
    - Modular Native REST Providers (Google, GitHub, Spotify)
    - Modular MCP Transport Gateway (Desktop Stdio / Tools)
    - Provider executes; provider NEVER reasons
```

**The Inviolable Rules**:
1. Domain engines ([CognitiveStateEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/), [RelationshipContextEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/RelationshipContextEngine.ts), [CrossDomainIntelligenceEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/reasoning/)) must **NEVER** accept raw natural language strings or independently invoke LLMs for language parsing. They consume strictly typed DTOs.
2. [ContradictionResolver.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/memory/ContradictionResolver.ts) must **NEVER** call regex polarity pairs. Contradictions are detected by comparing structured subject-predicate-object assertions emitted by Layer 2.
3. [FastPathExecutor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/FastPathExecutor.ts) executes deterministic shortcuts only after Layer 2 emits a high-confidence, unambiguous structured turn.

---

### ARTIFACT C: Threshold Classification Matrix

Every numeric threshold in LifeOS is explicitly categorized into one of 9 governance classes to prevent arbitrary magic numbers from becoming constitutional rules:

| Threshold / Parameter | Value in V1 | Hardened V2 Governance Classification | Authority & Mutability Rules |
| :--- | :--- | :--- | :--- |
| **Zero Regex for Semantics** | 0 occurrences | **1. CONSTITUTIONAL INVARIANT** | Non-negotiable. Absolute repository invariant. |
| **Kernel Sole Execution Boundary**| 100% of actions| **1. CONSTITUTIONAL INVARIANT** | Non-negotiable. No direct DB mutations allowed. |
| **FastPath Response Time** | $\le 180\text{ms}$ | **2. ENGINEERING BUDGET** | Benchmark budget. Monitored via Prometheus P95. |
| **Context Bridge Latency** | $\le 15\text{ms}$ | **2. ENGINEERING BUDGET** | In-memory cached lookup performance target. |
| **Max Context Projection Tokens**| $\le 250\text{ tokens}$| **2. ENGINEERING BUDGET** | Hard ceiling on token usage injected into LLM context. |
| **User Autonomy Level** | L0 - L5 | **3. USER CONFIGURATION** | Explicitly chosen by user per capability category. |
| **Quiet Hours Window** | 22:00 - 08:00 | **4. POLICY DEFAULT** | Initial default; overridable in user settings. |
| **Max Unsolicited Alerts / Day** | 3 alerts | **4. POLICY DEFAULT** | Default fatigue ceiling; user configurable (1 to 5). |
| **Intervention Cooldown** | 4 hours | **4. POLICY DEFAULT** | Minimum quiet interval between alerts for same domain. |
| **Behavioral Decay Half-Life** | $\tau = 21\text{ days}$ | **5. LEARNED PARAMETER** | Initial mathematical baseline; dynamically calibrated per user. |
| **Task Completion Baseline** | Moving average | **5. LEARNED PARAMETER** | Exponential rolling average computed from telemetry. |
| **LangGraph Deliberative Value** | MEASURE FIRST | **6. EXPERIMENTAL HYPOTHESIS** | Must be measured in Phase 10; NOT pre-decided. |
| **MCP Desktop Tool Overhead** | MEASURE FIRST | **6. EXPERIMENTAL HYPOTHESIS** | Must be measured in Phase 11; NOT pre-decided. |
| **Cognitive Stress Score** | $0.0 - 1.0$ | **7. MODEL OUTPUT** | Probabilistic estimate derived from evidence bundle. |
| **Focus Readiness Score** | $0.0 - 1.0$ | **7. MODEL OUTPUT** | Dynamic mathematical inference; never an immutable law. |
| **Longitudinal Stability Score**| $\ge 85 / 100$ | **8. TEST ORACLE** | Automated regression pass criteria in simulation lab. |
| **Intervention Efficacy Delta** | $\ge +25\%$ | **8. TEST ORACLE** | Target improvement in 90-day simulation experiments. |
| **Circuit Breaker Ceiling** | 1 alert / hour | **9. OPERATIONAL SAFETY CEILING** | Hardcoded rate limiter; cannot be bypassed by any LLM. |
| **LangGraph Recursion Limit** | 10 steps | **9. OPERATIONAL SAFETY CEILING** | Hard infinite-loop circuit breaker. |

---

### ARTIFACT D: Autonomy Eligibility Matrix

Autonomy is not a binary toggle based on a simplistic "LOW" risk tag. Eligibility for autonomous execution (Autonomy Tier L5) is determined by an empirical cross-product of 6 dimensions:

$$\text{Autonomy Eligibility} = \text{Risk} \times \text{Reversibility} \times \text{Side Effect} \times \text{User Policy} \times \text{Provider Guarantee} \times \text{State Certainty}$$

| Capability Category | Risk Class | Reversibility Classification | External Side Effect | Required Provider Guarantee | Max Autonomy Tier Allowed |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Internal Focus Block Creation**| LOW | `REVERSIBLE_EXACT` (Event delete) | Internal calendar | Idempotent write confirmed | **Level 5 (Autonomous)** |
| **Task Priority Re-ranking** | LOW | `REVERSIBLE_EXACT` (Revert sort) | None (Local DB) | Atomic local transaction | **Level 5 (Autonomous)** |
| **Notification Digest Bundling** | LOW | `REVERSIBLE_EXACT` (Restore feed) | None (Local DB) | Atomic local transaction | **Level 5 (Autonomous)** |
| **Drafting Meeting Briefing** | LOW | `REVERSIBLE_EXACT` (Discard draft)| None (Local DB) | Atomic local transaction | **Level 5 (Autonomous)** |
| **Rescheduling Internal 1-on-1** | MEDIUM | `PARTIALLY_REVERSIBLE` (Notify invitee)| Shared calendar invite| 2-way sync confirmed | **Level 4 (Approval Required)** |
| **Declining External Solicitations**| MEDIUM | `COMPENSATABLE` (Send follow-up) | External email/invite | Outbound delivery confirmed | **Level 4 (Approval Required)** |
| **Cancelling External Client Meeting**| HIGH | `COMPENSATABLE` (Manual apology)| External client invite| Outbound delivery confirmed | **Level 4 (Approval Required)** |
| **Sending External Email / Message**| HIGH | `IRREVERSIBLE` (Cannot unsend) | External network | Message dispatch | **Level 4 (Approval Required)** |
| **Deleting Database Entities** | CRITICAL | `IRREVERSIBLE` (Hard purge) | Permanent data loss | Storage write | **Level 4 (Approval Required)** |
| **Financial Transactions / Purchases**| CRITICAL | `COMPENSATABLE` (Refund request) | External payment gateway| PCI-compliant ledger | **Level 4 (Approval Required)** |

**The Two Hard Invariants of Autonomy**:
1. **The LLM May Never Authorize Itself**: Autonomy Tier L5 can ONLY be granted by deterministic policy evaluating an explicit user configuration toggle.
2. **Reversibility is Capability-Specific**: We replace the false claim of "universal 1-tap undo" with explicit compensation descriptors:
   - `REVERSIBLE_EXACT`: Inverse capability executed (e.g. `calendar.event.delete`).
   - `COMPENSATABLE`: Compensation workflow triggered (e.g. draft cancellation notice).
   - `IRREVERSIBLE`: Cannot execute autonomously under any circumstance.

---

### ARTIFACT E: External Authority & Conflict Resolution Matrix

To eliminate dangerous blanket "last-write-wins" assumptions, LifeOS defines granular authority, synchronization states, and reconciliation policies for every domain:

| Domain / Entity | Authoritative Source of Record | Mirrored / Cached Replica | Synchronization States Supported | Conflict Reconciliation Policy |
| :--- | :--- | :--- | :--- | :--- |
| **Google Calendar Events** | External Provider (Google) | LifeOS MongoDB (`calendar_events`) | `PENDING_COMMIT`, `CONFIRMED`, `UNKNOWN_STATE`, `REJECTED` | **External Wins on Remote Mutation**. If local write conflicts with remote edit, local is aborted; user prompted to resolve. |
| **LifeOS Core Tasks** | LifeOS MongoDB (`tasks`) | Linear / Google Tasks (if synced) | `LOCAL_AUTHORITY`, `SYNC_PENDING`, `SYNC_FAILED` | **LifeOS Wins**. External task managers are secondary mirrors. Local state commits immediately. |
| **Health & Wearable Biometrics**| External Provider (Apple/Oura) | LifeOS Telemetry Store (`observations`) | `RAW_INGESTED`, `NORMALIZED`, `CORRUPTED` | **External Provider Owns Sensor Facts**. LifeOS derives operational readiness; never mutates raw readings. |
| **User Explicit Preferences** | LifeOS MongoDB (`user_profiles`) | None | `COMMITTED`, `PENDING_VERIFICATION` | **User Explicit Input is Absolute**. Cannot be modified by external webhooks or background inference. |
| **Learned Behavioral Model** | LifeOS MongoDB (`behavior_profiles`) | In-memory cached profile | `ACTIVE`, `DECAYING`, `CANDIDATE` | **Derived Operational State**. Degrades via exponential decay ($	au = 21	ext{d}$) without reinforcement. |
| **Interpersonal Relationships** | LifeOS MongoDB (`relationships`) | Google Contacts (Metadata feed) | `AUTHORITATIVE`, `ENRICHED` | **LifeOS Owns Execution Context**. Contact names/emails enriched from external; roles/commitments owned locally. |
| **Execution Event Ledger** | LifeOS Immutable Ledger (`event_ledger`)| Local append-only log | `COMMITTED_CRYPTO_HASHED` | **Append-Only Immutable Truth**. Zero external updates permitted; authoritative source for replay. |

---

### ARTIFACT F: Intervention Attribution Model

LifeOS rejects the naive assumption that observing an expected outcome proves an intervention succeeded. The **Intervention Attribution Engine** evaluates 6 discrete outcome categories using baseline control comparison:

```
   Intervention Proposal
            │
            ▼
   Execution Committed (T_0)
            │
            ├─────────────────────────────────────────────────┐
            ▼ (T + 4 hours)                                   ▼ (T + 24 hours)
   Sample Window Metric Delta                        Sample Window Metric Delta
            │                                                 │
            ▼                                                 ▼
   Evaluate Confounders & User Overrides             Evaluate Longitudinal Sustainability
            │                                                 │
            └────────────────────────┬────────────────────────┘
                                     │
                                     ▼
                    Compute Attribution Confidence Score
                                     │
                                     ▼
              Assign Final Categorical Attribution Status
```

**The 6 Attribution Categories**:
1. `EFFECTIVE`: Expected delta observed ($>20\%$ improvement over baseline), zero confounders, user confirmed utility, attribution confidence $\ge 0.80$.
2. `LIKELY_EFFECTIVE`: Metric improved, minor confounders present, attribution confidence between $0.60$ and $0.79$.
3. `UNCERTAIN`: Metric improved, but major confounding event occurred (e.g. unexpected calendar cancellation by another party).
4. `INEFFECTIVE`: Metric showed zero statistically significant change compared to baseline control.
5. `ADVERSE`: Target metric degraded post-intervention (e.g. user deferred more tasks after focus block was created).
6. `NOT_MEASURABLE`: Telemetry was incomplete or user manually deleted target entity before measurement window closed.

**Constitutional Learning Rule**:
[LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts) is strictly forbidden from reinforcing a strategy unless the outcome is classified as `EFFECTIVE` or `LIKELY_EFFECTIVE`.

---

### ARTIFACT G: Evidence Provenance & Cryptographic Traceability Model

Every piece of derived state in LifeOS must carry an immutable provenance record:

```typescript
export interface IEvidenceProvenance {
  evidenceId: string;
  sourceCollection: "dailylogs" | "calendar_events" | "telemetry_observations" | "conversation_turns";
  sourceEntityId: string;
  originatingProvider: "google_calendar" | "oura" | "apple_health" | "local_kernel" | "user_chat";
  capturedAt: number;        // Epoch ms when sensor or user produced data
  ingestedAt: number;        // Epoch ms when LifeOS ingested record
  extractorVersion: string;  // e.g. "CalendarObservationExtractor:v2.1"
  rawPayloadHash: string;    // SHA-256 hash of raw input for audit integrity
  confidence: number;        // 0.0 to 1.0 confidence score
}
```

---

### ARTIFACT H: State Freshness & Temporal Validity Model

No background daemon or proactive engine may authorize an action using stale context:

```typescript
export interface ITemporalValidity {
  computedAt: number;
  validUntil: number;
  ttlSeconds: number;
  freshnessState: FreshnessState;
}

export function evaluateFreshness(validity: ITemporalValidity, currentEpochMs: number): FreshnessState {
  if (currentEpochMs > validity.validUntil) {
    return "EXPIRED";
  }
  const ageMs = currentEpochMs - validity.computedAt;
  if (ageMs > (validity.ttlSeconds * 1000) * 0.75) {
    return "STALE"; // In upper 25% of lifespan; eligible for proactive recomputation
  }
  return "FRESH";
}
```
*Invariant*: Proactive Engine background daemons must verify `freshnessState === "FRESH"` before dispatching any ActionProposal.

---

### ARTIFACT I: Real-LLM Testing Model & Mock Purge

To eradicate false confidence without losing fast, deterministic test suites, testing is split into 3 distinct classes:

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ CLASS A: DETERMINISTIC CONTRACT TESTS (100% Deterministic / CI Gating)  │
  │ - Structured, static SemanticTurn JSON fixtures                          │
  │ - Zero LLM network calls, zero regex matching                            │
  │ - Validates: schemas, risk gates, invariants, kernel execution, replay   │
  └─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ CLASS B: RECORDED REAL-MODEL FIXTURES (VCR Replay / Regression Suite)   │
  │ - Cryptographically hashed recordings of REAL Groq / Claude exchanges    │
  │ - Matches: hash(prompt + system_prompt + schema_version)                 │
  │ - Zero API billing during CI runs; verifies real prompt output parsing   │
  └─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ CLASS C: LIVE MODEL EVALUATION (Nightly CI / Adversarial Smoke Tests)   │
  │ - Hits live production model APIs with temperature = 0.0                │
  │ - Tests: prompt drift, semantic edge cases, multi-turn disambiguation    │
  │ - Catches vendor model silent updates before they hit production users   │
  └─────────────────────────────────────────────────────────────────────────┘
```
*Rule*: All instances of `ScriptedLLMProvider` using regex string matching are permanently eliminated from the repository.

---

### ARTIFACT J: LangGraph Experiment Design & Quantitative Decision Gate

LangGraph TypeScript is NOT pre-decided. Phase 10 executes a controlled, head-to-head pilot comparing Native ReAct vs LangGraph on 50 identical complex deliberative life-restructuring requests:

```
                               [ Phase 0 Baseline Latency & Memory Established ]
                                                      │
                                                      ▼
                                       [ Execute 50 Pilot Test Runs ]
                                        ├── Run A: Native ReAct Orchestrator
                                        └── Run B: LangGraph StateGraph Pilot
                                                      │
                                                      ▼
                                       [ Evaluate Quantitative Decision Gate ]
```

**The Three Mutually Exclusive Outcomes for Phase 10**:
- **Outcome A (`KEEP CURRENT ORCHESTRATION` )**: If LangGraph adds $>250\text{ms}$ deliberative latency or $>50\text{MB}$ memory overhead without demonstrating superior resumability or HITL recovery.
- **Outcome B (`ADOPT LIMITED LANGGRAPH` )**: If LangGraph demonstrates clean multi-step checkpointing, resumable HITL pauses, and maintainable specialist fan-out while adding $<200\text{ms}$ latency and $<40\text{MB}$ heap overhead. (Strictly quarantined to deliberative planning; zero FastPath usage).
- **Outcome C (`ADOPT BROADER LANGGRAPH` )**: Only permissible if LangGraph latency matches native performance ($<50\text{ms}$ delta) across all turns. (Unlikely based on architectural characteristics).

---

### ARTIFACT K: MCP Experiment Design & Transport Abstraction

We define the **MCP Transport Abstraction**:
```typescript
export interface IMcpTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendRequest<T>(method: string, params: unknown): Promise<T>;
  isAlive(): boolean;
}
```

**Mandatory Preflight**: Prior to Phase 11 implementation, engineers must execute an architectural preflight against the official `@modelcontextprotocol/sdk` to determine the latest recommended transport (Stdio vs SSE vs Stream) for desktop and remote environments.

**Native vs MCP Rule**:
- **Core Cloud APIs** (Google Calendar, GitHub, Spotify, Stripe, Apple Health) remain **NATIVE REST ADAPTERS**. (Guarantees multi-tenant vaulting, $<150\text{ms}$ execution, and deterministic replay).
- **MCP Scope** is restricted to desktop-local tools (filesystem, local SQLite, Obsidian) and open developer tooling.

---

### ARTIFACT L: Experience, Proposal & Execution Event Taxonomy

LifeOS strictly separates experiential and conversational turns from operational execution mutations:

```
1. EXPERIENCE_EVENT: UI / Audio rendering (e.g. Morning Briefing displayed, voice audio streamed).
2. CONVERSATION_EVENT: User dialogue utterance or conversational reply.
3. PROPOSAL_EVENT: System or Specialist formulates an ActionProposal with expected outcome.
4. AUTHORIZATION_EVENT: Human approves proposal, or Policy authorizes Level 5 execution.
5. EXECUTION_EVENT: Sovereign KernelCapabilityService commits an atomic state mutation.
6. OBSERVATION_EVENT: Sensor, webhook, or system activity ingested into observation store.
7. OUTCOME_EVENT: Delayed measurement window evaluates intervention efficacy delta.
8. LEARNING_EVENT: LearningEngine commits calibrated behavioral weight to database.
```
*Invariant*: Generating a Morning Briefing is an `EXPERIENCE_EVENT`. It is **NEVER** an intervention. An intervention only begins when a `PROPOSAL_EVENT` is authorized and committed as an `EXECUTION_EVENT`.

---

### ARTIFACT M: Simulation Hidden-Ground-Truth Model

To prevent circular reasoning where the simulation merely confirms its own rules, Phase 14 implements a **Hidden-Ground-Truth Simulation Harness**:

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │ SIMULATOR PRIVATE STATE (HIDDEN FROM LIFEOS)                           │
  │ - Actual Human Fatigue: 0.78 (True biological exhaustion)              │
  │ - Unreported Family Distraction: 2.5 hours                             │
  │ - Hidden Motivation Drift: -0.30                                       │
  └──────────────────────────────────┬─────────────────────────────────────┘
                                     │ (Emits noisy, incomplete observations)
                                     ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ LIFEOS OBSERVATION INGESTION & COGNITIVE ENGINE                        │
  │ - Ingested: 6h sleep, 5 meetings, 2 task deferrals                     │
  │ - Inferred Cognitive Readiness: 0.32 (Confidence: 0.84)                │
  │ - Emits Action Proposal: Protect afternoon focus block                 │
  └──────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ LONGITUDINAL STABILITY VALIDATOR                                       │
  │ - Compares LifeOS inference vs Hidden Biological State                 │
  │ - Measures True Inductive Accuracy across 90 simulated days            │
  └────────────────────────────────────────────────────────────────────────┘
```

---

### ARTIFACT N: No-Second-Brain & No-Hardcoded-Intelligence Audit

A comprehensive static audit verifies that V2 introduces zero parallel systems and zero semantic regex:

| Architectural Responsibility | Authoritative System | Verified No Second Brain | Verified No Regex / Keywords |
| :--- | :--- | :--- | :--- |
| **Language Understanding** | `SemanticIntentInterpreter` | PASS: Sole semantic authority | PASS: Model-driven; zero regex |
| **Entity Resolution** | `EntityResolutionEngine` | PASS: Sole resolver; no shadow matching | PASS: Structured relation binding |
| **World Model Truth** | `WorldModelV2` | PASS: Evolved; no WorldModelV3 | PASS: Deterministic state reducers |
| **Capability Execution** | `KernelCapabilityService` | PASS: Sole execution boundary | PASS: Invariant risk gates |
| **Context Assembly** | `WorldModelBridge` | PASS: Bounded projection of WorldModelV2| PASS: Typed DTO mapping |
| **Contradiction Resolution**| `ContradictionResolver` | PASS: Integrated in Epistemic Verification| PASS: Polarities verified semantically |
| **Intervention Ledger** | `InterventionRecordModel` | PASS: Extensions of ExecutionEventLedger | PASS: Mathematical outcome metrics |

---



## 3. DETAILED 15-PHASE IMPLEMENTATION PLAN (PHASES 0 TO 4)

---

### PHASE 0: Reality Baseline, Characterization & False-Completeness Audit

#### 1. Objective
Establish an empirical, unvarnished baseline of system behavior across the entire LifeOS monorepo using real Dockerized MongoDB/Redis instances, real LLM gateways, and live OAuth provider tokens. Rigorously measure and document baseline P50/P95/P99 latency, heap memory footprint, CPU consumption, token usage, error rates, and worker throughput across all 23 kernel stages and conversational endpoints.

#### 2. Why this phase exists
Previous audit findings proved that existing test suites rely on `ScriptedLLMProvider` with regex matching in [v3RealityAudit.test.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/v3RealityAudit.test.ts). When tests use mocks that simulate human language with regex, they hide real-world prompt formatting bugs, model drift, and database transaction failures. Crucially, before we can evaluate LangGraph (Phase 10) or MCP (Phase 11), we must establish an authoritative, measured baseline.

#### 3. Current repository state
- Kernel tests in [v3RealityAudit.test.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/v3RealityAudit.test.ts) pass via regex-based scripted responses.
- In-memory fallbacks silently swallow MongoDB connection errors in [Supervisor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts) (lines 123-125).
- Zero unified benchmark suites exist to measure true P50/P95/P99 latency.

#### 4. Existing components reused
- [ProductionTracer.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/observability/ProductionTracer.ts) for execution tracing.
- [ExecutionEventLedger.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/workspace/ExecutionEventLedger.ts) for event audit logging.
- Existing Jest / Node test runner infrastructure.

#### 5. Components to modify
- [packages/execution-kernel/src/testing/v3RealityAudit.test.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/v3RealityAudit.test.ts): Add test flag to run against live MongoDB test container rather than in-memory mocks.
- [packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts): Add diagnostic assertions to log when MongoDB is disconnected instead of silently continuing.

#### 6. Components to create
- `packages/execution-kernel/src/testing/reality/BaselineBenchmarkHarness.ts`: Automated performance harness measuring P50/P95/P99 latency across all 23 kernel stages and conversational endpoints.
- `packages/execution-kernel/src/testing/reality/InvariantEnforcementTest.ts`: Test suite verifying the 9 constitutional invariants (asserting zero regex for semantic understanding, zero unverified state mutations).
- `packages/execution-kernel/src/testing/docker/docker-compose.test.yml`: Ephemeral test container configuration for isolated MongoDB and Redis instances.

#### 7. Components to deprecate/remove
- Deprecate `ScriptedLLMProvider` regex pattern matching in reality test suites.
- Quarantine all mock-only assertions that do not verify database state mutations.

#### 8. Architectural dependencies
None. This is the root foundation.

#### 9. Data model changes
None. Read-only audit and test harness deployment.

#### 10. Contract/interface changes
Introduce `IBenchmarkResult` in `packages/execution-kernel/src/testing/reality/BenchmarkContracts.ts`:
```typescript
export interface IBenchmarkResult {
  operation: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  memoryDeltaMb: number;
  cpuPercent: number;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  timestamp: number;
}
```

#### 11. API changes
Add internal diagnostic route: `GET /api/kernel/diagnostics/baseline`.

#### 12. Event changes
None.

#### 13. Background job changes
None.

#### 14. Frontend changes
None.

#### 15. Mobile changes
Verify mobile build connectivity to live test server without mock overrides.

#### 16. Desktop changes
Verify desktop runtime compiles and launches without mock dependencies.

#### 17. Aven changes
None.

#### 18. Supervisor changes
Instrument `Supervisor.processRequest()` with high-resolution timers (`process.hrtime.bigint()`) for benchmarking.

#### 19. Kernel changes
Instrument `KernelCapabilityService.execute()` to report per-capability execution latency to the benchmark harness.

#### 20. World Model changes
None.

#### 21. Learning changes
None.

#### 22. Persistence changes
Configure test runner to connect to real MongoDB test database on port `27018`.

#### 23. Replay implications
Verify that replaying identical historical event ledgers yields 100% byte-for-byte identical state trees in MongoDB.

#### 24. Observability requirements
Export baseline metrics to JSON artifact: `documentation/benchmarks/baseline_v0.json`.

#### 25. Security implications
Ensure no production credentials or real user OAuth tokens are committed into test fixtures.

#### 26. Performance implications
Zero runtime overhead in production; benchmark harness runs strictly in test environments.

#### 27. Migration strategy
Additive test infrastructure only. Zero disruption to production services.

#### 28. Backward compatibility
100% backward compatible.

#### 29. Failure modes
- Docker unavailable in developer environment: Fallback to local MongoDB daemon with explicit warning.
- Rate limits on real LLM calls during benchmark runs: Harness uses exponential backoff and records rate-limit failures.

#### 30. Recovery strategy
Clean teardown of test containers via `docker compose down -v` in afterAll hooks.

#### 31. Idempotency requirements
Benchmark harness must be fully re-runnable with identical clean state resets between runs.

#### 32. Concurrency requirements
Test harness must support concurrent execution (5 concurrent virtual users) to measure contention latency.

#### 33. Adversarial test plan
- Disconnect MongoDB during active kernel execution: verify deterministic error classification (`DATABASE_UNAVAILABLE`).
- Inject malformed JSON responses from LLM: verify kernel fails safely without corrupting memory.

#### 34. Real-system test plan
Run complete conversational task creation turn through [ConversationService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/services/ConversationService.ts) against real MongoDB and assert document exists in database.

#### 35. Simulation test plan
Execute 1-day synthetic simulation cycle in [apps/web/simulation/](file:///d:/PROGRAMMING/Projects/life-os/apps/web/simulation/) to measure baseline runtime speed.

#### 36. Manual smoke-test plan
Trigger "Mark task complete" via API and inspect MongoDB collection directly using mongosh.

#### 37. Exit criteria
- Baseline latency report produced with concrete P50/P95/P99 metrics for FastPath, Specialist, and Kernel execution.
- 100% of False Completeness Register items cataloged with exact file lines and failing tests.

#### 38. Regression criteria
Zero existing tests broken; any test failures caused by removing false mocks must be cataloged in the audit log.

#### 39. Loop-engineering procedure
`INSPECT` current test suite → `HYPOTHESIZE` latency baselines → `IMPLEMENT` real container harness → `TEST` real db calls → `OBSERVE` failures → `DIAGNOSE` mock gaps → `REPAIR` test assumptions → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rules.

#### 40. Rollback strategy
Delete `packages/execution-kernel/src/testing/reality/` directory; zero production code touched.

#### 41. Risks
Live LLM testing incurs API cost and potential rate-limiting. Mitigate with cached record/replay fixtures for secondary regression passes.

#### 42. Open architectural decisions
Decide whether live LLM reality tests run on every pull request or nightly in CI. (Recommended: nightly CI for live LLMs; deterministic recorded fixtures on PR).

#### 43. Dependencies on previous phases
None.

#### 44. What must NOT be implemented in this phase
Do not refactor any adapters, do not implement LangGraph, do not implement MCP, do not modify MongoDB schemas.

---

### PHASE 1: Canonical Unified World Model & Context Bridge

#### 1. Objective
Bridge the "Two Disjointed Brains" by establishing a bidirectional, low-latency context bridge between [WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts) and [Supervisor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts), providing Aven with bounded, typed `ILifeContextProjection` without creating a second world model.

#### 2. Why this phase exists
Currently, when a user talks to Aven, [Supervisor.processRequest()](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts#L88) loads only recent conversation messages and short-term memory (lines 120-165). The rich analytical state in [WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts) (goal pressures, recovery state, life balance, active incidents) is completely ignored. This makes Aven context-blind.

#### 3. Current repository state
- [WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts) builds [KernelSnapshot.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/KernelSnapshot.ts) via [KernelSnapshotBuilder.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/KernelSnapshotBuilder.ts).
- [Supervisor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts) constructs `SupervisorRequest` and passes context to `SemanticIntentInterpreter.interpret()`.
- Zero import of `WorldModelV2` exists inside `Supervisor.ts` or `SemanticIntentInterpreter.ts`.

#### 4. Existing components reused
- [KernelSnapshot.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/KernelSnapshot.ts) contracts.
- [WorldModelV2.computeKernelSnapshot()](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts#L57).
- [ContextProjectionEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/context/ContextProjectionEngine.ts).

#### 5. Components to modify
- [packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts): In `processRequest()`, inject bounded world context projection before semantic interpretation.
- [packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts): Extend `SemanticInterpreterContext` to receive bounded `ILifeContextProjection`.
- [packages/execution-kernel/src/persona/index.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/persona/index.ts): Update system prompt builder to ingest world context tokens.

#### 6. Components to create
- `packages/execution-kernel/src/worldv2/WorldModelBridge.ts`: High-speed caching bridge that serves freshly computed or cached `ILifeContextProjection` to the Supervisor in $<15\text{ms}$.
- `packages/execution-kernel/src/worldv2/projections/LifeContextProjectionBuilder.ts`: Compiles bounded, token-optimized projection contract (strictly $\le 250\text{ tokens}$).

#### 7. Components to deprecate/remove
- Deprecate `WorldModelV1` legacy artifacts in `packages/execution-kernel/src/world/`.
- Remove `computeSnapshot()` legacy wrapper in `WorldModelV2.ts` once callers migrate to `computeKernelSnapshot()`.

#### 8. Architectural dependencies
Phase 0 reality baseline.

#### 9. Data model changes
Add snapshot cache collection in MongoDB: `kernel_snapshot_cache` (capped collection, 1 document per user, TTL 60 seconds).

#### 10. Contract/interface changes
Adopt `ILifeContextProjection` (from Artifact A) in `SemanticInterpreterContext`. Zero `any` permitted.

#### 11. API changes
Update `POST /api/conversation` to accept optional `skipWorldHydration` flag for lightweight latency testing.

#### 12. Event changes
Emit `WORLD_MODEL_HYDRATED` telemetry event into [ExecutionEventLedger.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/workspace/ExecutionEventLedger.ts).

#### 13. Background job changes
Introduce periodic snapshot warm-up job (runs every 5 minutes per active user) to keep the cache hot.

#### 14. Frontend changes
Web client displays active life state badge (e.g. `[Focused Flow]`, `[Overload Alert]`) inside the Aven chat interface header using calm, restrained Executioners neutral surfaces.

#### 15. Mobile changes
Mobile chat modal displays concise cognitive readiness indicator in the top status bar.

#### 16. Desktop changes
Desktop tray tooltip displays current LifeState from the unified world model.

#### 17. Aven changes
Aven's responses dynamically adapt tone and recommendations based on user readiness (e.g. shorter, crisper sentences when stress is high).

#### 18. Supervisor changes
Supervisor checks `WorldModelBridge.getLatestSnapshot(userId)` before invoking `FastPathExecutor` or `ReActOrchestrator`.

#### 19. Kernel changes
Kernel execution results trigger an asynchronous cache invalidation signal to `WorldModelBridge`.

#### 20. World Model changes
[WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts) enforces strict field-level provenance, validity timestamps, and confidence scoring on every returned slice.

#### 21. Learning changes
Learning signals emitted by `LearningEngine` are directly exposed in the `ILifeContextProjection`.

#### 22. Persistence changes
Cached snapshot stored in Redis/MongoDB memory with a 60-second invalidation window.

#### 23. Replay implications
Replay harness hydrates historical snapshots matching the exact timestamp of each turn, ensuring identical model context during replay.

#### 24. Observability requirements
Track `world_bridge_latency_ms` and `world_bridge_cache_hit_rate` in [ProductionTracer.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/observability/ProductionTracer.ts).

#### 25. Security implications
World context projection strips all PII and raw biometric readings, providing only normalized scores ($0.0 - 1.0$) and high-level summaries to prompt contexts.

#### 26. Performance implications
Context bridge budget: $<20\text{ms}$ when cached, $<150\text{ms}$ on cold cache recomputation.

#### 27. Migration strategy
Feature flag: `ENABLE_WORLD_MODEL_CONTEXT_BRIDGE` (default `false` initially; shadow-run in background to verify latency, then cut over).

#### 28. Backward compatibility
If `WorldModelBridge` fails or times out, Supervisor gracefully falls back to previous behavior (STM only) with zero disruption.

#### 29. Failure modes
- Cache miss with heavy DB load: Timeout after 150ms and proceed with degraded context.
- Stale snapshot: Snapshot age $>10\text{ minutes}$ flagged with `freshness: "STALE"` in prompt.

#### 30. Recovery strategy
Fallback to empty context object; background worker re-populates cache asynchronously.

#### 31. Idempotency requirements
Multiple concurrent calls to `WorldModelBridge.getLatestSnapshot()` deduplicate onto a single in-flight promise.

#### 32. Concurrency requirements
Bridge must handle 50 concurrent requests per node without thread-blocking or cache corruption.

#### 33. Adversarial test plan
- Provide contradictory user input (user claims "I feel amazing" while snapshot shows extreme sleep debt and critical stress): verify Aven acknowledges discrepancy tactfully without crashing.
- Corrupt snapshot cache JSON: verify bridge handles parse error and falls back to clean database recomputation.

#### 34. Real-system test plan
Send "What should I focus on next?" via ConversationService; verify response explicitly references the top goal from [GoalIntelligenceEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/GoalIntelligenceEngine.ts).

#### 35. Simulation test plan
Execute 5-day lifecycle simulation; verify that changing simulated task backlog dynamically modifies Aven's recommendations across turns.

#### 36. Manual smoke-test plan
Open web chat, query "What's my current state?", verify Aven outputs current LifeState and active goal pressure.

#### 37. Exit criteria
- Aven prompt incorporates `[ACTIVE_USER_STATE]` block with valid confidence scores and $<250\text{ tokens}$.
- P95 latency overhead of context bridge is $\le 25\text{ms}$.
- Zero regex or hardcoded strings used for world model context translation.

#### 38. Regression criteria
All existing fast-path execution tests pass without regression.

#### 39. Loop-engineering procedure
`INSPECT` Supervisor context loading → `HYPOTHESIZE` bridge latency → `IMPLEMENT` WorldModelBridge → `TEST` bridge latency → `OBSERVE` token usage → `DIAGNOSE` prompt bloat → `REPAIR` projection bounds → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 4 (No Second Brain).

#### 40. Rollback strategy
Disable feature flag `ENABLE_WORLD_MODEL_CONTEXT_BRIDGE=false`.

#### 41. Risks
Token inflation in conversational prompts. Mitigate by enforcing strict 250-token hard limit on `ILifeContextProjection`.

#### 42. Open architectural decisions
Determine exact TTL for snapshot cache (30s vs 60s vs 120s). Benchmark P95 freshness vs database query load.

#### 43. Dependencies on previous phases
Phase 0.

#### 44. What must NOT be implemented in this phase
Do not modify background workers, do not implement proactive push notifications, do not modify external capability adapters.

---

### PHASE 2: Observation & Continuous Telemetry Engine

#### 1. Objective
Transform [TelemetryIngestionService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/telemetry/TelemetryIngestionService.ts) from an isolated daily-log reader into a continuous, multi-source observation pipeline ingesting calendar events, task activity, wearable biometrics, and desktop/mobile system events into a durable observation store backed by cryptographic evidence provenance.

#### 2. Why this phase exists
Currently, [TelemetryIngestionService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/telemetry/TelemetryIngestionService.ts) only queries [DailyLogRepository.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/repositories/DailyLogRepository.ts) and active tasks (lines 49-54). If the user does not submit an explicit manual daily log, LifeOS is completely blind to sleep, workouts, meeting density, and activity. Continuous awareness requires passive ingestion.

#### 3. Current repository state
- [Observation.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/telemetry/Observation.ts) defines immutable, frozen observation contracts.
- [ObservationMapper.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/telemetry/ObservationMapper.ts) extracts observations strictly from manual daily logs.
- External webhooks from Google Calendar or wearables are not connected to the observation pipeline.

#### 4. Existing components reused
- [Observation.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/telemetry/Observation.ts) and `createFrozenObservation()`.
- [TelemetryQuality.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/telemetry/TelemetryQuality.ts) for completeness scoring.
- [ExecutionEventLedger.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/workspace/ExecutionEventLedger.ts).

#### 5. Components to modify
- [packages/execution-kernel/src/telemetry/TelemetryIngestionService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/telemetry/TelemetryIngestionService.ts): Connect durable event queue and multi-source provider extractors.
- [packages/execution-kernel/src/telemetry/ObservationMapper.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/telemetry/ObservationMapper.ts): Add mappers for calendar events, wearable sleep records, and app activity.

#### 6. Components to create
- `packages/execution-kernel/src/telemetry/pipeline/ObservationPipeline.ts`: Durable, idempotent ingestion pipeline handling normalization, deduplication, and storage.
- `packages/execution-kernel/src/telemetry/pipeline/CalendarObservationExtractor.ts`: Normalizes calendar meetings into `ScheduleDensity`, `MeetingFragmentation`, and `DeepWorkWindow` observations.
- `packages/execution-kernel/src/telemetry/pipeline/WearableObservationExtractor.ts`: Normalizes sleep duration, resting heart rate, and step count from connected providers.
- `packages/execution-kernel/src/server/db/models/ObservationModel.ts`: MongoDB persistence model with compound indexes on `userId`, `timestamp`, and `type`.

#### 7. Components to deprecate/remove
- Deprecate synchronous, in-line telemetry extraction in [DailyLogRepository.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/repositories/DailyLogRepository.ts).

#### 8. Architectural dependencies
Phase 1 (Unified World Model consumes generated observations).

#### 9. Data model changes
New collection: `telemetry_observations`:
```typescript
export interface ITelemetryObservationRecord {
  id: string; // obs-uuid
  type: ObservationType;
  userId: string;
  timestamp: number;
  generatedAt: number;
  normalizedValue: number; // 0.0 - 1.0
  rawValue: number | string | boolean | Record<string, unknown>;
  unit: string;
  provenance: IEvidenceProvenance; // From Artifact G
}
```

#### 10. Contract/interface changes
Extend `ObservationType` in [Observation.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/telemetry/Observation.ts#L4) with:
`ScheduleDensity`, `CalendarFragmentation`, `SleepDurationHours`, `SleepRecoveryScore`, `WorkoutCompleted`, `AppInterruptionFrequency`. Zero `any` permitted.

#### 11. API changes
- `POST /api/telemetry/ingest`: External webhook ingestion endpoint.
- `GET /api/telemetry/observations`: Paginated query endpoint for historical observations.

#### 12. Event changes
Emit `OBSERVATION_EVENT` (type: `TELEMETRY_OBSERVATION_INGESTED`) onto the system event bus.

#### 13. Background job changes
Scheduled job: Poll connected external calendar and wearable APIs every 15 minutes to ingest new delta records.

#### 14. Frontend changes
Personalization settings UI displays "Telemetry Sources" status table showing connection state and last sync timestamp for Google Calendar, Apple Health, and Google Fit.

#### 15. Mobile changes
Register background task using Notifee and Expo Background Fetch to push device step count and screen time summaries every 6 hours.

#### 16. Desktop changes
Tauri runtime records active focus application duration and emits periodic `DesktopActivityObservation` events.

#### 17. Aven changes
Aven can answer telemetry questions ("How did I sleep last night?") using passively ingested observations without prompting the user to log anything.

#### 18. Supervisor changes
None.

#### 19. Kernel changes
Kernel actions (e.g. task completed, event scheduled) emit domain observations directly into the observation pipeline.

#### 20. World Model changes
[WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts) reads active observations from MongoDB collection instead of relying solely on the 14-day manual log array.

#### 21. Learning changes
[LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts) receives rich stream of multi-domain observations, enabling multi-factor pattern detection.

#### 22. Persistence changes
Write observations in batches using `bulkWrite()` with `ordered: false` and `upsert: true` based on deterministic observation IDs.

#### 23. Replay implications
Deterministic observation IDs (`obs-{type}-{sourceId}-{timestamp}`) guarantee replay deduplication.

#### 24. Observability requirements
Prometheus metrics: `telemetry_ingested_total{type, provider}`, `telemetry_pipeline_duration_ms`.

#### 25. Security implications
Health and biometric data encrypted at rest in MongoDB using AES-256 field-level encryption.

#### 26. Performance implications
Ingestion throughput engineering budget: $\ge 500\text{ observations/sec}$; batch processing latency: $<50\text{ms}$.

#### 27. Migration strategy
Run dual ingestion: keep existing manual DailyLog mapping while activating the continuous pipeline in parallel. Compare observation quality scores.

#### 28. Backward compatibility
Existing daily log queries continue to function seamlessly.

#### 29. Failure modes
- External API down: Queue backoff with exponential retry up to 24 hours.
- Duplicate webhook delivery: Idempotent deduplication via observation ID index.

#### 30. Recovery strategy
Dead-letter queue (`telemetry_dlq` collection) stores unparseable payloads for manual review.

#### 31. Idempotency requirements
Re-ingesting the exact same webhook or log record produces zero duplicate observation documents.

#### 32. Concurrency requirements
Safe for distributed ingestion across multiple API worker pods.

#### 33. Adversarial test plan
- Ingest 10,000 duplicate events concurrently: assert MongoDB document count equals exactly 1.
- Ingest out-of-order timestamps: verify observation pipeline sorts and indexes correctly.

#### 34. Real-system test plan
Sync real Google Calendar with 10 meetings; verify `ScheduleDensity` and `MeetingFragmentation` observations are created in MongoDB.

#### 35. Simulation test plan
Feed 30 days of synthetic wearable and calendar data; verify observation count matches expected volume and quality score remains $>0.90$.

#### 36. Manual smoke-test plan
Trigger calendar sync in web UI, check `telemetry_observations` collection in MongoDB Compass.

#### 37. Exit criteria
- Passive observations stored in MongoDB from at least two distinct sources (Calendar + Tasks).
- Zero reliance on manual daily logs for schedule density and task completion observations.

#### 38. Regression criteria
Manual DailyLog creation continues to produce valid observations.

#### 39. Loop-engineering procedure
`INSPECT` ObservationMapper → `HYPOTHESIZE` deduplication logic → `IMPLEMENT` pipeline extractors → `TEST` deduplication → `OBSERVE` DB growth → `DIAGNOSE` index bottlenecks → `REPAIR` compound indexes → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 6.

#### 40. Rollback strategy
Feature flag: `ENABLE_CONTINUOUS_TELEMETRY=false`.

#### 41. Risks
High collection growth. Mitigate with MongoDB TTL index expiring raw observations after 90 days (retaining aggregated weekly rollups).

#### 42. Open architectural decisions
Determine whether Apple Health sync is native via mobile app or cloud-relayed via Health Connect.

#### 43. Dependencies on previous phases
Phase 0, Phase 1.

#### 44. What must NOT be implemented in this phase
Do not implement cognitive state estimation formulas (Phase 3), do not implement automated schedule rescheduling (Phase 8).

---

### PHASE 3: Passive Cognitive & Mental State Estimation

#### 1. Objective
Replace the manual 1-10 mental state slider with a probabilistic cognitive state estimation engine that infers stress, cognitive load, energy, and focus readiness from passive observations, asking micro-check-ins only when confidence is low ($<0.70$).

#### 2. Why this phase exists
Currently, mental state in LifeOS is completely manual ([ObservationMapper.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/telemetry/ObservationMapper.ts) lines 39-42 reads `log.mental.stress`). Asking a busy user to fill out a daily questionnaire is failed UX. A chief of staff infers cognitive state from evidence (sleep debt, meeting density, task deferral velocity) and asks only when uncertain.

#### 3. Current repository state
- Mental state is modeled as a simple scalar `stress` number ($0 - 10$) in [DailyLogRepository.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/repositories/DailyLogRepository.ts).
- No multi-factor cognitive load model exists.
- No confidence scoring or evidence provenance exists for mental state.

#### 4. Existing components reused
- [LifeStateEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/LifeStateEngine.ts).
- [Observation.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/telemetry/Observation.ts).
- [ConfidenceEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/ConfidenceEngine.ts).

#### 5. Components to modify
- [packages/execution-kernel/src/worldv2/LifeStateEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/LifeStateEngine.ts): Ingest derived cognitive state rather than raw daily log stress.
- [packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts): Ingest conversational sentiment and somatic signals into cognitive evidence.

#### 6. Components to create
- `packages/execution-kernel/src/worldv2/CognitiveStateEngine.ts`: Probabilistic estimation engine computing `CognitiveStateEstimate` from multi-factor evidence.
- `packages/execution-kernel/src/worldv2/contracts/CognitiveStateContracts.ts`: Canonical contracts defining `CognitiveStateEstimate`, `CognitiveDimension`, `EvidenceBundle`.
- `packages/execution-kernel/src/worldv2/proactive/MicroCheckinTrigger.ts`: Generates targeted 1-tap confirmation prompts when confidence is $<0.70$.

#### 7. Components to deprecate/remove
- Deprecate mandatory mental state sliders in daily log UI.

#### 8. Architectural dependencies
Phase 1, Phase 2.

#### 9. Data model changes
New model: `CognitiveStateHistoryModel` in MongoDB:
```typescript
export interface CognitiveDimension {
  estimate: number;     // 0.0 to 1.0
  confidence: number;   // 0.0 to 1.0
  evidenceBundle: IEvidenceProvenance[];
}

export interface CognitiveStateRecord {
  userId: string;
  timestamp: number;
  stress: CognitiveDimension;
  energy: CognitiveDimension;
  cognitiveLoad: CognitiveDimension;
  focusReadiness: CognitiveDimension;
  provenance: "PASSIVE_INFERENCE" | "USER_MICRO_CHECKIN" | "HYBRID";
  temporalValidity: ITemporalValidity; // From Artifact H
}
```

#### 10. Contract/interface changes
Adopt `CognitiveStateContracts.ts`. Zero `any` permitted.

#### 11. API changes
- `GET /api/state/cognitive`: Returns current estimate and explanation.
- `POST /api/state/cognitive/micro-checkin`: Submits 1-tap user confirmation or correction.

#### 12. Event changes
Emit `COGNITIVE_STATE_ESTIMATED` and `MICRO_CHECKIN_REQUESTED`.

#### 13. Background job changes
Scheduled job: Recompute cognitive state estimate every 30 minutes or immediately following new sleep or calendar observations.

#### 14. Frontend changes
Daily log modal transforms from an interrogation form into a smart pre-filled card: "Aven estimates you have High Focus Capacity today based on 8h sleep and a light morning schedule. [Confirm] [Adjust]".

#### 15. Mobile changes
Interactive push notification for micro-check-ins with 2 quick action buttons: `[Accurate]` or `[Actually Tired]`.

#### 16. Desktop changes
Subtle menu bar / tray dot color reflects focus readiness (green: ready, amber: medium, red: overloaded).

#### 17. Aven changes
Aven's conversational planning adjusts without user asking: "I noticed you had back-to-back meetings and short sleep; I've cleared non-urgent tasks from your afternoon."

#### 18. Supervisor changes
Supervisor uses `focusCapacity` score to filter task recommendations in `FastPathExecutor`.

#### 19. Kernel changes
Kernel enforces that cognitive estimates carry explicit provenance and expiration timestamps.

#### 20. World Model changes
[WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts) incorporates `CognitiveStateEstimate` into the `KernelSnapshot.subsystems` object.

#### 21. Learning changes
User micro-check-in corrections feed directly into [ConfidenceEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/ConfidenceEngine.ts) to calibrate feature weights for that specific user.

#### 22. Persistence changes
Store estimates in `cognitive_state_history` with 30-day TTL index.

#### 23. Replay implications
Given identical observation inputs and timestamps, `CognitiveStateEngine` produces 100% deterministic estimates.

#### 24. Observability requirements
Track `micro_checkin_accuracy_rate` and `cognitive_estimation_confidence_avg`.

#### 25. Security implications
Strict disclaimer: System explicitly states "Operational readiness estimate only; not a medical assessment."

#### 26. Performance implications
Estimation execution time engineering budget: $<10\text{ms}$ (pure mathematical weighted regression over in-memory observations).

#### 27. Migration strategy
Feature flag `ENABLE_PASSIVE_COGNITIVE_ESTIMATION`. Run parallel comparison between manual daily log slider and inferred score for 14 days.

#### 28. Backward compatibility
Legacy code reading `log.mental.stress` reads the normalized `stress.estimate * 10` fallback.

#### 29. Failure modes
Zero observations available (new user): Engine outputs baseline default ($0.50$) with `confidence: 0.10` and `requiresUserConfirmation: true`.

#### 30. Recovery strategy
Fallback to explicit user question: "How is your energy today?"

#### 31. Idempotency requirements
Calling `evaluate()` multiple times with unchanged observations yields identical result.

#### 32. Concurrency requirements
Stateless evaluation; thread-safe across all worker instances.

#### 33. Adversarial test plan
- User inputs sarcasm in chat ("Oh great, another 5 meetings, I'm thrilled"): verify interpreter does not classify stress as low.
- Wearable reports 12 hours sleep (user left watch on charger): verify anomaly detector filters outlier observation.

#### 34. Real-system test plan
Simulate a day with 6 hours of meetings and 3 deferred tasks; verify `cognitiveLoad` estimate is $\ge 0.75$ and `focusCapacity` is $\le 0.35$.

#### 35. Simulation test plan
Run 30-day simulated user with varying sleep; assert strong correlation ($r \ge 0.85$) between simulated state and inferred estimate.

#### 36. Manual smoke-test plan
Open mobile app, tap micro-checkin notification, verify database updates `provenance: "HYBRID"`.

#### 37. Exit criteria
- Passive estimation operating without manual daily log inputs.
- Micro-check-in trigger rate $\le 1.0$ per user per day.
- Zero medical diagnosis claims in any user-facing text.

#### 38. Regression criteria
LifeState calculations in `LifeStateEngine` remain stable and monotonic.

#### 39. Loop-engineering procedure
`INSPECT` manual log data → `HYPOTHESIZE` feature weights → `IMPLEMENT` CognitiveStateEngine → `TEST` correlation with manual logs → `OBSERVE` accuracy → `DIAGNOSE` noisy signals → `REPAIR` weightings → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 8.

#### 40. Rollback strategy
Feature flag `ENABLE_PASSIVE_COGNITIVE_ESTIMATION=false` reverts to manual slider.

#### 41. Risks
Over-inferring stress causing user annoyance. Mitigate by enforcing high threshold for unsolicited notifications.

#### 42. Open architectural decisions
Determine weight balance between sleep telemetry (physiological) vs calendar fragmentation (operational).

#### 43. Dependencies on previous phases
Phase 1, Phase 2.

#### 44. What must NOT be implemented in this phase
Do not execute automated schedule re-balancing (Phase 8), do not modify external calendars.

---

### PHASE 4: Deep User Model & Preference Intelligence

#### 1. Objective
Evolve the user model from shallow profile records into an authoritative, longitudinal intelligence model that rigorously distinguishes explicit user preferences from learned behavioral tendencies, backed by full provenance, confidence, and semantic contradiction resolution without regex.

#### 2. Why this phase exists
Currently, user preferences in LifeOS are shallow key-value pairs, and [BehaviorProfile.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/BehaviorProfile.ts) is an ephemeral in-memory singleton. Crucially, [ContradictionResolver.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/memory/ContradictionResolver.ts) uses hardcoded regex polarity pairs (e.g. `morning` vs `night`), directly violating Constitutional Rule 3.1. Phase 4 provides permanent, grounded user intelligence.

#### 3. Current repository state
- [BehaviorProfile.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/BehaviorProfile.ts) updates in-memory properties and console-logs (lines 55-63).
- [ContradictionResolver.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/memory/ContradictionResolver.ts) defines `POLARITY_PAIRS: Array<[RegExp, RegExp]>` (lines 38-44).
- Learned preferences can easily overwrite explicit preferences because authority tiers are not enforced.

#### 4. Existing components reused
- [PersonalMemoryContracts.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/memory/PersonalMemoryContracts.ts).
- [EpistemicVerificationEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/memory/EpistemicVerificationEngine.ts).

#### 5. Components to modify
- [packages/execution-kernel/src/memory/ContradictionResolver.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/memory/ContradictionResolver.ts): Eliminate all regex polarity pairs; replace with model-driven semantic contradiction resolution.
- [packages/execution-kernel/src/learning/BehaviorProfile.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/BehaviorProfile.ts): Connect to MongoDB persistence with schema validation.

#### 6. Components to create
- `packages/execution-kernel/src/user/UserModel.ts`: Comprehensive user model aggregating identity, preferences, constraints, execution profile, and physical/cognitive baselines.
- `packages/execution-kernel/src/user/PreferenceAuthorityManager.ts`: Enforces the 5-tier preference hierarchy: `EXPLICIT_HARD > EXPLICIT_SOFT > CANDIDATE_PROPOSED > LEARNED_BEHAVIORAL > SYSTEM_DEFAULT`.
- `packages/execution-kernel/src/server/db/models/UserDeepProfileModel.ts`: MongoDB schema supporting longitudinal adaptation history.

#### 7. Components to deprecate/remove
- Delete `POLARITY_PAIRS` regex table from [ContradictionResolver.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/memory/ContradictionResolver.ts).
- Deprecate unpersisted in-memory singleton pattern in `BehavioralProfile.ts`.

#### 8. Architectural dependencies
Phase 1, Phase 2, Phase 3.

#### 9. Data model changes
New collection: `user_deep_profiles`:
```typescript
export interface IUserPreferenceItem {
  key: string;
  value: string | number | boolean;
  authority: "EXPLICIT_HARD" | "EXPLICIT_SOFT" | "CANDIDATE" | "LEARNED" | "SYSTEM_DEFAULT";
  provenance: IEvidenceProvenance;
  confidence: number;
  lastReinforced: number;
  decayHalfLifeDays?: number;
}

export interface IUserDeepProfile {
  userId: string;
  identity: { name: string; timezone: string; role: string };
  preferences: IUserPreferenceItem[];
  operationalConstraints: string[];
  cognitiveBaseline: { avgFocusMinutes: number; peakHours: number[] };
  updatedAt: number;
}
```

#### 10. Contract/interface changes
Define `IPreferenceResolution` in `PreferenceContracts.ts`:
```typescript
export interface IPreferenceResolution {
  effectiveValue: string | number | boolean;
  authority: "EXPLICIT_HARD" | "EXPLICIT_SOFT" | "CANDIDATE" | "LEARNED" | "SYSTEM_DEFAULT";
  isOverridableByAgent: boolean;
  provenance: IEvidenceProvenance;
}
```

#### 11. API changes
- `GET /api/user/deep-profile`: Returns user profile with preference authority tiers.
- `POST /api/user/preferences/candidate/confirm`: User approves candidate preference into explicit soft preference.

#### 12. Event changes
Emit `USER_PREFERENCE_PROMOTED` and `CONTRADICTION_RESOLVED_SEMANTICALLY`.

#### 13. Background job changes
Weekly maintenance job: Apply exponential decay to learned preferences; expire unreinforced candidate preferences after 14 days.

#### 14. Frontend changes
"Personalization" settings UI organizes preferences into "Explicit Rules" (locked by user) and "Learned by Aven" (with toggles to promote, adjust, or discard).

#### 15. Mobile changes
Mobile personalization tab exposes clean list of active habits and learned peak focus windows.

#### 16. Desktop changes
None.

#### 17. Aven changes
When user behavior contradicts a rule (e.g. user repeatedly books meetings during protected focus time), Aven proposes: "I noticed you've scheduled meetings before 10 AM three times this week. Would you like me to update your scheduling preference?"

#### 18. Supervisor changes
Supervisor enforces that no action proposal violates an `EXPLICIT_HARD` preference.

#### 19. Kernel changes
[KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts) checks `PreferenceAuthorityManager` before executing scheduling mutations.

#### 20. World Model changes
[WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts) projects effective preferences into `KernelSnapshot`.

#### 21. Learning changes
[LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts) emits candidate preferences rather than mutating profile directly.

#### 22. Persistence changes
MongoDB transactions used when promoting preferences to guarantee atomic audit logging.

#### 23. Replay implications
Replay verifies that preference promotion is 100% deterministic based on event ledger history.

#### 24. Observability requirements
Track `preference_promoted_count` and `preference_contradiction_count`.

#### 25. Security implications
User preferences cannot be modified by unauthenticated external webhooks or untrusted specialists.

#### 26. Performance implications
Preference lookup engineering budget: $<2\text{ms}$ (in-memory cached map per active user session).

#### 27. Migration strategy
Migrate existing shallow `User.preferences` into `user_deep_profiles` with `authority: "EXPLICIT_HARD"`.

#### 28. Backward compatibility
Legacy profile getters map seamlessly from the deep profile.

#### 29. Failure modes
Model contradiction resolver times out: Fail closed; flag memory as `PENDING_VERIFICATION` rather than corrupting profile.

#### 30. Recovery strategy
User can view and reset all learned preferences to defaults with a single click.

#### 31. Idempotency requirements
Duplicate preference updates deduplicated by preference key and version.

#### 32. Concurrency requirements
Optimistic locking via `version` field on `UserDeepProfileModel`.

#### 33. Adversarial test plan
- Instruct Aven: "I prefer working at night." Next turn: "I prefer mornings." Verify contradiction resolver marks older preference superseded without regex.
- Try to overwrite `EXPLICIT_HARD` constraint via inferred observation: assert preference manager blocks the overwrite.

#### 34. Real-system test plan
Run preference update through ConversationService; verify MongoDB document updates with correct authority tier and provenance.

#### 35. Simulation test plan
Simulate 60 days of user behavior; verify learned habits emerge and decay properly when behavior changes.

#### 36. Manual smoke-test plan
Open web settings, promote a candidate preference, verify status changes to `EXPLICIT_SOFT`.

#### 37. Exit criteria
- 100% elimination of regex in [ContradictionResolver.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/memory/ContradictionResolver.ts).
- Explicit preferences cannot be overridden by learned heuristics.
- Deep user profile persisted in MongoDB.

#### 38. Regression criteria
All existing memory tests in `packages/execution-kernel/src/memory/` pass.

#### 39. Loop-engineering procedure
`INSPECT` ContradictionResolver regex → `HYPOTHESIZE` semantic comparison → `IMPLEMENT` model-driven resolver → `TEST` semantic antonyms → `OBSERVE` accuracy → `DIAGNOSE` edge cases → `REPAIR` prompt contract → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 1.

#### 40. Rollback strategy
Revert `ContradictionResolver.ts` to git snapshot if semantic resolution fails regression tests.

#### 41. Risks
LLM latency on contradiction resolution. Mitigate by running contradiction check asynchronously post-turn.

#### 42. Open architectural decisions
Determine number of behavioral repetitions required before promoting an observation to a candidate preference (Policy default: 3 occurrences).

#### 43. Dependencies on previous phases
Phase 0, Phase 1, Phase 2, Phase 3.

#### 44. What must NOT be implemented in this phase
Do not implement autonomous scheduling without user confirmation (Phase 15).



## 4. DETAILED 15-PHASE IMPLEMENTATION PLAN (PHASES 5 TO 9)

---

### PHASE 5: Behavioral, Relationship & Physical Models

#### 1. Objective
Replace fake and stubbed models—specifically the hardcoded [RelationshipContextEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/RelationshipContextEngine.ts) and isolated health logs—with persistent, longitudinal behavioral, relationship, and physical models integrated into the unified world state, resolving relationship references via the single authoritative [EntityResolutionEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/EntityResolutionEngine.ts).

#### 2. Why this phase exists
Audit forensics established that [RelationshipContextEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/RelationshipContextEngine.ts) (lines 28-39) returns a single hardcoded stub ("Primary Support Network"), while health and nutrition data live in isolated silos without longitudinal recovery modeling. A chief of staff must know who the user's co-founder, client, or partner is, and must know if the user is physically depleted from training.

#### 3. Current repository state
- [RelationshipContextEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/RelationshipContextEngine.ts) has zero database connection.
- Nutrition and Gym collections exist in MongoDB (`nutrition`, `gym`) but do not project into the operational world model.
- Natural references to people ("Schedule a sync with my co-founder") fail or require manual UUID mapping.

#### 4. Existing components reused
- [EntityResolutionEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/EntityResolutionEngine.ts) for entity binding.
- Existing MongoDB collections for `nutrition` and `gym`.
- [WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts).

#### 5. Components to modify
- [packages/execution-kernel/src/worldv2/RelationshipContextEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/RelationshipContextEngine.ts): Connect to live database and entity resolver.
- [packages/execution-kernel/src/worldv2/WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts): Incorporate longitudinal physical readiness into snapshot.

#### 6. Components to create
- `packages/execution-kernel/src/relationships/RelationshipRepository.ts`: Authoritative data access for interpersonal connections, roles, and commitments.
- `packages/execution-kernel/src/server/db/models/RelationshipModel.ts`: MongoDB schema for contacts, relationship types, and interaction cadence.
- `packages/execution-kernel/src/physical/PhysicalReadinessEngine.ts`: Longitudinal physical model tracking training load, recovery, nutrition consistency, and weight progression.

#### 7. Components to deprecate/remove
- Deprecate hardcoded stub in `RelationshipContextEngine.getRelationshipContext()`.

#### 8. Architectural dependencies
Phase 1, Phase 2, Phase 4.

#### 9. Data model changes
New collection: `relationships`:
```typescript
export interface IRelationshipRecord {
  userId: string;
  entityId: string;
  name: string;
  aliases: string[]; // e.g. ["co-founder", "partner", "investor"]
  role: string;
  importanceScore: number; // 0.0 - 1.0
  interactionCadenceDays: number;
  lastInteractedAt: number;
  activeCommitments: Array<{ commitmentId: string; title: string; dueTimestamp: number }>;
}
```

#### 10. Contract/interface changes
Extend `RelationshipSummary` in `RelationshipContextEngine.ts` to include `entityId`, `aliases`, and `lastInteractedAt`. Zero `any` permitted.

#### 11. API changes
- `GET /api/relationships`: List user relationships with commitments.
- `POST /api/relationships`: Add or update relationship entity.

#### 12. Event changes
Emit `OBSERVATION_EVENT` (type: `RELATIONSHIP_INTERACTION_RECORDED`) when a meeting or task involving a contact is completed.

#### 13. Background job changes
Weekly relationship maintenance job: Flag commitments that are nearing breach or contacts whose cadence has lapsed.

#### 14. Frontend changes
New "People & Network" view under settings/workspace displaying key collaborators and pending commitments using calm, restrained Executioners surfaces.

#### 15. Mobile changes
Mobile app contact picker integration when scheduling meetings or tasks.

#### 16. Desktop changes
None.

#### 17. Aven changes
Aven understands colloquial relational references: "Schedule 30 mins with Michael" or "When did I last speak to my investor?" seamlessly resolved via structured relation metadata through [EntityResolutionEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/EntityResolutionEngine.ts).

#### 18. Supervisor changes
Supervisor uses `importanceScore` of involved contacts when prioritizing conflicting calendar invitations.

#### 19. Kernel changes
Kernel capability `schedule_event` automatically creates a relationship link if the attendee exists in the relationship directory.

#### 20. World Model changes
[KernelSnapshot.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/KernelSnapshot.ts) includes populated `relationshipContext` and `physicalReadiness` slices.

#### 21. Learning changes
[LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts) updates interaction frequency and detects relationship communication drift.

#### 22. Persistence changes
Relationships stored in MongoDB `relationships` with text index on `aliases` and `name`.

#### 23. Replay implications
Replay verifies that entity resolution for contacts produces deterministic IDs across runs.

#### 24. Observability requirements
Track `relationship_resolution_hit_rate` and `physical_readiness_score`.

#### 25. Security implications
Contact information and relationship notes encrypted at rest; never exported to external LLMs without anonymization.

#### 26. Performance implications
Relationship resolution engineering budget: $<5\text{ms}$ (cached per conversation session).

#### 27. Migration strategy
Auto-seed initial relationships from Google Calendar attendees and email thread frequency.

#### 28. Backward compatibility
100% backward compatible; queries with unknown names fall back to standard entity creation.

#### 29. Failure modes
Ambiguous contact name ("Alex" when user knows two Alexes): Aven prompts for conversational disambiguation.

#### 30. Recovery strategy
Prompt: "Did you mean Alex Chen (Co-founder) or Alex Smith (Investor)?"

#### 31. Idempotency requirements
Updating contact metadata is idempotent via `entityId`.

#### 32. Concurrency requirements
Standard MongoDB document-level locking.

#### 33. Adversarial test plan
- User says "Tell my co-founder I'm late" with zero contacts defined: verify Aven asks "Who is your co-founder?" and registers the alias.
- Log an intense leg workout and short sleep; verify physical readiness score drops appropriately without triggering a medical warning.

#### 34. Real-system test plan
Create a contact with alias "cofounder"; send message "Set a sync with cofounder tomorrow"; verify task/event is bound to the correct `entityId`.

#### 35. Simulation test plan
Simulate a 30-day contact cadence; verify drift warnings fire when contact interval exceeds 14 days.

#### 36. Manual smoke-test plan
Add relationship in UI, speak to Aven using the alias, verify prompt correctly resolves contact.

#### 37. Exit criteria
- [RelationshipContextEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/RelationshipContextEngine.ts) contains zero hardcoded strings.
- Colloquial alias resolution works via [EntityResolutionEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/EntityResolutionEngine.ts).
- Physical readiness model operational in WorldModelV2.

#### 38. Regression criteria
Existing task scheduling workflows operate without latency increase.

#### 39. Loop-engineering procedure
`INSPECT` RelationshipContextEngine stub → `HYPOTHESIZE` alias resolution → `IMPLEMENT` RelationshipRepository → `TEST` alias resolution → `OBSERVE` ambiguities → `DIAGNOSE` matching precision → `REPAIR` alias scoring → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 4 (No Second Resolver).

#### 40. Rollback strategy
Revert `RelationshipContextEngine.ts` to previous stub if database indexing fails.

#### 41. Risks
Over-indexing on stale contacts. Mitigate by sorting candidates by recency of interaction.

#### 42. Open architectural decisions
Determine whether Google Contacts sync is two-way or one-way import. (Recommended: one-way import with LifeOS-local alias management).

#### 43. Dependencies on previous phases
Phase 1, Phase 2, Phase 4.

#### 44. What must NOT be implemented in this phase
Do not implement automated email sending or messaging to contacts (Phase 15).

---

### PHASE 6: Cross-Domain Intelligence & Causal State Reasoning

#### 1. Objective
Design and implement the cross-domain reasoning engine that correlates multi-factor evidence across Health, Work, Cognition, Calendar, and Goals to identify operational tensions and produce evidence-backed Action Proposals, rigorously distinguishing correlation from causal evidence.

#### 2. Why this phase exists
In LifeOS today, domains operate in functional silos: the workout tracker doesn't talk to the calendar, and the task backlog doesn't know about sleep debt. If a user sleeps 4 hours, has 7 hours of meetings, and faces an overdue sprint goal, no subsystem synthesizes this into an actionable insight. A chief of staff operates across domains.

#### 3. Current repository state
- [GoalIntelligenceEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/GoalIntelligenceEngine.ts) measures goal pressure across 5 axes.
- [LifeStateEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/LifeStateEngine.ts) computes LifeState.
- Zero cross-domain causal reasoning exists to correlate sleep deficits with task deferral patterns.

#### 4. Existing components reused
- [GoalIntelligenceEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/GoalIntelligenceEngine.ts).
- [LifeStateEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/LifeStateEngine.ts).
- [ActionProposalContracts.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/contracts/ActionProposalContracts.ts).

#### 5. Components to modify
- [packages/execution-kernel/src/worldv2/WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts): Ingest and evaluate cross-domain rules during snapshot assembly.
- [packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts): Receive cross-domain tension alerts and formulate holistic advice.

#### 6. Components to create
- `packages/execution-kernel/src/reasoning/CrossDomainIntelligenceEngine.ts`: Evaluates cross-factor rules and emits causal hypotheses with confidence and evidence chains.
- `packages/execution-kernel/src/reasoning/contracts/CrossDomainContracts.ts`: Defines `CrossDomainTension`, `CausalHypothesis`, `DomainFactor`.

#### 7. Components to deprecate/remove
- Deprecate isolated ad-hoc insights in [WorldSnapshotV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldSnapshotV2.ts#L162).

#### 8. Architectural dependencies
Phase 1, Phase 2, Phase 3, Phase 5.

#### 9. Data model changes
New embedded schema in `KernelSnapshot`:
```typescript
export type EpistemicLink = "CORRELATION" | "ASSOCIATION" | "EVIDENCE_SUPPORTED_HYPOTHESIS" | "CAUSAL_EVIDENCE";

export interface CrossDomainInsight {
  insightId: string;
  title: string;
  description: string;
  contributingFactors: Array<{
    domain: string;
    metric: string;
    observedValue: number | string | boolean;
    baselineValue: number | string | boolean;
    epistemicStatus: EpistemicLink;
  }>;
  causalConfidence: number; // 0.0 - 1.0
  recommendedActionURN?: string;
  proposedParameters?: Record<string, unknown>;
  temporalValidity: ITemporalValidity; // From Artifact H
}
```

#### 10. Contract/interface changes
Define `ICrossDomainEvaluator`:
```typescript
export interface ICrossDomainEvaluator {
  evaluate(snapshot: KernelSnapshot): CrossDomainInsight[];
}
```
Zero `any` permitted.

#### 11. API changes
`GET /api/intelligence/cross-domain`: Returns active cross-domain tensions with explainable evidence trees.

#### 12. Event changes
Emit `PROPOSAL_EVENT` (type: `CROSS_DOMAIN_TENSION_IDENTIFIED`).

#### 13. Background job changes
Evaluated on every snapshot recomputation wave (every 30 mins).

#### 14. Frontend changes
"Life Intelligence" card on web dashboard explaining multi-factor connections (e.g. "High Meeting Density is associated with a 40% drop in Deep Work Velocity"). Never claim absolute causality without evidence.

#### 15. Mobile changes
Dashboard displays dynamic "Chief of Staff Insight" card with expandable evidence.

#### 16. Desktop changes
None.

#### 17. Aven changes
Aven answers "Why am I so tired?" by synthesizing: "You had a 2-hour sleep deficit, an intense leg workout yesterday, and 6 hours of high-cognitive-load meetings today."

#### 18. Supervisor changes
Supervisor leverages cross-domain insights to explain *why* it recommends specific interventions.

#### 19. Kernel changes
Kernel guarantees that all cross-domain proposals satisfy invariant risk classes before execution.

#### 20. World Model changes
[WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts) orchestrates `CrossDomainIntelligenceEngine` in Wave 3 of snapshot compilation.

#### 21. Learning changes
[LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts) tests whether cross-domain insights match historical user outcomes.

#### 22. Persistence changes
Cross-domain insights persisted as part of historical snapshots.

#### 23. Replay implications
Replay verifies that cross-domain hypotheses are 100% deterministic given the same inputs.

#### 24. Observability requirements
Track `cross_domain_insights_generated_total` and `insight_relevance_rating`.

#### 25. Security implications
Insights remain local to the user's encrypted tenant; never aggregated across users.

#### 26. Performance implications
Cross-domain evaluation engineering budget: $<15\text{ms}$.

#### 27. Migration strategy
Feature flag: `ENABLE_CROSS_DOMAIN_INTELLIGENCE=true`.

#### 28. Backward compatibility
If no cross-domain insights trigger, system operates as normal.

#### 29. Failure modes
False causal inference (confusing correlation with causation): Enforce explicit language: "Associated with" or "Likely influenced by" rather than "Caused by".

#### 30. Recovery strategy
User can dismiss any insight, lowering the confidence weight of that rule pattern.

#### 31. Idempotency requirements
Evaluating identical snapshots produces identical insight IDs.

#### 32. Concurrency requirements
Stateless and thread-safe.

#### 33. Adversarial test plan
- Ingest high workout volume with high sleep and low meetings: verify system recognizes high physical strain without claiming cognitive burnout.
- Ingest high meeting load with high task completion: verify system does not falsely flag task paralysis.

#### 34. Real-system test plan
Seed database with 4 hours sleep, 5 back-to-back calendar events, and 3 overdue tasks; query Aven "How am I doing?"; verify answer identifies cognitive overload.

#### 35. Simulation test plan
Run 14-day simulation with alternating high-workload and high-recovery days; verify insights adapt dynamically.

#### 36. Manual smoke-test plan
View web dashboard, inspect evidence cards under "Intelligence".

#### 37. Exit criteria
- Causal hypothesis engine operational with $>80\%$ explainability score.
- Cross-domain context available to Aven in conversational turns.
- Zero hardcoded linguistic templates used for causal reasoning.

#### 38. Regression criteria
Goal pressure calculations in [GoalPressureEngineV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/GoalPressureEngineV2.ts) remain unaltered.

#### 39. Loop-engineering procedure
`INSPECT` LifeState & GoalIntelligence → `HYPOTHESIZE` causal rules → `IMPLEMENT` CrossDomainIntelligenceEngine → `TEST` multi-factor scenarios → `OBSERVE` insights → `DIAGNOSE` false correlations → `REPAIR` causal guards → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 8.

#### 40. Rollback strategy
Feature flag `ENABLE_CROSS_DOMAIN_INTELLIGENCE=false`.

#### 41. Risks
Overwhelming the user with obvious observations. Mitigate by requiring minimum tension score ($ge 0.70$) before surfacing.

#### 42. Open architectural decisions
Determine maximum number of active cross-domain insights displayed simultaneously (Policy default: 3).

#### 43. Dependencies on previous phases
Phase 1, Phase 2, Phase 3, Phase 5.

#### 44. What must NOT be implemented in this phase
Do not execute automated calendar rescheduling without user approval (Phase 8 & 15).

---

### PHASE 7: Closed-Loop Intervention & Outcome Learning

#### 1. Objective
Establish an authoritative Closed-Loop Intervention framework that tracks every operational intervention from proposal through execution, verifies outcomes at $T+4\text{h}$ and $T+24\text{h}$ using the Intervention Attribution Model (Artifact F), and adapts behavioral weights with exponential recency decay ($	au = 21\text{ days}$) strictly on verified outcomes.

#### 2. Why this phase exists
LifeOS currently takes actions (e.g. completing tasks, creating events), but has no mechanism to evaluate whether an action *actually helped the user*. Without closed-loop verification, the system cannot learn from its mistakes or adapt to what works.

#### 3. Current repository state
- [OutcomeVerifier.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/kernel/OutcomeVerifier.ts) verifies technical execution success (did the DB write succeed?), but not operational efficacy (did the user actually get work done?).
- [LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts) emits signals, but they are not linked to past interventions.

#### 4. Existing components reused
- [ExecutionEventLedger.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/workspace/ExecutionEventLedger.ts).
- [ActionAuditRecord](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/contracts/ActionProposalContracts.ts).
- [LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts).

#### 5. Components to modify
- [packages/execution-kernel/src/orchestration/kernel/OutcomeVerifier.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/kernel/OutcomeVerifier.ts): Extend to support delayed longitudinal outcome verification.
- [packages/execution-kernel/src/learning/LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts): Ingest completed intervention records to calibrate future policy weights.

#### 6. Components to create
- `packages/execution-kernel/src/interventions/InterventionRecordModel.ts`: MongoDB schema recording intervention lifecycle, state before/after, and measurement windows.
- `packages/execution-kernel/src/interventions/InterventionVerificationEngine.ts`: Background evaluator measuring observed delta against expected outcome at $T+4\text{h}$ and $T+24\text{h}$.
- `packages/execution-kernel/src/interventions/contracts/InterventionContracts.ts`: Canonical contracts defining `InterventionRecord`, `AttributionCategory`, `InterventionEffectiveness`.

#### 7. Components to deprecate/remove
- Deprecate fire-and-forget action execution without intervention ID linkage.

#### 8. Architectural dependencies
Phase 1, Phase 2, Phase 3, Phase 6.

#### 9. Data model changes
New collection: `intervention_records`:
```typescript
export type AttributionCategory = "EFFECTIVE" | "LIKELY_EFFECTIVE" | "UNCERTAIN" | "INEFFECTIVE" | "ADVERSE" | "NOT_MEASURABLE";

export interface IMeasurementWindow {
  measurementAt: number;
  observedDelta?: number;
  confoundersDetected?: string[];
  attributionConfidence?: number;
  evaluatedStatus?: AttributionCategory;
}

export interface IInterventionRecord {
  interventionId: string;
  userId: string;
  triggerType: "PROACTIVE_ENGINE" | "AVEN_CONVERSATION" | "SCHEDULED_DAEMON";
  crossDomainTensionId?: string;
  stateBefore: {
    lifeState: string;
    cognitiveLoad: number;
    goalPressure: number;
  };
  proposedAction: { capabilityURN: string; parameters: Record<string, unknown> };
  expectedOutcome: {
    targetMetric: "task_completion_rate" | "stress_reduction" | "focus_duration";
    expectedDelta: number;
  };
  executedAt: number;
  windows: {
    t4h: IMeasurementWindow;
    t24h: IMeasurementWindow;
  };
  learningImplicationRecorded: boolean;
}
```

#### 10. Contract/interface changes
Extend `ActionProposal` in [ActionProposalContracts.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/contracts/ActionProposalContracts.ts#L12) to accept optional `interventionMetadata`. Zero `any` permitted.

#### 11. API changes
- `GET /api/interventions/active`: View pending interventions under observation.
- `POST /api/interventions/:id/feedback`: User submits qualitative rating (thumbs up / down).

#### 12. Event changes
Emit `PROPOSAL_EVENT` (`INTERVENTION_INITIATED`), `OUTCOME_EVENT` (`INTERVENTION_VERIFIED_T4H`, `INTERVENTION_VERIFIED_T24H`).

#### 13. Background job changes
Verification Worker: Runs hourly to query interventions where `measurementAt <= now` and compute outcome metrics.

#### 14. Frontend changes
"Intervention History" tab in Settings displaying past actions, their intended effect, and whether they succeeded or failed.

#### 15. Mobile changes
Subtle in-app badge: "Focus block completed (+45m deep work)".

#### 16. Desktop changes
None.

#### 17. Aven changes
Aven references past intervention history: "Last time we rescheduled your morning meetings, your task velocity improved by 30%. Should we do that again?"

#### 18. Supervisor changes
Supervisor suppresses intervention strategies that have repeatedly evaluated to `INEFFECTIVE` or `ADVERSE` in the past 14 days.

#### 19. Kernel changes
Kernel records `interventionId` in the immutable [ExecutionEventLedger.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/workspace/ExecutionEventLedger.ts).

#### 20. World Model changes
[WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts) projects `interventionSuccessRate` into the user profile.

#### 21. Learning changes
[LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts) updates strategy weights using exponential recency weighting (half-life $\tau = 21\text{ days}$) strictly when outcome is `EFFECTIVE` or `LIKELY_EFFECTIVE` with attribution confidence $ge 0.75$.

#### 22. Persistence changes
Interventions stored in `intervention_records` collection with compound indexes on `userId` and `windows.t4h.measurementAt`.

#### 23. Replay implications
Replay verifies that given the historical event stream, the verification worker computes identical outcome metrics.

#### 24. Observability requirements
Track `intervention_success_rate_t4h`, `intervention_success_rate_t24h`, and `intervention_user_override_rate`.

#### 25. Security implications
Intervention history cannot be altered after verification; records are append-only.

#### 26. Performance implications
Hourly verification worker completes in $<200\text{ms}$ for 1,000 active users.

#### 27. Migration strategy
Phase-in: Track interventions in "observe-only" mode for 14 days before feeding weights into the LearningEngine.

#### 28. Backward compatibility
Actions executed without an intervention metadata envelope execute normally with zero overhead.

#### 29. Failure modes
User rejects intervention halfway through (e.g. deletes a focus block): Verification worker marks status `NOT_MEASURABLE` and lowers strategy confidence.

#### 30. Recovery strategy
Strategy cooldown: If an intervention fails 3 consecutive times, lock it for 14 days.

#### 31. Idempotency requirements
Verification worker uses MongoDB findOneAndUpdate with state check to prevent double evaluation.

#### 32. Concurrency requirements
Safe for distributed execution across multiple worker nodes.

#### 33. Adversarial test plan
- User creates a focus block, but immediately books a meeting over it: verify outcome is classified as `ADVERSE` or `NOT_MEASURABLE` without error.
- Clock jumps forward 48 hours: verify verification worker handles expired windows gracefully.

#### 34. Real-system test plan
Execute a test intervention (create focus block); simulate 4 hours of activity; trigger verification worker; assert `evaluatedStatus` is populated in MongoDB.

#### 35. Simulation test plan
Run 30-day simulation with 20 interventions; assert learning weights converge toward the most effective strategies.

#### 36. Manual smoke-test plan
View active interventions via API, verify JSON structure matches canonical contract.

#### 37. Exit criteria
- Complete closed loop operational: Proposal → Execution → Measurement at T+4h/T+24h → Learning weight update.
- Intervention records persisted in MongoDB.

#### 38. Regression criteria
Execution speed of core kernel actions unaffected ($<5\text{ms}$ overhead).

#### 39. Loop-engineering procedure
`INSPECT` ExecutionEventLedger → `HYPOTHESIZE` outcome attribution → `IMPLEMENT` InterventionRecordModel → `TEST` measurement worker → `OBSERVE` outcomes → `DIAGNOSE` measurement noise → `REPAIR` metric formulas → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 9 (No Fake Success).

#### 40. Rollback strategy
Feature flag `ENABLE_INTERVENTION_TRACKING=false`.

#### 41. Risks
Noisy attribution (did the user finish the task because of Aven, or coincidentally?). Mitigate by using baseline control comparisons and confounder detection.

#### 42. Open architectural decisions
Determine whether T+48h or weekly windows should be introduced for complex project goals. (Deferred to Phase 14).

#### 43. Dependencies on previous phases
Phase 1, Phase 2, Phase 3, Phase 6.

#### 44. What must NOT be implemented in this phase
Do not allow Aven to execute high-risk interventions without explicit user approval (Phase 8 & 15).

---

### PHASE 8: Proactive Intelligence & Policy Engine

#### 1. Objective
Transform the dead 79-line [ProactiveEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/proactive/ProactiveEngine.ts) into an authoritative, policy-driven background daemon that continuously evaluates user state, respects strict quiet hours and cooldowns, evaluates both Action Value and Interruption Cost, and initiates bounded interventions across 6 explicit autonomy tiers.

#### 2. Why this phase exists
Currently, [ProactiveEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/proactive/ProactiveEngine.ts) (lines 7-12) explicitly acknowledges: *"Zero autonomous execution, zero jobs, zero planning, zero background workers, zero LLM calls, zero DB writes."* Aven is 100% reactive. To become a proactive chief of staff, LifeOS requires an active background daemon bounded by rigorous safety policy.

#### 3. Current repository state
- [ProactiveEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/proactive/ProactiveEngine.ts) generates static string suggestions from hardcoded prediction types.
- Zero scheduling daemon exists in production.
- Zero quiet hours, notification fatigue, or cooldown policies exist.

#### 4. Existing components reused
- [WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts) and `KernelSnapshot`.
- [CrossDomainIntelligenceEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/reasoning/CrossDomainIntelligenceEngine.ts) (from Phase 6).
- [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts).

#### 5. Components to modify
- [packages/execution-kernel/src/proactive/ProactiveEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/proactive/ProactiveEngine.ts): Complete rewrite into an active policy-driven engine.

#### 6. Components to create
- `packages/execution-kernel/src/proactive/ProactivePolicyDaemon.ts`: Background service running on a 15-minute tick to evaluate candidate proactive actions.
- `packages/execution-kernel/src/proactive/AutonomyPolicyManager.ts`: Enforces the 6 Autonomy Tiers (L0: Observe, L1: Inform, L2: Recommend, L3: Prepare, L4: Execute with Approval, L5: Autonomous within Explicit Rules).
- `packages/execution-kernel/src/proactive/NotificationFatigueFilter.ts`: Enforces daily notification budgets (Policy default: max 3 unsolicited alerts/day), quiet hours (22:00 - 08:00), and per-domain cooldowns (4 hours).
- `packages/execution-kernel/src/proactive/InterruptionCostEvaluator.ts`: Computes whether the value of the action exceeds the cost of interrupting the user right now.

#### 7. Components to deprecate/remove
- Delete legacy [Suggestion.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/proactive/Suggestion.ts) and static text generator in `ProactiveEngine.ts`.

#### 8. Architectural dependencies
Phase 1, Phase 2, Phase 3, Phase 6, Phase 7.

#### 9. Data model changes
New collection: `proactive_action_log`:
```typescript
export interface IProactiveActionLog {
  actionId: string;
  userId: string;
  autonomyLevel: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  triggerRule: string;
  confidenceScore: number;
  actionValueScore: number;
  interruptionCostScore: number;
  notificationDispatched: boolean;
  userResponse?: "APPROVED" | "REJECTED" | "DISMISSED" | "IGNORED";
  executedAt: number;
}
```

#### 10. Contract/interface changes
Define `IProactiveCandidate`:
```typescript
export interface IProactiveCandidate {
  candidateId: string;
  autonomyLevel: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  urgency: "LOW" | "MEDIUM" | "HIGH";
  proposal: ActionProposal;
  rationale: string;
  requiredConfidence: number;
}
```
Zero `any` permitted.

#### 11. API changes
- `GET /api/proactive/feed`: User's pending proactive recommendations.
- `POST /api/proactive/:id/action`: User approves/rejects an L4 proposal.

#### 12. Event changes
Emit `PROPOSAL_EVENT` (`PROACTIVE_PROPOSAL_GENERATED`), `EXPERIENCE_EVENT` (`PROACTIVE_NOTIFICATION_SENT`).

#### 13. Background job changes
`ProactivePolicyDaemon` ticks every 15 minutes per active tenant.

#### 14. Frontend changes
"Proactive Feed" notification drawer with high-context action cards featuring 1-tap "Execute" or "Dismiss" using calm Executioners neutrals.

#### 15. Mobile changes
Push notifications with interactive action buttons (e.g. `[Reschedule to 2 PM]`, `[Keep As Is]`).

#### 16. Desktop changes
Subtle system notification banner sliding in from system tray.

#### 17. Aven changes
Aven initiates conversations when high-urgency conditions arise: "Good morning. Your sleep was disrupted and you have 6 hours of meetings today. I recommend rescheduling your 3 PM review. Should I do that?"

#### 18. Supervisor changes
Supervisor receives proactive candidates and formats them using the appropriate conversational tone.

#### 19. Kernel changes
Kernel verifies that any proactive execution has passed `AutonomyPolicyManager` validation. **Proactive engine NEVER bypasses the kernel.**

#### 20. World Model changes
Snapshot includes `activeProactiveRecommendations`.

#### 21. Learning changes
User dismissals train the `NotificationFatigueFilter` to raise the confidence threshold for that trigger type.

#### 22. Persistence changes
Log entries stored in `proactive_action_log` with 60-day TTL.

#### 23. Replay implications
Replay verifies that proactive triggers fire deterministically given the same snapshot and cooldown state.

#### 24. Observability requirements
Track `proactive_evaluations_total`, `proactive_notifications_sent_total`, `proactive_approval_rate`.

#### 25. Security implications
L4 and L5 actions strictly prohibited from performing irreversible external side effects (e.g. deleting files, sending external emails, financial transactions) without explicit user authorization.

#### 26. Performance implications
Policy daemon tick execution time engineering budget: $<50\text{ms}$ per active user.

#### 27. Migration strategy
Deploy daemon with default setting `AUTONOMY_LEVEL=L1` (Inform only). Gradually unlock L2 and L3 as user confidence builds.

#### 28. Backward compatibility
Users can completely disable proactive features via a global "Mute Proactivity" toggle in settings.

#### 29. Failure modes
Notification storm: Daemon hits a loop and spams user. Mitigate with hard operational safety ceiling: max 1 notification per hour, max 3 per day, enforced at kernel level.

#### 30. Recovery strategy
Circuit breaker trips and automatically switches user profile to `AUTONOMY_LEVEL=L0` (Observe only) while logging error.

#### 31. Idempotency requirements
Deduplication key (`dedupKey: ${ruleId}-${entityId}-${date}`) prevents duplicate proposals on consecutive ticks.

#### 32. Concurrency requirements
Distributed lock on `proactive_daemon_${userId}` using Redis or MongoDB to ensure only one daemon pod processes a user at a time.

#### 33. Adversarial test plan
- Simulate 10 high-urgency triggers occurring simultaneously: verify `NotificationFatigueFilter` suppresses all but the single most important alert.
- Attempt an L5 autonomous calendar deletion: verify kernel blocks execution and downgrades to L4 (Approval required).

#### 34. Real-system test plan
Inject high sleep debt and conflicting calendar event; verify daemon generates an L4 recommendation card in web feed.

#### 35. Simulation test plan
Run 30-day simulation; verify notification volume remains within 1-3 alerts per day across all days.

#### 36. Manual smoke-test plan
Trigger proactive evaluation via CLI test tool; verify push notification appears on mobile device with action buttons.

#### 37. Exit criteria
- Real background daemon operating on 15-minute tick.
- Strict enforcement of quiet hours and 3-notification daily limit.
- Zero capability execution bypassing [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts).

#### 38. Regression criteria
Zero impact on normal conversational response latency.

#### 39. Loop-engineering procedure
`INSPECT` ProactiveEngine stub → `HYPOTHESIZE` interruption cost weights → `IMPLEMENT` ProactivePolicyDaemon → `TEST` notification cooldowns → `OBSERVE` fatigue metrics → `DIAGNOSE` annoying triggers → `REPAIR` fatigue filters → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 5 (Kernel Sovereignty).

#### 40. Rollback strategy
Set `ENABLE_PROACTIVE_DAEMON=false`.

#### 41. Risks
User feeling spammed or losing trust. Mitigate by prioritizing quiet, high-confidence, actionable interventions.

#### 42. Open architectural decisions
Determine default quiet hours per user timezone (Policy default: 22:00 to 08:00 local time).

#### 43. Dependencies on previous phases
Phase 1, Phase 2, Phase 3, Phase 6, Phase 7.

#### 44. What must NOT be implemented in this phase
Do not execute autonomous mutations of third-party systems without prior approval (Phase 15).

---

### PHASE 9: Morning Aven / First True Jarvis Experience

#### 1. Objective
Synthesize the unified world model, passive telemetry, cognitive estimation, cross-domain reasoning, and proactive engine into the flagship end-to-end product experience: the **"Morning Jarvis" Briefing**, delivering a personalized, voice-enabled, operational readiness briefing upon waking with seamless conversational continuation and proper event taxonomy separation (Artifact L).

#### 2. Why this phase exists
This is the moment LifeOS transitions from an architectural framework into an unmistakable, high-signal Personal Operating System. The user wakes up, and instead of opening 5 different apps (sleep tracker, calendar, to-do list, weather, notes), Aven greets them with an executive summary that understands *what kind of day they are capable of having*.

#### 3. Current repository state
- Voice call infrastructure exists in [apps/mobile/app/(dashboard)/voice-call.tsx](file:///d:/PROGRAMMING/Projects/life-os/apps/mobile/app/(dashboard)/voice-call.tsx) and [FastSemanticFiller.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/FastSemanticFiller.ts).
- Web dashboard has individual widgets but no synthesized morning briefing experience.
- No automated wake-up trigger or briefing generator exists.

#### 4. Existing components reused
- [Supervisor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts) and [ConversationService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/services/ConversationService.ts).
- [FastSemanticFiller.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/FastSemanticFiller.ts) for real-time voice latency.
- [WorldModelV2.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts) and `KernelSnapshot`.

#### 5. Components to modify
- [apps/mobile/app/(dashboard)/index.tsx](file:///d:/PROGRAMMING/Projects/life-os/apps/mobile/app/(dashboard)/index.tsx): Add Morning Briefing card with audio play button.
- [apps/web/app/page.tsx](file:///d:/PROGRAMMING/Projects/life-os/apps/web/app/page.tsx): Add Morning Jarvis header card with interactive schedule proposal.

#### 6. Components to create
- `packages/execution-kernel/src/experience/morning/MorningBriefingEngine.ts`: Synthesizes sleep recovery, schedule density, priority goals, and cognitive readiness into a crisp 3-part briefing.
- `packages/execution-kernel/src/experience/morning/MorningWakeDetector.ts`: Detects when user wakes up (via wearable sleep end event or first phone unlock).
- `packages/execution-kernel/src/experience/morning/contracts/MorningBriefingContracts.ts`: Canonical schema for the briefing payload.

#### 7. Components to deprecate/remove
- Deprecate fragmented daily summary text templates.

#### 8. Architectural dependencies
Phases 1 through 8.

#### 9. Data model changes
New collection: `morning_briefings`:
```typescript
export interface IMorningBriefingRecord {
  briefingId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  audioUrl?: string;
  transcript: string;
  keyInsights: string[];
  proposedScheduleAdjustments: ActionProposal[];
  readinessScore: number;
  userInteracted: boolean;
  generatedAt: number;
}
```

#### 10. Contract/interface changes
Define `IMorningBriefing`:
```typescript
export interface IMorningBriefing {
  greeting: string;
  readinessHeadline: string;
  scheduleOverview: { totalMeetings: number; deepWorkHours: number; firstCommitmentTime: string };
  priorityFocusTask: { id: string; title: string; rationale: string };
  proposedOptimization?: { description: string; action: ActionProposal };
}
```
Zero `any` permitted.

#### 11. API changes
- `GET /api/experience/morning-briefing`: Get or generate today's briefing.
- `POST /api/experience/morning-briefing/accept-optimization`: Apply proposed schedule adjustment.

#### 12. Event changes
Emit `EXPERIENCE_EVENT` (`MORNING_BRIEFING_DELIVERED`), `AUTHORIZATION_EVENT` (`MORNING_OPTIMIZATION_ACCEPTED`). Generating a briefing is NEVER an intervention.

#### 13. Background job changes
Job triggers upon wake detection (or fallback at 07:30 local time) to pre-generate briefing so it loads instantly ($<50\text{ms}$).

#### 14. Frontend changes
Dedicated "Morning Briefing" modal appearing on first daily login with audio voice player and "Accept Optimizations" button using calm, restrained Executioners surfaces.

#### 15. Mobile changes
Rich push notification at wake-up: "Good morning. Aven has prepared your day brief. Tap to listen."

#### 16. Desktop changes
Raycast-style shortcut opens the Morning Briefing window instantly.

#### 17. Aven changes
Aven delivers the briefing with natural conversational voice, pausing for user continuation ("Move my 10 AM to the afternoon").

#### 18. Supervisor changes
Supervisor recognizes context continuation from the briefing (e.g. user says "Do that" referring to the proposed optimization).

#### 19. Kernel changes
Kernel executes any accepted morning schedule optimizations through [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts).

#### 20. World Model changes
Accepting a schedule optimization records an active intervention in the World Model.

#### 21. Learning changes
User acceptance or rejection of morning schedule proposals feeds into [LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts).

#### 22. Persistence changes
Briefings stored in `morning_briefings` collection with 90-day retention.

#### 23. Replay implications
Given identical snapshot inputs, the briefing generator creates deterministic bullet points and proposal structures.

#### 24. Observability requirements
Track `morning_briefing_listen_rate`, `morning_optimization_acceptance_rate`.

#### 25. Security implications
Briefing audio generated securely; temporary audio URLs signed with 1-hour expiry.

#### 26. Performance implications
Pre-generated briefing loads in $<50\text{ms}$. Live streaming text-to-speech begins in $<300\text{ms}$.

#### 27. Migration strategy
Roll out to beta testers first via feature flag `ENABLE_MORNING_JARVIS=true`.

#### 28. Backward compatibility
Users without wearable data receive a schedule-and-task-focused briefing without recovery metrics.

#### 29. Failure modes
TTS audio synthesis fails: UI falls back seamlessly to crisp markdown text cards with zero delay.

#### 30. Recovery strategy
Briefing regenerates on pull-to-refresh if new calendar events arrived overnight.

#### 31. Idempotency requirements
Only one briefing generated per user per calendar day.

#### 32. Concurrency requirements
Single briefing record per user date; upsert-safe.

#### 33. Adversarial test plan
- User wakes up with 0 calendar events and 0 tasks: verify Aven provides an encouraging planning prompt rather than an empty screen.
- User says "Move that" when briefing had 2 proposals: verify Aven asks for clarification rather than guessing.

#### 34. Real-system test plan
Simulate 07:00 wake-up; verify `morning_briefings` document created; open mobile app; verify audio streams and continuation request succeeds.

#### 35. Simulation test plan
Execute 14 consecutive simulated mornings with varying schedules; verify briefing accurately reflects day types (heavy work vs rest day).

#### 36. Manual smoke-test plan
Open mobile app, tap Morning Briefing, listen to voice summary, reply "Move my first meeting", verify calendar updates.

#### 37. Exit criteria
- Fully voice-enabled or text-streamed morning briefing operational on Web and Mobile.
- User can accept schedule optimizations with 1 tap or spoken response.
- Continuation turns retain context through [Supervisor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts).

#### 38. Regression criteria
Existing chat modal and calendar views continue to work without regression.

#### 39. Loop-engineering procedure
`INSPECT` voice-call.tsx & Supervisor → `HYPOTHESIZE` wake detection → `IMPLEMENT` MorningBriefingEngine → `TEST` continuation flow → `OBSERVE` latency → `DIAGNOSE` audio stutter → `REPAIR` pre-generation cache → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 28 (Zero mechanical leak to user).

#### 40. Rollback strategy
Feature flag `ENABLE_MORNING_JARVIS=false`.

#### 41. Risks
Briefing feeling too long or repetitive. Mitigate by enforcing strict 45-second spoken limit (max 120 words).

#### 42. Open architectural decisions
Determine primary TTS provider (ElevenLabs vs Cartesia vs OpenAI Whisper/TTS). (Recommended: Cartesia for $<150\text{ms}$ time-to-first-audio).

#### 43. Dependencies on previous phases
Phases 1 through 8.

#### 44. What must NOT be implemented in this phase
Do not implement autonomous external meeting cancellations without confirmation (Phase 15).



## 5. DETAILED 15-PHASE IMPLEMENTATION PLAN (PHASES 10 TO 15)

---

### PHASE 10: Controlled LangGraph Evaluation & Pilot

#### 1. Objective
Conduct an empirical, controlled engineering pilot of LangGraph TypeScript for complex, multi-step deliberative reasoning, benchmarking it directly against the existing [Supervisor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts) / [ReActOrchestrator.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/react/ReActOrchestrator.ts) architecture across latency, memory, determinism, and resumability. The outcome is NOT pre-decided; adoption depends strictly on empirical gate criteria.

#### 2. Why this phase exists
LangGraph is often proposed as a generic agentic panacea. However, LifeOS has strict constitutional guarantees: zero direct DB mutations by LLMs, sub-2.5s voice latency, and sovereign kernel execution. Adopting LangGraph wholesale without an empirical pilot risks massive latency bloat, memory leaks, and architectural entanglement. We must test the hypothesis with cold, measured benchmarks against the Phase 0 baseline.

#### 3. Current repository state
- LangGraph is NOT currently used in production.
- Orchestration is handled natively by [Supervisor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts) (72KB) and [FastPathExecutor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/FastPathExecutor.ts).
- Specialist agents ([ProductivityAgent.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/specialists/ProductivityAgent.ts), [HealthAgent.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/specialists/HealthAgent.ts)) execute via custom parallel orchestrators.

#### 4. Existing components reused
- [Supervisor.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts).
- [ProductionTracer.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/observability/ProductionTracer.ts).
- [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts).

#### 5. Components to modify
- [packages/execution-kernel/src/orchestration/supervisor/DynamicRouter.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/DynamicRouter.ts): Add route to route complex deliberative planning turns to the LangGraph pilot graph when feature flag is active.

#### 6. Components to create
- `packages/execution-kernel/src/orchestration/langgraph/DeliberativePlanningGraph.ts`: StateGraph implementation modeling complex goal decomposition, specialist consultation, and synthesis with interrupt/checkpoint support.
- `packages/execution-kernel/src/orchestration/langgraph/LangGraphBenchmarkRunner.ts`: Head-to-head benchmark harness running 50 identical complex requests through native ReAct vs LangGraph.
- `packages/execution-kernel/src/orchestration/langgraph/adapters/KernelCapabilityToolBridge.ts`: Wraps kernel capability descriptors as read-only tools for LangGraph nodes.

#### 7. Components to deprecate/remove
None during pilot.

#### 8. Architectural dependencies
Phase 0, Phase 1, Phase 6.

#### 9. Data model changes
Add checkpoint collection if MongoDBSaver is piloted: `langgraph_checkpoints` (test/pilot scope only).

#### 10. Contract/interface changes
Define `IDeliberativePlanResult`:
```typescript
export interface IDeliberativePlanResult {
  executionId: string;
  proposedActionSequence: ActionProposal[];
  synthesisRationale: string;
  interruptedForHITL: boolean;
  checkpointId?: string;
  metrics: { stepCount: number; durationMs: number; memoryDeltaMb: number };
}
```
Zero `any` permitted.

#### 11. API changes
`POST /api/orchestration/pilot/langgraph`: Direct benchmarking endpoint.

#### 12. Event changes
Emit `LANGGRAPH_STEP_EXECUTED`, `LANGGRAPH_CHECKPOINT_SAVED`.

#### 13. Background job changes
None.

#### 14. Frontend changes
None.

#### 15. Mobile changes
None.

#### 16. Desktop changes
None.

#### 17. Aven changes
Aven utilizes the deliberative graph strictly for complex multi-step restructuring ("I want to reorganize my entire Q4 project schedule around my half-marathon training").

#### 18. Supervisor changes
Supervisor routes simple requests ($>90\%$) to FastPath, delegating only deep deliberative queries to the graph.

#### 19. Kernel changes
Kernel acts as the **only** execution boundary for proposals emitted by the graph. **LangGraph nodes NEVER execute side effects directly.**

#### 20. World Model changes
World model snapshot injected into LangGraph `StateGraph` initial state as read-only context.

#### 21. Learning changes
None.

#### 22. Persistence changes
Pilot checkpoints stored in temporary Redis/MongoDB collection.

#### 23. Replay implications
Verify that replaying graph state from a checkpoint matches identical deterministic nodes.

#### 24. Observability requirements
Full LangSmith / OpenTelemetry tracing on all graph transitions.

#### 25. Security implications
LangGraph nodes operate within a sandboxed context; zero direct access to raw MongoDB connection or OS filesystem.

#### 26. Performance implications
Empirical budget: Graph transition overhead must not exceed $+200\text{ms}$ over Phase 0 baseline. Deliberative total latency budget: $\le 3.5\text{s}$.

#### 27. Migration strategy
Dark-launch pilot: 5% of complex planning traffic shadowed to LangGraph runner; compare proposals against native ReAct.

#### 28. Backward compatibility
100% backward compatible; if graph fails, DynamicRouter immediately falls back to native ReActOrchestrator.

#### 29. Failure modes
Graph loop runaway: Hard operational safety ceiling enforced (`recursionLimit: 10`).

#### 30. Recovery strategy
Graph aborts on timeout ($4.0\text{s}$) and returns fallback proposal.

#### 31. Idempotency requirements
Graph resumption with same threadId must be strictly idempotent.

#### 32. Concurrency requirements
Isolated execution threads per user request.

#### 33. Adversarial test plan
- Provide cyclic planning goals ("Reschedule A after B, and B after A"): verify graph detects cycle and interrupts with clarification.
- Inject node crash: verify state checkpoint persists and allows clean recovery.

#### 34. Real-system test plan
Run complex compound request: "Replan my week to make room for 5 hours of studying"; verify emitted proposals match kernel validation rules.

#### 35. Simulation test plan
Execute 50 synthetic multi-goal planning scenarios; record latency, memory, and token cost.

#### 36. Manual smoke-test plan
Trigger deliberative plan via test CLI, verify LangGraph trace in LangSmith/OpenTelemetry.

#### 37. Exit criteria
- Benchmark report completed comparing Native ReAct vs LangGraph across 10 dimensions against Phase 0 baselines.
- Formal decision gate executed (Outcome A: Keep Current, Outcome B: Adopt Limited, or Outcome C: Adopt Broader).

#### 38. Regression criteria
Zero impact on FastPath or standard chat response times.

#### 39. Loop-engineering procedure
`INSPECT` ReActOrchestrator → `HYPOTHESIZE` graph latency → `IMPLEMENT` DeliberativePlanningGraph → `TEST` benchmarks → `OBSERVE` latency/memory → `DIAGNOSE` overheads → `REPAIR` state trimming → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 7.

#### 40. Rollback strategy
Disable feature flag `ENABLE_LANGGRAPH_PILOT=false`.

#### 41. Risks
Dependency bloat from LangChain ecosystem packages. Mitigate by installing only `@langchain/langgraph` core.

#### 42. Open architectural decisions
Final decision on whether LangGraph is retained or replaced by a zero-dependency custom FSM based on pilot data.

#### 43. Dependencies on previous phases
Phase 0, Phase 1, Phase 6.

#### 44. What must NOT be implemented in this phase
Do not migrate FastPath to LangGraph, do not give LangGraph direct DB write access, do not use LangGraph for voice responses.

---

### PHASE 11: Controlled MCP Evaluation & Pilot

#### 1. Objective
Conduct a controlled engineering pilot of the Model Context Protocol (MCP) TypeScript SDK as a provider transport behind [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts), evaluating it strictly for desktop-local tools and search while comparing performance against native REST adapters. Conduct architectural preflight on official MCP SDK transports.

#### 2. Why this phase exists
Ecosystem enthusiasm often urges replacing all native REST integrations (Google Calendar, GitHub, Spotify) with MCP servers. However, MCP adds process/transport latency, complex multi-tenant auth management, and potential failure modes. Constitutional Rule 6 dictates: *MCP is not the architecture; it is an optional provider transport.* This pilot determines where MCP genuinely helps vs where it harms without pre-deciding the outcome.

#### 3. Current repository state
- MCP SDK (`@modelcontextprotocol/sdk`) is listed in dependencies, but live production execution runs entirely through native REST adapters in [ExternalCapabilityAdapter.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/external/ExternalCapabilityAdapter.ts).
- No production MCP client connects to external services.

#### 4. Existing components reused
- [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts).
- [ActionAdapterRegistry.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/ActionAdapterRegistry.ts).
- [packages/desktop-runtime/](file:///d:/PROGRAMMING/Projects/life-os/packages/desktop-runtime/).

#### 5. Components to modify
- [packages/execution-kernel/src/orchestration/ActionAdapterRegistry.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/ActionAdapterRegistry.ts): Register MCP capability provider alongside native adapters.

#### 6. Components to create
- `packages/execution-kernel/src/orchestration/external/mcp/McpCapabilityGateway.ts`: Manages MCP client connections, tool discovery, parameter translation, and process lifecycle.
- `packages/execution-kernel/src/orchestration/external/mcp/transports/McpTransportFactory.ts`: Abstract factory creating Stdio, SSE, or Stream transports based on official SDK preflight.
- `packages/execution-kernel/src/testing/reality/McpBenchmarkSuite.ts`: Benchmarks Native REST vs MCP across latency, memory, and error recovery.

#### 7. Components to deprecate/remove
None.

#### 8. Architectural dependencies
Phase 0, Phase 1.

#### 9. Data model changes
New collection: `user_mcp_servers` in MongoDB:
```typescript
export interface IUserMcpServerConfig {
  userId: string;
  serverId: string;
  serverName: string;
  transportType: "STDIO" | "SSE" | "STREAM";
  endpointOrCommand: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  discoveredTools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
}
```

#### 10. Contract/interface changes
Adopt `IMcpTransport` from Artifact K. Zero `any` permitted.

#### 11. API changes
- `GET /api/mcp/servers`: List registered MCP servers and discovered tools.
- `POST /api/mcp/servers/connect`: Register and test connection to a local or remote MCP server.

#### 12. Event changes
Emit `MCP_SERVER_CONNECTED`, `MCP_TOOL_EXECUTED`, `MCP_SERVER_ERROR`.

#### 13. Background job changes
Health check worker: Pings registered remote MCP servers every 5 minutes.

#### 14. Frontend changes
"Developer / MCP Integrations" tab in Settings allowing power users to add custom MCP server endpoints.

#### 15. Mobile changes
Mobile app disables Stdio MCP transports (unsupported on mobile OS) and allows only validated remote transports.

#### 16. Desktop changes
Tauri runtime supports launching local Stdio MCP child processes (e.g. local filesystem explorer, Obsidian vault reader).

#### 17. Aven changes
Aven can utilize discovered MCP tools if authorized by user policy, speaking the result naturally.

#### 18. Supervisor changes
Supervisor treats MCP tools as capabilities exposed through [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts). **MCP never becomes a second semantic router.**

#### 19. Kernel changes
Kernel enforces that **all MCP tool calls flow through the sovereign capability boundary**, with full authorization, idempotency, and audit logging.

#### 20. World Model changes
Discovered MCP capabilities are registered in `KernelSnapshot.availableCapabilities`.

#### 21. Learning changes
None.

#### 22. Persistence changes
Server configurations encrypted at rest in MongoDB.

#### 23. Replay implications
Replay verifies that MCP tool executions are mocked using recorded event ledger outputs; live MCP servers are NEVER contacted during replay.

#### 24. Observability requirements
Track `mcp_tool_duration_ms`, `mcp_transport_overhead_ms`, `mcp_connection_failures`.

#### 25. Security implications
Strict sandboxing: Local Stdio commands restricted to a whitelist of approved executables; zero arbitrary shell execution.

#### 26. Performance implications
Target engineering budget: MCP transport overhead $\le 30\text{ms}$ over native baseline.

#### 27. Migration strategy
Pilot MCP strictly on local Desktop filesystem search and Tavily web search. Core Google Calendar and GitHub remain native.

#### 28. Backward compatibility
Native adapters remain the primary execution path.

#### 29. Failure modes
MCP child process crashes: Gateway catches process termination, marks server degraded, and fails closed without crashing kernel.

#### 30. Recovery strategy
Gateway attempts automatic restart of crashed local MCP server up to 3 times with exponential backoff.

#### 31. Idempotency requirements
State-changing MCP tools must support client-generated idempotency keys.

#### 32. Concurrency requirements
Multiplexed concurrent requests supported over transport abstraction.

#### 33. Adversarial test plan
- Feed massive 10MB payload through MCP tool: verify gateway enforces maximum payload limit (1MB) and rejects safely.
- Kill MCP server process mid-call: verify kernel returns `UNKNOWN_EXTERNAL_STATE` and logs audit failure.

#### 34. Real-system test plan
Connect local desktop filesystem MCP server; ask Aven "Find my meeting notes from yesterday in my desktop notes folder"; verify tool executes and returns file content.

#### 35. Simulation test plan
Benchmark 500 tool executions comparing Native REST vs MCP; produce comparative latency/error report.

#### 36. Manual smoke-test plan
Add an MCP server via Settings UI, click "Test Connection", verify tool definitions appear.

#### 37. Exit criteria
- Working MCP gateway operating behind [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts).
- Benchmark completed comparing Native vs MCP against Phase 0 baselines.
- Formal decision gate executed (Outcome: No MCP, Limited MCP, or Broader MCP).

#### 38. Regression criteria
Zero regression in native Google Calendar or Task capability execution.

#### 39. Loop-engineering procedure
`INSPECT` ExternalCapabilityAdapter → `HYPOTHESIZE` transport latency → `IMPLEMENT` McpCapabilityGateway → `TEST` transports → `OBSERVE` latency → `DIAGNOSE` IPC overhead → `REPAIR` connection pooling → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 6.

#### 40. Rollback strategy
Set `ENABLE_MCP_GATEWAY=false`.

#### 41. Risks
Process management complexity on desktop. Mitigate by using robust child process supervisor with resource limits.

#### 42. Open architectural decisions
Determine whether multi-tenant remote MCP servers require OAuth token exchange or per-user API keys.

#### 43. Dependencies on previous phases
Phase 0, Phase 1.

#### 44. What must NOT be implemented in this phase
Do not rewrite Google Calendar or GitHub integrations to MCP; keep them native.

---

### PHASE 12: External Capability / Provider Decomposition

#### 1. Objective
Refactor and decompose the monolithic, 3,838-line [ExternalCapabilityAdapter.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/external/ExternalCapabilityAdapter.ts) into discrete, domain-scoped provider modules behind [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts), ensuring provider modules strictly execute and never reason or route.

#### 2. Why this phase exists
[ExternalCapabilityAdapter.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/external/ExternalCapabilityAdapter.ts) is an architectural hazard: 3,838 lines of tangled code containing Spotify playback, Google Calendar sync, GitHub issues, weather queries, presentation formatting, and token refreshes in a single massive class. Any modification risks breaking unrelated providers. Clean architecture requires modular provider isolation.

#### 3. Current repository state
- [ExternalCapabilityAdapter.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/external/ExternalCapabilityAdapter.ts) contains all external provider logic.
- [ActionAdapterRegistry.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/ActionAdapterRegistry.ts) delegates all external capability actions to this single monolith.

#### 4. Existing components reused
- [UserProviderConnection](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/external/ExternalCapabilityAdapter.ts) model.
- Credential vault and token refresh infrastructure.
- Canonical capability URN contracts (`calendar.event.create`, `wellness.media.playback_control`, etc.).

#### 5. Components to modify
- [packages/execution-kernel/src/orchestration/ActionAdapterRegistry.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/ActionAdapterRegistry.ts): Register individual provider adapters directly.
- [packages/execution-kernel/src/orchestration/external/ExternalCapabilityAdapter.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/external/ExternalCapabilityAdapter.ts): Deprecate and replace with modular delegator.

#### 6. Components to create
- `packages/execution-kernel/src/orchestration/external/providers/GoogleCalendarProvider.ts`: Isolated Google Calendar REST adapter.
- `packages/execution-kernel/src/orchestration/external/providers/SpotifyMediaProvider.ts`: Isolated Spotify Web API adapter.
- `packages/execution-kernel/src/orchestration/external/providers/GitHubProvider.ts`: Isolated GitHub REST adapter.
- `packages/execution-kernel/src/orchestration/external/providers/WeatherProvider.ts`: Isolated Weather API adapter.
- `packages/execution-kernel/src/orchestration/external/core/BaseCapabilityProvider.ts`: Abstract base class enforcing credential management, retry logic, and error normalization.

#### 7. Components to deprecate/remove
- Deprecate monolithic `ExternalCapabilityAdapter.ts` class after routing all capability URNs to discrete provider modules.

#### 8. Architectural dependencies
Phase 0, Phase 1, Phase 11.

#### 9. Data model changes
None. `user_provider_connections` collection preserved intact.

#### 10. Contract/interface changes
Define `ICapabilityProvider`:
```typescript
export interface ICapabilityProvider {
  readonly providerId: string;
  readonly supportedURNs: string[];
  execute(urn: string, params: Record<string, unknown>, context: ProviderContext): Promise<ProviderExecutionResult>;
  validatePayload(urn: string, params: Record<string, unknown>): boolean;
  checkHealth(userId: string): Promise<boolean>;
}
```
Zero `any` permitted.

#### 11. API changes
None. External API surface remains identical.

#### 12. Event changes
Emit `PROVIDER_CAPABILITY_EXECUTED` with discrete `providerId` tag.

#### 13. Background job changes
Token refresh daemon modularized to invoke provider-specific refresh methods.

#### 14. Frontend changes
None.

#### 15. Mobile changes
None.

#### 16. Desktop changes
None.

#### 17. Aven changes
None.

#### 18. Supervisor changes
None.

#### 19. Kernel changes
Kernel dispatches capability URNs directly to resolved modular provider instances via `ActionAdapterRegistry`.

#### 20. World Model changes
None.

#### 21. Learning changes
None.

#### 22. Persistence changes
None.

#### 23. Replay implications
Replay safety preserved; mock providers plug cleanly into `BaseCapabilityProvider`.

#### 24. Observability requirements
Per-provider Prometheus metrics: `provider_execution_duration_ms{provider}`, `provider_errors_total{provider, code}`.

#### 25. Security implications
Provider credentials isolated: Spotify adapter cannot access Google Calendar OAuth tokens.

#### 26. Performance implications
Class loading time reduced; zero heap bloat from monolithic imports.

#### 27. Migration strategy
Strangler pattern: Extract one provider at a time (Weather → Spotify → GitHub → Google Calendar), running regression tests at each step.

#### 28. Backward compatibility
`ExternalCapabilityAdapter` maintained as a thin facade routing to modular providers during the migration window.

#### 29. Failure modes
OAuth token expired: Provider throws `TOKEN_EXPIRED`; base class attempts automatic refresh and retries once.

#### 30. Recovery strategy
If refresh fails, provider transitions connection to `AUTH_REQUIRED` and notifies user.

#### 31. Idempotency requirements
Providers pass idempotency tokens in HTTP request headers where supported (e.g. Stripe, GitHub).

#### 32. Concurrency requirements
Thread-safe; multiple concurrent calls share cached access tokens.

#### 33. Adversarial test plan
- Expire access token and refresh token: verify provider reports `AUTH_REQUIRED` cleanly without hanging.
- Provide malformed calendar event payload: verify `validatePayload` rejects before network call.

#### 34. Real-system test plan
Execute live Spotify playback command and Google Calendar event creation; verify both execute successfully via decomposed providers.

#### 35. Simulation test plan
Execute 1,000 synthetic provider calls; assert zero memory leaks and 100% test pass rate.

#### 36. Manual smoke-test plan
Trigger Spotify playback and Calendar event creation from web chat; verify functionality.

#### 37. Exit criteria
- `ExternalCapabilityAdapter.ts` decomposed into $\ge 4$ independent provider classes under `external/providers/`.
- 100% of capability URNs pass regression tests.
- Monolith reduced to $<200\text{ lines}$ (facade only).

#### 38. Regression criteria
All existing external integration tests in `packages/execution-kernel/src/testing/` pass.

#### 39. Loop-engineering procedure
`INSPECT` ExternalCapabilityAdapter → `HYPOTHESIZE` module boundaries → `IMPLEMENT` BaseCapabilityProvider & modular providers → `TEST` each provider → `OBSERVE` errors → `DIAGNOSE` token refresh edge cases → `REPAIR` base class → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 5.

#### 40. Rollback strategy
Revert `ActionAdapterRegistry` to delegate to original monolith file if regressions occur.

#### 41. Risks
Subtle credential format differences during token refresh. Mitigate with thorough unit tests for each provider's auth flow.

#### 42. Open architectural decisions
Decide whether to move provider adapters into separate micro-packages or keep them in `execution-kernel`. (Recommended: keep in `packages/execution-kernel/src/orchestration/external/providers/` to avoid monorepo churn).

#### 43. Dependencies on previous phases
Phase 0, Phase 1, Phase 11.

#### 44. What must NOT be implemented in this phase
Do not add new third-party integrations; focus strictly on decomposing existing providers.

---

### PHASE 13: Real-System Production Hardening

#### 1. Objective
Systematically purge mock-heavy false confidence across the entire repository, upgrading test suites to the 3-Tier Real-LLM Testing Model (Artifact I), while hardening desktop and mobile runtimes against production failure modes.

#### 2. Why this phase exists
Audit finding 11 identified that current test suites rely on `ScriptedLLMProvider` with regex matching ([v3RealityAudit.test.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/v3RealityAudit.test.ts) line 26). When tests use mocks that guess what the LLM will return, they hide real-world model drift, prompt formatting errors, and database transaction failures. Production hardening requires reality.

#### 3. Current repository state
- Unit tests run with in-memory mocks.
- Desktop runtime has unwired stubs for notifications and updater.
- Mobile background service needs production Android/iOS signing and crash reporting.

#### 4. Existing components reused
- [docker-compose.test.yml](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/docker/docker-compose.test.yml) (from Phase 0).
- [ProductionTracer.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/observability/ProductionTracer.ts).
- Monorepo build tooling (Turbo, Expo, Tauri).

#### 5. Components to modify
- [packages/execution-kernel/src/testing/v3RealityAudit.test.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/testing/v3RealityAudit.test.ts): Replace all scripted regex LLM providers with recorded production replay fixtures.
- [packages/desktop-runtime/](file:///d:/PROGRAMMING/Projects/life-os/packages/desktop-runtime/): Wire Tauri system tray, global shortcut daemon, and auto-updater.
- [apps/mobile/](file:///d:/PROGRAMMING/Projects/life-os/apps/mobile/): Configure Sentry crash reporting and production push notification certificates.

#### 6. Components to create
- `packages/execution-kernel/src/testing/reality/ProductionReplayFixtureEngine.ts`: Records and replays real LLM network exchanges with cryptographic integrity checking (Class B Testing).
- `packages/execution-kernel/src/testing/reality/ChaosFailureInjector.ts`: Injects simulated database disconnects, provider timeouts (HTTP 504), and malformed payloads to verify kernel resiliency.

#### 7. Components to deprecate/remove
- Permanently delete all instances of `ScriptedLLMProvider` using regex matching.

#### 8. Architectural dependencies
Phases 0 through 12.

#### 9. Data model changes
None.

#### 10. Contract/interface changes
None. Zero `any` permitted.

#### 11. API changes
None.

#### 12. Event changes
Emit `CHAOS_EXPERIMENT_EXECUTED` during test runs.

#### 13. Background job changes
None.

#### 14. Frontend changes
Production Sentry error boundary and performance monitoring enabled on Web.

#### 15. Mobile changes
Production release build pipeline verified with EAS (Expo Application Services).

#### 16. Desktop changes
Signed production builds for macOS (.dmg) and Windows (.msi) with auto-updater.

#### 17. Aven changes
None.

#### 18. Supervisor changes
None.

#### 19. Kernel changes
Kernel adds circuit breakers on all external provider and database calls ($>3$ consecutive timeouts trips circuit for 30s).

#### 20. World Model changes
None.

#### 21. Learning changes
None.

#### 22. Persistence changes
MongoDB connection pool tuned for production: `maxPoolSize: 50`, `minPoolSize: 10`, `serverSelectionTimeoutMS: 5000`.

#### 23. Replay implications
Replay fixtures guarantee 100% deterministic test execution without live API billing or rate limits.

#### 24. Observability requirements
Full production telemetry dashboard in Grafana showing P50/P95/P99 latency, error rates, and active daemon health.

#### 25. Security implications
Conduct static application security testing (SAST) and dependency vulnerability scan (`npm audit`). Zero critical vulnerabilities allowed.

#### 26. Performance implications
Production build optimizations: tree-shaking, bundle size reduction ($<250\text{KB}$ initial web bundle).

#### 27. Migration strategy
Roll out hardened builds through canary channels (10% → 50% → 100%).

#### 28. Backward compatibility
100% backward compatible.

#### 29. Failure modes
Provider API outage during production: Kernel falls back to `UNKNOWN_EXTERNAL_STATE` and queues retry without blocking user chat.

#### 30. Recovery strategy
Circuit breaker automatically resets after cooldown when health check succeeds.

#### 31. Idempotency requirements
All mutating API endpoints require `X-Idempotency-Key` header.

#### 32. Concurrency requirements
Production cluster supports 500 concurrent active WebSocket voice/chat sessions.

#### 33. Adversarial test plan
- Run Chaos Failure Injector: sever MongoDB connection while Aven is writing a task; verify graceful error response and zero memory leaks.
- Inject 500ms jitter into provider calls: verify voice filler maintains conversation continuity without stuttering.

#### 34. Real-system test plan
Execute full regression test suite against live staging server; 100% tests must pass without any mock fallbacks.

#### 35. Simulation test plan
Run 100 concurrent virtual users through 24 hours of simulated operational requests.

#### 36. Manual smoke-test plan
Download and launch production macOS and Android builds; perform voice call, task creation, and calendar sync.

#### 37. Exit criteria
- Zero regex-based LLM mocks remaining in test directories.
- 100% of tests verify database state mutations.
- P95 conversational latency verified against Phase 0 budget.
- Signed production desktop and mobile artifacts generated.

#### 38. Regression criteria
Zero test regressions.

#### 39. Loop-engineering procedure
`INSPECT` test suites → `HYPOTHESIZE` failure modes → `IMPLEMENT` replay fixture engine → `TEST` live database containers → `OBSERVE` failures → `DIAGNOSE` unhandled errors → `REPAIR` circuit breakers → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rule 9.

#### 40. Rollback strategy
Standard deployment rollback to previous container tag.

#### 41. Risks
Live staging tests hitting rate limits. Mitigate with cached replay fixtures for CI pipelines.

#### 42. Open architectural decisions
Choose between self-hosted Sentry vs cloud-hosted for error tracking.

#### 43. Dependencies on previous phases
Phases 0 through 12.

#### 44. What must NOT be implemented in this phase
Do not introduce new experimental features; focus strictly on hardening and verification.

---

### PHASE 14: Longitudinal Adaptive Simulation

#### 1. Objective
Build a continuous, multi-day longitudinal simulation harness (simulating 30 to 90 consecutive days) within [apps/web/simulation/](file:///d:/PROGRAMMING/Projects/life-os/apps/web/simulation/) that validates behavioral learning convergence, preference adaptation, intervention efficacy, and memory stability against Hidden Ground Truth (Artifact M) without touching production data.

#### 2. Why this phase exists
A personal operating system cannot be validated by 1-turn unit tests. True intelligence is longitudinal: How does Aven adapt when the user gets sick for 5 days? What happens to learned preferences when a sprint ends? Does memory grow uncontrollably or drift into oscillation? Validating a 90-day closed loop requires an accelerated, deterministic multi-day simulation lab testing true inductive accuracy against hidden biological truth.

#### 3. Current repository state
- [apps/web/simulation/](file:///d:/PROGRAMMING/Projects/life-os/apps/web/simulation/) contains a rich simulation lab with [ARCHITECTURE_RULES.md](file:///d:/PROGRAMMING/Projects/life-os/apps/web/simulation/ARCHITECTURE_RULES.md) (Law 1: Kernel Sole Ownership).
- Existing simulation tests ([test_multiday.ts](file:///d:/PROGRAMMING/Projects/life-os/apps/web/simulation/test_multiday.ts), [test_daily_lifecycle.ts](file:///d:/PROGRAMMING/Projects/life-os/apps/web/simulation/test_daily_lifecycle.ts)) cover basic lifecycles but do not exercise closed-loop intervention verification or behavioral decay.

#### 4. Existing components reused
- [apps/web/simulation/](file:///d:/PROGRAMMING/Projects/life-os/apps/web/simulation/) simulation framework.
- [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts).
- [LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts).

#### 5. Components to modify
- [apps/web/simulation/engine/SimulationRuntimeEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/apps/web/simulation/): Add virtual clock acceleration (1 simulated day = 2 real seconds).
- [apps/web/simulation/test_multiday.ts](file:///d:/PROGRAMMING/Projects/life-os/apps/web/simulation/test_multiday.ts): Expand test run from 7 days to 30 and 90 days.

#### 6. Components to create
- `apps/web/simulation/personas/AdaptiveUserPersona.ts`: Virtual user maintaining private hidden ground truth (e.g. biological fatigue, hidden distractions) and emitting noisy observations.
- `apps/web/simulation/validation/LongitudinalStabilityValidator.ts`: Analyzes 90-day simulation logs to assert: zero memory explosion, zero preference oscillation, and positive intervention efficacy against hidden ground truth.

#### 7. Components to deprecate/remove
None.

#### 8. Architectural dependencies
Phases 1 through 9, Phase 13.

#### 9. Data model changes
Simulation database uses isolated prefix `sim_` in MongoDB to prevent cross-contamination.

#### 10. Contract/interface changes
Define `ILongitudinalValidationReport`:
```typescript
export interface ILongitudinalValidationReport {
  simulatedDays: number;
  totalInterventions: number;
  successRateT4h: number;
  successRateT24h: number;
  learnedPreferencesFormed: number;
  preferenceOscillationCount: number;
  memoryGrowthBytesPerDay: number;
  stabilityScore: number; // 0.0 - 100.0
}
```
Zero `any` permitted.

#### 11. API changes
`POST /api/simulation/run-longitudinal`: Triggers background multi-day simulation run.

#### 12. Event changes
Emit `SIMULATION_DAY_TICK_COMPLETED`.

#### 13. Background job changes
None.

#### 14. Frontend changes
Simulation Lab UI (/simulation) renders longitudinal analytics graphs: Learning Curve, Stress vs Recovery Trend, and Preference Evolution Timeline.

#### 15. Mobile changes
None.

#### 16. Desktop changes
None.

#### 17. Aven changes
None. Simulation interacts with Aven via standard [ConversationService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/services/ConversationService.ts) interface.

#### 18. Supervisor changes
None.

#### 19. Kernel changes
Kernel processes virtual user requests through production pipeline (strictly adhering to Simulation Law 1).

#### 20. World Model changes
World Model computes snapshots at each simulated day transition.

#### 21. Learning changes
[LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts) updates behavioral profile dynamically across simulated weeks.

#### 22. Persistence changes
Simulation snapshots written to ephemeral MongoDB collections, auto-dropped after report generation.

#### 23. Replay implications
Given identical initial seed and persona parameters, the 90-day simulation produces 100% deterministic event logs.

#### 24. Observability requirements
Real-time simulation progress bar and metric streaming via Server-Sent Events (SSE).

#### 25. Security implications
Zero production user data used in simulation personas.

#### 26. Performance implications
90 simulated days executed in $<3\text{ minutes}$ on a standard developer workstation.

#### 27. Migration strategy
Used as the final validation gate before deploying autonomous execution features (Phase 15).

#### 28. Backward compatibility
100% backward compatible.

#### 29. Failure modes
Simulation divergence: Virtual user gets trapped in an infinite deferral loop. Validator catches loop and flags as behavioural failure.

#### 30. Recovery strategy
Validator terminates simulation, captures memory dump, and produces failure diagnostic report.

#### 31. Idempotency requirements
Identical random seed produces identical simulation trajectory.

#### 32. Concurrency requirements
Multiple simulation experiments can run concurrently on isolated database names.

#### 33. Adversarial test plan
- Persona with 100% rejection rate: verify Aven does not spam user and lowers proactive intervention frequency to zero.
- Persona with erratic schedule (night shift one week, day shift the next): verify behavioral engine detects drift without crashing.

#### 34. Real-system test plan
Run 30-day simulation; verify report generates with `stabilityScore >= 85`.

#### 35. Simulation test plan
Execute 90-day simulation run with 3 distinct personas (The Overloaded Founder, The Strict Athlete, The Procrastinating Student); verify all three reach adaptive equilibrium.

#### 36. Manual smoke-test plan
Open /simulation in browser, select "90-Day Adaptive Run", click Start, observe live graphs.

#### 37. Exit criteria
- 90-day continuous simulation executed without memory leak or state corruption.
- Preference oscillation count equals exactly 0.
- Empirical proof of closed-loop learning convergence against hidden ground truth.

#### 38. Regression criteria
Zero disruption to production kernel tests.

#### 39. Loop-engineering procedure
`INSPECT` simulation engine → `HYPOTHESIZE` convergence rates → `IMPLEMENT` 90-day persona runner → `TEST` 90-day run → `OBSERVE` memory growth → `DIAGNOSE` state leaks → `REPAIR` snapshot cleanup → `RETEST` → `REPLAY` → `AUDIT` against Simulation Law 1 (Kernel Sole Ownership).

#### 40. Rollback strategy
Delete simulation test output directory.

#### 41. Risks
High CPU utilization during 90-day accelerated run. Mitigate with configurable batch yielding (`setImmediate`).

#### 42. Open architectural decisions
Determine whether 90-day simulation runs automatically in nightly CI or on-demand before minor releases.

#### 43. Dependencies on previous phases
Phases 1 through 9, Phase 13.

#### 44. What must NOT be implemented in this phase
Do not alter production kernel logic to "make the simulation pass"; fix the model, never cheat the oracle.

---

### PHASE 15: Controlled Autonomous Life Management

#### 1. Objective
Activate controlled Level 5 autonomous execution strictly for capabilities satisfying the Autonomy Eligibility Matrix (Artifact D: `LOW` risk + `REVERSIBLE_EXACT` + no external side effects), backed by deterministic capability-specific compensation and complete user sovereignty.

#### 2. Why this phase exists
The ultimate north star is not a chatbot that asks permission for every breath. It is a sovereign personal operating system that silently takes care of low-risk operational friction so the human can focus on high-leverage living. Phase 15 unlocks controlled autonomy only after all observation, estimation, verification, and safety systems have been thoroughly hardened.

#### 3. Current repository state
- Autonomy is currently 0% (strictly reactive).
- Kernel Capability Service enforces risk classes (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) in [ActionProposalContracts.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/contracts/ActionProposalContracts.ts).
- No autonomous execution exists in production.

#### 4. Existing components reused
- [AutonomyPolicyManager.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/proactive/AutonomyPolicyManager.ts) (from Phase 8).
- [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts).
- [ExecutionEventLedger.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/workspace/ExecutionEventLedger.ts).

#### 5. Components to modify
- [packages/execution-kernel/src/proactive/AutonomyPolicyManager.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/proactive/AutonomyPolicyManager.ts): Enable Level 5 execution for strictly registered `LOW` risk, `REVERSIBLE_EXACT` capability URNs.
- [packages/execution-kernel/src/capabilities/KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts): Enforce user-configured autonomy boundaries and instant compensation capability.

#### 6. Components to create
- `packages/execution-kernel/src/autonomy/AutonomousActionReverser.ts`: Maintains rollback inverse actions for all autonomous mutations, allowing the user to retract any autonomous action within 24 hours.
- `packages/execution-kernel/src/autonomy/AutonomyAuditFeed.ts`: Real-time audit feed detailing every autonomous decision made, its rationale, and its undo button.
- `packages/execution-kernel/src/autonomy/contracts/AutonomyContracts.ts`: Defines `AutonomousExecutionRecord`, `CompensationDescriptor`, `UserAutonomyGrant`.

#### 7. Components to deprecate/remove
None.

#### 8. Architectural dependencies
All previous phases (Phases 0 through 14).

#### 9. Data model changes
New collection: `autonomous_execution_ledger`:
```typescript
export interface IAutonomousExecutionRecord {
  executionId: string;
  userId: string;
  capabilityURN: string;
  parameters: Record<string, unknown>;
  riskClass: "LOW";
  reversibility: "REVERSIBLE_EXACT";
  policyRuleId: string;
  confidenceScore: number; // Must be >= 0.85
  rationale: string;
  compensationAction: { capabilityURN: string; parameters: Record<string, unknown> };
  executedAt: number;
  undoneAt?: number;
  userFeedback?: "APPROVED" | "REVERSED";
}
```

#### 10. Contract/interface changes
Extend `KernelCapabilityService.execute()` to accept `isAutonomousExecution: boolean` and require an `inverseAction` generator for Level 5 actions. Zero `any` permitted.

#### 11. API changes
- `GET /api/autonomy/audit-feed`: Real-time list of autonomous actions taken today.
- `POST /api/autonomy/undo/:executionId`: Instantly executes inverse action to rollback state.

#### 12. Event changes
Emit `EXECUTION_EVENT` (`AUTONOMOUS_ACTION_EXECUTED`), `EXECUTION_EVENT` (`AUTONOMOUS_ACTION_REVERSED`).

#### 13. Background job changes
Autonomy policy daemon evaluates Level 5 candidates during scheduled background ticks.

#### 14. Frontend changes
"Autonomy Center" in settings: Fine-grained toggle switches for every autonomous capability (e.g. "[x] Automatically protect 2h focus time when sleep is low", "[x] Automatically reschedule overdue personal tasks").

#### 15. Mobile changes
Daily evening push notification summary: "Aven took 3 autonomous actions today to protect your schedule. Tap to review or undo."

#### 16. Desktop changes
Notification toast with "Undo" button appears whenever an autonomous action occurs.

#### 17. Aven changes
Aven proactively reports what it handled: "I saw you had back-to-back meetings tomorrow morning, so I moved your workout to 5 PM and blocked a 30-minute lunch. Let me know if you want to change that."

#### 18. Supervisor changes
Supervisor respects user's explicit autonomy toggles.

#### 19. Kernel changes
Kernel enforces hard invariant: **ONLY `LOW` risk, `REVERSIBLE_EXACT` actions can EVER execute under Level 5.** `MEDIUM`, `HIGH`, and `CRITICAL` actions permanently require explicit user approval (Level 4).

#### 20. World Model changes
Autonomous actions record active interventions in the World Model.

#### 21. Learning changes
If user clicks "Undo" on an autonomous action, system immediately lowers confidence for that trigger rule and locks it into Level 4 (Approval required) for 30 days.

#### 22. Persistence changes
Ledger entries stored in `autonomous_execution_ledger` with immutable append-only constraints.

#### 23. Replay implications
Replay verifies that autonomous triggers fire deterministically and inverse actions cleanly restore prior database state.

#### 24. Observability requirements
Track `autonomous_actions_total{urn}`, `autonomous_undo_rate`, `autonomy_user_satisfaction_score`.

#### 25. Security implications
Hardcoded non-overridable security rule: Destructive actions (delete database record, send external email, financial payments) can **NEVER** be registered as Level 5 autonomous.

#### 26. Performance implications
Autonomous execution adds $<10\text{ms}$ kernel overhead.

#### 27. Migration strategy
Opt-in only. All users start at Level 1 (Inform) or Level 2 (Recommend). User must explicitly enable Level 5 per capability category.

#### 28. Backward compatibility
Users who keep autonomy disabled experience zero changes from Phase 8.

#### 29. Failure modes
Unintended side effect: User dislikes an autonomous schedule change. Recovery: 1-tap "Undo" button instantly executes inverse action.

#### 30. Recovery strategy
Undo action executed via kernel; policy daemon adds 14-day cooldown to that rule.

#### 31. Idempotency requirements
Inverse action can only be executed once per autonomous record.

#### 32. Concurrency requirements
Optimistic locking on target entity to prevent race conditions with user edits.

#### 33. Adversarial test plan
- Simulate LLM hallucinating Level 5 authorization for a `HIGH` risk email deletion: verify kernel blocks execution immediately with `AUTONOMY_VIOLATION_ERROR`.
- Trigger autonomous action, user clicks Undo 10 minutes later: verify database state returns to exact prior state.

#### 34. Real-system test plan
Enable "Auto-create focus block"; inject sleep deficit; verify focus block appears on calendar and undo button works from mobile app.

#### 35. Simulation test plan
Run 90-day simulation with Level 5 enabled; assert undo rate remains $<5\%$.

#### 36. Manual smoke-test plan
Trigger autonomous action via test script, view audit feed in web UI, click Undo, verify calendar event is removed.

#### 37. Exit criteria
- Controlled Level 5 autonomy operating safely within explicit user policy.
- 100% of autonomous actions support instant 1-tap inverse rollback.
- Zero high-risk actions executed without approval.
- Complete audit feed accessible across Web, Mobile, and Desktop.

#### 38. Regression criteria
Kernel invariants and authorization gates remain 100% enforced.

#### 39. Loop-engineering procedure
`INSPECT` AutonomyPolicyManager → `HYPOTHESIZE` undo rates → `IMPLEMENT` AutonomousActionReverser → `TEST` inverse rollbacks → `OBSERVE` undo rates → `DIAGNOSE` unwanted triggers → `REPAIR` confidence thresholds → `RETEST` → `REPLAY` → `AUDIT` against Constitutional Rules 5 & 20 (User Sovereignty).

#### 40. Rollback strategy
Global kill-switch: Set `MAX_AUTONOMY_LEVEL=L4` to instantly revert all users to approval-required mode.

#### 41. Risks
User anxiety over loss of control. Mitigate with extreme transparency, prominent audit feeds, and 1-tap undo.

#### 42. Open architectural decisions
Determine retention window for inverse action rollbacks (Policy default: 24 hours).

#### 43. Dependencies on previous phases
All previous phases (Phases 0 through 14).

#### 44. What must NOT be implemented in this phase
Do not allow LLMs to dynamically adjust their own autonomy levels; autonomy policies are strictly deterministic and user-controlled.



## 6. HARDENED DECISION FRAMEWORKS, SIMULATION & USER JOURNEYS

---

### 6.1 LangGraph Controlled Decision Framework & Pilot Design

#### Empirical Benchmark Evaluation Protocol
To ensure architectural adoption is driven by empirical measurements rather than ecosystem hype, the controlled pilot compares Native ReAct vs LangGraph across 10 quantitative dimensions:

| Dimension | Native ReAct Orchestrator Baseline | LangGraph TypeScript Pilot Candidate | Delta / Trade-off Evaluation | Adoption Threshold Criterion |
| :--- | :--- | :--- | :--- | :--- |
| **FastPath Latency (P95)** | **MEASURE IN PHASE 0** | **MEASURE IN PHASE 10** | Any added latency $>50\text{ms}$ is fatal for voice | Reject LangGraph for FastPath |
| **Deliberative Latency (P95)** | **MEASURE IN PHASE 0** | **MEASURE IN PHASE 10** | Permissible if $<+200\text{ms}$ and resumability proven | Permissible for deep planning |
| **Heap Memory Overhead** | **MEASURE IN PHASE 0** | **MEASURE IN PHASE 10** | Must not exceed $+40\text{MB}$ heap footprint | Must remain $<100\text{MB}$ total |
| **Checkpoint / Resumability** | Manual STM serializer | **Native StateGraph checkpointer** | Native pause/resume for multi-day plans | Significant LangGraph advantage |
| **Human-In-The-Loop (HITL)** | Custom pendingOp state machine | **Native interrupt() primitive** | Clean, declarative pause on critical actions | Significant LangGraph advantage |
| **State Replay Determinism** | High (EventLedger based) | High (StateGraph checkpoint based) | Parity | Parity |
| **Multi-Agent Specialist Fan-out** | Custom Promise.all wrapper | **Declarative Send() / Fan-out** | Cleaner graph visualization | Moderate LangGraph advantage |
| **Testability & Mock Isolation** | Simple function mocks | Requires StateGraph harness | Scaffolding complexity | Acceptable |
| **Runtime Dependency Weight** | **Zero extra packages** | $\sim 15$ npm dependencies | Transitive dependency vulnerability surface | Must pin strictly |
| **Failure Recovery** | Try/catch with fallback | Graph retry policies per node | Declarative retry on flaky LLM calls | Moderate LangGraph advantage |

#### Architectural Boundary: The Cognitive State Machine
If adopted, LangGraph is strictly quarantined to the **Cognitive Deliberation Layer**:

```
  [ Supervisor.ts / DynamicRouter ]
          │
          ├── Simple Request (< 180ms) ────────► [ FastPathExecutor.ts ] ──► [ KernelCapabilityService ]
          │
          └── Complex Deliberation (Multi-step) ─► [ LangGraph StateGraph ]
                                                           │
                                                   (Proposes Actions)
                                                           │
                                                           ▼
                                                [ KernelCapabilityService ] (Sovereign Authority)
                                                           │
                                                           ▼
                                                [ MongoDB / External API ]
```

**The Three Hard LangGraph Invariants**:
1. **Zero Direct Mutations**: LangGraph nodes are strictly read-only with respect to MongoDB and external APIs. They emit `ActionProposal[]` objects; only `KernelCapabilityService` executes mutations.
2. **Zero FastPath Ownership**: FastPath conversational execution must never pass through LangGraph.
3. **Zero State of Record**: The authoritative conversation state lives in `ConversationManager.ts` and MongoDB, never exclusively inside a LangGraph checkpointer.

#### The LangGraph Decision Gate
Phase 10 concludes with exactly ONE of these three outcomes based on measured evidence:
- **Outcome A (`KEEP CURRENT ORCHESTRATION` )**: If LangGraph adds $>250\text{ms}$ deliberative latency or $>50\text{MB}$ memory overhead without demonstrating superior resumability or HITL recovery.
- **Outcome B (`ADOPT LIMITED LANGGRAPH` )**: If LangGraph demonstrates clean multi-step checkpointing, resumable HITL pauses, and maintainable specialist fan-out while adding $<200\text{ms}$ latency and $<40\text{MB}$ heap overhead. (Strictly quarantined to deliberative planning; zero FastPath usage).
- **Outcome C (`ADOPT BROADER LANGGRAPH` )**: Only permissible if LangGraph latency matches native performance ($<50\text{ms}$ delta) across all turns.

---

### 6.2 MCP Controlled Decision Framework & Pilot Design

#### Empirical Benchmark Evaluation Protocol: Native vs MCP
We compare Native REST adapters against Model Context Protocol (MCP) servers across 10 operational dimensions:

| Dimension | Native REST Provider (e.g. Google Calendar) | MCP Provider Adapter (e.g. Calendar MCP) | Trade-off Analysis | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **Execution Latency (P95)** | **MEASURE IN PHASE 0** | **MEASURE IN PHASE 11** | Remote IPC/process adds overhead | Native preferred for cloud APIs |
| **Desktop Local Tool Latency** | Complex custom IPC | **MEASURE IN PHASE 11** | Stdio transport is fast & standard | **MCP preferred for Desktop Tools** |
| **Multi-Tenant Auth Handling** | **Vault-managed OAuth per user** | Complex multi-tenant auth in MCP | MCP server auth is single-tenant biased | Native preferred for SaaS |
| **Connection Lifecycle** | Stateless HTTP/REST | Persistent process / transport stream | Process crashes require supervisors | Native preferred for cloud |
| **Ecosystem Tool Leverage** | Manual bespoke coding | **Instant access to open servers** | Fast integration of niche tools | **MCP preferred for ecosystem** |
| **Credential Security** | Strict AES-256 field vault | Env vars passed to child process | Process env exposure risk on desktop | Native has stricter isolation |
| **Replay & Auditability** | 100% deterministic via Ledger | Requires recording transport packets | Both achieve parity behind Kernel | Parity |
| **Mobile OS Compatibility** | **100% native fetch support** | Stdio unsupported; stream only | Mobile cannot spawn child processes | Native preferred on Mobile |
| **Maintenance Burden** | High for bespoke APIs | Low for standardized tools | Shared ecosystem maintenance | **MCP preferred for commodity tools** |
| **Failure Recovery** | Standard HTTP status codes | Process restarts, pipe breaks, RPC errors | More complex failure modes in MCP | Native is more predictable |

#### The MCP Decision Gate
Phase 11 concludes with exactly ONE of these three outcomes:
- **Outcome A (`NO MCP` )**: If transport preflight or benchmarks show unacceptable latency ($>100\text{ms}$ overhead) or process instability.
- **Outcome B (`LIMITED MCP: DESKTOP TOOLS ONLY` )**: Native providers remain authoritative for cloud services; MCP is adopted strictly for desktop filesystem, local SQLite, and markdown vault tools via Stdio.
- **Outcome C (`BROADER MCP` )**: Adopted for external tools only where verified, secure, multi-tenant remote MCP servers exist and outperform native maintenance.

---

### 6.3 Longitudinal Testing & Hidden-Ground-Truth Simulation

#### Multi-Day Simulation Architecture
To validate closed-loop learning without waiting months for real-world user data, the simulation harness in [apps/web/simulation/](file:///d:/PROGRAMMING/Projects/life-os/apps/web/simulation/) is extended to support continuous **30-Day and 90-Day accelerated runs**:

```
  [ Virtual Clock Engine ] (Accelerated: 1 day = 2 real seconds)
             │
             ▼
  [ Virtual User Persona ] (Maintains Hidden Biological Ground Truth)
             │
             ▼ (Invokes standard KernelGateway)
  [ LifeOS Production Kernel Pipeline ] (All 23 stages execute deterministically)
             │
             ├── Telemetry Ingestion (Stores observations)
             ├── Cognitive State Engine (Estimates load & readiness)
             ├── Cross-Domain Engine (Identifies tensions)
             ├── Proactive Daemon (Proposes interventions)
             ├── Outcome Verifier (Measures T+4h and T+24h deltas)
             └── Learning Engine (Updates behavioral weights with τ = 21d decay)
             │
             ▼
  [ Longitudinal Stability Validator ] (Compares Inferred State vs Hidden Ground Truth)
```

#### Invariant Assertions for Longitudinal Runs
- **Zero Preference Oscillation**: A learned preference cannot toggle back and forth $>2$ times in a 30-day window.
- **Bounded Heap Growth**: Total memory allocated for user state must reach steady-state equilibrium ($<5\text{MB}$ per user after 90 days), proving that historical rollups and TTL cleanups function properly.
- **Intervention Efficacy Convergence**: Over 90 days, the success rate of proactive interventions must trend upward ($r \ge +0.30$) as the LearningEngine discards degraded strategies.
- **Inductive Estimation Accuracy**: Inferred cognitive readiness must achieve $r \ge 0.80$ against the simulator's hidden biological ground truth variables across noisy days.

---

### 6.4 The 15 Hardened End-to-End User Journeys

Every journey traces the complete 13-stage lifecycle:
`Input → Observation → World Model → State Estimate → Reasoning → Proposal → Authorization → Execution → External State → Verification → Learning → Future Adaptation`

---

#### JOURNEY 1: The Morning Briefing & Schedule Calibration
- **Input**: User wakes up at 07:15 AM; mobile device unlock detected.
- **Observation**: Oura sleep observation: 5h 45m sleep, elevated resting HR ($68\text{ bpm}$). Calendar observation: 6 hours of meetings, first call at 09:00 AM.
- **World Model**: `KernelSnapshot` computes `LifeState: OVERLOADED`, `SleepRecoveryScore: 0.42`.
- **State Estimate**: `CognitiveLoad: 0.82`, `FocusReadiness: 0.35` (`confidence: 0.91`).
- **Reasoning**: Cross-domain engine correlates poor recovery with dense meeting schedule; identifies severe risk of afternoon exhaustion.
- **Proposal**: Propose moving 3:00 PM internal review to tomorrow; insert a 45-minute recovery buffer at 2:00 PM (`PROPOSAL_EVENT`).
- **Authorization**: Autonomy Tier L4 (Execute with Approval).
- **Execution**: Briefing generated (`EXPERIENCE_EVENT`) with spoken audio: "Good morning. Sleep was short at 5 hours 45 minutes, and your calendar is heavy. I've drafted a proposal to move your 3 PM review to tomorrow. Should I apply that?"
- **External State**: User replies: "Yes, do that" (`AUTHORIZATION_EVENT`).
- **Verification**: Kernel moves Google Calendar event (`EXECUTION_EVENT`); verifies HTTP 200 and updated event ID.
- **Learning**: Records `InterventionRecord` with target metric `stress_reduction`.
- **Future Adaptation**: T+4h and T+24h verify that user completed morning priorities without afternoon cancellation.

---

#### JOURNEY 2: Mid-Day Workload Overload Detection
- **Input**: User defers third task in a row while active on Slack.
- **Observation**: 3 consecutive `TaskDeferredObservation` events in 90 minutes. Calendar shows 2 remaining afternoon meetings.
- **World Model**: `KernelSnapshot` updates `taskExecutionVelocity: 0.20`.
- **State Estimate**: `Stress: HIGH (0.85)`, `CognitiveLoad: 0.90`.
- **Reasoning**: Cross-domain engine identifies task paralysis triggered by impending meeting context switching.
- **Proposal**: Propose hiding 12 non-critical backlog tasks from the dashboard, leaving only the single top-priority item visible (`PROPOSAL_EVENT`).
- **Authorization**: Autonomy Tier L2 (Recommend).
- **Execution**: Aven displays dashboard toast: "Task paralysis detected. Would you like me to hide non-urgent items so you can focus on the Q3 Deck?"
- **External State**: User clicks "Focus on Deck".
- **Verification**: UI workspace filters view to single task.
- **Learning**: User marks task complete 40 minutes later; outcome classified as `EFFECTIVE`.
- **Future Adaptation**: Increases confidence in focus-isolation intervention for this user.

---

#### JOURNEY 3: Health-Aware Workout Rescheduling
- **Input**: User logs an intense 90-minute leg hypertrophy workout at 07:00 PM.
- **Observation**: Gym observation: 18 working sets, high RPE ($9/10$).
- **World Model**: `PhysicalReadiness` drops to $0.30$ for the next 24 hours.
- **State Estimate**: `PhysicalFatigue: HIGH`, `CentralNervousSystemStrain: MODERATE`.
- **Reasoning**: Tomorrow morning's calendar contains a scheduled 06:30 AM 10k run. Cross-domain engine detects injury risk / recovery mismatch.
- **Proposal**: Suggest converting tomorrow's run into an active recovery walk or moving it to the evening.
- **Authorization**: Autonomy Tier L2 (Recommend).
- **Execution**: Proactive push notification at 09:30 PM: "Heavy training session detected. Tomorrow's 6:30 AM run may impair recovery. Would you like to swap it for a 30-min mobility walk?"
- **External State**: User selects "Swap for Walk".
- **Verification**: Kernel updates calendar event and training target.
- **Learning**: Intervention recorded; sleep score next morning verified at $82\%$ (well-recovered).
- **Future Adaptation**: Establishes behavioral rule linking leg workouts with next-morning low-impact training.

---

#### JOURNEY 4: Passive Cognitive State Estimation via Friction
- **Input**: User enters chat: "I'm so exhausted, what do I have left?"
- **Observation**: Conversational sentiment: somatic affective evidence of fatigue. Telemetry: 7.5 hours screen time, 4 task switches in 30 minutes.
- **World Model**: Snapshot state updated with conversational evidence (`provenance: "HYBRID"`).
- **State Estimate**: `Energy: 0.25`, `FocusCapacity: 0.15` (`confidence: 0.94`).
- **Reasoning**: Cross-domain engine detects end-of-day cognitive depletion.
- **Proposal**: Recommend shutting down work; summarize tomorrow's first task and close active workspace.
- **Authorization**: Autonomy Tier L1 (Inform).
- **Execution**: Aven replies: "You've had 7.5 hours of high screen time today. Your remaining 2 tasks are low priority. I recommend closing your laptop. Tomorrow starts with the Investor Sync at 10 AM."
- **External State**: User closes laptop.
- **Verification**: Desktop runtime records zero app activity after 06:15 PM.
- **Learning**: Confirms fatigue estimation accuracy; updates evening shutdown baseline.
- **Future Adaptation**: Calibrates evening shutdown recommendation timing to 06:00 PM.

---

#### JOURNEY 5: Cross-Domain Multi-Factor Synthesis
- **Input**: User asks: "Why haven't I made progress on the mobile app project this week?"
- **Observation**: Goal `mobile_app` has 0 commits, 0 completed tasks in 5 days.
- **World Model**: Analytical correlation across 5 days of data.
- **State Estimate**: Synthesis of historical snapshots.
- **Reasoning**: Cross-domain engine uncovers causal chain: Sleep was normal, but user had 22 hours of unplanned client meetings, leaving only 12% deep work time.
- **Proposal**: Explain causal factors clearly and propose blocking 3 hours of protected deep work tomorrow morning.
- **Authorization**: Autonomy Tier L4 (Execute with Approval).
- **Execution**: Aven presents explainable breakdown: "You were blocked by 22 hours of client meetings this week, leaving only 3 hours of deep work time. I've drafted a 3-hour focus lock for tomorrow at 9 AM. Should I block it?"
- **External State**: User approves: "Yes, block it."
- **Verification**: Kernel creates protected calendar event with `isFocusBlock: true`.
- **Learning**: Tracks progress on mobile app project at T+24h.
- **Future Adaptation**: Strengthens association between client meeting volume and project stagnation.

---

#### JOURNEY 6: Proactive Deadline & Schedule Buffering
- **Input**: Background daemon evaluates user state at 02:00 PM on Thursday.
- **Observation**: Task "File Corporate Taxes" due in 24 hours ($T-24\text{h}$). Current calendar shows only 1 hour of free time remaining before deadline.
- **World Model**: Goal pressure on Financial Compliance reaches critical tension ($0.95$).
- **State Estimate**: `DeadlineRisk: CRITICAL`.
- **Reasoning**: Task estimated duration is 2.5 hours; remaining free time is 1.0 hour. Mathematically impossible to complete without rescheduling.
- **Proposal**: Identify non-urgent 1-on-1 meeting at 04:00 PM; draft request to colleague to reschedule.
- **Authorization**: Autonomy Tier L4 (Execute with Approval).
- **Execution**: Priority notification: "Corporate Taxes are due tomorrow and require 2.5 hours. You only have 1 hour free. Would you like me to move your 4 PM 1-on-1 with Mark to Monday to guarantee completion?"
- **External State**: User taps "Move Meeting".
- **Verification**: Kernel reschedules meeting, sends invite update, and blocks 4:00 - 6:00 PM for tax filing.
- **Learning**: Taxes completed and verified at 05:45 PM. Outcome: `EFFECTIVE`.
- **Future Adaptation**: System learns that tax tasks require 48-hour advance buffer warnings.

---

#### JOURNEY 7: Intervention Outcome Verification at T+4h and T+24h
- **Input**: Background worker ticks at 06:00 PM (4 hours post-focus block).
- **Observation**: Task completed in focus block: "Finish API Documentation". Telemetry shows 110 minutes of uninterrupted editor activity.
- **World Model**: Load `InterventionRecord` `int-focus-123`.
- **State Estimate**: Measure observed delta against baseline.
- **Reasoning**: Target metric was `focus_duration >= 90m`; observed was $110\text{m}$. Task status in MongoDB is `COMPLETED`.
- **Proposal**: Mark intervention `t4h.evaluatedStatus = "EFFECTIVE"`.
- **Authorization**: Autonomous internal state update (L0).
- **Execution**: Record outcome in `InterventionRecordModel` and emit learning signal.
- **External State**: Internal DB update.
- **Verification**: Record confirmed written with cryptographic ledger checksum.
- **Learning**: [LearningEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/LearningEngine.ts) increases weight for afternoon focus block strategy (+0.08).
- **Future Adaptation**: Aven prioritizes afternoon focus blocks over morning focus blocks for coding tasks.

---

#### JOURNEY 8: Longitudinal Behavioral Habit Adaptation
- **Input**: User consistently completes workouts at 06:30 AM over a 21-day window, despite an old explicit preference stating "Evening workouts".
- **Observation**: 14 `WorkoutCompleted` observations recorded between 06:30 and 07:45 AM.
- **World Model**: Behavioral model detects strong divergence from profile rule.
- **State Estimate**: `CandidatePreference: preferredWorkoutTime = "06:30"` (`confidence: 0.88`).
- **Reasoning**: Behavioral evidence is overwhelming, but Constitutional Rule 8 dictates: explicit preferences cannot be silently overwritten.
- **Proposal**: Propose candidate preference to user for confirmation.
- **Authorization**: Autonomy Tier L2 (Recommend).
- **Execution**: Aven prompts in evening review: "You've worked out in the morning 14 times this month. Would you like me to update your scheduling preference to morning workouts?"
- **External State**: User confirms: "Yes, mornings are much better now."
- **Verification**: [PreferenceAuthorityManager.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/user/PreferenceAuthorityManager.ts) updates preference with `authority: "EXPLICIT_SOFT"`.
- **Learning**: Old evening preference superseded cleanly without regex.
- **Future Adaptation**: Morning calendar scheduling automatically reserves 06:30 - 08:00 AM for exercise.

---

#### JOURNEY 9: Desktop Local MCP File Analysis
- **Input**: User speaking on Desktop: "Find the action items in my meeting notes from yesterday's sync with Stripe."
- **Observation**: Request requires local filesystem access.
- **World Model**: Identifies desktop context with active Stdio MCP server.
- **State Estimate**: Standard operational turn.
- **Reasoning**: Supervisor matches capability URN `desktop.filesystem.search_notes` to local MCP Stdio adapter.
- **Proposal**: Execute MCP tool `search_files` with query "Stripe" in notes vault.
- **Authorization**: Autonomy Tier L5 (Autonomous within read-only local sandbox).
- **Execution**: `McpCapabilityGateway` dispatches JSON-RPC over Stdio to local markdown parser.
- **External State**: File parsed, 3 bullet points extracted.
- **Verification**: Kernel verifies payload matches read-only invariant; passes content to Aven.
- **Learning**: Records successful tool execution; logs MCP transport latency.
- **Future Adaptation**: Notes from Stripe are indexed in conversation STM for follow-up questions.

---

#### JOURNEY 10: LangGraph Deliberative Multi-Domain Life Restructuring
- **Input**: User asks: "I'm training for a marathon in 12 weeks while launching our product. Restructure my entire weekly schedule so I hit 40 miles without missing project milestones."
- **Observation**: Highly complex, multi-constraint deliberative request spanning Health, Work, and Calendar.
- **World Model**: DynamicRouter classifies turn as `COMPLEX_DELIBERATIVE`.
- **State Estimate**: Requires multi-agent fan-out and synthesis.
- **Reasoning**: Routed to Phase 10 `DeliberativePlanningGraph`.
- **Proposal**: Graph executes 4-node flow: Goal Decomposition → Specialist Consultation (Health + Productivity) → Conflict Synthesis → Checkpoint Pause.
- **Authorization**: Graph halts at HITL checkpoint (`interruptedForHITL: true`); awaits user review of 12-week schedule draft.
- **Execution**: Aven presents structured weekly breakdown with clear trade-offs.
- **External State**: User adjusts Wednesday mileage and clicks "Commit Schedule".
- **Verification**: Resumed graph dispatches atomic batch proposal to [KernelCapabilityService.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/capabilities/KernelCapabilityService.ts).
- **Learning**: Deliberative workflow duration and user edits recorded in benchmark harness.
- **Future Adaptation**: Calibrates specialist weighting for endurance training projects.

---

#### JOURNEY 11: Relationship-Aware Conflict Resolution
- **Input**: Two meeting requests arrive simultaneously for Thursday at 02:00 PM: one from "Michael (Co-founder)" and one from an inbound sales lead.
- **Observation**: Inbound calendar invite webhook triggers observation pipeline.
- **World Model**: [RelationshipContextEngine.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/RelationshipContextEngine.ts) resolves Michael with `importanceScore: 0.95`, sales lead with `importanceScore: 0.40`.
- **State Estimate**: Scheduling collision detected.
- **Reasoning**: Co-founder sync has higher strategic priority; sales lead can be accommodated on Friday morning.
- **Proposal**: Accept co-founder meeting; propose alternative time slot to sales lead.
- **Authorization**: Autonomy Tier L4 (Execute with Approval).
- **Execution**: Aven asks: "Michael scheduled a sync for Thursday at 2 PM, which conflicts with an inbound lead. I recommend accepting Michael's invite and offering Friday at 10 AM to the lead. Should I proceed?"
- **External State**: User approves with 1 tap.
- **Verification**: Kernel updates calendar and dispatches standardized reschedule email.
- **Learning**: Confirms relationship priority hierarchy.
- **Future Adaptation**: Relationship weighting applied to automated calendar sorting.

---

#### JOURNEY 12: External Calendar Outage Resiliency & Unknown State Handling
- **Input**: User says: "Schedule dinner with Sarah tonight at 7 PM."
- **Observation**: Request to write to Google Calendar.
- **World Model**: `GoogleCalendarProvider` attempts network call; Google API returns HTTP 503 Service Unavailable.
- **State Estimate**: External provider degradation.
- **Reasoning**: Kernel must not claim fake success (Constitutional Rule 9) and must not crash.
- **Proposal**: Save event locally in LifeOS database; queue background retry; notify user transparently.
- **Authorization**: Autonomy Tier L4.
- **Execution**: Aven states: "I've saved dinner with Sarah for 7 PM in LifeOS, but Google Calendar hasn't confirmed it yet. I'll sync it automatically as soon as Google recovers."
- **External State**: Local DB has event with `syncStatus: "UNKNOWN_EXTERNAL_STATE"`.
- **Verification**: Background queue polls Google health; commits event when API recovers (`CONFIRMED_EXTERNAL_COMMIT`).
- **Learning**: Logs provider outage duration in Prometheus tracer.
- **Future Adaptation**: Retains robust user trust through radical transparency.

---

#### JOURNEY 13: Sarcastic / Ambiguous Conversational Disambiguation
- **Input**: User sends: "Yeah right, like I really want another meeting today."
- **Observation**: Natural language turn with strong sarcastic polarity.
- **World Model**: [SemanticIntentInterpreter.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/SemanticIntentInterpreter.ts) analyzes utterance.
- **State Estimate**: Classified as `OPINION_EXPRESSION / NEGATIVE_SENTIMENT`, NOT `CREATE_CALENDAR_EVENT`. Zero regex pattern matching used.
- **Reasoning**: Model-driven interpreter correctly identifies negation/irony; zero actions generated.
- **Proposal**: Conversational empathy acknowledgment.
- **Authorization**: Autonomy Tier L1 (Inform).
- **Execution**: Aven replies: "Understood. I won't add anything to your calendar today. Rest up."
- **External State**: Zero calendar mutations.
- **Verification**: Kernel audit ledger confirms 0 mutations executed.
- **Learning**: Avoids false-positive execution.
- **Future Adaptation**: Emotional state registered in cognitive evidence buffer.

---

#### JOURNEY 14: Compound Multi-Action Execution with Partial Failure
- **Input**: User says: "Mark task 123 done, create a meeting tomorrow at 9 with David, and play some focus music."
- **Observation**: Compound multi-domain turn (Task + Calendar + Media).
- **World Model**: Interpreter splits into 3 discrete `SemanticOperation` objects.
- **State Estimate**: Multi-domain batch execution.
- **Reasoning**: Kernel dispatches all 3 actions concurrently through `ActionAdapterRegistry`.
- **Proposal**: Task completed (Success), Calendar scheduled (Success), Spotify token expired (Failure).
- **Authorization**: Autonomy Tier L4.
- **Execution**: Aven reports partial success honestly: "Done: Task 123 is completed and your 9 AM meeting with David is scheduled. However, your Spotify account needs to be reconnected to start playback."
- **External State**: Task is COMPLETED, Event is CREATED, Spotify prompts re-auth link.
- **Verification**: Kernel ledger records 2 successes and 1 structured failure (`AUTH_REQUIRED`).
- **Learning**: Demonstrates constitutional compliance (No Fake Success).
- **Future Adaptation**: Aven suppresses media actions until re-auth event is received.

---

#### JOURNEY 15: User Retraction & Capability-Specific Compensation
- **Input**: Aven autonomously creates a 2-hour focus block under Level 5 policy at 08:00 AM. User wakes up and wants that time open.
- **Observation**: User taps "Undo" in the morning audit feed.
- **World Model**: [AutonomousActionReverser.ts](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/autonomy/AutonomousActionReverser.ts) looks up `executionId`.
- **State Estimate**: User retraction within 24-hour window.
- **Reasoning**: Capability is `calendar.event.create` with `reversibility: "REVERSIBLE_EXACT"`. Inverse action is `calendar.event.delete` targeting the created focus block ID.
- **Proposal**: Execute inverse action immediately without interrogation.
- **Authorization**: User initiated rollback (100% sovereign authority).
- **Execution**: Focus block deleted from Google Calendar; audit log marked `userFeedback: "REVERSED"`.
- **External State**: Calendar slot cleared.
- **Verification**: Google Calendar returns confirmed deletion.
- **Learning**: Policy daemon adds 14-day cooldown to morning focus block auto-creation rule.
- **Future Adaptation**: Aven downgrades focus block creation to Level 4 (Approval required) for this user.

---

## 7. FINAL GOVERNANCE, READINESS & ARCHITECTURAL SUMMARY

### 7.1 "Jarvis Ready" Evidence-Based Readiness Framework

| Readiness Dimension | Metric | Measurement Method | Test Environment | Passing Threshold | Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Conversational Latency** | Time to First Token (TTFT) | High-res timer in ProductionTracer | Live staging server | **P95 $\le 1.8\text{s}$** (FastPath $\le 180\text{ms}$) | Human conversational immersion breaks if latency $>2.5\text{s}$. |
| **2. Sovereign Execution Integrity** | Zero unverified DB mutations | Kernel audit ledger vs MongoDB diff | Adversarial chaos test suite | **$100.0\%$ verified commits** | A personal OS must never corrupt state or report fake success. |
| **3. Passive State Inference** | Correlation with hidden ground truth | Pearson correlation over 30 days | Simulation Lab (Artifact M) | **$r \ge 0.80$** ($p < 0.001$) | Eliminating manual daily logs requires high inferred accuracy. |
| **4. Multi-Domain Awareness** | Cross-domain context injection | Automated prompt inspector | Live conversation turn suite | **$100\%$ of turns contain valid snapshot** | Eliminates the "Two Disjointed Brains" architecture. |
| **5. Proactive Signal-to-Noise** | Notification dismissal / block rate | User action tracking over 14 days | Staging / dogfooding deployment | **Dismissal rate $\le 15\%$** | Prevents notification fatigue and uninstalls. |
| **6. Closed-Loop Adaptation** | Intervention efficacy delta | T+4h/T+24h verification metrics | 30-day longitudinal simulation | **$\ge +25\%$ improvement** | Proves the system actually learns what works over time. |
| **7. Preference Authority** | Explicit override violation count | Automated adversarial test runner | Unit & Integration regression suite | **Exactly 0 violations** | Explicit human rules must NEVER be overridden by learned heuristics. |
| **8. Replay Determinism** | Byte-for-byte ledger reconstruction | ReplayEngine fixture verification | CI automated test pipeline | **$100.0\%$ identical state trees** | Guarantees auditability and bug reproducibility. |
| **9. Platform Parity** | Feature execution equivalence | Cross-platform E2E test suite | Web, iOS, Android, macOS builds | **$100\%$ core capability parity** | Voice, tasks, and world state must behave identically everywhere. |
| **10. Autonomy Safety** | High-risk autonomous executions | Kernel authorization barrier logs | Chaos failure injection | **Exactly 0 unapproved actions** | Level 5 is strictly reserved for low-risk, reversible actions. |

---

### 7.2 Final Implementation Dependency Graph

```
[Phase 0: Reality Baseline & Invariants]
   │
   ▼
[Phase 1: Unified World Model Bridge] ◄────────────────────────────────┐
   │                                                                   │
   ├──────────────────────────────┐                                    │
   ▼                              ▼                                    │
[Phase 2: Continuous Telemetry]   [Phase 12: External Adapter Decomp]  │
   │                              │                                    │
   ▼                              ▼                                    │
[Phase 3: Passive Cognitive State][Phase 11: MCP Gateway Pilot]        │
   │                                                                   │
   ▼                                                                   │
[Phase 4: Deep User Model & Prefs]                                     │
   │                                                                   │
   ▼                                                                   │
[Phase 5: Behavioral, Rel & Phys Models]                               │
   │                                                                   │
   ▼                                                                   │
[Phase 6: Cross-Domain Intelligence] ──► [Phase 10: LangGraph Pilot]   │
   │                                                                   │
   ▼                                                                   │
[Phase 7: Closed-Loop Interventions]                                   │
   │                                                                   │
   ▼                                                                   │
[Phase 8: Proactive Engine Daemon]                                     │
   │                                                                   │
   ▼                                                                   │
[Phase 9: Morning Jarvis Flagship]                                     │
   │                                                                   │
   ▼                                                                   │
[Phase 13: Real-System Hardening & Mock Purge] ────────────────────────┘
   │
   ▼
[Phase 14: Longitudinal 90-Day Simulation]
   │
   ▼
[Phase 15: Controlled Autonomous Life Management]
```

- **Critical Sequential Path**: Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 13 → Phase 14 → Phase 15.
- **Parallel Workstreams**:
  - Phase 11 (MCP Pilot) and Phase 12 (Adapter Decomposition) can run in parallel with Phases 2 through 6.
  - Phase 10 (LangGraph Pilot) can run in parallel once Phase 6 (Cross-Domain) is complete.

---

### 7.3 Final File-by-File Implementation Map

| Target Package / Path | Current File State | Planned Architecture Change | Target Subsystem Owner | Phase |
| :--- | :--- | :--- | :--- | :--- |
| `packages/execution-kernel/src/worldv2/WorldModelV2.ts` | Analytical snapshot only | Evolve into canonical world model; add field-level confidence/provenance | `WorldModelV2` | **Phase 1** |
| `packages/execution-kernel/src/worldv2/WorldModelBridge.ts` | Does not exist | Create high-speed caching bridge ($<15\text{ms}$) to feed Supervisor | `WorldModelBridge` | **Phase 1** |
| `packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts` | Bypasses analytical state | Inject `ILifeContextProjection` into semantic interpretation prompt | `Supervisor` | **Phase 1** |
| `packages/execution-kernel/src/telemetry/TelemetryIngestionService.ts` | Reads daily logs only | Connect durable event queue and multi-source provider extractors | `TelemetryIngestionService` | **Phase 2** |
| `packages/execution-kernel/src/telemetry/pipeline/ObservationPipeline.ts` | Does not exist | Create pipeline for normalization, deduplication, and batch storage | `ObservationPipeline` | **Phase 2** |
| `packages/execution-kernel/src/worldv2/CognitiveStateEngine.ts` | Does not exist | Create probabilistic estimator for stress, energy, load, and readiness | `CognitiveStateEngine` | **Phase 3** |
| `packages/execution-kernel/src/memory/ContradictionResolver.ts` | Contains regex polarity pairs | Purge all regex; replace with model-driven contradiction verification | `ContradictionResolver` | **Phase 4** |
| `packages/execution-kernel/src/user/PreferenceAuthorityManager.ts` | Does not exist | Create 5-tier authority manager (`EXPLICIT_HARD > LEARNED`) | `PreferenceAuthorityManager` | **Phase 4** |
| `packages/execution-kernel/src/worldv2/RelationshipContextEngine.ts` | Hardcoded stub array | Connect to MongoDB `relationships` collection and Entity Resolver | `RelationshipContextEngine` | **Phase 5** |
| `packages/execution-kernel/src/physical/PhysicalReadinessEngine.ts` | Does not exist | Longitudinal model tracking workouts, sleep, and physical recovery | `PhysicalReadinessEngine` | **Phase 5** |
| `packages/execution-kernel/src/reasoning/CrossDomainIntelligenceEngine.ts`| Does not exist | Multi-factor causal engine correlating Health, Work, and Goals | `CrossDomainIntelligenceEngine`| **Phase 6** |
| `packages/execution-kernel/src/interventions/InterventionRecordModel.ts` | Does not exist | Create schema tracking interventions, baselines, and T+4h/T+24h deltas | `InterventionVerificationEngine`| **Phase 7** |
| `packages/execution-kernel/src/proactive/ProactiveEngine.ts` | 79-line dead stub | Re-engineer as active policy daemon with quiet hours and cooldowns | `ProactiveEngine` | **Phase 8** |
| `packages/execution-kernel/src/experience/morning/MorningBriefingEngine.ts`| Does not exist | Flagship briefing synthesizer with voice TTS streaming | `MorningBriefingEngine` | **Phase 9** |
| `packages/execution-kernel/src/orchestration/langgraph/DeliberativePlanningGraph.ts`| Does not exist | Controlled LangGraph pilot graph for complex multi-step planning | `Supervisor` | **Phase 10** |
| `packages/execution-kernel/src/orchestration/external/mcp/McpCapabilityGateway.ts`| Does not exist | Sandboxed MCP gateway managing Stdio/SSE transports behind Kernel | `KernelCapabilityService` | **Phase 11** |
| `packages/execution-kernel/src/orchestration/external/ExternalCapabilityAdapter.ts`| 3,838-line monolith | Decompose into discrete provider classes under `external/providers/` | Modular Providers | **Phase 12** |
| `packages/execution-kernel/src/testing/v3RealityAudit.test.ts` | Uses ScriptedLLM mocks | Upgrade to real MongoDB test containers and production replay fixtures | `RealityTestHarness` | **Phase 0 & 13** |
| `apps/web/simulation/test_multiday.ts` | 7-day basic simulation | Expand to 30-day and 90-day accelerated longitudinal convergence tests | `SimulationRuntimeEngine` | **Phase 14** |
| `packages/execution-kernel/src/autonomy/AutonomousActionReverser.ts` | Does not exist | Enforces Level 5 low-risk autonomy with capability-specific compensation | `KernelCapabilityService` | **Phase 15** |

---

### 7.4 Final Migration Strategy

1. **Strangler Migration Pattern**: Evolve subsystems incrementally behind existing interfaces rather than executing a high-risk big-bang rewrite.
2. **Feature Flag Isolation**: Every architectural component (World Model Bridge, Continuous Telemetry, Proactive Daemon, MCP Gateway, LangGraph Pilot) is wrapped in a dynamic feature flag. The default configuration is strictly identical to current production behavior.
3. **Dual-Run Shadow Characterization**: Before activating any new engine (such as `CognitiveStateEngine` or `CrossDomainIntelligenceEngine`), the engine runs in background shadow mode for 7 days. It evaluates incoming events and records logs, but surfaces zero changes to the UI. Its outputs are compared against baseline telemetry to verify numerical stability.
4. **Additive Persistence Migrations**: Database schemas are expanded strictly additively. New collections (`telemetry_observations`, `user_deep_profiles`, `intervention_records`) are created alongside existing models. Legacy collections (`dailylogs`, `tasks`) are never mutated destructively.
5. **Instant Rollback Points**: In the event of latency regressions ($>2.5\text{s}$) or error spikes ($>1%$), disabling the feature flag instantly restores prior system behavior without requiring database rollbacks or server restarts.

---

### 7.5 What LifeOS Must NOT Build (Explicit Anti-Goals)

1. **DO NOT Build Custom Foundation Models**: LifeOS is an execution and intelligence operating system, not an LLM training lab. We consume frontier hosted models (Groq, Anthropic, OpenAI) via standardized gateways.
2. **DO NOT Build a Generic Autonomous Browser Agent**: LifeOS will not build generic DOM-clicking browser automation to scrape the web or book flights. All external mutations occur via authenticated, deterministic APIs or sandboxed MCP servers.
3. **DO NOT Build a Medical Diagnosis Engine**: Cognitive and physical state models are strictly operational readiness estimators for scheduling and focus management. The system will never issue clinical diagnoses or medical treatment advice.
4. **DO NOT Build a Commodity Chatbot Wrapper**: Aven is an executive chief of staff. We will not waste cycles building open-ended small-talk bots, personality customizers, or frivolous conversational games.
5. **DO NOT Build a Second Brain or Duplicate Entity Resolver**: We will never create `WorldModelV3` or secondary memory systems. All intelligence evolves within the canonical architecture.
6. **DO NOT Build Bespoke Integrations for Dying Services**: We will integrate high-leverage personal OS platforms (Google Workspace, Apple Health, GitHub, Spotify, Oura); we will not build custom adapters for niche, unvetted third-party services.

---

### 7.6 Hardened Risk Register & Open Decisions

| Risk Description | Probability | Severity | Mitigation Strategy | Owner |
| :--- | :--- | :--- | :--- | :--- |
| **Conversational Latency Inflation** (World Model Bridge bloating TTFT past 2.0s) | High | Critical | Strict 250-token context budget; pre-computed cached snapshots ($<15\text{ms}$); FastPath completely bypasses heavy graph steps. | Supervisor Authority |
| **Notification Fatigue & User Trust Erosion** (Proactive engine sending unwanted interruptions) | High | High | Interruption Cost Evaluator; default 3 alerts/day ceiling; quiet hours (22:00-08:00); 4h per-domain cooldown. | Proactive Authority |
| **Inferred Bias Overriding User Intent** (Learned behavior incorrectly blocking an explicit task) | Medium | Critical | Preference Authority Matrix: `EXPLICIT_HARD` preferences permanently override learned heuristics; zero silent promotions. | Preference Authority |
| **External API Outages & Unknown State** (Third-party OAuth or HTTP 503 failures breaking execution) | High | Medium | Decoupled provider modules with automatic refresh; explicit `UNKNOWN_EXTERNAL_STATE` classification; idempotent retry queue. | Capability Authority |
| **Monorepo Dependency Bloat** (LangChain/MCP packages introducing dependency conflicts) | Medium | Medium | Pin exact versions; isolate pilot dependencies; evaluate standalone implementations before wide adoption. | Runtime Authority |

### Open Architectural Decisions Requiring Review:
1. **TTS Streaming Provider Selection**: Decision between Cartesia (fastest TTFT: $\sim 120\text{ms}$) vs ElevenLabs (richer audio timbre, $\sim 350\text{ms}$) for the Morning Jarvis experience. (Recommendation: Cartesia for live voice calls; ElevenLabs for pre-generated morning briefings).
2. **Mobile Health Sync Architecture**: Choose between direct native iOS Background Fetch sync vs cloud-relayed sync via Google Health Connect. (Recommendation: Direct native iOS sync via Expo plugin to maximize privacy).
3. **LangGraph Permanent Retention Gate**: Benchmark criteria for whether LangGraph is permanently retained for deliberative planning or replaced by a zero-dependency custom finite state machine (FSM). (Recommendation: Retain only if multi-day resumability and HITL benefits exceed the heap overhead).
