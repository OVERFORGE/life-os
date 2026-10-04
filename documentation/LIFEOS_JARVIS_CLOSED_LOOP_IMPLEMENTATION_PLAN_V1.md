# LIFEOS — JARVIS TRANSFORMATION / CLOSED-LOOP PERSONAL OS
# IMPLEMENTATION STRATEGY & ARCHITECTURE PLAN V1
**Author**: Antigravity Cognitive Systems Architecture & Execution Kernel Engineering Team  
**Scope**: Complete LifeOS Monorepo (`packages/execution-kernel`, `apps/web`, `apps/mobile`, `packages/desktop-runtime`, `graph`, `documentation`)  
**Date**: October 2026 Baseline  
**Mode**: RESEARCH + ARCHITECTURE + IMPLEMENTATION PLANNING (Plan Only — Zero Code Mutations)

---

## 1. EXECUTIVE SUMMARY

### 1.1 The Transformational Objective
LifeOS is transitioning from a reactive task-management and conversational dispatcher into a **Sovereign Personal Operating System for Human Execution and Life Management**, powered by **Aven** as an ongoing cognitive chief of staff. The goal is an operating system that models the user longitudinally across **Physical Health, Work/Execution, and Cognitive State**, actively closing the loop between observation, state estimation, intervention, and learned adaptation.

### 1.2 Core Architectural Imperatives
1. **Unify the Two Disjointed Brains**: Bridge analytical intelligence ([`WorldModelV2.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts), [`LifeStateEngine.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/LifeStateEngine.ts)) with live conversational execution ([`Supervisor.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts), [`ConversationService.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/services/ConversationService.ts)) into **One Coherent World Model**.
2. **Transition from Reactive to Proactive & Controlled Autonomous**: Transform the placeholder [`ProactiveEngine.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/proactive/ProactiveEngine.ts) into an event- and cron-driven background engine that delivers timely interventions, starting with the **Morning Jarvis Experience**.
3. **Replace Manual Ingestion with Passive Telemetry & Cognitive Estimation**: Transition from manual 1–10 check-in forms to continuous passive evidence gathering (sleep debt, calendar density, task deferral velocity, wearable recovery) with explicit uncertainty-driven check-in prompts.
4. **Implement Closed-Loop Adaptation**: Track every intervention through an **Intervention & Outcome Verification Ledger** that measures 4-hour and 24-hour real-world impact and updates personal behavioral heuristics.
5. **Establish Controlled Integration Boundaries (LangGraph & MCP)**:
   - **LangGraph**: Adopted in a **controlled pilot** as an in-process cognitive state machine only; the **Sovereign Kernel** ([`KernelCapabilityService.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/kernel/KernelCapabilityService.ts)) retains absolute authority over execution, idempotency, and side effects.
   - **MCP**: Deployed selectively as an **optional transport provider** behind the kernel capability boundary; high-frequency core services remain native REST/IPC to maintain latency budgets.

---

## 2. CURRENT REALITY: FORENSIC CODEBASE TOPOLOGY

A strict code-level trace reveals the current system state:

```
[UI Trigger: Web / Mobile Voice / Check-in Form]
       │
       ▼
[Next.js API Handler: apps/web/app/api/conversation/route.ts]
       │
       ▼
[ConversationService.executeUserRequest()]
       │
       ▼
[Supervisor.processRequest()] ◄─── Loads STM / ConversationShortTermMemory
       │
       ├─────────────────────────────────────────┐
       ▼ (Operations > 0: 95% of live turns)      ▼ (Operations == 0: Fallback)
[Direct Semantic Proposal Batch]         [ReActOrchestrator.runLoop()]
       │                                         │
       │                                         ├─ ParallelSpecialistExecutor
       │                                         │  (Productivity, Health, Wellness)
       │                                         └─ SynthesisEngine
       │                                                 │
       └─────────────────────────┬───────────────────────┘
                                 ▼
                     [KernelCapabilityService]
                      Authoritative Execution Boundary
                       ├─ Precondition Validation
                       ├─ Idempotency Audit Ledger (RAM + Mongo)
                       ├─ Compensating Sagas Rollback
                       └─ ActionAdapterRegistry
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
     [DefaultActionAdapters]         [ExternalCapabilityAdapter]
      ├─ Task / Goal Adapters         ├─ 3,838 lines monolithic fetch()
      ├─ DailyLog.mental update       ├─ Gmail RFC 822 base64 builder
      └─ Temporal Occurrence Engine   └─ Deep-link intents (Uber, Zomato)
                                                 ▲
                                                 │
                                     (Bypasses MCP & WorldModelV2)
```

