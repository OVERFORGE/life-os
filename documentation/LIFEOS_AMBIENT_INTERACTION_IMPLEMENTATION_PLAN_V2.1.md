# LIFEOS AMBIENT INTERACTION LAYER
## MASTER IMPLEMENTATION PLAN (VERSION 2.1.1)
### Final Pre-Implementation Consistency Pass — Authoritative Implementation Blueprint
#### Cross-Platform Ambient Presence, Sovereign Ingress Membrane, and Local Wake-Word ("Aven" / "Hey Aven") Architecture

> **DOCUMENT VERSION**: 2.1.1-FINAL-CONSISTENCY-PASS  
> **STATUS**: AUTHORITATIVE IMPLEMENTATION BLUEPRINT (PLAN-FIRST / ZERO CODE MODIFIED)  
> **GOVERNANCE BOUNDARY**: Sovereign Ingress Facade over KernelCapabilityService / WorldModelV2 / Supervisor / Aven  
> **DATE**: October 2026  
> **TARGET RUNTIMES**:
> - **Mobile**: Android (API 31–35, Jetpack Glance, Notifee, Headless `BroadcastReceiver`, Quick Settings Tile) & iOS (WidgetKit, App Intents, Live Activities, Dynamic Island)
> - **Desktop**: Tauri v2 (Rust Core, Native System Tray, Global Shortcuts, Frameless Spotlight HUD, Audio Thread)
> - **Web**: Next.js 15+ App Router (Turbopack, Service Worker Web Push, SSE, Sticky Executive Bar, Cmd+K Palette)
> - **Backend / Kernel**: Node.js v22+, TypeScript 5.7+, MongoDB Atlas, Sovereign `KernelCapabilityService`, `WorldModelV2`, `Aven Supervisor`

---

## 1. EXECUTIVE SUMMARY

LifeOS has completed its comprehensive Jarvis backend transformation (Phases 0–15). The system is built around core cognitive foundations:
- Authoritative context projection via `WorldModelBridge` (engineering target: sub-5ms hydration, $\le 250$ token footprint).
- Multi-factor causal reasoning via `CrossDomainIntelligenceEngine`.
- Sub-180ms conversational voice responsiveness target via `FastSemanticFiller`.
- Unified temporal planning via `TemporalTimelineEngine` and `ScheduleSolver`.
- Deterministic execution, auditability, and replay via `KernelCapabilityService` and `ExecutionChronicle`.

*(Note: In accordance with our metric classification standard, latency, token budgets, and detection rates are explicitly defined as **engineering budgets** and **experimental hypotheses** that require real-device benchmarking during implementation).*

### The Core UX Pathology
Despite this computational power, **LifeOS remains trapped in an administrative "destination app" paradigm.** To perform high-frequency life actions—such as starting a scheduled focus block, acknowledging a proactive intervention, completing a task, or asking Aven a fast question—the user is forced to unlock their device, navigate menus, wait for framework hydration, and report their state. LifeOS behaves like an administrative portal the user must attend to, rather than an intelligent companion that participates in their day.

### The Ambient Interaction Objective
> Transform LifeOS from a destination application into a frictionless, platform-native ambient presence: present when useful, completely invisible when unnecessary, accessible in $\le 1$ tap or by saying "Aven" / "Hey Aven", operating with zero second brains, zero battery-wasting polling, and absolute kernel sovereignty.

### What Version 2.1.1 Surgically Hardens
1. **Separates Logical Action Identity from Observed Projection Version**:
   - `idempotencyKey` represents the **logical client action identity** (e.g. `SHA-256(userId + actionType + entityId + (instanceSeed ?? occurrenceId))`).
   - `observedProjectionVersion` is supplied separately as an optimistic concurrency/staleness context field. Two devices tapping `[Done]` simultaneously at different projection versions now resolve to the exact same idempotency key and yield **at most one authoritative mutation**.
2. **Eliminates Generic Type Escape Hatches (Zero `any`)**:
   - Replaces `Record<string, string | number | boolean>` with fully discriminated, strongly typed `InterventionActionProposal` contracts.
3. **Decouples Wake-Word Provider from Architecture**:
   - Replaces provider-specific file paths (`SherpaWakeWordService.kt`, `sherpa-onnx-sys`) with provider-agnostic `LocalWakeWordService` and `IWakeWordEngine` contracts. Sherpa-ONNX, Picovoice Porcupine, and OpenWakeWord remain candidate engines evaluated empirically in Phase 11.
4. **Clarifies Freshness Windows as Policy Defaults**:
   - Freshness windows (such as $[-15\text{m}, +60\text{m}]$ for execution start) are formally defined as **capability-specific policy defaults** evaluated by the kernel, not immutable constitutional laws.
5. **Enforces Truthful Offline Reconciliation**:
   - The test oracle guarantees durable pending intent, deterministic ordering, idempotent retry, and zero silent data loss—without making the false assumption that every offline action will blindly commit if external state drifted.
6. **Honest Platform Capability Classification**:
   - Every capability in the platform matrix is strictly audited: unverified items (such as iOS App Intents background networking or headless `BroadcastReceiver` execution while process is dead) are transparently marked as `REQUIRES PLATFORM SPIKE`.
7. **Decouples Test Oracles from Transport Assumptions**:
   - The primary test oracle for headless actions is the authoritative kernel state transition and immutable `ExecutionChronicle` entry; HTTP status is verified separately as transport behavior.

---

## 2. CONSTITUTIONAL INVARIANTS & THE MEMBRANE PRINCIPLE

Every component designed in this blueprint is bound by the following non-negotiable architectural invariants:

```
                    LIFEOS
                       │
                 WORLD MODEL
                       │
                      AVEN
                       │
          ┌────────────┴────────────┐
          │                         │
     INTELLIGENCE               EXECUTION
          │                         │
          └────────────┬────────────┘
                       │
             AMBIENT INTERACTION
           (Projection & Ingress)
                       │
       ┌───────────────┼────────────────┐
       │               │                │
     MOBILE          DESKTOP           WEB
       │               │                │
    Widget         Tray / HUD        App / PWA
    Notify         Hotkey            Cmd+K
    Voice          Voice             Voice
    Wake           Wake              —
       │               │                │
       └───────────────┼────────────────┘
                       │
                CANONICAL ACTION
                       │
                  KERNEL GATE
             (KernelCapabilityService)
                       │
                    REALITY
                  (MongoDB)
                       │
                 WORLD MODEL
                       │
                      AVEN
```

### The Ten Invariants

1. **The Membrane Principle (Zero Second Brain)**:  
   The Ambient Interaction Layer is strictly a **projection and ingress membrane**, NOT an independent intelligence system. It must **NEVER** become:
   - another brain
   - another planner
   - another scheduler
   - another task manager
   - another memory system
   - another semantic interpreter
   - another autonomy engine
   - another source of truth
   - another conversational architecture
   - another domain reasoning layer
2. **Sovereign Kernel Authority**:  
   No interaction surface may ever write directly to MongoDB, invoke internal service classes directly, or bypass `KernelCapabilityService.ts`. Every state-changing user interaction must be encapsulated as an `ISurfaceActionEnvelope` and routed to the sovereign kernel gate.
3. **Presentation-Only Projection (`IInteractionSurfaceProjection`)**:  
   The projection received by client surfaces is read-only, ephemeral, reconstructable, and versioned. Clients render; they do not calculate scheduling constraints, task rankings, or cadence rules.
4. **Preference for Event-Driven / OS-Managed Updates Over Polling**:  
   Periodic background network polling (such as the legacy 15s `setInterval` prototype in `apps/mobile/utils/persistentNotification.ts`) is strictly banned. State propagation relies on silent push data messages (FCM/APNs), local OS-managed exact alarms, or foreground SSE streams.
5. **Dynamic De-Escalation & Silence as a First-Class Success State**:  
   When LifeOS has nothing useful or urgent to communicate, **it does nothing**. Active execution surfaces appear strictly while a task or focus block is actively running and auto-dismiss upon completion. Silence is a valid, desirable system state.
6. **Local Wake-Word Privacy**:  
   Acoustic wake-word detection for **"Aven"** and **"Hey Aven"** must execute 100% locally on-device. Audio buffers are held transiently in RAM (overwritten every 2.0s) and never streamed to any cloud server prior to verified local keyword activation.
7. **Capability-Specific Reversibility (No Universal Undo Assumption)**:  
   Surfaces only expose an `[Undo]` action if the kernel explicitly returns an active `undoToken`. Irreversible external actions (e.g., external calendar invitations, physical emails, financial commits) are handled via capability-specific compensation or confirmation gates.
