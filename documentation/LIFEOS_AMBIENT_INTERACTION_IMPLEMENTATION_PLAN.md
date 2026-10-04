# LIFEOS AMBIENT INTERACTION LAYER
## MASTER ARCHITECTURAL IMPLEMENTATION PLAN & SYSTEM DESIGN SPECIFICATION
### Cross-Platform Ambient Surfaces, Sovereign Execution Boundary, and Local Wake-Word ("Aven" / "Hey Aven") Integration

**Document Version**: 1.0.0-PROPOSAL  
**Date**: October 4, 2026  
**Status**: PLAN-FIRST SPECIFICATION — STRICTLY APPROVED FOR ARCHITECTURAL REVIEW (NO CODE IMPLEMENTATION)  
**Target Environments**:
- **Mobile**: Android (API 31–35, Jetpack Glance, Notifee, Headless BroadcastReceivers, Quick Settings) & iOS (WidgetKit, App Intents, Live Activities, Dynamic Island)
- **Desktop**: Tauri v2 (Rust Core, System Tray, Global Shortcuts, Frameless Spotlight HUD, Windows WASAPI / macOS CoreAudio)
- **Web**: Next.js App Router (Turbopack, Service Worker Web Push, SSE, Sticky Executive Bar, Cmd+K Palette)
- **Backend / Kernel**: Node.js v22+, TypeScript 5.7+, MongoDB Atlas, Sovereign `KernelCapabilityService`, `WorldModelV2`, `Aven Supervisor`

---

## 1. EXECUTIVE SUMMARY

LifeOS has completed its major Jarvis backend transformation (Phases 0–15). The core system possesses authoritative context projection (`WorldModelBridge`), multi-factor causal reasoning (`CrossDomainIntelligenceEngine`), 6-tier autonomy governance (`AutonomyPolicyManager`), 24-hour undoability (`AutonomousActionReverser`), and sovereign execution invariants (`KernelCapabilityService`).

However, **LifeOS remains trapped in an administrative "App Destination" paradigm.** To perform simple, high-frequency life actions—such as starting a scheduled focus block, acknowledging an intervention, completing a task, or asking Aven a quick question—the user must unlock their phone, launch a heavy application, wait for framework hydration, navigate menus, and report their state.

### The Ambient Interaction Objective
Transform LifeOS from an **application the user visits** into an **ambient presence that participates in the user's day**:
> *Present when useful, completely invisible when unnecessary, accessible in $\le 1$ tap or by saying "Aven" / "Hey Aven", operating with zero second brains, zero battery-wasting polling, and absolute kernel sovereignty.*

### The Three Intersecting Pillars
1. **Tiered Ambient Interaction Mesh**:
   - **Glance Surface (Passive)**: Android Glance Widget, iOS WidgetKit, Desktop System Tray. Displays current reality, upcoming commitments, and a 1-tap primary action. Zero continuous background battery drain.
   - **Active Execution Surface (Temporal)**: Appears *only* when a scheduled task or focus block is actively running (Android Ongoing Notification with chronometer, iOS Live Activity / Dynamic Island, Desktop Tray Progress, Web Header Bar). Disappears immediately upon completion or cancellation.
   - **Instant Conversational Entry (On-Demand)**: Summoning Aven in $< 200\text{ms}$ via Desktop Global Shortcut (`Cmd/Ctrl+Shift+Space`), Android Quick Settings Tile, or Wake Word, loading an isolated streaming voice/text sheet without full app navigation.
2. **Unified Interaction Surface State (`IInteractionSurfaceState`)**:
   - A single, versioned, read-only projection generated on the backend from `WorldModelV2` and `TemporalTimelineEngine`. Distributed to devices via event-driven push (FCM / APNs) and local SSE.
   - All surface taps (`START`, `DONE`, `LATER`, `PAUSE`) emit typed `ActionProposal` envelopes routed to `/api/calendar/mutate` or `/api/kernel/dispatch`. No local widget or notification can directly mutate domain records or invent business logic.
3. **Local Wake-Word Detection ("Aven" & "Hey Aven")**:
   - 100% on-device, offline acoustic keyword spotting using **Sherpa-ONNX** (Next-gen Kaldi, Apache 2.0) and **Picovoice Porcupine** fallbacks. Zero 24/7 cloud audio streaming.
   - Seamless voice handoff into the existing `FastSemanticFiller` (< 180ms voice response) and `Aven Supervisor` pipeline.

---

## 2. CURRENT REPOSITORY BASELINE & FORENSIC AUDIT