### Forensic Status of Subsystems:
* `Supervisor.ts`: **IMPLEMENTED + LIVE VERIFIED** ([`Supervisor.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/supervisor/Supervisor.ts)). Handles 100% of user chat turns.
* `KernelCapabilityService.ts`: **IMPLEMENTED + TEST VERIFIED** ([`KernelCapabilityService.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/kernel/KernelCapabilityService.ts)). Robust sovereign boundary.
* `WorldModelV2.ts` / `LifeStateEngine.ts`: **ARCHITECTURAL / ISOLATED** ([`WorldModelV2.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/WorldModelV2.ts)). Computes complex 5-axis goal pressure and life states, but is **never called by `Supervisor.ts` in live production turns**.
* `ProactiveEngine.ts`: **DEAD / UNUSED** ([`ProactiveEngine.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/proactive/ProactiveEngine.ts)). Contains zero background jobs, daemons, or execution triggers.
* `RelationshipContextEngine.ts`: **DEAD STUB** ([`RelationshipContextEngine.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/RelationshipContextEngine.ts)). Hardcoded static array with 1 item.
* `LearningEngine.ts`: **DISCONNECTED** ([`LearningService.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/services/LearningService.ts)). Called with empty arrays `[]` in production routes.
* `ExternalCapabilityAdapter.ts`: **MONOLITHIC REST ENGINE** ([`ExternalCapabilityAdapter.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/kernel/ExternalCapabilityAdapter.ts)). 3,838 lines of direct `fetch()` calls; zero live MCP server connections.

---

## 3. TARGET PRODUCT DEFINITION: THE PERSONAL OPERATING SYSTEM

LifeOS is an **operating system for human execution**. Aven is the **persistent executive intelligence** operating on top of it.

```
+----------------------------------------------------------------------------------------------------+
|                                    TARGET PRODUCT CAPABILITY MATRIX                                |
+----------------------------------------------------------------------------------------------------+
| 1. Persistent Identity      | Calm, grounded, non-performative, zero mechanical jargon.             |
| 2. Ongoing Observation      | Passive biometric, calendar, task velocity, and communication sync.  |
| 3. Longitudinal World Model | Fuses Physiology + Execution Velocity + Cognitive State into one graph.|
| 4. Cross-Domain Intelligence| Correlates sleep debt with task deferrals to protect focus windows.  |
| 5. Proactive Initiative     | Wakes the user with an executive morning briefing and schedule plan. |
| 6. Closed-Loop Adaptation   | Measures 4h/24h outcome of interventions to refine personal defaults. |
| 7. Sovereign Execution      | Idempotent, replayable, crash-safe execution with user-controlled HITL.|
+----------------------------------------------------------------------------------------------------+
```

---

## 4. ARCHITECTURAL PRINCIPLES (THE CONSTITUTION)

The implementation plan strictly enforces the 20 Constitutional Rules:
1. **Semantic Authority**: Aven owns semantic intent interpretation; the LLM never executes side effects directly.
2. **Sovereign Execution**: `KernelCapabilityService` is the sole execution boundary.
3. **No Second Brain**: No parallel memory, entity resolution, or world model architectures.
4. **Deterministic Governance**: Zero regex, zero token-overlap, and zero fuzzy matching for routing authority.
5. **Crash-Consistent Idempotency**: Every external mutation must have a deterministic idempotency key.
6. **Replay Integrity**: Zero network side effects may execute during historical replay.
7. **User Sovereignty**: Critical real-world actions require explicit Human-in-the-Loop (HITL) approval.

---

## 5. UNIFIED WORLD MODEL ARCHITECTURE

Rather than creating a parallel "WorldModelV3", we **evolve `WorldModelV2` into the Single Canonical World Model** and wire it directly into the active conversational pipeline.

```
                                [CANONICAL WORLD MODEL STATE]
                                              │
         ┌───────────────────┬────────────────┼───────────────────┬───────────────────┐
         ▼                   ▼                ▼                   ▼                   ▼
    [IDENTITY]          [PHYSICAL]       [EXECUTION]         [COGNITIVE]         [ENVIRONMENT]
    ├─ User Profile     ├─ Nutrition     ├─ Active Tasks     ├─ Stress Estimate  ├─ Desktop Status
    ├─ Explicit Prefs   ├─ Workouts      ├─ Active Goals     ├─ Energy Estimate  ├─ Connected Apps
    └─ Learned Habits   ├─ Sleep Debt    ├─ Calendar Slots   ├─ Focus Index      └─ Geolocation
                        └─ Wearable HRV  └─ Velocity Metric  └─ Active Incidents
```

### 5.1 Canonical State Contract: `IUnifiedWorldModel`
Every state estimate contains:
* `value`: Normalized or structured metric.
* `timestamp`: Epoch millisecond of estimation.
* `provenance`: Originating data source (`"HEALTHKIT"`, `"GOOGLE_FIT"`, `"CALENDAR_DIFF"`, `"CONVERSATION"`).
* `confidence`: Attenuated score (0.0 to 1.0) based on data freshness and sensor quality.
* `evidenceReferences`: IDs of raw observations backing the estimate.
* `validUntil`: TTL expiration timestamp after which the estimate is marked stale.

### 5.2 The Unified Injection Bridge
`Supervisor.processRequest` is updated to receive an immutable `KernelSnapshot` generated by `WorldModelV2.computeKernelSnapshot(userId)`:
```typescript
// Architectural Pattern:
const worldSnapshot = await WorldModelV2.getInstance().getLatestSnapshot(req.userId);
const semanticTurn = await interpreter.interpret(req.message, {
  ...context,
  worldSnapshot, // Injected directly into Aven's context projection
});
```

---

## 6. OBSERVATION & TELEMETRY SUBSYSTEM PLAN

Transform the passive telemetry ingestion pipeline from a static batch processor into an **event- and poll-driven observation engine**.

```
[External Sources]
 ├─ Wearables (Apple HealthKit / Health Connect / Oura / Fit)
 ├─ Calendar & Email Changes (Google Push Webhooks)
 ├─ Task Modifications & Action Ledger Entries
 └─ Local Desktop FS Events
         │
         ▼
[TelemetryIngestionService] ──► Normalizes into strongly typed ObservationRecord[]
         │
         ▼
[DurableTelemetryQueue] (Backed by MongoDB 'telemetry_jobs')
         │
         ▼
[WorldModelV2.ingestObservationBatch()] ──► Updates Canonical World State
```

### Telemetry Normalization Pipeline:
1. **`ObservationRecord`**:
   - `id`: `obs_<timestamp>_<hash>`
   - `source`: `"WEARABLE"` | `"CALENDAR"` | `"TASK_SYSTEM"` | `"COMMUNICATION"` | `"SYSTEM"`
   - `domain`: `"health"` | `"work"` | `"wellness"` | `"context"`
   - `metricName`: e.g. `"sleep_duration"`, `"hrv_rmssd"`, `"calendar_fragmentation"`, `"task_completed"`
   - `value`: Raw value + normalized unit
   - `confidence`: Telemetry quality score

---

## 7. PASSIVE COGNITIVE & MENTAL STATE ESTIMATION PLAN

Eliminate manual 1–10 DailyLog entries as the primary UX. Implement **Passive Cognitive State Inference**:

```
                       [RAW EVIDENCE SIGNALS]
   ├─ Sleep Debt (Wearable / Google Fit)
   ├─ Schedule Density (Calendar busy hours > 6h)
   ├─ Task Deferral Rate (Tasks postponed > 2 times)
   ├─ Calendar Fragmentation (Gaps < 30 mins between meetings)
   └─ Keystroke / Interaction Tempo (Desktop Activity)
                             │
                             ▼
              [COGNITIVE STATE ESTIMATOR]
               (Rule-Guided Multi-Factor Scorer)
                             │
                             ▼
           [STATE ESTIMATE + CONFIDENCE RATING]
   Stress: 0.78 (Conf: 0.85) | Energy: 0.32 (Conf: 0.90) | Load: High
                             │
            ┌────────────────┴────────────────┐
            ▼ (Confidence >= 0.70)            ▼ (Confidence < 0.70)
    [Update World Model]               [Micro-Checkin Prompt]
    Passive state update               "Energy seems low today. Scale 1-5?"
```

### Uncertainty-Driven Check-In Policy:
Aven asks an explicit question **only when confidence is below 0.70** or conflicting signals exist (e.g. 8h sleep logged, but high task deferrals and cancelled meetings). Maximum 1 micro-check-in per 24-hour cycle.

---

## 8. DEEP USER MODEL & PREFERENCE ENGINE

### 8.1 The 12-Dimensional User Representation
1. **Identity**: Name, accounts, communication tone.
2. **Explicit Preferences**: Hard constraints (e.g. *"Never schedule meetings before 10 AM"*).
3. **Learned Habits**: Observed recurring patterns (e.g. *"Usually takes lunch at 1:30 PM"*).
4. **Goals**: Active performance, identity, and maintenance goals.
5. **Constraints**: Acute incident constraints (e.g. *"Sprained wrist — suppress upper body gym"*).
6. **Relationships**: Key personal and professional stakeholders with influence weightings.
7. **Environment**: Primary OS, workstation paths, active location context.
8. **Execution Profile**: Velocity baseline (tasks/day), focus duration limit.
9. **Physical Baseline**: Resting HR, baseline sleep requirement, caloric maintenance.
10. **Cognitive Baseline**: Workload tolerance threshold, recovery latency curve.
11. **History**: Longitudinal record of completed projects, seasons, and eras.
12. **Adaptation Ledger**: Success rates of past Aven recommendations.

### 8.2 Preference Progression Hierarchy
* **Tier 1: Explicit User Command** (*"Do not book focus blocks on Friday"*). Permanently authoritative.
* **Tier 2: Candidate Learned Preference** (*"User rejected 4 morning meetings in a row"*). Aven prompts: *"You usually decline meetings before 10 AM. Should I make this a rule?"*
* **Tier 3: Observed Heuristic**. Used internally for soft scheduling ranking; never overrides Tier 1.

---

## 9. BEHAVIORAL & RELATIONSHIP MODELS

### 9.1 Behavioral Model Evolution
Enhance [`BehaviorProfile.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/learning/BehaviorProfile.ts) from a static singleton into a **dynamically calculated entity**:
* Track **Execution Consistency** = `actual_completed / scheduled_tasks` over rolling 7-day windows.
* Track **Task Procrastination Index** = frequency of `reschedule_occurrence` calls on high-priority tasks.
* Apply exponential decay ($\tau = 21\text{ days}$) via [`CadenceLearningEngine.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/temporal/cadence/CadenceLearningEngine.ts) so behavioral shifts update naturally.

### 9.2 Relationship Model Refactor
Replace the stub in [`RelationshipContextEngine.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/worldv2/RelationshipContextEngine.ts) with a MongoDB collection `user_relationships`:
* `personId`: Unique handle or email.
* `displayName`: *"Sarah (Cofounder)"*, *"Dr. Gupta"*.
* `relationshipType`: `"PROFESSIONAL"` | `"PERSONAL"` | `"MEDICAL"` | `"FAMILY"`.
* `priorityWeight`: 0.0 to 1.0 (used by calendar scheduler to protect slots with high-priority stakeholders).
* Integrated into existing entity resolution without creating a parallel resolver.

---

## 10. PHYSICAL HEALTH & NUTRITION ARCHITECTURE

Transition Health from isolated CRUD tables to a **Longitudinal Physical Engine**:

```
[Meal Ingestion: AI / Web Form] ──► Daily Totals (Calories, P/C/F, Micronutrients)
                                              │
[Workout Ingestion: Gym / Wearable] ──► Training Volume & Muscle Groups Worked
                                              │
[Sleep & Biometrics: Wearable API] ──► Rest Duration & Recovery Score
                                              │
                                              ▼
                             [PHYSICAL CAPACITY ESTIMATOR]
                              Calculates Physical Readiness (0-100)
                              Informs work/exercise scheduling
```

* **Core LifeOS Modules**: Meal & macro tracking, workout routine execution, body weight trajectory.
* **External Provider Responsibility**: Raw sensor collection (Apple HealthKit, Google Health Connect, Oura API).
* **Cross-Domain Impact**: Physical Readiness score directly constrains the daily work scheduler.

---

## 11. CROSS-DOMAIN INTELLIGENCE ENGINE

The cross-domain engine connects disparate life domains into causal reasoning trees:

```
[PHYSIOLOGY]              [EXECUTION]               [COGNITIVE]
Sleep: 4.2h (Debt: +3.8h)  Meetings: 6.5h            Focus Index: 0.28
HRV: -25% from baseline   Overdue Tasks: 5          Stress: 0.82
      │                         │                         │
      └─────────────────────────┼─────────────────────────┘
                                ▼
               [CROSS-DOMAIN REASONING GATEWAY]
               Identifies Multi-Factor Strain Pattern:
               "ACUTE_OVERLOAD_RISK" (Confidence: 0.92)
                                │
                                ▼
               [DETERMINISTIC KERNEL MITIGATION]
               1. Throttle afternoon focus tasks.
               2. Suggest shifting gym workout to active recovery walk.
               3. Proactively alert user via Aven voice briefing.
```

---

## 12. CLOSED-LOOP INTERVENTION & OUTCOME VERIFICATION

Every Aven suggestion or schedule adjustment is tracked as a first-class **Intervention**:

```
[Trigger Detected: Burnout Risk]
       │
       ▼
[Intervention Formulated: ID #int_8921]
 ├─ Action: Reschedule 2 non-urgent tasks & protect 1h rest block
 ├─ Expected Outcome: Focus index improves by >= 0.20 within 24 hours
 └─ Measurement Windows: T+4h, T+24h
       │
       ▼
[Kernel Execution with User Approval]
       │
       ▼
[Outcome Evaluator Daemon (T+4h, T+24h)]
 Compares actual user velocity & mental state against expected outcome
       │
       ▼
[LearningEngine Update]
 Records intervention success/failure; adapts future confidence weights
```

---

## 13. PROACTIVE ENGINE SPECIFICATION

Refactor [`ProactiveEngine.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/proactive/ProactiveEngine.ts) into an **Authoritative Policy-Driven Evaluator**:

### Autonomy Level Hierarchy:
* **Level 0 (Observe Only)**: Records anomalies in internal logs; zero user alerts.
* **Level 1 (Inform)**: Passive banner on dashboard (e.g. *"Hydration below daily target"*).
* **Level 2 (Recommend)**: Proactive suggestion with action button (e.g. *"Schedule an early night?"*).
* **Level 3 (Prepare)**: Pre-builds schedule changes as pending `ActionProposal`s awaiting 1-click confirmation.
* **Level 4 (Execute with Approval)**: Prompts user via voice/push: *"May I shift your 4 PM task to tomorrow?"*
* **Level 5 (Autonomous Safe Execution)**: Executes deterministic low-risk non-external tasks (e.g. re-indexing task priorities) within explicit user policy limits.

### Guardrails:
* **Cooldowns**: Maximum 1 unsolicited voice alert every 4 hours.
* **Quiet Hours**: Hard block between 10:00 PM and 7:30 AM (configurable).
* **Zero Kernel Bypass**: Every proactive action routes through `KernelCapabilityService`.

---

## 14. BACKGROUND RUNTIME ARCHITECTURE

Implement durable background processing across all 3 platforms:

```
[BACKEND / WEB / SERVER]
 Node.js Scheduled Cron / BullMQ / Mongo Change Streams
 ├─ T+15m: Wearable Telemetry Poll Daemon
 ├─ T+1h: Cross-Domain Strain Evaluator
 ├─ T+4h / T+24h: Intervention Outcome Verifier
 └─ 07:00 AM: Morning Briefing Synthesizer

[MOBILE (Expo / React Native)]
 Notifee ForegroundService + BackgroundFetch (OS-Native)
 ├─ Local notification dispatch
 ├─ Passive pedometer / Apple HealthKit sync
 └─ Silent push receiver for urgent Aven alerts

[DESKTOP (Tauri / Node Runtime)]
 Long-running OS tray daemon
 ├─ File watcher for local Obsidian / documents
 └─ Local stdio process management for Desktop MCP
```

---

## 15. THE MORNING JARVIS EXPERIENCE

The first flagship end-to-end proactive workflow:

```
07:15 AM: [Sleep Sensor Syncs 5.2h Sleep, Elevated Resting HR]
07:20 AM: [Background Daemon Computes KernelSnapshot: Physical Readiness = 48/100]
07:30 AM: [User Picks Up Phone or Opens Desktop]
              │
              ▼
[Aven Voice Briefing Initiates (or Push Notification Arrives)]
 "Good morning Daksh. You had 5.2 hours of sleep last night and recovery is lower than normal.
  You have 5 meetings today and your investor deck deadline. 
  I've protected your 10 AM focus window for the deck, but I recommend we postpone your 
  heavy leg workout to tomorrow and move our 4 PM check-in. 
  Would you like me to adjust the schedule?"
              │
              ▼
[User Says: "Yes, go ahead"] ──► Kernel executes batch schedule repair in 40ms.
```

---

## 16. VOICE & NOTIFICATION ARCHITECTURE

* **Voice as an I/O Modality**: Voice is strictly an audio interface for Aven. **No separate VoiceBrain or VoiceAgent is created**.
* **Audio Pipeline**:
  - Input: Client WebRTC / Expo Audio Recorder -> Whisper API -> Text
  - Cognitive Core: Supervisor -> Semantic Intent -> Kernel
  - Output: Text Chunk Stream -> Fast TTS (Edge-TTS / ElevenLabs) -> Client Audio Stream + Reactive Orb
* **Push Notifications**: Filtered through the Proactive Engine's rate-limiter and quiet-hours policy.

---

## 17. LANGGRAPH INTEGRATION STRATEGY

### Architectural Principle:
**LangGraph is the Cognitive State Machine; the Sovereign Kernel is the Execution Authority.**

```
[User Input] ──► [LangGraph StateGraph Engine]
                   ├─ Dynamic Router Node
                   ├─ Parallel Specialist Nodes (Productivity, Health, Mind)
                   ├─ Synthesis & Conflict Resolver Node
                   └─ Human-In-The-Loop Interrupt Gate (Native interrupt())
                             │
                             ▼ (Outputs ActionProposal[])
                 [KernelCapabilityService]
                  Sovereign Execution Gate
                  (Validates, Idempotency Checks, Mutates DB)
```

### The Controlled LangGraph Pilot:
* **Scope**: Pilot LangGraph strictly on the **Deliberative Reasoning Flow** (replacing [`ReActOrchestrator.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/react/ReActOrchestrator.ts)), leaving the Fast-Path and direct Semantic Operations paths intact.
* **Benchmark Metrics**:
  - State Transition Latency: Must be $\le 25\text{ ms}$ overhead.
  - Replay Determinism: Graph must accept pre-recorded state snapshots for 100% deterministic test replay.
  - Memory Footprint: Monitored in Node.js process heap.