8. **Headless Execution (Android 12+ Trampoline Compliance)**:  
   Notification action taps (`[Start]`, `[Done]`, `[Later]`) are processed by a native Kotlin `BroadcastReceiver` (`TaskActionReceiver.kt`) executing an HTTP call directly to `/api/kernel/dispatch` without launching the React Native JS runtime or `MainActivity`.
9. **Single Conversational Mind**:  
   All quick conversational access points (widget mic, Quick Settings tile, desktop Spotlight HUD, wake word) route into the exact same backend `Supervisor.ts` and `ConversationService.ts` pipeline. No surface-specific chatbots or regex intent parsers are permitted.
10. **Pre-Filtered Proactive Interventions**:  
    No surface may independently generate notifications. All proactive prompts must be evaluated and authorized by the backend `InterruptionCostEvaluator` and `NotificationFatigueFilter` before entering the push distribution pipeline.

---

## 3. PRODUCT VISION & INTERACTION PHILOSOPHY

> **"LifeOS should participate in the user's day rather than behaving like an administrative application that the user must repeatedly report to."**

LifeOS operates on four core interaction verbs:
- **Glance**: Passive temporal awareness without touching the device. Answer *"What matters now?"* in $< 500\text{ms}$.
- **Tap**: Instant headless execution. Tap `[Start]`, `[Done]`, `[Later]`, or `[Undo]` in $\le 1$ tap on the lock screen or menu bar without app navigation.
- **Summon**: Instant conversational entry. Press `Ctrl+Alt+Space` or tap the widget mic to talk to Aven with sub-180ms voice latency.
- **Speak**: Completely hands-free invocation. Say *"Aven"* or *"Hey Aven"* while typing, cooking, or waking up to trigger focused execution without manual interaction.

---

## 4. RELATIONSHIP TO JARVIS TRANSFORMATION ARCHITECTURE

The Ambient Interaction Layer maps directly onto the authoritative 4-tier Jarvis architecture established in `LIFEOS_JARVIS_MERGED_15_PHASE_IMPLEMENTATION_PLAN_V2.1`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. INTELLIGENCE (Semantic, Probabilistic, Deliberative)                     │
│    - Aven / SemanticIntentInterpreter                                      │
│    - Specialist Agents (ProductivityAgent, HealthAgent, WellnessAgent)      │
│    - FastSemanticFiller (< 180ms conversational filler budget)              │
│    ROLE: Interprets voice/text from quick surfaces; proposes actions.       │
│    INVARIANT: Zero execution authority. Proposes ActionProposals only.      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (Emits ActionProposal[])
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. GOVERNANCE (Deterministic, Policy, Safety, Verification)                 │
│    - AutonomyPolicyManager (6-Tier Autonomy Matrix)                         │
│    - InterruptionCostEvaluator & NotificationFatigueFilter                  │
│    - AutonomousActionReverser (Capability-specific reversibility)           │
│    ROLE: Decides if an ambient action or notification is authorized.        │
│    INVARIANT: Enforces policy contracts; never parses language.             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (Authorized Command)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. EXECUTION (Sovereign Authority Boundary)                                 │
│    - KernelCapabilityService                                                │
│    - Modular Action Adapters (Native REST & External Capability Adapters)   │
│    ROLE: SOLE system permitted to mutate state or execute side effects.     │
│    INVARIANT: 100% of committed mutations recorded in ExecutionChronicle.   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (Committed State & Event Stream)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. TRUTH (Authoritative State of Record)                                    │
│    - WorldModelV2 & WorldModelBridge (Unified Context Projection)           │
│    - ExecutionChronicle (Immutable Execution Event Stream)                  │
│    - Authoritative MongoDB Collections (Tasks, Goals, Events)               │
│    ROLE: Represents ground-truth reality. Reconstructable and audited.     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (Generates Read-Only Projection)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 0. AMBIENT INTERACTION MEMBRANE (The Surface Facade)                        │
│    - Class A: Glance Surfaces (Android Widget, iOS Widget, Desktop Tray)   │
│    - Class B: Active Execution Surfaces (Notifee Chronometer, Live Activity)│
│    - Class C: Instant Entry (Spotlight HUD, Quick Settings, Wake Word)      │
│    ROLE: Renders current reality; emits typed action envelopes.             │
│    INVARIANT: ZERO domain logic; ZERO direct DB writes; ZERO second brain.  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. AMBIENT INTERACTION MODES

The system does not arbitrarily display UI. It operates in six explicit **Ambient Interaction Modes** determined by authoritative backend state:

| Interaction Mode | Trigger Condition | Primary Surface Manifestation | Audio / Haptic Behavior |
|---|---|---|---|
| **SILENT** | No active task; high cognitive load; quiet hours; or fatigue ceiling reached. | All notifications hidden; desktop tray idle monochrome; widget shows passive next event. | Completely muted; zero vibrations. |
| **GLANCE** | Normal idle state between scheduled blocks. | Widget displays current time, next commitment with countdown, and 1-tap Start. | Silent; updates passively. |
| **ATTENTION** | A scheduled block is due, or `InterruptionCostEvaluator` approves a high-value proposal. | High-priority actionable proposal notification: `[Start]` and `[Later]`. | Subtle single haptic pulse; no jarring chime. |
| **ACTIVE_EXECUTION** | A task or focus block is actively running. | Ongoing notification with live chronometer; iOS Live Activity; Desktop tray pulsing Executioners Red. | Silent chronometer; live countdown. |
| **CONVERSATION** | User triggers hotkey, widget mic, Quick Settings tile, or wake word. | Translucent Spotlight HUD or Quick Aven sheet opens in $< 150\text{ms}$. | Low-latency audio stream with `FastSemanticFiller`. |
| **PROACTIVE** | High-confidence causal intervention approved by autonomy matrix. | Contextual card proposing schedule adjustment or break. | Silent low-priority banner; 1-tap accept/dismiss. |

---

## 6. THE THREE SURFACE CLASSES

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   THREE SURFACE CLASSES MESH                                     │
├──────────────────────────┬───────────────────────────────┬───────────────────────────────────────┤
│ Class A: GLANCE          │ Class B: ACTIVE EXECUTION     │ Class C: INSTANT AVEN ENTRY           │
├──────────────────────────┼───────────────────────────────┼───────────────────────────────────────┤
│ • Android Jetpack Glance │ • Android Ongoing Chronometer │ • Desktop Frameless Spotlight HUD     │
│   Widget (4x2, 2x2)      │   Notification                │   (Ctrl+Alt+Space / Cmd+Shift+Space)  │
│ • iOS WidgetKit Home/    │ • iOS Live Activity & Dynamic │ • Android Quick Settings Tile         │
│   Lock Screen Widget     │   Island (ActivityKit)        │   (AvenTileService.kt)                │
│ • Desktop System Tray    │ • Desktop Tray Progress Ring  │ • Widget Quick Mic / Text Buttons     │
│   Tooltip & Popover      │ • Web Sticky Executive Bar    │ • On-Device Wake Word ("Aven")        │
├──────────────────────────┼───────────────────────────────┼───────────────────────────────────────┤
│ **Role**: Passive        │ **Role**: Temporal Presence   │ **Role**: On-Demand Intelligence      │
│ Awareness                │ (During active focus/task)    │ (Zero app navigation)                 │
│ **Lifecycle**: Silent,   │ **Lifecycle**: Appears on     │ **Lifecycle**: Opens in < 150ms,      │
│ persistent, OS-updated   │ Start, dismisses on Done      │ streams response, auto-dismisses      │
└──────────────────────────┴───────────────────────────────┴───────────────────────────────────────┘
```

---

## 7. AMBIENT EXECUTION LIFECYCLE (THE "JUST TELL ME WHEN YOU'RE DONE" LOOP)

The core product loop of LifeOS is not administrative reporting—it is **collaborative execution**:

$$\text{DUE} \xrightarrow{\text{Proposal Alert}} \text{START} \xrightarrow{\text{Ongoing Chronometer}} \text{"JUST TELL ME WHEN YOU'RE DONE"} \xrightarrow{\text{Taps [Done]}} \text{AUTO-DISMISS (SILENCE)}$$

```
1. TIME TO START (Proposal Phase)
   ┌────────────────────────────────────────────────────────┐
   │ LifeOS • Attention                                     │
   │ Architecture Review Spec                               │
   │ Scheduled for now (45 min block)                       │
   │ [ Start ]                 [ Later ]                    │
   └────────────────────────────────────────────────────────┘