A complete forensic scan of the active codebase establishes the ground-truth baseline:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           CURRENT REPOSITORY FORENSICS                                                 │
├─────────────────────────┬───────────────────────────────┬────────────┬─────────────────────────────────────────────────┤
│ Component / Subsystem   │ Actual File Path              │ Status     │ Technical Reality & Immediate Gaps              │
├─────────────────────────┼───────────────────────────────┼────────────┼─────────────────────────────────────────────────┤
│ Execution Kernel        │ packages/execution-kernel/    │ EXISTING   │ Sovereign boundary. Accepts ActionProposals,    │
│                         │ src/orchestration/kernel/     │            │ verifies idempotency, manages compensating sagas│
│                         │ KernelCapabilityService.ts    │            │ and 24h undo. Ready for headless callers.       │
├─────────────────────────┼───────────────────────────────┼────────────┼─────────────────────────────────────────────────┤
│ Context Projection      │ packages/execution-kernel/    │ EXISTING   │ Hydrates unified life context in < 5ms.         │
│                         │ src/worldv2/WorldModelBridge  │            │ Serializes to <= 250 token budget.              │
├─────────────────────────┼───────────────────────────────┼────────────┼─────────────────────────────────────────────────┤
│ Mobile Notification     │ apps/mobile/utils/            │ DEPRECATE  │ Prototype runs 15s setInterval polling loop     │
│ Prototype               │ persistentNotification.ts     │            │ on /tasks/list. Violates Android 14 FGS caps.   │
│                         │                               │            │ Must be replaced with event-driven Notifee.     │
├─────────────────────────┼───────────────────────────────┼────────────┼─────────────────────────────────────────────────┤
│ Mobile Foreground Svc   │ apps/mobile/                  │ MODIFY     │ Expo config plugin configuring AndroidManifest  │
│ Config Plugin           │ withNotifeeForegroundService  │            │ for dataSync|location. Needs active execution.  │
├─────────────────────────┼───────────────────────────────┼────────────┼─────────────────────────────────────────────────┤
│ Android Manifest        │ apps/mobile/android/app/src/  │ MODIFY     │ Has FOREGROUND_SERVICE, RECORD_AUDIO, ALARMS.   │
│ Configuration           │ main/AndroidManifest.xml      │            │ Missing: AppWidgetProvider, Glance receiver.    │
├─────────────────────────┼───────────────────────────────┼────────────┼─────────────────────────────────────────────────┤
│ Mobile Audio Capture    │ apps/mobile/utils/            │ REUSE      │ Uses expo-audio with VAD, metering, and         │
│                         │ audioCapture.ts               │            │ FormData upload to /api/voice/transcribe.       │
├─────────────────────────┼───────────────────────────────┼────────────┼─────────────────────────────────────────────────┤
│ Mobile Neural TTS       │ apps/mobile/utils/            │ REUSE      │ Uses expo-audio full duplex + en-GB-RyanNeural  │
│                         │ ttsManager.ts                 │            │ via /api/voice/tts. High fidelity.              │
├─────────────────────────┼───────────────────────────────┼────────────┼─────────────────────────────────────────────────┤
│ Desktop Application     │ apps/desktop/src-tauri/       │ MODIFY     │ Tauri v2 with Node sidecar. Has single-instance │
│                         │ src/lib.rs, tauri.conf.json   │            │ and deep links. Lacks tray, shortcuts, HUD.     │
├─────────────────────────┼───────────────────────────────┼────────────┼─────────────────────────────────────────────────┤
│ Web Notifications       │ apps/web/app/api/             │ MODIFY     │ Purely internal MongoDB NotificationLog.        │
│                         │ notifications/route.ts        │            │ Zero Web Push, zero VAPID, zero service workers.│
├─────────────────────────┼───────────────────────────────┼────────────┼─────────────────────────────────────────────────┤
│ Push Distribution       │ apps/web/server/              │ NEW        │ No FCM or APNs gateway exists. Entire push      │
│ Gateway                 │                               │            │ distribution infrastructure must be built.      │
├─────────────────────────┼───────────────────────────────┼────────────┼─────────────────────────────────────────────────┤
│ Wake-Word Engine        │ (None in repo)                │ NEW        │ Zero wake-word code exists. Local Sherpa-ONNX   │
│                         │                               │            │ engine must be integrated for desktop & mobile. │
└─────────────────────────┴───────────────────────────────┴────────────┴─────────────────────────────────────────────────┘
```

---

## 3. ARCHITECTURAL PRINCIPLES & CONSTITUTIONAL INVARIANTS

Every phase in this implementation plan is bound by the following non-negotiable invariants:

1. **Sovereign Execution Boundary**: No interaction surface (widget, notification action, desktop HUD, watch) may ever write directly to MongoDB or bypass `KernelCapabilityService.ts`. Every state-changing user tap must be encapsulated as an `ActionProposal` with a deterministic `idempotencyKey`.
2. **No Second Brain**: Clients store only a transient, read-only projection (`IInteractionSurfaceState`). No client-side task sorting algorithms, scheduling engines, priority solvers, or conversational memory stores may exist on Android, iOS, or Tauri.
3. **One Execution & Conversation Model**: A `complete_task` action or an Aven voice prompt means the exact same thing whether issued from the full Next.js UI, an Android notification button, a desktop hotkey, or a smartwatch.
4. **Zero Continuous Background Polling**: Periodic polling loops (e.g., the existing 15s `setInterval`) are strictly outlawed. All background state updates must be event-driven via high-priority data push (FCM / APNs) or local OS-scheduled exact alarms.
5. **Dynamic De-Escalation & Silence as a First-Class State**: The system must never nag. Active execution surfaces (notifications, Live Activities) appear strictly during active commitments and auto-dismiss upon completion. When idle, LifeOS resides silently on the home-screen widget or system tray.
6. **Local Wake-Word Privacy**: Acoustic wake-word detection for "Aven" and "Hey Aven" must execute 100% locally on-device using quantized neural models. Microphone audio must never stream to any cloud server prior to verified wake-word activation.
7. **Deterministic 24-Hour Undoability**: Every action executed from a lightweight surface must be reversible via the kernel's `AutonomousActionReverser`, safely falling back to `UNKNOWN_EXTERNAL_STATE` if external state drifts.

---

## 4. TARGET ARCHITECTURE & END-TO-END SYSTEM TOPOLOGY

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   LIFEOS AMBIENT INTERACTION LAYER ARCHITECTURE                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

                                           ┌───────────────────────────┐
                                           │       WORLD MODEL V2      │
                                           │  (Authoritative Reality)  │
                                           └─────────────┬─────────────┘
                                                         │
                                                         ▼
                                           ┌───────────────────────────┐
                                           │ INTERACTION SURFACE STATE │
                                           │     PROJECTION SERVICE    │
                                           │  (IInteractionSurfaceState)
                                           └─────────────┬─────────────┘
                                                         │
                         ┌───────────────────────────────┼───────────────────────────────┐
                         │ High-Priority Data Push       │ Local Server-Sent Events (SSE)│ Local Memory / IPC
                         ▼                               ▼                               ▼
              ┌─────────────────────┐         ┌─────────────────────┐         ┌─────────────────────┐
              │     MOBILE MESH     │         │     DESKTOP MESH    │         │       WEB MESH      │
              │  (Android & iOS)    │         │      (Tauri v2)     │         │      (Next.js)      │
              ├─────────────────────┤         ├─────────────────────┤         ├─────────────────────┤
              │ • Jetpack Glance    │         │ • System Tray Icon  │         │ • Sticky Header     │
              │   / WidgetKit       │         │   (Status & Action) │         │   Execution Bar     │
              │ • Active Execution  │         │ • Global Spotlight  │         │ • Cmd+K Palette     │
              │   Notification / LA │         │   HUD (Ctrl+Alt+Spc)│         │ • Service Worker    │
              │ • Quick Settings    │         │ • Sherpa-ONNX Local │         │   Web Push Actions  │
              │   Tile & Shortcuts  │         │   Wake-Word Worker  │         │                     │
              │ • Sherpa-ONNX Voice │         │                     │         │                     │
              └──────────┬──────────┘         └──────────┬──────────┘         └──────────┬──────────┘
                         │                               │                               │
                         └───────────────────────────────┼───────────────────────────────┘
                                                         │
                                           Headless Action Proposal Dispatch
                                            (START, DONE, LATER, REVERT)
                                                         │
                                                         ▼
                                           ┌───────────────────────────┐
                                           │   ACTION PROPOSAL ROUTE   │
                                           │   (/api/calendar/mutate   │
                                           │   or /api/kernel/dispatch)│
                                           └─────────────┬─────────────┘
                                                         │
                                                         ▼
                                           ┌───────────────────────────┐
                                           │   SOVEREIGN KERNEL GATE   │
                                           │  KernelCapabilityService  │
                                           └─────────────┬─────────────┘
                                                         │
                                                         ▼
                                           ┌───────────────────────────┐
                                           │  Execution Chronicle &    │
                                           │  World Model Rehydration  │
                                           └───────────────────────────┘
```

---

## 5. INTERACTION SURFACE STATE CONTRACT (`IInteractionSurfaceState`)

A dedicated TypeScript contract published by the backend and cached locally across all client runtimes:

```typescript
export type SurfaceExecutionStatus = "DORMANT" | "PROPOSAL_PENDING" | "ACTIVE" | "PAUSED";
export type CommitmentCategory = "DEEP_WORK" | "MEETING" | "HABIT" | "ROUTINE" | "GENERAL";

export interface IInteractionSurfaceState {
  schemaVersion: 1;
  projectionVersion: number;                 // Monotonic version counter
  generatedAtMs: number;                     // Server timestamp
  expiresAtMs: number;                       // Freshness TTL (default: now + 30 min)
  userId: string;

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
    idempotencySeed: string;
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

  // 3. Pending Proactive Intervention (Human-in-the-Loop Decision Gate)
  pendingIntervention: {
    interventionId: string;
    type: "PROPOSAL_START" | "RECOVERY_NUDGE" | "SCHEDULE_CONFLICT";
    headline: string;
    explanation: string;
    primaryActionLabel: string;
    primaryActionPayload: Record<string, any>;
    secondaryActionLabel: string;
    secondaryActionPayload: Record<string, any>;
    expiresAtMs: number;
  } | null;

  // 4. Daily Progress Summary (Glance Widget Counters)
  dailyProgress: {
    completedTasksCount: number;
    totalTasksScheduled: number;
    deepWorkMinutesCompleted: number;
    currentFocusScore: number;               // 0.0 to 1.0 (from CognitiveStateEngine)
  };

  // 5. Conversational Reference
  conversationContext: {
    activeConversationId: string;
    latestBriefingSnippet?: string;
  };
}
```

---

## 6. CANONICAL ACTION CONTRACT

Every interaction surface event translates into a standard `ActionProposal`:

```typescript
export interface ISurfaceActionEnvelope {
  sourceSurface: "ANDROID_NOTIFICATION" | "ANDROID_WIDGET" | "IOS_LIVE_ACTIVITY" | "IOS_WIDGET" | "DESKTOP_TRAY" | "DESKTOP_HUD" | "WEB_BAR";
  actionType: "start_execution" | "complete_task" | "defer_execution" | "pause_execution" | "cancel_execution" | "compensate_last_action";
  entityId: string;                          // taskId or occurrenceId
  timestampMs: number;
  idempotencyKey: string;                    // SHA-256(userId + actionType + entityId + stateVersion)
  payload: Record<string, any>;
}
```

### Action Freshness & Validation Matrix
Not all actions require the same freshness guarantees:

| Action Type | Freshness Requirement | Stale Behavior (> 30m) | Conflict Resolution |
|---|---|---|---|
| `complete_task` | Authoritative Current Check | Allowed offline; reconciled on sync | If already completed elsewhere: No-op `SUCCESS`. If deleted: Log `ORPHANED_ACTION`. |
| `start_execution` | Strict (Current time window) | Rejects if past scheduled window | Checks collision; buffers transition if late. |
| `defer_execution` | Strict ($< 15\text{m}$ from proposal) | Rejects if task already started | Pushes by 15m; runs `ScheduleSolver` collision check. |
| `compensate_last_action` | Strict ($< 24\text{h}$ undo window) | Rejects if outside 24h window | Restores previous DB state; flags external drift as `UNKNOWN_EXTERNAL_STATE`. |

---

## 7. STATE SYNCHRONIZATION & EVENT DISTRIBUTION

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   EVENT-DRIVEN STATE DISTRIBUTION TOPOLOGY                                             │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

Kernel State Mutation Committed (MongoDB)
                  │
                  ▼
InteractionSurfaceService.generateProjection(userId)
                  │
                  ▼
PushDispatchService.broadcastStateUpdate(projection)
                  │
  ┌───────────────┼───────────────────────────────┬───────────────────────────────┐
  │               │                               │                               │
  ▼               ▼                               ▼                               ▼
Firebase Cloud  Apple Push Notification       Server-Sent Events (SSE)        Local IPC Event
Messaging (FCM) service (APNs)                Hub (/api/surface/stream)       (Tauri Webview)
  │               │                               │                               │
  ▼               ▼                               ▼                               ▼
Android Client  iOS Client                    Web Browser Client              Desktop Tauri Tray
(Background)    (ActivityKit Token)           (Foreground Tabs)               & Spotlight Window
```

### Reconnection & Deduplication Protocol
- **Versioning**: Every projection carries a monotonic integer `projectionVersion`. If an incoming payload has a version $\le$ currently held local state, it is immediately discarded.
- **Silent Data Payloads**: Mobile push uses FCM `data` messages (`priority: "high"`) with zero display notification payload. The local Android/iOS native receiver unpacks the JSON projection and updates the widget and notification directly in native memory.

---

## 8. ANDROID IMPLEMENTATION ARCHITECTURE

### 8.1 Jetpack Glance App Widget
- **Technology**: Jetpack Glance (`androidx.glance:glance-appwidget:1.1.0`). Declarative, Compose-style UI producing native `RemoteViews`.
- **Sizes**:
  - $4\times 2$ (Primary Banner): Displays current active execution (with live progress bar), upcoming meeting countdown, 1-tap `[Start]` / `[Done]`, and Mic icon.
  - $2\times 2$ (Compact Pill): Displays current task title and status circle.
- **Expo Integration Strategy**: Written as a custom native Android module (`apps/mobile/android/app/src/main/java/com/overforge/lifeos/widget/`) wrapped by an Expo Config Plugin (`plugins/withLifeOsGlanceWidget.js`). This enables EAS custom development builds without detaching from Expo.

### 8.2 Event-Driven Active Execution Notifications
- **Technology**: Built on `@notifee/react-native` (already installed v9.1.8) + native `TaskActionReceiver.kt`.
- **Lifecycle**:
  1. **Proposal Phase**: When a task is due, a gentle alert notification is displayed: `"Time to start: Write Spec"` with `[ Start ]` and `[ Later +15m ]`.
  2. **Active Phase**: When started, Notifee updates the notification to `ongoing: true`, `asForegroundService: true`, `chronometer: true`, and replaces actions with: `[ Done ]`, `[ Pause ]`, `[ +15m ]`.
  3. **Termination**: When the user taps `[ Done ]`, the receiver fires an HTTP POST to `/api/calendar/mutate`, replaces notification content with `"✓ Completed: Write Spec"`, and dismisses it after 3 seconds. Zero persistent 24/7 red banners.

### 8.3 Headless Action Receiver (`TaskActionReceiver.kt`)
- Inherits from `BroadcastReceiver`.
- Does **not** launch the React Native JavaScript runtime or `MainActivity` (complying strictly with Android 12+ Notification Trampoline restrictions).
- Reads auth credentials from Android `EncryptedSharedPreferences`, constructs an `ISurfaceActionEnvelope`, and dispatches via Kotlin Coroutines / `OkHttp`.

### 8.4 Quick Settings Tile (`AvenTileService.kt`)
- A system-level pull-down tile in Android Notification Shade: `"Aven Voice"`.
- Tapping the tile summons an instant, translucent floating Activity (`QuickAvenActivity.kt`) with microphone auto-record, bypassing home-screen navigation.

---

## 9. IOS IMPLEMENTATION ARCHITECTURE

### 9.1 WidgetKit & App Intents (iOS 17+)
- Declarative SwiftUI widgets rendered via `TimelineProvider`.
- Tapping `[Start]` or `[Done]` triggers an iOS 17 `AppIntent` (`CompleteTaskIntent`), executing background network requests directly to the LifeOS Kernel.

### 9.2 Live Activities & Dynamic Island (ActivityKit)
- Activates strictly during active task execution.
- **Dynamic Island Compact**: Shows spinning focus ring + countdown (`14m`).
- **Dynamic Island Expanded**: Displays full task title, progress bar, `[ Done ]` button, and pause icon.
- **Lock Screen Banner**: Displays rich card with chronometer and 1-tap actions.
- Updates pushed via APNs ActivityKit push tokens generated at task start.

---

## 10. DESKTOP / TAURI V2 IMPLEMENTATION ARCHITECTURE

### 10.1 System Tray (`tauri-plugin-tray`)
- Rust implementation in `apps/desktop/src-tauri/src/lib.rs`.
- **States**:
  - `IDLE`: Subtle monochrome LifeOS glyph. Tooltip: `"Next: Standup in 42m"`.
  - `ACTIVE`: Vibrant cyan/green glowing ring. Tooltip: `"Focusing: Architecture Spec (22m elapsed)"`.
- **Menu**: Left-click opens a mini-popover window ($320\times 400\text{px}$) with upcoming commitments and active controls. Right-click shows quick settings.

### 10.2 Frameless Spotlight HUD (`tauri-plugin-global-shortcut`)
- Pre-warmed, hidden frameless window ($680\times 72\text{px}$ expanding to $680\times 420\text{px}$ on conversation).
- Global hotkey: `Cmd+Shift+Space` (macOS) or `Ctrl+Alt+Space` (Windows).
- Tapping hotkey unminimizes and focuses the window in $< 120\text{ms}$.
- Pressing `Esc` or clicking away automatically conceals the window without process destruction.

---

## 11. WEB & PWA IMPLEMENTATION ARCHITECTURE

1. **Sticky Executive Top-Bar**:
   - Anchored across all Next.js routes in `apps/web/app/layout.tsx`.
   - When active execution is running, renders a slim $34\text{px}$ bar showing active timer, task name, and 1-tap `[Done]`.
2. **Service Worker Web Push (`sw.js`)**:
   - Implements Web Push API with VAPID keys.
   - Handles `self.addEventListener('notificationclick')` to post `complete_task` directly via background `fetch()` without reloading the active web tab.
3. **Command Palette (`Cmd+K`)**:
   - Integrates existing web chat into an accessible modal overlay from any dashboard view.

---

## 12. AVEN LIGHTWEIGHT CONVERSATIONAL ENTRY

### Reusing Canonical Aven Infrastructure
Lightweight conversation surfaces do not invent a second AI. They stream directly into the existing `Supervisor.ts` and `ConversationService.ts`:

```
User Voice / Text from Quick Sheet
                 │
                 ▼