### Decision Gate:
* **Adopt Limited Scope (Cognitive Workflows Only)**. Do **NOT** use LangGraph to execute tools or mutate MongoDB directly.

---

## 18. MCP INTEGRATION STRATEGY

### Architectural Principle:
**MCP is an optional transport provider behind the capability boundary, NOT the universal integration architecture.**

```
[ActionProposal: external_capability_action]
                    │
                    ▼
       [KernelCapabilityService]
                    │
                    ▼
     [ExternalCapabilityRouter]
      ├─ Latency-Critical Core Services ──► [Native REST Adapter] (Google Cal, Gmail, GitHub)
      ├─ Local Desktop Tooling         ──► [Desktop Stdio MCP] (Local Filesystem, Brave Search)
      └─ Standard Cloud Ecosystem      ──► [Remote SSE MCP Client] (Modular Tools)
```

### The Controlled MCP Pilot:
* **Scope**: Migrate **Brave Web Search** and **Desktop Local Filesystem** to official MCP servers ([`@modelcontextprotocol/server-filesystem`](https://github.com/modelcontextprotocol/servers)).
* **Benchmark vs. Native**:
  - Cold-start connection latency.
  - Multi-tenant credential injection safety.
  - Error serialization on timeout (`UNKNOWN_EXTERNAL_STATE`).
* **Core Retention**: Keep Google Calendar and Gmail on native, highly tuned REST adapters to avoid multi-tenant auth complexities.

### Decision Gate:
* **Adopt as Provider Option**. Use MCP where mature servers exist; keep core life APIs native.

---

## 19. EXTERNAL ADAPTER MODULARIZATION PLAN

Decompose the monolithic 3,838-line [`ExternalCapabilityAdapter.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/kernel/ExternalCapabilityAdapter.ts) into clean, modular providers:

```
packages/execution-kernel/src/orchestration/external/
├── providers/
│   ├── google/
│   │   ├── GoogleCalendarProvider.ts
│   │   ├── GmailProvider.ts
│   │   ├── GoogleDriveProvider.ts
│   │   └── GoogleOAuthManager.ts
│   ├── github/
│   │   └── GitHubProvider.ts
│   ├── spotify/
│   │   └── SpotifyProvider.ts
│   ├── weather/
│   │   └── OpenMeteoProvider.ts
│   ├── mobility/
│   │   └── DeepLinkDispatcher.ts (Uber, Zomato, Swiggy)
│   └── mcp/
│       ├── McpClientManager.ts
│       └── McpToolAdapter.ts
└── ExternalCapabilityGateway.ts (Lean router < 300 lines)
```

---

## 20. REAL-SYSTEM TESTING TRANSFORMATION

Eliminate mock-induced false confidence while preserving fast deterministic unit tests:

| Test Tier | Target System | Execution Engine | Validation Criteria |
| :--- | :--- | :--- | :--- |
| **Tier 1: Unit & Invariant** | Kernel rules, solvers | In-Memory / tsx | Pure mathematical determinism, $\le 5\text{ ms}$/test. |
| **Tier 2: Real Database** | Adapters, Ledgers, World Model | Real MongoDB Test DB | Real BSON serialization, unique index collision handling. |
| **Tier 3: Real LLM Ingestion** | Semantic interpreter, Aven persona | Real Groq / Gemini API | Checks schema conformity across 100 colloquial variations. |
| **Tier 4: Live Provider Integration** | Google Calendar, Gmail | Live Test Accounts | Verifies actual OAuth refresh and real external event creation. |
| **Tier 5: Longitudinal Simulation** | Multi-day life progression | Simulated Time Advance | Validates behavioral decay, habit updates, and state recovery. |

---

## 21. LONGITUDINAL SIMULATION ENGINE

Build an automated multi-day life simulator to test closed-loop adaptation:

```
[Simulation Framework]
Day 1: Ingests 4.5h sleep -> Observes high stress -> Aven recommends schedule lightening.
Day 2: Simulates user accepting recommendation -> Measures task completion recovery.
Day 3: Ingests heavy workout -> Evaluates physical strain.
Day 4: Verifies whether LearningEngine adjusted personal velocity baseline downwards.
```
* **Constraint**: Simulation runs against production database models and kernel adapters; zero artificial mocks.

---

## 22. CROSS-PLATFORM IMPLEMENTATION MATRIX

| Architectural Function | Web (`apps/web`) | Mobile (`apps/mobile`) | Desktop (`packages/desktop-runtime`) |
| :--- | :--- | :--- | :--- |
| **Primary Role** | Dashboard & In-Depth Analytics | Voice, Real-Time Alerts, Camera | High-Performance Shell & Local OS |
| **Background Runtime** | Serverless / Cron Jobs | Notifee Foreground Service | Persistent System Tray Daemon |
| **Wearable Telemetry** | Cloud API Sync (Google / Oura) | Native Apple HealthKit / Health Connect | Imported via Cloud Sync |
| **Voice Interface** | WebRTC / MediaRecorder | Native Expo Audio + Whisper | Native Desktop Microphone Capture |
| **MCP Execution** | Remote SSE MCP Clients | Remote SSE MCP Clients | Local Subprocess Stdio MCP Servers |
| **Credential Storage** | MongoDB `CredentialVault` (AES) | Expo SecureStore + JWT | OS Keychain / DPAPI |

---

## 23. DATA GOVERNANCE & SOURCE-OF-TRUTH RULES

* **LifeOS Authoritative**: Tasks, Goals, Temporal Occurrences, Behavioral Profiles, Interventions.
* **External Authoritative**: Google Calendar events, Wearable biometric samples, Gmail threads.
* **Derived / Ephemeral**: `LifeState` estimates, Cognitive load scores, Dynamic schedule proposals.
* **Conflict Resolution**: If an external calendar event is modified outside LifeOS, Google Calendar wins; the kernel generates a `ScheduleConflict` incident and alerts Aven.

---

## 24. USER AUTONOMY & RISK CLASSIFICATION

All actions are classified into deterministic risk tiers:
* **Low Risk (Auto-executable under policy)**: Re-ranking task priorities, fetching read-only calendar events, logging passive telemetry.
* **Medium Risk (Prepare & Prompt)**: Moving internal task deadlines, proposing new workout times.
* **High Risk (Strict Confirmation Required)**: Deleting calendar events, sending external emails, creating GitHub issues, modifying external appointments.
* **Irreversible External (Double Confirmation)**: Financial transactions, booking rides, un-recallable communications.

---

## 25. PERFORMANCE ENGINEERING BUDGETS

| Flow / Metric | Target P50 | Target P95 | Target P99 | Strategy to Preserve Latency |
| :--- | :--- | :--- | :--- | :--- |
| **Early Semantic Filler** | $\le 120\text{ ms}$ | $\le 180\text{ ms}$ | $\le 250\text{ ms}$ | Lightweight concurrent Groq call ([`FastSemanticFiller.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/semantic/FastSemanticFiller.ts)). |
| **Semantic Intent Interpretation** | $\le 250\text{ ms}$ | $\le 450\text{ ms}$ | $\le 750\text{ ms}$ | Strict JSON schema generation with Groq `qwen3.8-27b`. |
| **Kernel Batch Execution** | $\le 25\text{ ms}$ | $\le 60\text{ ms}$ | $\le 120\text{ ms}$ | In-memory validation, indexed MongoDB writes. |
| **Native REST Provider Call** | $\le 350\text{ ms}$ | $\le 650\text{ ms}$ | $\le 1200\text{ ms}$ | HTTP/2 persistent connection pooling, proactive token refresh. |
| **MCP Tool Call Overhead** | $\le 40\text{ ms}$ | $\le 90\text{ ms}$ | $\le 180\text{ ms}$ | Long-lived persistent SSE connections; avoid per-call process spawning. |
| **LangGraph Transition** | $\le 15\text{ ms}$ | $\le 25\text{ ms}$ | $\le 40\text{ ms}$ | In-process compiled StateGraph, zero heavy intermediate chains. |

---

## 26. ORDERED IMPLEMENTATION ROADMAP (PHASES 0 TO 15)

The implementation roadmap is rigorously ordered by architectural dependency:

```
[Phase 0: Baseline Characterization]
         │
         ▼
[Phase 1: Unified World Model Bridge] ──► Bridges WorldModelV2 into Supervisor
         │
         ▼
[Phase 2: Observation & Telemetry Pipeline] ──► Ingests Wearable & System Events
         │
         ▼
[Phase 3: Passive Cognitive State Estimator] ──► Calculates Stress, Energy, Load
         │
         ▼
[Phase 4: Deep User Model & Preferences] ──► Explicit vs Learned Preferences
         │
         ▼
[Phase 5: Behavioral & Relationship Models] ──► Velocity & Stakeholder Weighting
         │
         ▼
[Phase 6: Cross-Domain Intelligence Gateway] ──► Correlates Health + Work + Mind
         │
         ▼
[Phase 7: Closed-Loop Intervention Ledger] ──► Measures 4h & 24h Outcome Success
         │
         ▼
[Phase 8: Active Proactive Engine] ──► Background Event & Anomaly Evaluator
         │
         ▼
[Phase 9: Flagship Morning Jarvis Experience] ──► First Proactive User Touchpoint
         │
         ▼
[Phase 10: Controlled LangGraph Pilot] ──► Cognitive State Machine Evaluation
         │
         ▼
[Phase 11: Controlled MCP Pilot] ──► Local Desktop Tooling & Search Evaluation
         │
         ▼
[Phase 12: External Adapter Decomposition] ──► Modularizes 3,838-line monolith
         │
         ▼
[Phase 13: Real-System End-to-End Hardening] ──► Replaces Mock Testing with Reality
         │
         ▼
[Phase 14: Longitudinal Multi-Day Simulation] ──► Validates 30-Day Life Adaptation
         │
         ▼
[Phase 15: Controlled Autonomous Life Management] ──► Production Multi-Platform Release
```

---

## 27. LOOP-ENGINEERED PHASE SPECIFICATIONS

Every phase follows the canonical loop: **IMPLEMENT → TEST → OBSERVE → DIAGNOSE → REPAIR → RETEST → AUDIT**.

### Phase 0: Reality Baseline & Characterization
* **Objective**: Measure exact baseline latency, token usage, test suite duration, and failure rates across all existing production paths.
* **Why**: Establishes undeniable empirical benchmarks before modifying architectural connections.
* **Current State**: Characterization test scripts exist in `packages/execution-kernel/test/characterization/`.
* **Deliverables**: Comprehensive `BASELINE_CHARACTERIZATION_REPORT.json`.

### Phase 1: Unified World Model Bridge
* **Objective**: Connect analytical `WorldModelV2` into `Supervisor.processRequest`.
* **Why**: Eliminates the "Two Disjointed Brains" gap; allows Aven to speak with knowledge of user life state.
* **Architectural Changes**: Update `Supervisor.processRequest` to call `WorldModelV2.computeKernelSnapshot()` and inject the snapshot into `SemanticIntentInterpreter` context.
* **Data Model Changes**: None (uses existing `KernelSnapshot` interface).
* **Acceptance Criteria**: A user asking *"What's my current state?"* receives a calm response citing active goal pressure and life state directly from `WorldModelV2`.

### Phase 2: Observation & Telemetry Pipeline
* **Objective**: Implement durable background ingestion for external observations.
* **Why**: Stops LifeOS from depending solely on explicit user conversational turns.
* **Architectural Changes**: Create `DurableTelemetryQueue` (following `DurableMemoryJobQueue` pattern) to normalize and ingest wearable and calendar events into `ObservationRecord[]`.
* **Acceptance Criteria**: Ingesting a mock Apple Health sleep record updates `WorldModelV2` observation store within 500ms without user interaction.

### Phase 3: Passive Cognitive State Estimator
* **Objective**: Infer stress, energy, and cognitive load from sleep debt, calendar fragmentation, and task deferral velocity.
* **Why**: Replaces manual 1–10 check-in forms.
* **Architectural Changes**: Implement `CognitiveStateEstimator` in `packages/execution-kernel/src/worldv2/`.
* **Acceptance Criteria**: A sequence of 4 deferred tasks + 5h sleep automatically produces a `stressEstimate >= 0.75` and `energyEstimate <= 0.35` with explicit evidence references.

### Phase 4: Deep User Model & Preferences
* **Objective**: Build the 12-dimensional user profile with explicit distinction between explicit rules and learned heuristics.
* **Why**: High-performance users require hard guarantees that their explicit rules are never overridden.
* **Architectural Changes**: Enhance `User.preferences` in MongoDB; implement candidate learned preference proposal pipeline.
* **Acceptance Criteria**: Rejecting morning tasks 4 times triggers Aven to ask if 10 AM should become a permanent preference.

### Phase 5: Behavioral & Relationship Models
* **Objective**: Real-time velocity decay tracking and stakeholder prioritization.
* **Why**: Replaces hardcoded singletons in `BehavioralProfile.ts` and `RelationshipContextEngine.ts`.
* **Data Model Changes**: Create `UserRelationship` MongoDB schema.
* **Acceptance Criteria**: High-priority stakeholders automatically receive schedule protection in `ScheduleSolver`.

### Phase 6: Cross-Domain Intelligence Gateway
* **Objective**: Implement causal multi-domain strain detection (Health + Work + Mind).
* **Why**: The core LifeOS differentiator against frontier lab chatbots.
* **Architectural Changes**: Implement `CrossDomainGateway` in kernel evaluating cross-subsystem tension.
* **Acceptance Criteria**: Poor sleep + high meeting load automatically triggers `ACUTE_OVERLOAD_RISK` diagnosis.

### Phase 7: Closed-Loop Intervention & Outcome Ledger
* **Objective**: Track every schedule repair and recommendation with T+4h and T+24h verification.
* **Why**: Turns LifeOS into an adaptive operating system that learns which interventions actually work.
* **Data Model Changes**: Create `InterventionRecordModel` in MongoDB.
* **Acceptance Criteria**: After protecting a focus block, the system records whether the associated task advanced within 24 hours.

### Phase 8: Active Proactive Engine
* **Objective**: Transform `ProactiveEngine.ts` into an active, policy-driven background daemon.
* **Why**: Enables Aven to speak first without user prompting.
* **Architectural Changes**: Implement rate-limiting, quiet-hours filtering, and autonomy level enforcement.
* **Acceptance Criteria**: Proactive suggestions trigger within autonomy limits; zero alerts violate quiet hours.

### Phase 9: Flagship Morning Jarvis Experience
* **Objective**: Ship the end-to-end morning voice briefing and schedule optimization workflow.
* **Why**: The single most compelling user-visible manifestation of "Jarvis".
* **Acceptance Criteria**: Opening the app at 7:30 AM delivers a 60-second personalized audio briefing aligning the day's tasks with sleep recovery.

### Phase 10: Controlled LangGraph Pilot
* **Objective**: Pilot `@langchain/langgraph` on the deliberative specialist reasoning flow.
* **Why**: Evaluates whether graph state machines simplify multi-agent synthesis without degrading latency.
* **Acceptance Criteria**: LangGraph StateGraph executes within 25ms of current custom `ReActOrchestrator` while supporting resumable interrupts.

### Phase 11: Controlled MCP Pilot
* **Objective**: Pilot MCP on Brave Web Search and Desktop Filesystem tools.
* **Why**: Tests ecosystem tool integration without risking core calendar/email workflows.
* **Acceptance Criteria**: Desktop MCP subprocess executes filesystem reads reliably behind `KernelCapabilityService` authorization.

### Phase 12: External Adapter Decomposition
* **Objective**: Refactor the 3,838-line `ExternalCapabilityAdapter.ts` into modular provider classes.
* **Why**: Eliminates massive technical debt and enables clean test isolation.
* **Acceptance Criteria**: All 51 kernel tests pass with zero regression; provider files are under 400 lines each.

### Phase 13: Real-System End-to-End Hardening
* **Objective**: Replace `MockScriptedLLM` and mock databases in master scenario tests with live test database and real model runs.
* **Why**: Eliminates false confidence and validates true production resilience.
* **Acceptance Criteria**: Master scenario suite passes against real MongoDB Atlas and live Groq/Gemini endpoints.

### Phase 14: Longitudinal Multi-Day Simulation
* **Objective**: Run 30-day life progression simulation with accelerated time.
* **Why**: Empirically proves that behavioral adaptation and habit learning stabilize over time.
* **Acceptance Criteria**: 30-day simulated run demonstrates personal velocity convergence and zero memory leaks.

### Phase 15: Controlled Autonomous Life Management
* **Objective**: Production roll-out across Web, Mobile, and Desktop with full user autonomy controls.
* **Why**: Delivers the complete Sovereign Personal Operating System to end users.
* **Acceptance Criteria**: Beta users successfully operate with Aven across calendar, tasks, and health with zero critical governance violations.

---

## 28. ACCEPTANCE TEST SUITE (10 END-TO-END JOURNEYS)

1. **Journey 1 (Morning Briefing)**: User wakes up -> Sleep telemetry ingested -> Aven voice briefing delivers schedule recommendations based on recovery -> User accepts -> Calendar updated.
2. **Journey 2 (Workday Overload)**: Calendar meetings exceed 7 hours -> Overload detected -> Non-critical tasks deferred -> User notified calmly.
3. **Journey 3 (Health-Aware Scheduling)**: Leg workout logged in gym -> Leg fatigue recorded -> Long running workout tomorrow automatically adjusted to light recovery.
4. **Journey 4 (Passive Cognitive Estimation)**: User postpones 3 tasks in 2 hours -> Energy score drops -> Aven prompts for a 5-minute break.
5. **Journey 5 (Cross-Domain Correlation)**: User asks *"Why am I tired?"* -> Aven correlates late bedtime with 3 alcohol units and high meeting volume.
6. **Journey 6 (Proactive Intervention)**: Urgent deadline approaching with insufficient calendar buffer -> Aven proactively suggests rescheduling an internal meeting.
7. **Journey 7 (Outcome Verification)**: Focus block protected -> T+4h check verifies task marked completed -> Intervention scored successful.
8. **Journey 8 (Longitudinal Adaptation)**: User consistently ignores afternoon focus blocks -> System shifts focus recommendations to morning hours.
9. **Journey 9 (External MCP Capability)**: User asks to inspect local codebase directory -> Desktop MCP executes read behind user approval gate.
10. **Journey 10 (LangGraph Resumability)**: Multi-step planning flow paused awaiting user confirmation -> State persisted in checkpointer -> Resumed seamlessly 2 hours later.

---

## 29. DEFINITION OF "JARVIS READY"

LifeOS is declared **Jarvis Ready** when:
* **Persistent Identity**: Zero mechanical jargon in 100 consecutive colloquial user turns.
* **Continuous Awareness**: World model updates within 5 minutes of any external wearable or calendar event.
* **Passive Inference**: Mental state inferred with $\ge 80\%$ correlation to manual check-in scores.
* **Proactivity**: Aven initiates morning briefing within 60 seconds of user device wake-up.
* **Closed-Loop Adaptation**: Demonstrates measurable heuristic updates following intervention verification.
* **Sovereignty**: Zero unapproved high-risk external side effects in 1,000 stress turns.

---

## 30. WHAT NOT TO BUILD (THE EXCLUSION LIST)

* **No Foundation Model Training**: Rely exclusively on frontier models via clean adapters.
* **No Generic Browser Virtual Machines**: Avoid competing with OpenAI/Anthropic cloud VMs.
* **No Generic Coding Agent**: LifeOS is for personal life management, not software engineering.
* **No Medical Diagnostic Capabilities**: Explicitly disclaim medical diagnosis; focus on non-clinical operational readiness.
* **No Duplicate Planners or Second Brains**: All planning routes through `ScheduleSolver` and `ExecutionGraph`.

---

## 31. STRATEGIC DECISION GATES

### LangGraph Decision Gate:
* **Recommendation**: **YES — LIMITED SCOPE (Cognitive State Machine Only)**.
* **Rationale**: LangGraph provides excellent resumable state machines for deliberative multi-agent workflows, but must **never** be given direct database or external side-effect execution rights.

### MCP Decision Gate:
* **Recommendation**: **YES — PROVIDER OPTION (Behind Capability Boundary)**.
* **Rationale**: MCP is valuable for local desktop tools and specialized search, but core multi-tenant OAuth workflows (Google Calendar, Gmail) must remain native to maintain latency and token-refresh reliability.

---

## 32. FINAL STRATEGIC DIRECT ANSWERS (A THROUGH T)

### A. Minimum architecture to unify the two brains?
Inject `WorldModelV2.computeKernelSnapshot(userId)` into `Supervisor.processRequest` context.

### B. Canonical LifeOS World Model?
An evolved, unified `WorldModelV2` owning physical, execution, cognitive, and environmental state.

### C. How should Aven consume it?
As an immutable read-only context projection passed into `SemanticIntentInterpreter` and specialist prompts.

### D. How should background observations update it?
Through a durable MongoDB-backed queue (`DurableTelemetryQueue`) consumed by `WorldModelV2.ingestObservationBatch()`.

### E. How should mental state be inferred without tedious check-ins?
Passively derived from sleep debt, schedule density, task deferral velocity, and calendar fragmentation.

### F. How should behavioral learning work?
Through exponential recency decay ($\tau = 21\text{ days}$) updating rolling velocity and consistency baselines.

### G. How should interventions be measured?
Via `InterventionRecordModel` checking actual user task progress and recovery metrics at T+4h and T+24h.

### H. How should Aven become proactive without becoming unsafe?
By operating behind strict rate limits, quiet hours, deterministic risk classes, and kernel validation.

### I. What should be autonomous?
Internal priority re-ranking, telemetry normalization, state estimation, and read-only schedule preparation.

### J. What must always require approval?
Modifying external calendar commitments, sending emails, deleting data, and financial transactions.

### K. Where does LangGraph genuinely help?
In complex, deliberative, multi-agent reasoning loops and resumable human-in-the-loop workflows.

### L. Where should LangGraph NOT be used?
Direct database writes, fast-path command execution, idempotency ledgering, and external tool execution.

### M. Where does MCP genuinely help?
In desktop local filesystem exploration, modular search tools, and third-party developer extensions.

### N. Which integrations should remain native?
Google Calendar, Gmail, GitHub, and mobile deep links (Uber, Zomato, Swiggy).

### O. Which integrations are good MCP candidates?
Local desktop filesystem tools, Brave Search, and future home automation modules.

### P. How do we preserve latency?
By preserving the fast semantic direct path, utilizing concurrent semantic fillers, and maintaining persistent transport pools.

### Q. How do we eliminate false completeness?
By auditing and either connecting or deprecating every orphaned model (`RelationshipContextEngine`, `ProactiveEngine`).

### R. How do we replace mock confidence with real-system confidence?
By testing against real MongoDB Atlas databases, live LLM API endpoints, and live provider test accounts.

### S. What is the smallest genuinely compelling Jarvis version?
A system that **wakes the user with a 60-second voice briefing**, aligning their day's tasks with real sleep recovery and offering 1-click schedule optimization.

### T. What is the safest path from today's LifeOS to that version?
Executing **Phases 0 through 9** in strict dependency order without rewriting the core kernel foundation.