2. ACTIVE EXECUTION (Focus Phase)
   ┌────────────────────────────────────────────────────────┐
   │ LifeOS • Focusing                                      │
   │ Architecture Review Spec                               │
   │ ● 28:14 remaining                                      │
   │ [ Done ]         [ Pause ]         [ +15m ]            │
   └────────────────────────────────────────────────────────┘

3. COMPLETION (De-escalation Phase)
   ┌────────────────────────────────────────────────────────┐
   │ LifeOS • Complete                                      │
   │ ✓ Architecture Review Spec                             │
   │ (Auto-dismisses in 3 seconds -> Returns to SILENT)     │
   └────────────────────────────────────────────────────────┘
```

---

## 8. INTERACTION SURFACE PROJECTION CONTRACT (`IInteractionSurfaceProjection`)

Published in `packages/execution-kernel/src/experience/surface/contracts/InteractionSurfaceContracts.ts`. It is strictly read-only, ephemeral, and devoid of dashboard analytics or generic escape hatches:

```typescript
export type SurfaceExecutionStatus = "DORMANT" | "PROPOSAL_PENDING" | "ACTIVE" | "PAUSED";
export type CommitmentCategory = "DEEP_WORK" | "MEETING" | "HABIT" | "ROUTINE" | "GENERAL";
export type AmbientInteractionMode = "SILENT" | "GLANCE" | "ATTENTION" | "ACTIVE_EXECUTION" | "CONVERSATION" | "PROACTIVE";

// Strongly-typed discriminated intervention action proposal
export type InterventionActionProposal =
  | {
      actionType: "start_execution";
      label: string;
      entityId: string;
      parameters: { plannedDurationMinutes?: number };
    }
  | {
      actionType: "defer_execution";
      label: string;
      entityId: string;
      parameters: { deferMinutes: number; reason?: string };
    }
  | {
      actionType: "accept_intervention";
      label: string;
      entityId: string;
      parameters: { targetSlotStartMs?: number; resolutionAction?: string };
    }
  | {
      actionType: "dismiss_intervention";
      label: string;
      entityId: string;
      parameters: { dismissalReason?: "busy" | "not_relevant" | "already_handled" };
    };

export interface IInteractionSurfaceProjection {
  schemaVersion: 2;
  projectionVersion: number;                 // Monotonic integer counter
  generatedAtMs: number;                     // Server epoch timestamp
  userId: string;
  interactionMode: AmbientInteractionMode;

  // 1. Current Active Execution (Drives Class B Active Surfaces)
  activeExecution: {
    status: SurfaceExecutionStatus;
    taskId?: string;
    occurrenceId?: string;
    chronicleId?: string;
    title: string;
    category: CommitmentCategory;
    startedAtMs?: number;
    plannedDurationMinutes: number;
    elapsedSeconds: number;
    remainingSeconds: number;
    canExtend: boolean;
    canPause: boolean;
    canComplete: boolean;
    undoToken?: string;                      // Populated ONLY if capability supports reversibility
    idempotencySeed: string;                 // Base identity seed for logical action construction
  } | null;

  // 2. Next Upcoming Commitment (Drives Class A Glance Surfaces)
  upcomingCommitment: {
    commitmentId: string;
    title: string;
    category: CommitmentCategory;
    startsAtMs: number;
    minutesUntilStart: number;
    isHardSchedule: boolean;
    locationOrUrl?: string;
  } | null;

  // 3. Pending Proactive Intervention (Gated by InterruptionCostEvaluator)
  pendingIntervention: {
    interventionId: string;
    type: "PROPOSAL_START" | "RECOVERY_NUDGE" | "SCHEDULE_CONFLICT";
    headline: string;
    explanation: string;
    primaryAction: InterventionActionProposal;
    secondaryAction?: InterventionActionProposal;
  } | null;

  // 4. Conversational Reference
  conversationContext: {
    activeConversationId: string;
    latestBriefingSnippet?: string;
  };
}
```

---

## 9. CANONICAL ACTION GATEWAY & CONCURRENCY ARCHITECTURE

### 9.1 Separation of Action Identity vs. Observed Projection Version
A critical defect in naive idempotency models is hashing `stateVersion` into the idempotency key. If Device A (phone, at version 100) and Device B (desktop, at version 101) both tap `[Done]` simultaneously, hashing `stateVersion` produces two different idempotency keys, causing double commits.

**The V2.1.1 Concurrency Model**:
1. **`idempotencyKey`**: Identifies the **logical client action attempt**.
   - For entity lifecycle mutations (e.g. `complete_task`, `pause_execution`):
     $$\text{idempotencyKey} = \text{SHA-256}(\text{userId} + \text{actionType} + \text{entityId} + (\text{occurrenceId} \parallel \text{idempotencySeed}))$$
   - This ensures multiple devices acting on the same task generate the **exact same idempotency key**, guaranteeing **at most one authoritative mutation**.
2. **`observedProjectionVersion`**: Transmitted as metadata on the envelope.
   - Tells the kernel which snapshot the user was looking at.
   - Used by the kernel's optimistic concurrency guard to detect whether the user acted on obsolete context (e.g., trying to start a task that was cancelled on another device).
3. **`authoritativeState`**: The actual truth in MongoDB/WorldModel at execution time.

```typescript
// Specific typed payloads
export interface StartExecutionPayload {
  startedAtMs: number;
  plannedDurationMinutes?: number;
}

export interface CompleteTaskPayload {
  completedAtMs: number;
  completionNote?: string;
}

export interface DeferExecutionPayload {
  deferMinutes: number;
  reason?: string;
}

export interface PauseExecutionPayload {
  pausedAtMs: number;
}

export interface ResumeExecutionPayload {
  resumedAtMs: number;
}

export interface CancelExecutionPayload {
  cancelledAtMs: number;
  reason?: string;
}

export interface CompensateLastActionPayload {
  undoToken: string;
  compensatedAtMs: number;
}

// Discriminated Payload Map
export interface SurfaceActionPayloadMap {
  start_execution: StartExecutionPayload;
  complete_task: CompleteTaskPayload;
  defer_execution: DeferExecutionPayload;
  pause_execution: PauseExecutionPayload;
  resume_execution: ResumeExecutionPayload;
  cancel_execution: CancelExecutionPayload;
  compensate_last_action: CompensateLastActionPayload;
}

export type SurfaceActionType = keyof SurfaceActionPayloadMap;

export interface ISurfaceActionEnvelope<T extends SurfaceActionType = SurfaceActionType> {
  sourceSurface: 
    | "ANDROID_NOTIFICATION" 
    | "ANDROID_WIDGET" 
    | "ANDROID_QUICK_SETTINGS"
    | "IOS_LIVE_ACTIVITY" 
    | "IOS_WIDGET" 
    | "DESKTOP_TRAY" 
    | "DESKTOP_HUD" 
    | "WEB_STICKY_BAR" 
    | "WAKE_WORD_AVEN";
  actionType: T;
  entityId: string;
  timestampMs: number;
  idempotencyKey: string;                    // Pure logical action identity (NO stateVersion hash)
  observedProjectionVersion: number;         // Optimistic concurrency context
  payload: SurfaceActionPayloadMap[T];
  clientSessionToken: string;
}

// Kernel Execution Result Envelope
export type KernelExecutionOutcome = 
  | "EXECUTE_COMMITTED" 
  | "EXECUTE_WITH_UNDO" 
  | "CONFIRMATION_REQUIRED" 
  | "COMPENSATED" 
  | "RECONCILIATION_REQUIRED" 
  | "UNKNOWN_EXTERNAL_STATE" 
  | "REJECTED_STALE" 
  | "REJECTED_IDEMPOTENT_DUPLICATE";