POST /api/conversation (streamFormat: "events")
                 │
                 ▼
Supervisor.processRequest()
   ├── WorldModelBridge.getProjection()      (< 5ms hydrated context)
   ├── FastSemanticFiller.generateFiller()   (< 180ms instant voice filler)
   └── SemanticIntentInterpreter.interpret() (Zero regex structured turn)
                 │
                 ▼
Server-Sent Events (SSE) Stream to Quick Surface
```

### Voice Handoff Protocol
When summoned via voice:
1. Local audio recorder immediately streams raw PCM to backend Whisper endpoint (`/api/voice/transcribe`).
2. Concurrently, `FastSemanticFiller` synthesizes an initial conversational acknowledgement (e.g., *"Looking that up..."* or *"On it."*).
3. The response is spoken aloud via neural TTS (`en-GB-RyanNeural`) while tool cards render visually in the sheet.

---

## 13. WAKE-WORD ARCHITECTURE ("Aven" & "Hey Aven")

### 13.1 Acoustic Keyword Spotting (KWS) Engine Comparison

| Engine Candidate | License | On-Device Platforms | Memory | CPU | Custom Keyword Training | Evaluation Verdict |
|---|---|---|---|---|---|---|
| **Sherpa-ONNX (k2-fsa)** | Apache 2.0 | Android, iOS, Windows, macOS, Linux | **12–18 MB** | **< 1.5%** | **YES**: Matches exact phoneme / zipformer sequences without cloud training. | **PRIMARY RECOMMENDED ENGINE**: Free, open-source, ultra-low resource, cross-platform Rust & Kotlin bindings. |
| **Picovoice Porcupine** | Commercial (Free tier 3 users) | Android, iOS, Windows, macOS | **< 2 MB** | **< 1.0%** | **YES**: Custom `.ppn` models for "Aven" & "Hey Aven" generated via console. | **SECONDARY / FALLBACK ENGINE**: Best-in-class accuracy, but constrained by licensing keys and commercial user quotas. |
| **OpenWakeWord** | Apache 2.0 | Windows, Linux (Python/ONNX) | 45–60 MB | 4–7% | Requires PyTorch synthetic dataset training. | **REJECTED FOR MOBILE**: Memory footprint and CPU too heavy for battery-safe mobile operation. |
| **PocketSphinx / Vosk** | BSD / Apache | All | 30 MB | 3–5% | Acoustic grammar models. | **REJECTED**: High false-positive rate on phonetically short names like "Aven". |

### 13.2 Wake-Word Activation Pipeline
Both `"Aven"` and `"Hey Aven"` must be supported:

```
Microphone Audio Stream (16kHz 16-bit Mono PCM)
                       │
                       ▼
Circular Rolling Ring Buffer (Last 2.0 Seconds)
                       │
                       ▼
Sherpa-ONNX Keyword Spotter (Local Thread)
   ├── Acoustic Filter: Energy VAD Threshold
   └── Neural KWS: P("Aven") >= 0.65 OR P("Hey Aven") >= 0.60
                       │
             ┌─────────┴─────────┐
             │ YES               │ NO
             ▼                   ▼
Play Subtle Haptic / Chime    Continue Listening (Zero Cloud Calls)
             │
             ▼
Activate Voice Session Stream
(Flushes the 2.0s buffer + live audio to Whisper STT)
             │
             ▼
Existing Aven Voice & Supervisor Pipeline
```

### 13.3 Desktop Wake-Word Implementation (Tauri / Rust)
- Implemented in a dedicated native background thread in `src-tauri/src/wake_word.rs` using `cpal` (cross-platform audio) and `sherpa-onnx-sys`.
- Resource footprint: $\le 15\text{MB}$ RAM, $< 0.8\%$ CPU on modern 4-core desktop processors.
- When triggered, Rust fires `app_handle.get_webview_window("spotlight").show()` and begins streaming voice immediately.

### 13.4 Mobile Wake-Word Reality & Privacy Constraints
- **Android**:
  - Requires `RECORD_AUDIO` and `FOREGROUND_SERVICE_MICROPHONE`.
  - Android 14+ displays a persistent system green privacy indicator dot whenever the microphone is active.
  - To prevent unexpected battery drain, the mobile app provides **Two Configurable Modes**:
    1. **Ambient Wake-Word Mode (Always Listening)**: Runs foreground microphone service with battery-saver pause logic (automatically suspends when screen is face-down or proximity sensor is covered).
    2. **On-Demand Mode (Default)**: Wake-word listens *only* when the phone screen is on, or when summoned via Quick Settings Tile / Widget Mic button.
- **iOS Policy Reality**:
  - Apple strictly forbids third-party apps from running continuous background microphone listening when suspended. Any app attempting 24/7 background audio capture for custom wake words is terminated by iOS within 30 seconds and rejected under App Store Review Guideline 2.5.4.
  - **iOS Architecture**: In-app / foreground wake word using Sherpa-ONNX; locked/background access provided via **Siri Shortcuts ("Hey Siri, ask Aven...")** and the **iOS Action Button / Lock Screen Widget**.

---

## 14. OFFLINE QUEUE & CONFLICT RECONCILIATION ENGINE

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        OFFLINE ACTION RECONCILIATION WORKFLOW                          │
└────────────────────────────────────────────────────────────────────────────────────────┘

User Taps [Done] on Surface (Network Disconnected)
                      │
                      ▼
Surface Enqueues into Secure Local SQLite/Room Store
(Record: { actionId, type: "COMPLETE_TASK", payload, idempotencyKey, queuedAtMs })
                      │
                      ▼
Surface Optimistically Updates UI ("✓ Done • Syncing...")
                      │
                      ▼
OS Network Monitor (WorkManager / NetworkCallback) Detects Connection
                      │
                      ▼
Drain Queue Sequentially (FIFO) to POST /api/kernel/dispatch
                      │
         ┌────────────┴────────────┐
         │ HTTP 200                │ HTTP 409 / 422 Conflict
         ▼                         ▼
Mark Synced & Remove from Queue   Handle Deterministic Conflict:
                                  - Task deleted elsewhere -> Discard cleanly
                                  - Task already completed -> Confirm idempotency
                                  - Schedule conflict -> Alert user via Aven
```

---

## 15. SECURITY, PRIVACY & THREAT MODEL

1. **Lock-Screen Notification Redaction**:
   - Notifications default to `NotificationCompat.VISIBILITY_PRIVATE` on lock screens.
   - Sensitive goal metadata, personal health metrics, and relationship details are concealed until biometric unlock.
2. **Cryptographic Action Tokens**:
   - Notification `PendingIntent` extras do not pass raw user IDs or database queries. They pass a short-lived HMAC token signed by the client session secret.
3. **Biometric Guard for Destructive Actions**:
   - Atomic tasks can be marked done headlessly. However, destructive actions (e.g., deleting a goal, executing a financial purchase) require biometric authentication (`LocalAuthentication` / `BiometricPrompt`).
4. **Microphone Privacy Transparency**:
   - The microphone is never opened without clear OS indicator indicators.
   - Audio ring buffers are held strictly in transient memory; un-triggered audio is discarded every 2 seconds.

---

## 16. PERFORMANCE, LATENCY & BATTERY BUDGETS

All metrics must be validated using automated profilers and physical test devices:

| Dimension / Metric | Target Budget | Measurement Method |
|---|---|---|
| **Headless Action Execution** | $< 350\text{ms}$ tap-to-ack | Network roundtrip from BroadcastReceiver to MongoDB commit |
| **Spotlight HUD Launch** | $< 150\text{ms}$ hotkey-to-focus | Tauri window unminimize latency |
| **Voice Filler Latency** | $< 180\text{ms}$ speech-end to audio | `FastSemanticFiller` time-to-first-chunk |
| **Wake-Word Detection Latency** | $< 250\text{ms}$ post-utterance | Sherpa-ONNX inference cycle duration |
| **Android Background Battery** | $< 1.0\%$ per 24 hours | Android Battery Historian / dumpsys batterystats |
| **Glance Widget Memory Footprint** | $< 20\text{MB}$ RAM | Android Profiler / dumpsys meminfo |
| **Cross-Device Sync Lag** | $< 2.0\text{s}$ action to update | Timestamp delta between Device A tap and Device B render |

---

## 17. FIFTEEN DETAILED USER JOURNEYS

1. **Scheduled Task $\to$ Proposal $\to$ Start $\to$ Active $\to$ Done**: 10:00 AM proposal notification $\to$ User taps `[Start]` $\to$ Notification transitions to live ongoing chronometer $\to$ User taps `[Done]` $\to$ Notification cleanly dismisses.
2. **Scheduled Task $\to$ Later (+30m)**: 14:00 PM task alert $\to$ User taps `[Later +30m]` $\to$ Kernel shifts block, verifies collisions, and silences alerts until 14:30.
3. **Widget $\to$ Aven Quick Text**: User taps Chat icon on Glance widget $\to$ Compact modal sheet opens in 150ms $\to$ User types prompt $\to$ Aven streams structured cards.
4. **Widget $\to$ Aven Quick Voice**: User taps Mic icon on widget $\to$ Audio capture starts immediately $\to$ User says *"Add dentist tomorrow at 2"* $\to$ Aven confirms with 1-sentence audio.
5. **Desktop Global Hotkey $\to$ Aven HUD**: User coding in VS Code presses `Ctrl+Alt+Space` $\to$ Centered Spotlight HUD appears $\to$ User types *"Reschedule sync"* $\to$ Presses Enter $\to$ HUD vanishes.
6. **Desktop Wake-Word $\to$ Aven HUD**: User at desk says *"Aven, what's my next meeting?"* $\to$ Local Rust thread detects keyword $\to$ Spotlight HUD pops up and speaks answer aloud.
7. **Phone Wake-Word $\to$ Aven Voice**: Phone on nightstand hears *"Hey Aven, good morning"* $\to$ Wake detector triggers `MorningWakeDetector` $\to$ Aven delivers $\le 120$-word morning briefing.
8. **Phone $\to$ Desktop Real-Time Synchronization**: User marks task done on phone lock screen $\to$ Desktop System Tray icon and open Web tab update to next task within 1.5 seconds.
9. **Desktop $\to$ Phone Synchronization**: User starts deep work block on Desktop $\to$ Phone immediately displays ongoing execution chronometer.
10. **Web $\to$ Phone Synchronization**: User reschedules routine block on Web calendar $\to$ Phone Glance widget updates next commitment time automatically.
11. **Offline Task Completion**: User in airplane mode taps `[Done]` $\to$ Local queue persists action $\to$ Phone reconnects to Wi-Fi $\to$ WorkManager flushes queue, kernel verifies commit.
12. **Process Death Resilience**: Android kills LifeOS to reclaim RAM $\to$ User taps `[Done]` on active notification $\to$ Standalone `BroadcastReceiver` executes mutation without app booting.
13. **Multi-Device Conflict Resolution**: User taps `[Done]` on phone at the exact moment desktop auto-completes $\to$ Kernel idempotency key absorbs duplicate; zero corrupted state.
14. **Ambient Silence (Flow State)**: User in 2-hour uninterrupted focus block $\to$ Zero alerts, zero popups. Widget silently reflects progress.
15. **Proactive Intervention Nudge**: Cognitive fatigue engine detects 4h high-stress schedule $\to$ Aven sends silent low-priority nudge with 1-tap `[Block 15m Break]`.

---

## 18. EXHAUSTIVE FILE-LEVEL CHANGE MAP