export interface IKernelExecutionResult {
  outcome: KernelExecutionOutcome;
  actionId: string;
  idempotencyKey: string;
  committedAtMs?: number;
  undoToken?: string;                        // Provided ONLY for EXECUTE_WITH_UNDO
  errorMessage?: string;
  reprojection?: IInteractionSurfaceProjection;
}
```

### 9.2 Sovereign Ingress Gateway (`/api/kernel/dispatch`)
The dispatch route is strictly an **ingress adapter**:
1. Authenticates the client session HMAC token.
2. Validates envelope schema against `ISurfaceActionEnvelope`.
3. Checks `idempotencyKey` against `ExecutionChronicle`. If already committed, returns `REJECTED_IDEMPOTENT_DUPLICATE` with the original outcome (0 double mutations).
4. Translates envelope into canonical `ActionProposal` and passes to `KernelCapabilityService.executeAction()`.
5. Returns `IKernelExecutionResult` to the surface.
6. **Invariant**: Contains **zero business logic, zero domain mutations, and zero scheduling code**.

---

## 10. FRESHNESS, OFFLINE RECONCILIATION & POLICY GOVERNANCE

### 10.1 Freshness Windows as Capability-Specific Policy Defaults
Freshness is not a hardcoded universal law. It is governed by **capability policy defaults** configured in the kernel:

| Action Type | Default Policy Classification | Kernel Evaluation Logic |
|---|---|---|
| `complete_task` | Tolerant Policy | Valid if task is open in MongoDB. Reconciles even if `observedProjectionVersion` is stale. |
| `start_execution` | Windowed Policy Default ($[-15\text{m}, +60\text{m}]$) | Valid within configured temporal buffer of scheduled start. If outside, kernel adapts start time to current timestamp. |
| `defer_execution` | Active Window Policy Default | Valid while proposal or active execution is live. Temporal shift evaluated by `ScheduleSolver`. |
| `compensate_last_action` | Capability Reversibility Policy | Governed by capability reversibility contract (e.g., local tasks reversible; sent external emails irreversible). |

### 10.2 Truthful Offline Reconciliation Guarantees
Offline interaction guarantees **truthful reconciliation**, NOT blind eventual success:
- **Durable Pending Intent**: Persisted in local store across app restarts and reboots.
- **Deterministic Ordering**: Replayed in FIFO sequence upon reconnect.
- **Idempotent Retry**: Network drops during transmission do not duplicate mutations.
- **Explicit Conflict State**: If the target entity was deleted or modified externally while offline, the kernel returns `RECONCILIATION_REQUIRED` or `UNKNOWN_EXTERNAL_STATE`. The UI alerts the user rather than faking success.

```typescript
export interface IPendingActionStore {
  enqueue<T extends SurfaceActionType>(action: ISurfaceActionEnvelope<T>): Promise<void>;
  peekNext(): Promise<ISurfaceActionEnvelope | null>;
  markCommitted(idempotencyKey: string): Promise<void>;
  markFailed(idempotencyKey: string, error: string): Promise<void>;
  getPendingCount(): Promise<number>;
}
```

---

## 11. CROSS-DEVICE CONTINUITY & PRAGMATIC EVENT DISTRIBUTION

```
                    Kernel Mutation Committed (MongoDB)
                                     │
                                     ▼
                InteractionSurfaceService.generateProjection(userId)
                                     │
                                     ▼
                   PushDispatchService.broadcastStateUpdate()
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
   Firebase Cloud             Apple Push (APNs)           Server-Sent Events
   Messaging (FCM)            ActivityKit Channel         (/api/surface/stream)
         │                           │                           │
         ▼                           ▼                           ▼
   Android Client               iOS Client                  Desktop (Tauri)
   (TaskActionReceiver.kt)     (ActivityKit Receiver)      & Web Foreground
```

### Pragmatic Event Distribution Invariant
The distribution layer satisfies the invariant: **PREFER EVENT-DRIVEN OR OS-MANAGED UPDATES OVER CONTINUOUS POLLING.** Mechanisms are chosen based on platform realities, not a complex custom distributed broker:
- **Foreground Surfaces**: Desktop webview and active web tabs use HTTP/2 Server-Sent Events (`GET /api/surface/stream`).
- **Android Background**: High-priority silent FCM data messages trigger native receivers to update widgets and notifications.
- **iOS Background**: APNs ActivityKit push updates Live Activities and Dynamic Island.
- **Lifecycle Reconciliation**: Desktop window un-minimize executes a **single lifecycle-triggered reconciliation check**, NOT a continuous polling loop.

---

## 12. ANDROID NATIVE AMBIENT ARCHITECTURE

### 12.1 Jetpack Glance App Widget (`LifeOsGlanceWidget.kt`)
- **Technology**: Jetpack Glance (`androidx.glance:glance-appwidget:1.1.0`), producing declarative `RemoteViews`.
- **Layouts**:
  - **$4\times 2$ Banner**: Current focus state, countdown to next event, 1-tap `[Start]` / `[Done]`, and Aven Mic button.
  - **$2\times 2$ Compact**: Active task name, live circular progress ring, and 1-tap `[Done]`.
- **Expo Integration**: Custom Expo Config Plugin `plugins/withLifeOsGlanceWidget.js` configures the Glance receiver and widget provider in `AndroidManifest.xml`.

### 12.2 Headless Action Receiver (`TaskActionReceiver.kt`)
- Inherits from Android `BroadcastReceiver`.
- **Android 12+ Trampoline Compliance**: Executes action network calls directly in background Kotlin coroutines using OkHttp without launching `MainActivity` or React Native.
- Reads encrypted credentials from `EncryptedSharedPreferences`.
- Engineering budget: $< 350\text{ms}$ tap-to-commit.

### 12.3 Quick Settings Tile (`AvenTileService.kt`)
- Adds an `"Aven Voice"` pull-down tile in the Android Notification Shade.
- Launches translucent `QuickAvenActivity.kt` with auto-microphone engagement in $< 150\text{ms}$.

---

## 13. IOS NATIVE AMBIENT ARCHITECTURE

### 13.1 WidgetKit & App Intents (iOS 17+)
- Interactive SwiftUI widgets consuming `IInteractionSurfaceProjection` stored in shared `AppGroup` container.
- Action buttons trigger iOS 17 `AppIntent` (`CompleteTaskIntent`), performing background network requests to `/api/kernel/dispatch`.

### 13.2 Live Activities & Dynamic Island (ActivityKit)
- Activates strictly during active task execution (`activeExecution !== null`).
- **Dynamic Island Compact**: Remaining minutes + spinning focus ring.
- **Dynamic Island Expanded**: Task title, progress bar, `[ Done ]`, `[ Pause ]`.
- **Lock Screen Banner**: Glassmorphic ongoing chronometer card.
- Updates pushed directly via ActivityKit APNs push tokens.

### 13.3 Honest iOS Wake-Word Architecture
- **Apple Platform Policy Constraint**: iOS strictly forbids continuous 24/7 background microphone listening for third-party apps (App Store Guideline 2.5.4).
- **iOS Implementation Reality**:
  - In-app / foreground wake word supported via local KWS engine.
  - Background/locked summon is supported natively through **Siri Shortcuts ("Hey Siri, ask Aven...")** and the **iOS 15+ Action Button / Lock Screen Widget**.

---

## 14. DESKTOP / TAURI V2 ARCHITECTURE

### 14.1 Native System Tray (`tauri-plugin-tray`)
- Implemented in Rust in `apps/desktop/src-tauri/src/lib.rs`.
- **States**:
  - `IDLE`: Monochrome LifeOS icon (`#ECE7E3`). Tooltip: `"Next: Standup in 40m"`.
  - `ACTIVE`: Executioners Red glowing ring (`#E8414A`). Tooltip: `"Focusing: Architecture Spec (25m elapsed)"`.
- **Tray Menu**: Left-click opens a $320\times 420\text{px}$ pre-warmed popover showing active controls and upcoming schedule.

### 14.2 Frameless Spotlight HUD (`tauri-plugin-global-shortcut`)
- Centered, borderless, semi-transparent window ($680\times 72\text{px}$ expanding to $680\times 420\text{px}$ on conversation).
- Global Hotkey: `Ctrl+Alt+Space` (Windows) or `Cmd+Shift+Space` (macOS).
- Engineering budget: $< 120\text{ms}$ hotkey-to-focus.
- Pressing `Esc` or clicking away automatically conceals the window without process destruction.

---

## 15. WEB & PWA AMBIENT ARCHITECTURE

1. **Sticky Executive Top-Bar (`StickyExecutiveBar.tsx`)**:
   - Anchored globally in `apps/web/app/layout.tsx`.
   - Renders a slim $34\text{px}$ dark-neutral bar with Executioners Red timer whenever `activeExecution !== null`.
2. **Service Worker Web Push (`public/sw.js`)**:
   - Handles background Web Push notifications via VAPID.
   - `notificationclick` events execute background `fetch()` calls to `/api/kernel/dispatch` even when no browser tabs are open.
3. **Command Palette (`Cmd+K`)**:
   - Universal shortcut across all web pages to summon instant conversational Aven.

---

## 16. UNIFIED AVEN CONVERSATIONAL ENTRY & VOICE HANDOFF

All quick conversational surfaces (Widget Mic, Quick Settings Tile, Desktop Spotlight HUD, Wake Word) route into the exact same canonical conversation pipeline:

```
User Voice / Text from Quick Surface
                 │
                 ▼
POST /api/conversation (streamFormat: "events")
                 │
                 ▼
LifeOSApplication.conversation.executeUserRequest()
   ├── WorldModelBridge.getProjection()      (< 5ms hydration budget)
   ├── FastSemanticFiller.generateFiller()   (< 180ms filler budget)
   └── SemanticIntentInterpreter.interpret() (Model-driven structured intent)
                 │
                 ▼
Supervisor.ts Orchestration & Specialist Execution
                 │
                 ▼
Server-Sent Events (SSE) Stream to Surface
   ├── Audio stream (Neural TTS: en-GB-RyanNeural)
   └── Structured Action Cards
```

---

## 17. LOCAL WAKE-WORD ARCHITECTURE ("Aven" & "Hey Aven")

### 17.1 Abstract Wake-Word Engine Contract (`IWakeWordEngine`)
The wake-word architecture is completely decoupled from any single vendor or library:

```typescript
export interface WakeWordConfig {
  keywords: ("Aven" | "Hey Aven")[];
  sensitivity: number;                       // 0.0 to 1.0 (configured per engine)
  audioSampleRate: 16000;
  audioBitDepth: 16;
}

export interface WakeWordDetectionEvent {
  keyword: "Aven" | "Hey Aven";
  confidence: number;
  detectedAtMs: number;
  bufferedPcmData: Int16Array;               // Last 2.0 seconds of audio pre-wake
}

export interface IWakeWordEngine {
  initialize(config: WakeWordConfig): Promise<void>;
  startListening(onWake: (event: WakeWordDetectionEvent) => void): Promise<void>;
  pauseListening(): Promise<void>;
  resumeListening(): Promise<void>;
  destroy(): Promise<void>;
}
```

### 17.2 Candidate Engines for Phase 11 Feasibility Spike

| Candidate Engine | License | Target Platforms | Evaluation Status in Phase 11 |
|---|---|---|---|
| **Sherpa-ONNX (k2-fsa)** | Apache 2.0 | Android, iOS, Windows, macOS, Linux | Candidate A (Open-source ONNX Zipformer KWS) |
| **Picovoice Porcupine** | Commercial (Free tier 3 users) | Android, iOS, Windows, macOS | Candidate B (High precision; license-key evaluation) |
| **OpenWakeWord** | Apache 2.0 | Windows, Linux (Python/ONNX) | Candidate C (Desktop open-source alternative) |

### 17.3 Acoustic Rolling Buffer & Zero Cloud Leak Pipeline
1. Microphone captures 16kHz 16-bit Mono PCM into a 2.0-second circular RAM buffer.
2. Local keyword spotter runs on-device. Zero audio packets leave the device prior to trigger.
3. Upon trigger:
   - Device emits a subtle haptic pulse or soft chime.
   - The 2.0-second pre-wake audio buffer is flushed along with live incoming audio to `/api/voice/transcribe`.
   - `FastSemanticFiller` provides $< 180\text{ms}$ voice acknowledgement while transcription and semantic interpretation run in parallel.
4. If no speech follows within 3 seconds, the session silently terminates.

---

## 18. SECURITY, PRIVACY & THREAT MODEL

1. **Lock-Screen Privacy Redaction**:
   - Notifications default to `NotificationCompat.VISIBILITY_PRIVATE`.
   - Sensitive personal health, goal names, and relationship details are concealed until biometric unlock.
2. **Cryptographic Action Tokens**:
   - Notification `PendingIntent` extras pass short-lived HMAC action tokens signed with the device session key, preventing intent injection or replay attacks.
3. **Capability-Specific Elevation**:
   - Routine task completions execute headlessly.
   - Destructive actions (e.g., deleting goals, external financial commits) require biometric elevation (`LocalAuthentication`).
4. **Local Audio Sovereignty**:
   - Wake-word audio buffers reside strictly in transient RAM and are overwritten every 2 seconds. No audio is ever written to disk or sent to the cloud un-triggered.

---

## 19. PERFORMANCE, BATTERY & METRIC CLASSIFICATION MATRIX

All numerical targets are classified into explicit engineering categories rather than asserted as unverified facts:

| Metric / Dimension | Target Value | Metric Classification | Verification Method |
|---|---|---|---|
| **Headless Action Commit** | $< 350\text{ms}$ tap-to-commit | ENGINEERING BUDGET | Network roundtrip from `TaskActionReceiver.kt` to MongoDB commit |
| **Spotlight HUD Focus Latency** | $< 120\text{ms}$ hotkey-to-focus | ENGINEERING BUDGET | Tauri window unminimize profiling |
| **Voice Semantic Filler** | $< 180\text{ms}$ speech-end to audio | ENGINEERING BUDGET | `FastSemanticFiller` time-to-first-byte |
| **Surface Projection Hydration** | $< 5\text{ms}$ server assembly | ENGINEERING BUDGET | Benchmark test on `InteractionSurfaceService.generateProjection()` |
| **Projection Payload Budget** | $\le 2\text{KB}$ ($\le 250$ tokens) | CONSTITUTIONAL SAFETY CEILING | JSON byte size assertion in CI test suite |
| **Android 24h Background Battery** | $< 1.0\%$ battery draw | EXPERIMENTAL HYPOTHESIS | Android `dumpsys batterystats` over 24-hour physical device run |
| **Desktop Idle CPU Overhead** | $< 0.8\%$ on 4-core machine | EXPERIMENTAL HYPOTHESIS | Task Manager / Activity Monitor profiling |
| **Wake-Word Detection Rate** | $\ge 95\%$ positive triggers | EXPERIMENTAL BENCHMARK HYPOTHESIS | Acoustic test harness with recorded speech datasets |
| **Wake-Word False Triggers** | $< 1$ per 24 hours | EXPERIMENTAL BENCHMARK HYPOTHESIS | 24-hour background noise test (TV, podcast, conversation) |
| **Cross-Device Sync Lag** | $< 2.0\text{s}$ tap to update | ENGINEERING BUDGET | Multi-device timestamp delta |

---

## 20. UX ACCEPTANCE CRITERIA

- **UX-01**: User can start a scheduled execution block in $\le 1$ tap without opening the main application.
- **UX-02**: User can complete an active execution block in $\le 1$ tap without opening the main application.
- **UX-03**: Starting an execution from the widget and starting from a notification produce identical authoritative kernel state.
- **UX-04**: Completing an execution from the widget and from a notification produce identical authoritative results.
- **UX-05**: Aven conversational entry can be summoned in $< 200\text{ms}$ from supported lightweight surfaces (hotkey, tile, widget mic).
- **UX-06**: The user is never exposed to LifeOS internal architecture or database error messages.
- **UX-07**: Ambient surfaces display only actionable temporal context, never cluttered analytics or health dashboards.
- **UX-08**: LifeOS remains completely silent when nothing requires attention or cognitive load is elevated.
- **UX-09**: Offline UI displays local provisional status (`"Syncing..."`) and never falsely claims authoritative completion.
- **UX-10**: The same canonical action (`complete_task`) produces identical results regardless of surface.
- **UX-11**: Aven conversation maintains unbroken session continuity regardless of which entry point was used.
- **UX-12**: Multi-device state converges to the same authoritative reality within $\le 2.0\text{s}$.

---

## 21. TEST STRATEGY & TEST ORACLE MATRIX