### 18.1 Backend & Execution Kernel (`packages/execution-kernel` & `apps/web/server`)
- `packages/execution-kernel/src/experience/surface/contracts/InteractionSurfaceContracts.ts` *(NEW)*: `IInteractionSurfaceState` contracts.
- `packages/execution-kernel/src/experience/surface/InteractionSurfaceService.ts` *(NEW)*: Projects world model into interaction state.
- `packages/execution-kernel/src/experience/surface/PushDispatchService.ts` *(NEW)*: FCM / APNs push distribution gateway.
- `apps/web/app/api/surface/state/route.ts` *(NEW)*: GET endpoint for surface state hydration.
- `apps/web/app/api/surface/stream/route.ts` *(NEW)*: SSE endpoint for live desktop/web surface streaming.
- `apps/web/app/api/kernel/dispatch/route.ts` *(NEW)*: Authenticated headless action gateway for mobile receivers.
- `apps/web/server/db/models/UserDeviceRegistrationModel.ts` *(NEW)*: Stores device push tokens and capabilities.

### 18.2 Mobile Application (`apps/mobile`)
- `apps/mobile/utils/persistentNotification.ts` *(DEPRECATE & REPLACE)*: Purge 15s polling loop; replace with event-driven `ActiveExecutionNotificationManager.ts`.
- `apps/mobile/withNotifeeForegroundService.js` *(MODIFY)*: Reconfigure foreground service types for active execution tracking.
- `plugins/withLifeOsGlanceWidget.js` *(NEW)*: Expo Config Plugin generating Android native Glance widget files.
- `apps/mobile/android/app/src/main/java/com/overforge/lifeos/widget/LifeOsGlanceWidget.kt` *(NEW)*: Jetpack Glance UI.
- `apps/mobile/android/app/src/main/java/com/overforge/lifeos/receivers/TaskActionReceiver.kt` *(NEW)*: Headless action receiver.
- `apps/mobile/android/app/src/main/java/com/overforge/lifeos/services/AvenTileService.kt` *(NEW)*: Quick Settings Tile service.
- `apps/mobile/android/app/src/main/java/com/overforge/lifeos/wakeword/SherpaWakeWordModule.kt` *(NEW)*: Native Android wake-word bridge.
- `apps/mobile/app/quick-aven.tsx` *(NEW)*: Lightweight translucent conversation sheet route.

### 18.3 Desktop Application (`apps/desktop`)
- `apps/desktop/src-tauri/Cargo.toml` *(MODIFY)*: Add `tauri-plugin-global-shortcut`, `tauri-plugin-notification`, `cpal`, `sherpa-onnx-sys`.
- `apps/desktop/src-tauri/tauri.conf.json` *(MODIFY)*: Add tray configuration and spotlight frameless window definition.
- `apps/desktop/src-tauri/src/lib.rs` *(MODIFY)*: Implement system tray event handlers and spotlight window toggle.
- `apps/desktop/src-tauri/src/wake_word.rs` *(NEW)*: Rust background thread for local "Aven" detection.
- `apps/desktop/src/components/SpotlightHUD.tsx` *(NEW)*: Frameless Spotlight UI.

### 18.4 Web Application (`apps/web`)
- `apps/web/public/sw.js` *(NEW)*: Service worker handling Web Push events and headless actions.
- `apps/web/components/layout/StickyExecutiveBar.tsx` *(NEW)*: Persistent active execution header.
- `apps/web/features/command/CommandPaletteModal.tsx` *(NEW)*: `Cmd+K` instant Aven palette.

---

## 19. DETAILED 15-PHASE IMPLEMENTATION PLAN

Every phase strictly implements the **14-Step Loop Engineering Standard**:  
`INSPECT → HYPOTHESIZE → IMPLEMENT → TARGETED TEST → REGRESSION → OBSERVE → DIAGNOSE → REPAIR → RETEST → ADVERSARIAL TEST → REAL DEVICE TEST → REPLAY → ARCHITECTURAL AUDIT → PHASE GATE`

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       15-PHASE IMPLEMENTATION DEPENDENCY GRAPH                                         │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

Phase 0: Feasibility & Baseline Audit (Reality check, Notifee audit, battery profiling)
   ↓
Phase 1: Canonical Surface Contracts & Projection Engine (IInteractionSurfaceState in Kernel)
   ↓
Phase 2: Headless Action Proposal Gateway (/api/kernel/dispatch & idempotency validation)
   ↓
Phase 3: Push Distribution Gateway & Device Registry (FCM / APNs / SSE infrastructure)
   ↓
Phase 4: Mobile Event-Driven Active Notifications (Purge 15s polling; Notifee active chronometer)
   ↓
Phase 5: Mobile Headless Action Receiver (BroadcastReceiver for 1-tap Start/Done/Later)
   ↓
Phase 6: Android Jetpack Glance App Widget (Home-screen ambient surface via Expo Config Plugin)
   ↓
Phase 7: Desktop Tauri System Tray & Active Indicator (Rust menu bar and state pulse)
   ↓
Phase 8: Desktop Frameless Spotlight HUD & Global Hotkeys (Cmd+Shift+Space instant entry)
   ↓
Phase 9: Web Sticky Execution Bar & Service Worker Web Push (Browser-level ambient presence)
   ↓
Phase 10: Unified Lightweight Aven Conversational Sheet (Sub-180ms voice streaming)
   ↓
Phase 11: Local Wake-Word Engine Integration & Acoustic Benchmarks (Sherpa-ONNX "Aven" & "Hey Aven")
   ↓
Phase 12: Desktop Local Wake-Word Integration (Tauri cpal audio thread -> Spotlight HUD)
   ↓
Phase 13: Mobile Wake-Word & Quick Settings Tile (AvenTileService + battery-safe listener)
   ↓