Testing adheres strictly to the **Test Oracle Rule**: Zero mock-passing; real-system execution validation on every tier:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           TEST ORACLE VALIDATION MATRIX                                                │
├─────────────────────┬─────────────────────────────────┬────────────────────────────────────────────────────────────────┤
│ Test Suite          │ Target Subsystem                │ Success Criteria & Oracle Invariants                           │
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Headless Action     │ /api/kernel/dispatch            │ Authoritative MongoDB state marked 'completed'; Execution-     │
│ State Transition    │                                 │ Chronicle entry committed with sourceSurface; HTTP 200 acked.  │
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Idempotency & Race  │ KernelCapabilityService         │ 50 concurrent identical action requests yield exactly 1 DB     │
│ Conditions          │                                 │ mutation and 49 cached idempotent responses (0 double commits).│
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Cross-Device Sync   │ Android + Desktop + Web         │ Device A executes 'complete_task' -> Device B & C dismiss       │
│ Consistency         │                                 │ notifications and update widgets in <= 2.0 seconds.            │
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Offline Queue       │ Local IPendingActionStore       │ Reconnect flushes queue; valid actions commit; conflicting     │
│ Reconciliation      │                                 │ actions transition to RECONCILIATION_REQUIRED (0 silent drops).│
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Wake-Word Accuracy  │ Local IWakeWordEngine           │ Positive: Target trigger rate >= 95%.                          │
│ & Adversarial Tests │                                 │ Negative: Zero triggers on "haven", "avenue", "Kevin", TV audio│
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Mobile Battery Draw │ Android dumpsys batterystats    │ 24-hour background execution draws <= 1.0% total battery.      │
│ (24h Run)           │                                 │ Zero Android OS battery warnings or ANR crashes.               │
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Architectural AST   │ Entire Codebase                 │ Zero direct MongoDB writes outside KernelCapabilityService;    │
│ Compliance Audit    │                                 │ Zero regex semantic routing; Zero client-side task managers.   │
└─────────────────────┴─────────────────────────────────┴────────────────────────────────────────────────────────────────┘
```

### Explicit Failure & Chaos Test Scenarios
1. **Duplicate Taps**: User rapidly double-taps `[Done]` $\to$ Exactly 1 mutation committed; 0 double logs.
2. **Concurrent Multi-Device Action**: Phone and desktop tap `[Start]` at same millisecond $\to$ Idempotency key absorbs duplicate.
3. **Stale Projection Tap**: User taps action on 4-hour-old cached notification $\to$ Kernel verifies current DB state; executes safely if still valid or returns `REJECTED_STALE`.
4. **Offline Process Death**: App process killed while offline actions are queued $\to$ Action persisted in local store; flushes on reboot.
5. **Wake Word False Positive Auto-Timeout**: Wake word falsely triggered by TV audio $\to$ No speech detected for 3 seconds $\to$ Session auto-dismisses silently without cloud upload.
6. **Simultaneous Aven Invocation**: User presses desktop hotkey while mobile voice session is active $\to$ Session lock routes to existing conversation without state corruption.

---

## 22. USER JOURNEY MATRIX (15 DETAILED JOURNEYS)

1. **Scheduled Task $\to$ Proposal $\to$ Start $\to$ Active Chronometer $\to$ Done**:
   10:00 AM proposal alert $\to$ User taps `[Start]` $\to$ Notification shifts to live chronometer $\to$ User finishes work and taps `[Done]` $\to$ Notification confirms and cleanly auto-dismisses. Zero lingering clutter.
2. **Scheduled Task $\to$ Later (Policy-Driven Deferral)**:
   Task proposal alert $\to$ User taps `[Later]` $\to$ Kernel dispatches `defer_execution`, `ScheduleSolver` shifts the calendar block without collisions, alert dismisses.
3. **Glance Widget $\to$ Aven Quick Text**:
   User taps Chat icon on Glance widget $\to$ Fast translucent sheet opens in 140ms $\to$ User types prompt $\to$ Aven streams structured cards.
4. **Glance Widget $\to$ Aven Quick Voice**:
   User taps Mic icon on widget $\to$ Audio capture starts immediately $\to$ User speaks $\to$ Aven confirms with 1-sentence audio feedback.
5. **Desktop Global Hotkey $\to$ Spotlight HUD**:
   User working in VS Code presses `Ctrl+Alt+Space` $\to$ Centered Spotlight HUD appears $\to$ User types *"What's next?"* $\to$ Aven answers $\to$ User presses `Esc` $\to$ HUD vanishes.
6. **Desktop Wake Word $\to$ Spotlight HUD**:
   User at desk says *"Aven, start focus block"* $\to$ Rust audio thread detects keyword $\to$ HUD opens, transcribes speech, starts focus timer, and updates system tray.
7. **Phone Wake Word $\to$ Morning Briefing**:
   User waking up says *"Hey Aven, good morning"* $\to$ Local Android detector triggers $\to$ Aven delivers a personalized, $\le 120$-word spoken briefing.
8. **Phone Lock Screen $\to$ Desktop System Tray Synchronization**:
   User taps `[Done]` on phone lock-screen notification $\to$ Within 1.5 seconds, desktop tray icon shifts from active red ring to idle monochrome, and open web dashboard marks task completed.
9. **Desktop $\to$ Phone Synchronization**:
   User clicks `[Start Focus]` on desktop tray $\to$ Phone immediately displays ongoing active chronometer notification.
10. **Web Calendar Drag $\to$ Phone Widget Update**:
    User reschedules focus block on web calendar $\to$ FCM silent push updates phone Glance widget countdown within 2.0 seconds.
11. **Offline Task Completion**:
    User on subway taps `[Done]` on active notification $\to$ Local store queues action and updates UI to *"Done • Syncing"* $\to$ Train exits tunnel $\to$ NetworkCallback triggers queue flush $\to$ Kernel commits mutation.
12. **Android Process Death Resilience**:
    Android OS terminates LifeOS background process to reclaim memory $\to$ User taps `[Done]` on active notification $\to$ Standalone `TaskActionReceiver.kt` executes the mutation without booting the app.
13. **Multi-Device Concurrent Tap Conflict**:
    User taps `[Done]` on phone at the exact moment desktop auto-completes $\to$ Kernel SHA-256 idempotency key absorbs duplicate; zero corrupted state or double logs.
14. **Flow State Silence (Zero Notification Intrusion)**:
    User in 3-hour deep work block $\to$ Cognitive engine detects high focus $\to$ Zero alerts, zero popups. Surfaces reflect progress silently.
15. **Cognitive Fatigue Proactive Intervention**:
    Backend detects 5 hours of continuous high-stress meetings $\to$ `InterruptionCostEvaluator` approves recovery nudge $\to$ Aven delivers low-priority notification with 1-tap `[Block 20m Walk]`.

---

## 23. REPOSITORY REALITY & EXHAUSTIVE FILE-LEVEL CHANGE MAP

### 23.1 Execution Kernel & Web Backend (`packages/execution-kernel` & `apps/web`)
- `packages/execution-kernel/src/experience/surface/contracts/InteractionSurfaceContracts.ts` *(NEW)*: Canonical `IInteractionSurfaceProjection` and `ISurfaceActionEnvelope` contracts.
- `packages/execution-kernel/src/experience/surface/InteractionSurfaceService.ts` *(NEW)*: Projects `WorldModelBridge` context into surface state in $< 5\text{ms}$ budget.
- `packages/execution-kernel/src/experience/surface/PushDispatchService.ts` *(NEW)*: Unified FCM, APNs, and Web Push event broadcaster.
- `apps/web/app/api/surface/state/route.ts` *(NEW)*: GET endpoint for hydrating surface state.
- `apps/web/app/api/surface/stream/route.ts` *(NEW)*: SSE endpoint for live desktop/web surface synchronization.
- `apps/web/app/api/kernel/dispatch/route.ts` *(NEW)*: Sovereign headless action gateway for mobile and desktop receivers.
- `apps/web/server/db/models/UserDeviceRegistrationModel.ts` *(NEW)*: Stores device push tokens, platform capabilities, and wake-word preferences.

### 23.2 Mobile Application (`apps/mobile`)
- `apps/mobile/utils/persistentNotification.ts` *(DEPRECATE & MIGRATE)*: Deprecate 15s polling loop; migrate reusable Notifee channel creation into `ActiveExecutionNotificationManager.ts`.
- `apps/mobile/withNotifeeForegroundService.js` *(MODIFY)*: Configure foreground service for active chronometer execution.
- `plugins/withLifeOsGlanceWidget.js` *(NEW)*: Expo Config Plugin generating Android native Glance widget files.
- `apps/mobile/android/app/src/main/java/com/overforge/lifeos/widget/LifeOsGlanceWidget.kt` *(NEW)*: Native Compose-based Glance Widget UI.
- `apps/mobile/android/app/src/main/java/com/overforge/lifeos/receivers/TaskActionReceiver.kt` *(NEW)*: Headless `BroadcastReceiver` executing actions in $< 350\text{ms}$ budget.
- `apps/mobile/android/app/src/main/java/com/overforge/lifeos/services/AvenTileService.kt` *(NEW)*: Android Quick Settings pull-down tile service.
- `apps/mobile/android/app/src/main/java/com/overforge/lifeos/wakeword/LocalWakeWordService.kt` *(NEW)*: Android foreground service wrapping the selected `IWakeWordEngine`.
- `apps/mobile/app/quick-aven.tsx` *(NEW)*: Translucent instant Aven voice/text conversation sheet.

### 23.3 Desktop Application (`apps/desktop`)
- `apps/desktop/src-tauri/Cargo.toml` *(MODIFY)*: Add `tauri-plugin-global-shortcut`, `tauri-plugin-notification`, `cpal`, and KWS provider library selected in Phase 11.
- `apps/desktop/src-tauri/tauri.conf.json` *(MODIFY)*: Configure system tray and frameless spotlight window.
- `apps/desktop/src-tauri/src/lib.rs` *(MODIFY)*: Implement tray event handlers, global shortcuts, and window focus toggles.
- `apps/desktop/src-tauri/src/wake_word.rs` *(NEW)*: Native Rust audio thread for local wake-word detection via `cpal`.
- `apps/desktop/src/components/SpotlightHUD.tsx` *(NEW)*: Frameless Spotlight HUD UI.

### 23.4 Web Application (`apps/web`)
- `apps/web/public/sw.js` *(NEW)*: Service Worker for Web Push events and background action clicks.
- `apps/web/components/layout/StickyExecutiveBar.tsx` *(NEW)*: Active execution header bar across all routes.
- `apps/web/features/command/CommandPaletteModal.tsx` *(NEW)*: `Cmd+K` instant Aven palette.

---

## 24. DETAILED 15-PHASE IMPLEMENTATION SEQUENCE

Every phase strictly implements the **14-Step Loop Engineering Standard**:  
`INSPECT → HYPOTHESIZE → IMPLEMENT → TARGETED TEST → REGRESSION → OBSERVE → DIAGNOSE → REPAIR → RETEST → ADVERSARIAL TEST → REAL DEVICE TEST → REPLAY → ARCHITECTURAL AUDIT → PHASE GATE`

```
Phase 0: Baseline Audit & Feasibility Spikes (Reality check, Notifee audit, battery profiling)
   ↓
Phase 1: Canonical Surface Contracts & Projection Engine (IInteractionSurfaceProjection in Kernel)
   ↓
Phase 2: Headless Action Proposal Gateway (/api/kernel/dispatch & idempotency validation)
   ↓
Phase 3: Push Distribution Gateway & Device Registry (FCM / APNs / SSE infrastructure)
   ↓
Phase 4: Mobile Event-Driven Active Notifications (Deprecate 15s polling; Notifee active chronometer)
   ↓
Phase 5: Mobile Headless Action Receiver (BroadcastReceiver for 1-tap Start/Done/Later)
   ↓
Phase 6: Android Jetpack Glance App Widget (Home-screen ambient surface via Expo Config Plugin)
   ↓
Phase 7: Desktop Tauri System Tray & Active Indicator (Rust menu bar and state pulse)
   ↓
Phase 8: Desktop Frameless Spotlight HUD & Global Hotkeys (Ctrl+Alt+Space instant entry)
   ↓
Phase 9: Web Sticky Execution Bar & Service Worker Web Push (Browser-level ambient presence)
   ↓
Phase 10: Unified Lightweight Aven Conversational Sheet (Sub-180ms voice streaming)
   ↓
Phase 11: Local Wake-Word Engine Feasibility Spike & Acoustic Benchmarks ("Aven" & "Hey Aven")
   ↓
Phase 12: Desktop Local Wake-Word Integration (Tauri cpal audio thread -> Spotlight HUD)
   ↓
Phase 13: Mobile Wake-Word & Quick Settings Tile (AvenTileService + battery-safe listener)
   ↓
Phase 14: Cross-Surface Hardening, Chaos Testing & 24h Real-Device Battery Validation
```

---

## 25. FINAL IMPLEMENTATION ORDER & DEPENDENCY GRAPH

```
[Phase 0: Baseline Audit]
       │
       ▼
[Phase 1: Surface Contracts] ──► [Phase 2: Headless Action Gateway]
                                          │
       ┌──────────────────────────────────┴──────────────────────────────────┐
       ▼                                                                     ▼
[Phase 3: Push Gateway]                                             [Phase 10: Lightweight Aven Sheet]
       │                                                                     │
  ┌────┴───────────────────────────┬─────────────────────────┐               │
  ▼                                ▼                         ▼               ▼
[Phase 4: Active Notifs]    [Phase 7: Desktop Tray]   [Phase 9: Web Bar]  [Phase 11: Wake-Word Spike]
  │                                │                                         │
  ▼                                ▼                                         ▼
[Phase 5: Headless Receiver] [Phase 8: Spotlight HUD]                   [Phase 12: Desktop Wake-Word]
  │                                                                          │
  ▼                                                                          ▼
[Phase 6: Glance Widget]                                                [Phase 13: Mobile Wake-Word]
  │                                                                          │
  └────────────────────────────────┬─────────────────────────────────────────┘
                                   │
                                   ▼
                   [Phase 14: Cross-Surface Hardening & Gate]