Phase 14: Cross-Surface Hardening, Chaos Testing & 24h Real-Device Battery Validation
```

### Phase-by-Phase Execution Details

#### Phase 0: Feasibility & Baseline Audit
- **Goal**: Measure current mobile battery draw of `persistentNotification.ts`, benchmark Notifee headless execution, and verify Tauri v2 plugin compatibility.
- **Deliverables**: `BaselineInteractionMetrics.md`, benchmark scripts.
- **Phase Gate**: Quantitative baseline established; verified that 15s polling drains $\ge 4.5\%$ battery/day.

#### Phase 1: Canonical Surface Contracts & Projection Engine
- **Goal**: Implement `IInteractionSurfaceState` and `InteractionSurfaceService.ts` in the execution kernel.
- **Deliverables**: Projection generator assembling live active execution, upcoming commitments, and interventions from `WorldModelBridge`.
- **Phase Gate**: Unit tests verify projection generation $< 5\text{ms}$; 100% strict adherence to $\le 250$ token budget.

#### Phase 2: Headless Action Proposal Gateway
- **Goal**: Build `/api/kernel/dispatch` to accept `ISurfaceActionEnvelope`, validate preconditions, and route to `KernelCapabilityService`.
- **Deliverables**: Action gateway route, idempotency verification, compensation linkages.
- **Phase Gate**: 50 concurrent simulated taps result in exactly 1 mutation; 0 double-completion bugs.

#### Phase 3: Push Distribution Gateway & Device Registry
- **Goal**: Build `UserDeviceRegistrationModel` and `PushDispatchService` supporting FCM, APNs, and SSE.
- **Deliverables**: Silent data push dispatcher, SSE hub for desktop/web.
- **Phase Gate**: State mutation on backend triggers SSE and push events within $< 500\text{ms}$.

#### Phase 4: Mobile Event-Driven Active Notifications
- **Goal**: Deprecate the 15s polling loop in `persistentNotification.ts`. Rebuild with event-driven Notifee active notifications.
- **Deliverables**: `ActiveExecutionNotificationManager.ts`. Notification appears *only* when a task is running.
- **Phase Gate**: Verified on real Android device: notification displays live chronometer and dismisses cleanly on task completion.

#### Phase 5: Mobile Headless Action Receiver
- **Goal**: Implement Kotlin `TaskActionReceiver.kt` to handle notification action button taps without launching React Native.
- **Deliverables**: Native broadcast receiver, encrypted token reader, network retry logic.
- **Phase Gate**: Tapping `[Done]` executes task completion in $< 350\text{ms}$ while the app is in the background or killed.

#### Phase 6: Android Jetpack Glance App Widget
- **Goal**: Implement Compose-based Glance home-screen widget ($4\times 2$ and $2\times 2$) via Expo Config Plugin.
- **Deliverables**: `LifeOsGlanceWidget.kt`, `plugins/withLifeOsGlanceWidget.js`.
- **Phase Gate**: Widget renders current task, countdown to next event, and updates dynamically when push messages arrive.

#### Phase 7: Desktop Tauri System Tray & Active Indicator
- **Goal**: Implement native system tray in `apps/desktop/src-tauri/src/lib.rs`.
- **Deliverables**: Dynamic tray icon (idle vs active pulse), left-click status popover, right-click actions.
- **Phase Gate**: Tray icon reflects live task progress; 1-tap `[Done]` completes task via Kernel.

#### Phase 8: Desktop Frameless Spotlight HUD & Global Hotkeys
- **Goal**: Implement centered Spotlight HUD summoned via `Cmd+Shift+Space` or `Ctrl+Alt+Space`.
- **Deliverables**: Pre-warmed Tauri window, auto-blur dismissal, instant keyboard input.
- **Phase Gate**: Hotkey-to-focus latency $< 120\text{ms}$; Esc dismisses window cleanly.

#### Phase 9: Web Sticky Execution Bar & Service Worker Web Push
- **Goal**: Implement sticky executive header bar across Next.js app and Service Worker for browser notifications.
- **Deliverables**: `StickyExecutiveBar.tsx`, `public/sw.js`.
- **Phase Gate**: Browser notification actions execute `complete_task` headlessly via Service Worker.

#### Phase 10: Unified Lightweight Aven Conversational Sheet
- **Goal**: Create fast-loading conversational sheet route (`quick-aven.tsx` and desktop HUD).
- **Deliverables**: Direct SSE streaming to `Supervisor.ts`, sub-180ms voice playback via `FastSemanticFiller`.
- **Phase Gate**: Audio response begins streaming within $< 180\text{ms}$ of user speech termination.

#### Phase 11: Local Wake-Word Engine Integration & Acoustic Benchmarks
- **Goal**: Package Sherpa-ONNX quantized models for "Aven" and "Hey Aven".
- **Deliverables**: Acoustic evaluation harness, false-positive benchmarking suite.
- **Phase Gate**: Positive detection rate $\ge 95\%$; false activation $< 1$ per 24 hours in noisy background environments.

#### Phase 12: Desktop Local Wake-Word Integration
- **Goal**: Implement background Rust audio capture thread in Tauri using `cpal` and Sherpa-ONNX.
- **Deliverables**: `src-tauri/src/wake_word.rs`.
- **Phase Gate**: Saying "Aven" while typing in VS Code pops up Spotlight HUD and begins voice stream in $< 250\text{ms}$.

#### Phase 13: Mobile Wake-Word & Quick Settings Tile
- **Goal**: Implement `AvenTileService.kt` and battery-safe Android wake-word listener.
- **Deliverables**: Android Quick Settings tile, proximity/screen-state sensor pause logic.
- **Phase Gate**: Pulling down shade and tapping "Aven" launches voice session instantly; wake word functions when screen is active.

#### Phase 14: Cross-Surface Hardening, Chaos Testing & 24h Battery Validation
- **Goal**: Multi-device synchronization validation, network failure chaos testing, and 24-hour battery consumption audit.
- **Deliverables**: Full test logs, battery drain report, architectural audit sign-off.
- **Phase Gate**: Cross-device sync lag $< 2.0\text{s}$; total 24h background battery draw $< 1.0\%$; zero second-brain AST violations.

---

## 20. TEST STRATEGY & TEST ORACLE MATRIX

Testing will adhere to the strict **Test Oracle Rule**: Zero mock-passing; real-system execution validation on every tier:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           TEST ORACLE VALIDATION MATRIX                                                │
├─────────────────────┬─────────────────────────────────┬────────────────────────────────────────────────────────────────┤
│ Test Suite          │ Target System                   │ Success Criteria & Oracle Invariants                           │
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Headless Action     │ /api/kernel/dispatch            │ HTTP 200 returned; task in MongoDB marked 'completed';          │
│ Roundtrip           │                                 │ ExecutionChronicle entry logged with sourceSurface metadata.   │
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Idempotency & Race  │ KernelCapabilityService         │ 50 concurrent identical action requests yield exactly 1 DB     │
│ Conditions          │                                 │ mutation and 49 cached idempotent responses.                   │
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Cross-Device Sync   │ Android + Desktop + Web         │ Device A executes 'complete_task' -> Device B & C dismiss       │
│ Consistency         │                                 │ notifications and update widgets in <= 2.0 seconds.            │
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Offline Queue       │ Local SQLite / Room             │ 5 actions queued offline -> network restored -> all 5 committed│
│ Reconciliation      │                                 │ in FIFO order; zero data loss; zero ghost tasks.               │
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Wake-Word Accuracy  │ Sherpa-ONNX KWS Engine          │ Positive: "Aven" & "Hey Aven" trigger rate >= 95%.             │
│ & Adversarial Tests │                                 │ Negative: Zero triggers on "haven", "avenue", "Kevin", TV audio│
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Mobile Battery Draw │ Android dumpsys batterystats    │ 24-hour background execution draws <= 1.0% total battery.      │
│ (24h Run)           │                                 │ Zero Android OS battery warnings or ANR crashes.               │
├─────────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Architectural AST   │ Entire Codebase                 │ Zero direct MongoDB writes outside KernelCapabilityService;    │
│ Compliance Audit    │                                 │ Zero regex semantic routing; Zero client-side task managers.   │
└─────────────────────┴─────────────────────────────────┴────────────────────────────────────────────────────────────────┘
```

---

## 21. OBSERVABILITY & TELEMETRY

All surface interactions emit structured events into the existing LifeOS `ExecutionChronicle`:

```json
{
  "eventId": "evt_surf_948271",
  "eventType": "SURFACE_ACTION_COMMITTED",
  "sourceSurface": "ANDROID_NOTIFICATION_ACTION",
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

Telemetry dashboards in `/admin/analytics` will monitor:
- Surface Action Share (% actions executed via surface vs full app).
- Sync Lag P50 / P99.
- Wake-Word False Acceptance Rate (FAR) and False Rejection Rate (FRR).
- Offline Queue Replay Success Rate.

---

## 22. RISK REGISTRY & MITIGATION STRATEGIES

1. **Risk: Android 14+ OEM Background Killing (Samsung OneUI / Xiaomi MIUI)**:
   - *Mitigation*: Do not run long-running background tasks. Use native system `BroadcastReceiver` components and high-priority FCM data messages. Provide an in-app setup guide for battery optimization exemption if Ambient Wake-Word mode is enabled.
2. **Risk: Expo Config Plugin Build Breakages on Native Upgrades**:
   - *Mitigation*: Isolate all native Glance and Notifee extensions within clean, modular Expo Config Plugins (`plugins/withLifeOsGlanceWidget.js`) tested in isolated CI docker builds.
3. **Risk: Wake-Word False Triggers Disrupting Work**:
   - *Mitigation*: Dual-stage confidence gating ($\ge 0.65$ threshold) + subtle haptic chime before open microphone capture. If no speech follows within 3 seconds, session auto-terminates silently.
4. **Risk: Accidental Double-Taps Creating Corrupt State**:
   - *Mitigation*: Mandatory SHA-256 idempotency tokens enforced at the Sovereign Kernel gate (`idempotencyKey`).

---

## 23. REJECTED ALTERNATIVES & ARCHITECTURAL RATIONALE

1. **Rejected: 24/7 Red Foreground Notification (Current Prototype)**:
   - *Rationale*: Drains battery via 15s polling, creates severe notification fatigue, violates Android 14 FGS time caps, and cannot be dismissed without annoying users.
2. **Rejected: Floating Android Chat Heads / Overlays (`SYSTEM_ALERT_WINDOW`)**:
   - *Rationale*: Clutters the screen while gaming/reading, requires intrusive user permissions, completely unsupported on iOS, and creates fragile window state.
3. **Rejected: Client-Side SQLite Task Manager ("Mini Second Brain")**:
   - *Rationale*: Violates Constitutional Invariant 2. Local state machines inevitably drift from backend reality. The surface must remain a pure projection renderer.
4. **Rejected: Continuous Cloud Audio Streaming for Wake Word**:
   - *Rationale*: Severe privacy violation, massive cellular data usage, and battery-hostile. Wake-word detection must be 100% on-device.

---

## 24. OPEN QUESTIONS & PLATFORM SPIKES

1. **Spike 1: Jetpack Glance within Expo Custom Dev Client**: Validate that `@react-native-async-storage/async-storage` and Glance widget can share state via Android `SharedPreferences` without native build race conditions.
2. **Spike 2: Sherpa-ONNX CPU Overhead on Mid-Range Android**: Benchmark real-world battery impact of Sherpa-ONNX on a mid-range Qualcomm Snapdragon 7-series device over an 8-hour period.
3. **Spike 3: Windows WASAPI Audio Capture in Tauri v2**: Confirm that `cpal` captures clean audio when system output is actively playing media (echo cancellation verification).

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
[Phase 4: Active Notifs]    [Phase 7: Desktop Tray]   [Phase 9: Web Bar]  [Phase 11: Wake-Word Engine]
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

## 26. FINAL ARCHITECTURAL SELF-CRITIQUE (SECTION 29 COMPLIANCE)

1. **Which parts came from the original product concept?**
   - The vision of ambient presence, home-screen widget, actionable notifications (`[Start]`, `[Done]`, `[Later]`), lightweight mic entry, and cross-device synchronization.
2. **Which parts came from the independent architectural research?**
   - The Tiered Ambient Interaction Mesh concept, the rejection of 24/7 overlays, the unified `IInteractionSurfaceState` projection, the headless `BroadcastReceiver` architecture, and the desktop Spotlight HUD.
3. **Which parts did you reject?**
   - Rejected the 24/7 persistent red notification prototype (`persistentNotification.ts`) and the 15-second background network polling loop.
   - Rejected floating Android chat heads (`SYSTEM_ALERT_WINDOW`).
   - Rejected client-side task state managers.
4. **Why were they rejected?**
   - They violate Android 14+ policies, drain battery, create notification fatigue, cannot run on iOS, and violate Constitutional Invariant 2 ("No Second Brain").
5. **Which assumptions were verified against the repository?**
   - Verified that Notifee is installed (`@notifee/react-native 9.1.8`).
   - Verified that Tauri v2 is configured with deep linking.
   - Verified that `KernelCapabilityService` handles `complete_task` and `ActionProposals`.
   - Verified that `expo-audio` supports full-duplex recording and neural TTS.
6. **Which assumptions require external platform verification?**
   - Jetpack Glance Expo config plugin compatibility requires validation during Phase 6.
   - Background microphone CPU consumption on specific Android OEM chipsets requires measurement in Phase 13.
7. **What is the biggest architectural risk?**
   - Push notification delivery latency on cellular networks (FCM can lag by 2–5s in deep sleep). Mitigated by local optimistic UI updates in the headless receiver.
8. **What is the biggest UX risk?**
   - Users may accidentally start or complete tasks if touch targets are too small. Mitigated by minimum $48\times 48\text{dp}$ touch targets and 24-hour instant undo.
9. **What is the biggest wake-word risk?**
   - False positive activations in noisy rooms. Mitigated by dual-stage confidence thresholds and 3-second silence auto-cancellation.
10. **What could create a second brain?**
    - Writing task filtering, priority calculations, or cadence logic inside Kotlin or Rust client code. Prevented: all ordering comes strictly from the server projection.
11. **What could cause cross-device divergence?**
    - Client devices acting on stale cached state without validating monotonic version numbers. Prevented: every mutation checks `projectionVersion` and idempotency keys.
12. **What could make LifeOS annoying?**
    - Loud chimes during meetings. Prevented: active notifications are strictly silent; proposals respect Phase 8 `InterruptionCostEvaluator` and quiet hours.
13. **What could make it battery-heavy?**
    - Any periodic background network polling. Prevented: 100% event-driven push and OS-managed alarms.
14. **What could make wake word unusable?**
    - High detection latency or missing user speech. Prevented: 2.0-second rolling ring buffer ensures the initial word of the sentence is preserved upon wake activation.
15. **What should NOT be implemented?**
    - Do NOT implement mood sliders, complex habit trackers, or multi-tab navigation inside widgets or notifications.
16. **What is the smallest meaningful MVP?**
    - **Phases 1, 2, 4, and 5**: Event-driven Active Execution Notifications with headless `[Start]` and `[Done]` buttons communicating directly to the Kernel, replacing the 15-second polling loop.
17. **What should be measured before expanding?**
    - Real-device 24-hour battery consumption and notification action tap-to-commit latency.
18. **What parts should remain deliberately platform-specific?**
    - Desktop uses Spotlight HUD and System Tray; Android uses Jetpack Glance and Quick Settings Tile; iOS uses WidgetKit and Dynamic Island. The backend provides one state; platforms manifest it natively.

---

## 27. FINAL ARCHITECTURAL SIGN-OFF & STOP DIRECTIVE

This document represents the complete, dependency-ordered, and repository-grounded implementation plan for the **LifeOS Ambient Interaction Layer**.

**In accordance with instructions, zero code has been modified or implemented.**

The architecture is fully documented and ready for your independent review.