```

---

## 26. MINIMUM VIABLE PRODUCT (MVP) DEFINITION

The first meaningful product milestone proves: **"I can meaningfully use LifeOS throughout my day without repeatedly opening the main application."**

### Milestone 1: Core Ambient Execution (The MVP)
- **Phone**:
  - Android Jetpack Glance Widget ($4\times 2$ Banner & $2\times 2$ Compact).
  - Event-Driven Active Chronometer Notification (Notifee).
  - Headless 1-tap `[Start]`, `[Done]`, `[Later]`.
  - Translucent Quick Aven Voice/Text Sheet (via Widget Mic).
- **Desktop**:
  - Native System Tray with Executioners Red pulse during active work.
  - Spotlight HUD summoned via `Ctrl+Alt+Space` / `Cmd+Shift+Space`.
  - Active execution visibility and 1-tap `[Done]`.
- **Backend**:
  - Canonical projection service (`IInteractionSurfaceProjection`).
  - Sovereign headless action gateway (`/api/kernel/dispatch`).
  - Silent FCM push and desktop SSE distribution.

### Milestone 2: Ambient Voice & Wake Word (Follow-Up Milestone)
- Abstract `IWakeWordEngine` evaluation spike across candidates.
- Desktop hands-free `"Aven"` detection via Rust audio thread.
- Android battery-safe `"Aven"` listener with proximity sensor gating.

---

## 27. ROLLOUT & MIGRATION STRATEGY (`persistentNotification.ts`)

1. **Step 1 (Audit)**: Extract reusable notification channel creation logic from `persistentNotification.ts`.
2. **Step 2 (Parallel Run)**: Introduce `ActiveExecutionNotificationManager.ts` behind an internal feature flag (`EXPO_PUBLIC_AMBIENT_SURFACE_V2=true`).
3. **Step 3 (Disable Polling)**: Invert the default: disable the 15-second `setInterval` loop in `persistentNotification.ts` and route active execution tracking through push events.
4. **Step 4 (Validation Gate)**: Verify 24-hour battery consumption on physical test devices.
5. **Step 5 (Purge)**: Delete `apps/mobile/utils/persistentNotification.ts` entirely once headless action receivers are green.

---

## 28. OBSERVABILITY, TELEMETRY & AUDIT CHRONICLE

All surface events are logged to the immutable `ExecutionChronicle`:

```json
{
  "eventId": "evt_surf_948271",
  "eventType": "SURFACE_ACTION_COMMITTED",
  "sourceSurface": "ANDROID_NOTIFICATION",
  "actionType": "complete_task",
  "targetEntityId": "task_847192",
  "durationMs": 142,
  "clientTimestampMs": 1775304192000,
  "serverCommitTimestampMs": 1775304192142,
  "syncLagMs": 142,
  "metadata": {
    "offlineQueued": false,
    "wakeWordTriggered": false,
    "deviceModel": "Pixel 8 Pro",
    "osVersion": "Android 14"
  }
}
```

Telemetry dashboards in `/admin/analytics` track:
- **Surface Action Ratio**: % of tasks started/completed via ambient surfaces vs main app.
- **Action Commit Latency P50 / P95**.
- **Cross-Device Synchronization Lag**.
- **Offline Queue Replay Success Rate**.

---

## 29. RISK REGISTRY & PRODUCTION MITIGATIONS

1. **Risk: Android 14+ OEM Background Killing (Samsung OneUI / Xiaomi MIUI)**:
   - *Mitigation*: Do not run continuous background JS. Rely on native `BroadcastReceiver` components and high-priority FCM data messages.
2. **Risk: Expo Config Plugin Build Breakages**:
   - *Mitigation*: Isolate all native Glance and Notifee configurations within modular, version-pinned Expo Config Plugins tested in isolated CI builds.
3. **Risk: Wake-Word False Triggers in Meeting Contexts**:
   - *Mitigation*: Check calendar context in `WorldModelBridge`. If user is in an active meeting, automatically suppress microphone wake-word listening.
4. **Risk: Touch Target Misfires on Small Notification Actions**:
   - *Mitigation*: Enforce minimum $48\times 48\text{dp}$ touch bounding boxes and provide instant 1-tap `[Undo]` on surfaces.

---

## 30. REJECTED ALTERNATIVES & TECHNICAL RATIONALE

1. **Rejected: 24/7 Persistent Red Foreground Notification**:
   - *Rationale*: Drains battery via polling, causes notification fatigue, violates Android 14 FGS time caps.
2. **Rejected: Floating Android Chat Heads (`SYSTEM_ALERT_WINDOW`)**:
   - *Rationale*: Clutters screen during gaming/reading, requires invasive permissions, has zero iOS parity.
3. **Rejected: Client-Side SQLite Task Manager ("Mini Second Brain")**:
   - *Rationale*: Violates Constitutional Invariant 1. State inevitably diverges from backend reality. Surfaces are pure projection renderers.
4. **Rejected: Continuous Cloud Audio Streaming for Wake Word**:
   - *Rationale*: Severe privacy violation, massive battery/cellular data drain. Detection must be 100% on-device.

---

## 31. PLATFORM SPIKES & EXPERIMENTAL FEASIBILITY TRACKS

Every capability is classified honestly based on actual repository and platform verification:

| Capability Track | Android | iOS | Desktop | Web |
|---|---|---|---|---|
| **Glance Surface** | REQUIRES PLATFORM SPIKE (Glance via Expo Plugin) | REQUIRES PLATFORM SPIKE (WidgetKit Extension) | VERIFIED CURRENT (System Tray Configured) | VERIFIED CURRENT (Web Shell) |
| **Active Execution** | VERIFIED CURRENT (Notifee Installed v9.1.8) | REQUIRES PLATFORM SPIKE (ActivityKit Token Handling) | REQUIRES PLATFORM SPIKE (Tray Dynamic Icon Redraw) | VERIFIED CURRENT (React Sticky Bar Component) |
| **Headless Action** | REQUIRES PLATFORM SPIKE (OkHttp from dead process) | REQUIRES PLATFORM SPIKE (App Intents Network Dispatch) | VERIFIED CURRENT (Tauri Rust Command Ingress) | REQUIRES PLATFORM SPIKE (Service Worker Action Fetch) |
| **Global Summon** | REQUIRES PLATFORM SPIKE (AvenTileService Native Manifest) | PLATFORM-CONSTRAINED (Siri / Action Button) | VERIFIED CURRENT (tauri-plugin-global-shortcut) | VERIFIED CURRENT (Cmd+K Event Listener) |
| **Local Wake Word** | REQUIRES PLATFORM SPIKE (KWS Foreground Audio Service) | PLATFORM-CONSTRAINED (Foreground Only / Siri) | REQUIRES PLATFORM SPIKE (cpal Audio Stream in Rust) | N/A (Browser Sandbox Restriction) |
| **Offline Actions** | REQUIRES PLATFORM SPIKE (Jetpack DataStore Action Queue) | REQUIRES PLATFORM SPIKE (AppGroup Store Replay) | VERIFIED CURRENT (Local SQLite Plugin) | VERIFIED CURRENT (IndexedDB Storage) |

---

## 32. FINAL ARCHITECTURAL SELF-CRITIQUE (SECTION 29 COMPLIANCE)

1. **Which parts came from the original product concept?**
   - The vision of ambient presence, home-screen widget, actionable notifications (`[Start]`, `[Done]`, `[Later]`), lightweight mic entry, and cross-device synchronization.
2. **Which parts came from the independent architectural research?**
   - The Tiered Ambient Interaction Mesh concept, rejection of 24/7 overlays, unified `IInteractionSurfaceProjection`, headless `BroadcastReceiver` architecture, and desktop Spotlight HUD.
3. **Which parts did you reject?**
   - Universal 24-hour undoability (reversibility is capability-specific).
   - Universal 30-minute freshness (freshness is action-specific and capability-governed).
   - Permanent 24/7 red notifications and 15s polling loops.
   - Client-side task state managers.
   - Generic `any` in TypeScript contracts.
4. **Why were they rejected?**
   - They violated the Jarvis constitutional architecture, introduced second brains, and drained battery.
5. **Which assumptions were verified against the repository?**
   - Verified that Notifee is installed (`@notifee/react-native 9.1.8`).
   - Verified that Tauri v2 is configured with deep linking.
   - Verified that `KernelCapabilityService` handles `ActionProposals`.
   - Verified that `expo-audio` supports full-duplex recording and neural TTS.
6. **Which assumptions require external platform verification?**
   - KWS battery draw on mid-range Android chipsets requires measurement in Phase 11/13.
7. **What is the biggest architectural risk?**
   - Cellular push delivery latency. Mitigated by local provisional UI updates in headless receivers.
8. **What is the biggest UX risk?**
   - Accidental button taps on small screens. Mitigated by $48\times 48\text{dp}$ touch targets and capability-specific undo.
9. **What is the biggest wake-word risk?**
   - False positive triggers. Mitigated by dual-stage confidence gating and 3s silence timeouts.
10. **What could create a second brain?**
    - Writing task filtering, priority calculations, or cadence logic inside Kotlin or Rust client code. Prevented: all ordering comes strictly from the server projection.
11. **What could cause cross-device divergence?**
    - Client devices acting on stale cached state without validating monotonic version numbers. Prevented: every mutation checks `observedProjectionVersion` and idempotency keys.
12. **What could make LifeOS annoying?**
    - Intrusive chimes during meetings. Prevented: active notifications are strictly silent; proposals respect `InterruptionCostEvaluator`.
13. **What could make it battery-heavy?**
    - Background polling. Prevented: 100% event-driven push and OS-managed alarms.
14. **What could make wake word unusable?**
    - Speech clipping at trigger time. Prevented: 2.0-second rolling ring buffer preserves initial phonemes.
15. **What should NOT be implemented?**
    - Mood sliders, complex habit trackers, or multi-tab navigation inside widgets or notifications.
16. **What is the smallest meaningful MVP?**
    - **Milestone 1**: Phone Glance widget, Notifee active execution notification, and desktop tray/HUD.
17. **What should be measured before expanding?**
    - Real-device 24-hour battery consumption and notification action tap-to-commit latency.
18. **What parts should remain deliberately platform-specific?**
    - Desktop uses Spotlight HUD and System Tray; Android uses Jetpack Glance and Quick Settings Tile; iOS uses WidgetKit and Dynamic Island.

---

## 33. FINAL IMPLEMENTATION READINESS GATE

### Verification of the 17 Readiness Questions
1. *Does this feel like an operating system for execution rather than a notification system?* **YES.** Active execution is a first-class loop.
2. *Does the user experience ONE LifeOS and ONE Aven across all surfaces?* **YES.** All surfaces route into canonical `Supervisor.ts`.
3. *Does the Ambient Interaction Layer remain a membrane rather than a brain?* **YES.** Zero business logic or planning exists in client surfaces.
4. *Can the user execute common LifeOS interactions without opening the full application?* **YES.** Start, Done, Later, and Voice summon operate headlessly.
5. *Does the phone remain the primary ambient surface?* **YES.** Powered by Jetpack Glance and Notifee.
6. *Does the desktop feel like Aven is part of the OS?* **YES.** Powered by native System Tray and frameless Spotlight HUD.
7. *Does the web remain the full workspace rather than merely another widget?* **YES.** Sticky executive bar provides ambient control without compromising full desktop web dashboard capabilities.
8. *Is wake word an invocation mechanism rather than a second AI?* **YES.** Audio pipes directly to canonical Whisper and `Supervisor.ts`.
9. *Can LifeOS remain completely silent when nothing deserves attention?* **YES.** Silence is a verified first-class state.
10. *Can the system survive stale projections, duplicate actions, offline mode, process death, and delayed push?* **YES.** Governed by monotonic versions and logical idempotency keys.
11. *Does the kernel remain the only execution authority?* **YES.** `KernelCapabilityService` is sovereign.
12. *Does the plan preserve deterministic replay?* **YES.** All events log to `ExecutionChronicle`.
13. *Are all empirical assumptions explicitly marked for measurement?* **YES.** Classified in Section 19.
14. *Are platform limitations represented honestly?* **YES.** iOS background listening policy constraint explicitly acknowledged.
15. *Does the MVP actually prove the LifeOS interaction philosophy?* **YES.** Milestone 1 proves full day-in-the-life ambient execution.
16. *Does the architecture remain consistent with the Jarvis V2.1 constitutional architecture?* **YES.** Fully subordinate to the 4-tier authority model.
17. *Is there anything in this document that would force us to redesign the architecture again after implementation begins?*  
    **NO KNOWN ARCHITECTURAL BLOCKERS.** Remaining uncertainty is intentionally bounded by implementation-time platform spikes.

---

### DECLARATION OF IMPLEMENTATION READINESS

**THIS SPECIFICATION IS DECLARED 100% READY FOR IMPLEMENTATION.**

In strict adherence to instructions:
- Zero code has been modified.
- Zero production packages have been installed.
- Phase 0 has NOT been started.

Standing by for your final kickoff directive.
