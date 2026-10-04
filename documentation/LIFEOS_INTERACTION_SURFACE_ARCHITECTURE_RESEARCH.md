# LIFEOS INTERACTION SURFACE ARCHITECTURE & SYSTEM DESIGN RESEARCH
## Sovereign, Ambient, Multi-Surface Architecture for Aven & LifeOS

**Document ID**: `LIFEOS_INTERACTION_SURFACE_ARCHITECTURE_RESEARCH.md`  
**Classification**: Research & Architectural Specification  
**Status**: Proposal / Pre-Implementation Architectural Evaluation  
**Author**: Antigravity (Advanced Agentic Architecture Group)  
**Target Systems**: Android (Expo / React Native), iOS (WidgetKit / ActivityKit), Desktop (Tauri v2), Web (Next.js App Router)  
**Authoritative Backend**: LifeOS Kernel Sovereign Boundary (`WorldModelV2`, `KernelCapabilityService`, `Aven Supervisor`)

---

## 1. EXECUTIVE SUMMARY

The recent completion of the Master 15-Phase Transformation established LifeOS as a hardened, epistemically grounded cognitive operating system. Its backend now possesses unified world context (`WorldModelV2`), sub-15ms projection bridges, multi-factor causal reasoning, 6-tier autonomy, and sovereign mutation guarantees.

However, **LifeOS suffers from severe user interaction friction**. The user is forced into an "App Destination" mental model:
> *To log a task, start a focus block, check an intervention, or speak to Aven, the user must unlock a phone, locate the app, wait for cold start/navigation, traverse menus, and manually report life state.*

This violates the foundational vision of LifeOS: **a personal operating system that participates in the user's day, rather than an administrative database the user reports to.**

### The Core Architectural Dilemma
An early prototype in the repository (`apps/mobile/utils/persistentNotification.ts`) attempted to solve this via a permanent, red foreground service notification running a 15-second JavaScript `setInterval` that loops over pending tasks. This prototype is **battery-hostile, violates Android 14+ foreground service policies, lacks task state lifecycle transitions, lacks cross-device synchronization, and creates severe notification fatigue.**

### Proposed Resolution: The Tiered Ambient Interaction Mesh (Option C)
This document rejects both the "Heavy Floating Overlay" (Option B) and the "Pure Ephemeral Push Notification" (Option A) in favor of a **Tiered Ambient Interaction Mesh**:
1. **Glance Tier (Ambient State)**: Android Glance Widget + iOS WidgetKit + Desktop Menu Bar/System Tray for passive temporal awareness without battery drain.
2. **Active Execution Tier (Temporal Presence)**: A dynamic, high-visibility control surface that activates *only* during active task execution or scheduled transition windows (Android Actionable Notification, iOS Live Activity / Dynamic Island, Desktop Tray Progress, Web Executive Bar), and cleanly de-escalates when idle.
3. **Instant Conversational Entry (The Spotlight/Aven Tier)**: Zero-friction invocation of Aven via Android Quick Settings Tile / App Shortcuts, Desktop Global Hotkey (`Cmd/Ctrl+Shift+Space`), and Web Command Palettes—routing to a sub-180ms streaming voice/text sheet without full app navigation.
4. **Unified Interaction Surface State (`IInteractionSurfaceState`)**: A consolidated, read-only projection published by the LifeOS kernel. All surfaces (widget, notification, tray, watch, web) render from this single projection, and all user taps (`START`, `DONE`, `DEFER`, `REVERT`) emit canonical `ActionProposal` payloads through `KernelCapabilityService`.

Zero second brains. Zero regex routing. Deterministic 24-hour undoability across all surfaces.

---

## 2. CURRENT REPOSITORY REALITY: FORENSIC AUDIT

A forensic inspection of the LifeOS codebase reveals the exact state of existing interaction primitives:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CURRENT REPOSITORY REALITY                                │
├─────────────────────────┬───────────────────────────────┬──────────────────────────────┤
│ Subsystem / Component   │ Current Implementation State  │ Forensic Analysis & Gaps     │
├─────────────────────────┼───────────────────────────────┼──────────────────────────────┤
│ Mobile Stack            │ Expo ~57.0.24 / React Native  │ Modern architecture, but no  │
│ (apps/mobile)           │ 0.86.3, NativeWind, Router    │ Glance widgets or receivers. │
├─────────────────────────┼───────────────────────────────┼──────────────────────────────┤
│ Mobile Notification     │ @notifee/react-native 9.1.8   │ Prototype executioner notif  │
│ Prototype               │ withNotifeeForegroundService  │ runs 15s setInterval polling │
│                         │ persistentNotification.ts     │ dataSync FG service. Flawed. │
├─────────────────────────┼───────────────────────────────┼──────────────────────────────┤
│ Home Screen Widgets     │ ABSENT (0 files)              │ AndroidManifest.xml has no   │
│                         │                               │ AppWidgetProvider or Glance. │
├─────────────────────────┼───────────────────────────────┼──────────────────────────────┤
│ Desktop Stack           │ Tauri v2 (com.lifeos.desktop) │ Shell, log, single-instance, │
│ (apps/desktop)          │ Rust core + Node Next sidecar │ deep-link (lifeos://). No    │
│                         │                               │ tray, no global shortcuts.   │
├─────────────────────────┼───────────────────────────────┼──────────────────────────────┤
│ Web Notifications       │ NotificationLog MongoDB model │ Purely internal DB model.    │
│ (apps/web)              │ /api/notifications route      │ No Web Push, no VAPID, no SW.│
├─────────────────────────┼───────────────────────────────┼──────────────────────────────┤
│ Push Infrastructure     │ ABSENT (0 files)              │ No Firebase Admin SDK, no    │
│ (Backend)               │                               │ FCM tokens, no APNs gateway. │
├─────────────────────────┼───────────────────────────────┼──────────────────────────────┤
│ Realtime Synchronization│ Polling / SSE streaming chat  │ Streaming exists for chat    │
│                         │ /api/conversation (SSE)       │ (/api/conversation). No live │
│                         │                               │ push sync for app state.     │
├─────────────────────────┼───────────────────────────────┼──────────────────────────────┤
│ Kernel Execution        │ KernelCapabilityService.ts    │ Sovereign boundary exists;   │
│ Boundary                │ /api/calendar/mutate          │ ready for ActionProposals.   │
└─────────────────────────┴───────────────────────────────┴──────────────────────────────┘
```

### Forensic Takeaways:
1. **The mobile notification prototype must be deprecated**: Polling `/tasks/list` over cellular every 15 seconds in a JavaScript foreground service will trigger Android 14 `FOREGROUND_SERVICE_TYPE_DATA_SYNC` timeouts (6-hour OS cap) and battery drain.
2. **The backend kernel is ready**: `KernelCapabilityService` already supports `complete_task`, `create_task`, `schedule_occurrence`, `log_execution_interval`, and `compensateAction` via strict `ActionProposal` contracts.
3. **The missing bridge is a lightweight event transport and unified projection**: The system has no push delivery mechanism (FCM/APNs) to tell lightweight surfaces that state changed without polling.

---

## 3. CURRENT UX PROBLEMS

1. **High Interaction Latency for Atomic Actions**: Marking a 5-minute task done requires unlocking the device, opening LifeOS, waiting for React Native / Next.js bundle mount (1.5s - 3s), clicking through tabs, and clicking complete. Total time: 10 - 15 seconds for a 1-second mental event.
2. **Cognitive Burden of Self-Reporting**: The user must remember to report state changes. If they start a task at 2:00 PM and finish at 2:45 PM, but only open the app at 8:00 PM, temporal fidelity is completely lost.
3. **Invasive Mental-State Check-ins**: Sliders and modal questionnaires interrupt flow and produce survey fatigue.
4. **Lack of Ambient Awareness**: The user has no ambient peripheral view of what they should be doing *right now* versus what is coming up next.
5. **Conversational Inaccessibility**: Talking to Aven requires navigating to `/dashboard/assistant` or opening `chat-modal.tsx`. Aven cannot be summoned with the speed of Siri, Google Assistant, or Raycast.

---

## 4. PRODUCT GOALS

1. **Sub-Second Interaction**: Acknowledge, start, defer, or complete tasks in $\le 1$ tap directly from the lock screen, notification shade, desktop menu bar, or home screen.
2. **Context-Driven Presence**: The system is highly visible when active execution is occurring, and completely quiet/ambient when nothing requires attention.
3. **Instant Aven Access**: Summon Aven via voice or text in $< 300\text{ms}$ from any screen on any device without disrupting foreground work.
4. **Cross-Surface Consistency**: Tapping `[Done]` on an Android notification updates the Desktop Tray, Web Dashboard, and iOS Widget within 2 seconds.
5. **Strict Battery Neutrality**: Zero background network polling loops. State updates are strictly push-event driven or aligned with OS-managed refresh windows.
6. **Preservation of Backend Sovereignty**: Lightweight surfaces are pure read-projection renderers and action dispatchers. They contain zero business logic or task managers.

---

## 5. NON-GOALS

1. **Not a Full App Replacement**: Deep schedule editing, complex goal configuration, analytics review, and historical data browsing remain inside the main application.
2. **Not a Floating Bubble Chat UI (Android Chat Heads)**: We explicitly reject persistent floating chat heads (`SYSTEM_ALERT_WINDOW`) that draw over other applications 24/7.
3. **Not an Incessant Reminder Machine**: The surface will never spam the user every 5 minutes with nag alerts.
4. **Not a Standalone Local Task Tracker**: Surfaces will never persist an independent SQLite database that can drift from the LifeOS World Model.

---

## 6. EXISTING INTERACTION INFRASTRUCTURE & REUSE POTENTIAL

```
Existing Codebase Assets                   Reuse Strategy in Interaction Surface
─────────────────────────────────────────────────────────────────────────────────
KernelCapabilityService.ts                 Direct execution target for all surface taps.
LifeContextProjectionContracts.ts          Baseline schema for the interaction projection.
TemporalActionAdapters.ts                  Executes start_execution, complete_task, defer.
FastSemanticFiller.ts                      Sub-180ms conversational filler for quick voice.
MorningBriefingEngine.ts                   Powers morning lock-screen executive briefing.
AutonomousActionReverser.ts                Enables 1-tap "Undo" on notification actions.
InterruptionCostEvaluator.ts               Suppresses notification surfaces during quiet hours.
useChat.tsx (SSE streaming)                Reused directly for lightweight conversation sheets.
tauri.conf.json (lifeos:// deep links)     Deep-link routing from desktop notifications.
```

---

## 7. PLATFORM CAPABILITY & CONSTRAINT ANALYSIS

### 7.1 Android (API 31 - 35 / Android 12 - 15)
- **App Widgets (Jetpack Glance)**: Declarative Compose-based widgets. Memory footprint is minimal ($\le 15\text{MB}$). Updates triggered via `GlanceAppWidgetManager.update()`. RemoteViews limitation: no complex custom animations.
- **Actionable Notifications**: Up to 3 action buttons with `PendingIntent.getBroadcast()`. Crucial: Android 12+ bans "Notification Trampolines" (starting an Activity from a service/broadcast). Therefore, actions like `[Done]` or `[Start]` **must execute headlessly in a BroadcastReceiver / WorkManager** and update the notification in place without launching the UI!
- **Foreground Service Restrictions (Android 14+)**: Android 14 strictly mandates valid foreground service types. `dataSync` has a 6-hour timeout and requires user-visible work. **A 24/7 foreground service is forbidden on Android 14/15.** Ongoing notifications must be driven by active task execution state or standard notification channels.
- **Quick Settings Tile**: Android `TileService` allows a permanent, system-level quick toggle (e.g. "Aven Voice"). Extremely fast, accessible from lock screen, zero battery impact when idle.
- **Lock Screen**: Notifications marked `VISIBILITY_PUBLIC` display on the lock screen. Redaction of sensitive goal/health details is required when the device is locked (`VISIBILITY_PRIVATE`).

### 7.2 iOS (iOS 16 - 18)
- **WidgetKit**: Strictly timeline-based (`TimelineProvider`). Refresh budget is controlled by iOS (~40-70 refreshes per 24 hours). Cannot poll servers directly.
- **Interactive Widgets (iOS 17+)**: Buttons trigger `AppIntent`. An `AppIntent` can run background network code to invoke the LifeOS kernel.
- **Live Activities & Dynamic Island (ActivityKit)**: Designed specifically for active temporal tracking. A task execution block can be rendered in the Dynamic Island with a live count-down timer, progress bar, and `[Done]` / `[Pause]` buttons. Updates are pushed via APNs ActivityKit tokens.
- **Actionable Notifications**: `UNNotificationCategory` with `UNNotificationAction`. Background actions run without opening the app if `.foreground` option is omitted.

### 7.3 Desktop (Tauri v2 / Windows & macOS)
- **System Tray (`tauri-plugin-tray`)**: Runs in background with minimal RAM ($< 35\text{MB}$). Shows current active task, progress icon, and right-click action menu.
- **Global Hotkey (`tauri-plugin-global-shortcut`)**: Registers system-wide shortcut (e.g. `Cmd+Shift+Space` or `Ctrl+Alt+A`). Instantly displays a centered, frameless Spotlight window in $< 100\text{ms}$.
- **Native Notifications (`tauri-plugin-notification`)**: Standard OS toasts on Windows / macOS with action buttons.

### 7.4 Web & Progressive Web Apps (PWA)
- **Service Worker & Web Push**: `self.registration.showNotification()` with action buttons. Supported in Chromium, Firefox, and macOS Safari.
- **iOS Safari PWA Limitations**: Web Push on iOS requires the user to explicitly "Add to Home Screen" and grant permission. Background execution without push is non-existent.
- **Web Command Palette**: `Cmd+K` keyboard listener on desktop web, floating speed-dial on mobile web.

---

## 8. CANDIDATE ARCHITECTURE OPTIONS: THREE COMPETING DESIGNS

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        ARCHITECTURAL CANDIDATES COMPARISON                             │
├─────────────────────┬──────────────────────────┬───────────────────────────────────────┤
│ Option              │ Architecture Summary     │ Primary Interaction Vehicle           │
├─────────────────────┼──────────────────────────┼───────────────────────────────────────┤
│ Option A:           │ Ephemeral notifications  │ Push notifications with action        │
│ Notification-       │ + Glance widget.         │ buttons. Zero continuous background   │
│ Centric Ephemeral   │ No ongoing notifications.│ presence. Minimalist approach.        │
├─────────────────────┼──────────────────────────┼───────────────────────────────────────┤
│ Option B:           │ 24/7 Foreground service  │ Persistent red banner + floating      │
│ Persistent Ambient  │ + floating chat heads    │ bubble overlay (SYSTEM_ALERT_WINDOW). │
│ Overlay & Launcher  │ drawing over all apps.   │ Always on top of screen.              │
├─────────────────────┼──────────────────────────┼───────────────────────────────────────┤
│ Option C:           │ Unified State Mesh:      │ Passive Glance Widget + Dynamic       │
│ Tiered Ambient      │ Context-driven execution │ Active Execution Surface (Live        │
│ Interaction Mesh    │ surface + instant entry  │ Activity / Notification) + Instant    │
│ (RECOMMENDED)       │ points (Tile / Spotlight)│ Voice/Text Spotlight Sheet.           │
└─────────────────────┴──────────────────────────┴───────────────────────────────────────┘
```

---

## 9. COMPARATIVE EVALUATION MATRIX

| Evaluation Criteria | Option A: Notification-Centric | Option B: Persistent Overlay | Option C: Tiered Interaction Mesh |
|---|---|---|---|
| **UX & Ergonomics** | Low: Missed notifications mean lost context; no active progress indicator. | Poor/Annoying: Screen clutter, intrusive bubbles, accidental taps while gaming. | **Superior**: Ambient when calm, high-visibility when active, instant access on demand. |
| **Glanceability** | Medium (widget only). | High (always on screen). | **High**: Widget for day-glance; Dynamic Island / Tray for running tasks. |
| **Battery Impact** | **Near Zero** (OS push driven). | **Severe**: High CPU usage, constant rendering, battery drain warnings. | **Optimal**: Event-driven; 0% CPU when idle; active only during task intervals. |
| **Android 14+ Compliance** | 100% Compliant. | **Fails**: Google Play policy violations on `dataSync` and `SYSTEM_ALERT_WINDOW`. | **100% Compliant**: Standard receivers, Jetpack Glance, approved FGS types. |
| **iOS Parity** | 90% Parity. | **0% Parity**: iOS forbids floating window overlays completely. | **100% Parity**: Maps naturally to WidgetKit and Live Activities. |
| **Desktop / Tauri Parity** | Weak: Toasts disappear quickly. | Clunky: Always-on-top window gets in the way of IDEs/browsers. | **Native**: System Tray + Spotlight Hotkey matches Raycast/Alfred ergonomics. |
| **Kernel Sovereignty** | High. | Risk of local state divergence in floating overlay. | **Absolute**: All surfaces dispatch typed `ActionProposal` to Kernel boundary. |
| **Implementation Complexity**| Low. | Very High (fragile Android window management). | **Moderate**: Structured, standard platform APIs. |

### Architectural Verdict
**Option B is definitively rejected.** It is battery-hostile, illegal on iOS, non-compliant with modern Android Play Store policies, and annoying to users.  
**Option A is technically safe but practically insufficient.** It leaves the user blind during ongoing execution once a notification is dismissed.  
**Option C (Tiered Ambient Interaction Mesh) is overwhelmingly recommended.** It respects platform lifecycles, guarantees cross-platform parity, minimizes battery impact, and provides high-utility interaction exactly when needed.

---

## 10. RECOMMENDED INTERACTION ARCHITECTURE (TIERED MESH)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          LIFEOS TIERED AMBIENT INTERACTION ARCHITECTURE                                │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘

                                    ┌────────────────────────┐
                                    │      WORLD MODEL       │
                                    │    (Canonical Truth)   │
                                    └───────────┬────────────┘
                                                │
                                                ▼
                                    ┌────────────────────────┐
                                    │  INTERACTION SURFACE   │
                                    │   PROJECTION SERVICE   │
                                    └───────────┬────────────┘
                                                │
                                    ┌───────────┴────────────┐
                                    │ IInteractionSurfaceState│
                                    └───────────┬────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 │ Event Push (FCM / APNs)      │ Server-Sent Events (SSE)     │ Local Broadcast / IPC
                 ▼                              ▼                              ▼
      ┌─────────────────────┐        ┌─────────────────────┐        ┌─────────────────────┐
      │     MOBILE TIER     │        │     DESKTOP TIER    │        │       WEB TIER      │
      ├─────────────────────┤        ├─────────────────────┤        ├─────────────────────┤
      │ • Glance Widget     │        │ • System Tray Icon  │        │ • Ambient Top-Bar   │
      │ • Active Execution  │        │ • Spotlight HUD     │        │ • Cmd+K Command Bar │
      │   Notification / LA │        │   (Global Shortcut) │        │ • Service Worker    │
      │ • Quick Settings    │        │ • Native Toasts     │        │   Push Actions      │
      │   Voice/Chat Sheet  │        │                     │        │                     │
      └──────────┬──────────┘        └──────────┬──────────┘        └──────────┬──────────┘
                 │                              │                              │
                 └──────────────────────────────┼──────────────────────────────┘
                                                │
                                   Canonical User Interaction
                                   (START, DONE, LATER, REVERT)
                                                │
                                                ▼
                                    ┌────────────────────────┐
                                    │    ACTION PROPOSAL     │
                                    │       GATEWAY          │
                                    │   (/api/kernel/mutate) │
                                    └───────────┬────────────┘
                                                │
                                                ▼
                                    ┌────────────────────────┐
                                    │    SOVEREIGN KERNEL    │
                                    │ KernelCapabilityService│
                                    └────────────────────────┘
```

---

## 11. SURFACE MODEL: THE THREE OPERATIONAL TIERS

### Tier 1: The Ambient Glance Surface
- **Purpose**: Continuous temporal awareness without user action or battery impact.
- **Vehicles**:
  - Android: Modern Jetpack Glance Home Screen Widget ($4\times 2$ and $2\times 2$).
  - iOS: WidgetKit Home Screen & Lock Screen Widget.
  - Desktop: System Tray minimal icon + tooltip (`"Next: Team Sync in 24m"`).
  - Web: Compact status pill in the persistent dashboard header.
- **Content Rendered**:
  - Current timeblock / active status.
  - Next upcoming commitment and countdown.
  - Priority task counter.
  - Quick action: `[Start Next Task]`.

### Tier 2: The Active Execution Surface (The Temporal Anchor)
- **Purpose**: High-visibility focus and friction-free completion *only when a commitment is actively running*.
- **Lifecycle**:
  - **Dormant**: When the user is between tasks, this surface does not exist. No persistent notification cluttering the phone shade.
  - **Triggered**: When a scheduled block arrives or the user taps `[Start]`.
  - **Vehicles**:
    - Android: Ongoing Notification with chronometer (`00:24:12`), task title, and explicit action buttons: `[ Done ]`, `[ Pause ]`, `[ +15m ]`.
    - iOS: Live Activity on Lock Screen and Dynamic Island.
    - Desktop: Tray icon transitions to active pulse; mini-dock bar floats on secondary monitor (optional).
    - Web: Sticky, translucent bottom execution controller with live timer.
  - **Termination**: Tapping `[Done]` or `[Cancel]` immediately dispatches to the Kernel and dismisses the surface.

### Tier 3: Instant Conversational Entry (The Spotlight/Aven Surface)
- **Purpose**: Fast conversational input without opening the full application.
- **Vehicles**:
  - Android: Quick Settings Shade Tile (`"Aven"`) or Lock Screen Assistant Shortcut $\to$ launches an ultra-lightweight, translucent bottom-sheet (`QuickAvenActivity`). Zero app navigation; instant microphone capture with `FastSemanticFiller` voice streaming.
  - Desktop: Global Hotkey (`Cmd/Ctrl+Shift+Space`) $\to$ centered, borderless Raycast-style input bar.
  - Web: Global keyboard shortcut (`Cmd+K`).

---

## 12. STATE MODEL: UNIFIED INTERACTION SURFACE PROJECTION

To ensure zero second brains, the interaction layer is governed by a single typed contract published by the backend:

```typescript
export interface IInteractionSurfaceState {
  version: number;                        // Monotonically increasing state version
  generatedAtMs: number;                  // Timestamp of state projection
  userId: string;
  
  // Active Execution State (Governs Tier 2 visibility)
  activeExecution: {
    hasActiveTask: boolean;
    taskId?: string;
    chronicleId?: string;
    occurrenceId?: string;
    title?: string;
    category?: "DEEP_WORK" | "MEETING" | "HABIT" | "ROUTINE" | "GENERAL";
    startedAtMs?: number;
    plannedDurationMinutes?: number;
    elapsedSeconds?: number;
    canExtend: boolean;
    canComplete: boolean;
    canPause: boolean;
  } | null;

  // Upcoming Temporal State (Governs Tier 1 Glance)
  upcomingCommitment: {
    title: string;
    startsAtMs: number;
    minutesUntilStart: number;
    isHardDeadline: boolean;
    locationOrLink?: string;
  } | null;

  // Pending Decisions & Human-in-the-Loop Interventions
  pendingIntervention: {
    interventionId: string;
    type: "PROPOSAL_START" | "RECOVERY_NUDGE" | "SCHEDULE_CONFLICT";
    headline: string;
    explanation: string;
    suggestedActions: Array<{
      actionLabel: string;
      actionPayload: Record<string, any>;
      isPrimary: boolean;
    }>;
    expiresAtMs: number;
  } | null;

  // Conversational Continuity Reference
  conversationContext: {
    activeConversationId: string;
    recentAssistantSummary: string;
  };
}
```

### State Storage & Invariant Guarantees:
- **Sole Source of Truth**: The projection is generated on the backend from `WorldModelV2` and `TemporalTimelineEngine`.
- **Client Cache**: Devices store only the latest received projection in lightweight persistent memory (`SharedPreferences` on Android, `UserDefaults` on iOS, `tauri-plugin-store` on Desktop).
- **Stale State Protection**: If `Date.now() - state.generatedAtMs > 30_minutes`, the client renders a degraded/reconnecting indicator rather than executing on stale task assumptions.

---

## 13. ACTION MODEL: CANONICAL ACTION DISPATCH

All taps from widgets, notification action buttons, tray menus, and spotlight bars must resolve to a canonical `ActionProposal` routed to the Sovereign Kernel:

```typescript
// Example: User taps [ Done ] on Android Notification
const completeTaskProposal: ActionProposal = {
  id: generateId("act_surf"),
  idempotencyKey: `idemp_complete_${taskId}_${dateStr}`,
  domain: "productivity",
  actionType: "complete_task",
  payload: {
    taskId: taskId,
    completedAt: new Date().toISOString(),
    sourceSurface: "ANDROID_NOTIFICATION_ACTION"
  },
  rationale: "User tapped [Done] on active execution surface",
  reversibility: "atomic_single_doc"
};

// Dispatched to: POST /api/calendar/mutate or /api/kernel/dispatch
```

### Headless Execution Workflow (No App Launch Required):
1. User taps `[ Done ]` on the notification.
2. Android `BroadcastReceiver` (`TaskActionReceiver.kt`) or iOS `AppIntent` catches the event.
3. The receiver acquires a wake-lock, reads the cached auth token from secure storage, and sends the payload to the LifeOS Kernel.
4. On HTTP 200:
   - The receiver updates the local notification to show: `"✓ Completed: Submit quarterly budget"`.
   - After 3 seconds, the notification cleanly auto-cancels.
   - The device broadcasts a local sync event so the Glance Widget immediately updates.
5. On Network Failure:
   - The action is appended to an encrypted SQLite / Room `PendingActionQueue`.
   - The UI shows: `"✓ Marked done (Syncing offline...)"`.
   - WorkManager / BackgroundSync flushes the queue immediately upon reconnect.

---

## 14. CONVERSATION ENTRY ARCHITECTURE (AVEN SPOTLIGHT)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                       AVEN LIGHTWEIGHT CONVERSATIONAL ENTRY                            │
└────────────────────────────────────────────────────────────────────────────────────────┘

User Trigger                   Surface Manifestation            Engine Bridge
──────────────────────────────────────────────────────────────────────────────────────────
Desktop: Cmd+Shift+Space       Frameless Spotlight HUD          SSE Stream to /api/conversation
Android: Quick Settings Tile   Translucent Voice BottomSheet    AudioCapture -> Whisper/TTS API
iOS: Action Button / Shortcut  Live Audio Sheet                 AVAudioEngine -> FastSemanticFiller
Web: Cmd+K / Voice Button      Modal Overlay                    Browser MediaStream -> Web SSE
```

### Architectural Rules for Lightweight Conversation:
1. **Never Mount the Full Navigation Hierarchy**: The conversational sheet is rendered in a dedicated, isolated window/activity (`QuickAvenActivity.kt` on Android, frameless Webview window on Tauri).
2. **Instant Audio Feedback (< 180ms)**: When opened via voice trigger, the sheet immediately begins audio capture and streams to `FastSemanticFiller`, streaming spoken audio back before the full LLM planner has finished thinking.
3. **Session Continuity**: All lightweight conversation turns use the default daily `conversationId`, ensuring that queries made from the lock screen are visible in the full conversation history.

---

## 15. NOTIFICATION STRATEGY & ANTI-FATIGUE POLICY

To prevent LifeOS from becoming an annoying spam tool, notifications are strictly governed by the Phase 8 `NotificationFatigueFilter` and `InterruptionCostEvaluator`:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              NOTIFICATION TAXONOMY & POLICIES                          │
├────────────────────┬───────────┬──────────────┬────────────────────────────────────────┤
│ Notification Type  │ Ongoing?  │ Sound/Vibe?  │ Auto-Dismissal Policy                  │
├────────────────────┼───────────┼──────────────┼────────────────────────────────────────┤
│ Active Execution   │ YES       │ Silent       │ Auto-dismisses when task ends or user  │
│ (Timer/Chronometer)│ (during)  │ (no nagging) │ taps [Done] / [Cancel].                │
├────────────────────┼───────────┼──────────────┼────────────────────────────────────────┤
│ Execution Proposal │ NO        │ Gentle Chime │ Expires after 15m; updates to silent   │
│ ("Time to start")  │           │              │ missed task in Glance widget.          │
├────────────────────┼───────────┼──────────────┼────────────────────────────────────────┤
│ Proactive Nudge    │ NO        │ Silent       │ Max 3/day; minimum 4-hour cooldown;    │
│ (Recovery/Burnout) │           │              │ strictly suppressed in Quiet Hours.    │
├────────────────────┼───────────┼──────────────┼────────────────────────────────────────┤
│ Autonomous Action  │ NO        │ Silent       │ Shows 1-tap [Undo] button; auto-       │
│ Execution Notice   │           │              │ dismisses after 30 seconds.            │
└────────────────────┴───────────┴──────────────┴────────────────────────────────────────┘
```

---

## 16. WIDGET ARCHITECTURE (GLANCE & WIDGETKIT)

### What Belongs in the Widget:
- Current task status + live chronometer if active.
- Title and start time of the next single commitment.
- 1-tap primary action: `[Start]` (if upcoming) or `[Done]` (if running).
- Aven microphone shortcut icon.

### What Does NOT Belong in the Widget:
- Multi-day calendar grids (belongs in `/calendar`).
- Nutrition/calorie tables (belongs in `/nutrition`).
- Task creation forms or deep text inputs.
- Sliders for mood or mental fatigue.

### Update Budget & Performance:
- **Android Glance**: Updates pushed on state change via FCM silent push or local BroadcastReceiver. Zero continuous polling.
- **iOS WidgetKit**: Timeline populated for the next 4 hours with deterministic minute entries.

---

## 17. DESKTOP / TAURI ARCHITECTURE

The desktop environment is the highest-productivity surface. The proposed Tauri architecture transforms `apps/desktop`:

```
┌──────────────────────────────────────────────────────────────────┐
│                     TAURI V2 DESKTOP TOPOLOGY                    │
├────────────────────────────────┬─────────────────────────────────┤
│ System Tray (tauri-plugin-tray)│ Global Spotlight HUD            │
├────────────────────────────────┼─────────────────────────────────┤
│ • Icon: Dynamic SVG icon       │ • Frameless, transparent window │
│   (shows idle, running, pause) │ • Always on top, centered       │
│ • Tooltip: Current execution   │ • Global hotkey: Ctrl+Alt+Space │
│ • Left-click: Mini status menu │ • Instant input + voice mic     │
│ • Actions: Start, Pause, Done  │ • Auto-hides on Esc or blur     │
└────────────────────────────────┴─────────────────────────────────┘
```

---

## 18. WEB & PWA ARCHITECTURE

1. **Persistent Top-Bar Controller**: When a task is running, a slim $36\text{px}$ bar anchors to the top of the browser tab across all pages, showing time elapsed and a 1-tap `[Done]` button.
2. **Web Push via Service Worker**:
   - `sw.js` listens to Push API events and displays native browser notifications with `actions: [{ action: 'complete', title: 'Done' }]`.
   - Action clicks dispatch `fetch('/api/tasks/complete')` directly inside the Service Worker without focusing or reloading the web page.

---

## 19. CROSS-DEVICE SYNCHRONIZATION TOPOLOGY

### Scenario: The Complete Synchronization Loop
1. **14:00:00**: Backend scheduler detects scheduled focus block: `"Write Architecture Spec"`.
2. **14:00:01**: Backend emits silent high-priority push message (`TYPE_SURFACE_UPDATE`) to all registered user devices (Phone, Laptop, Tablet).
3. **14:00:02**:
   - **Android**: Displays gentle proposal notification: `"Time to start: Write Architecture Spec"` with `[Start]` and `[Later]`.
   - **Desktop**: System Tray tooltip updates; toast notification appears.
4. **14:00:15**: User taps `[ Start ]` on their Android phone.
5. **14:00:16**: Android `TaskActionReceiver` sends `start_execution` to `/api/calendar/mutate`. Kernel executes mutation and emits WebSocket/SSE event.
6. **14:00:17**:
   - **Android Notification**: Switches from proposal to **Active Execution Chronometer** with `[Done]`, `[Pause]`, `[+15m]`.
   - **Android Widget**: Renders green active indicator: `"Active: Write Architecture Spec (0m)"`.
   - **Desktop**: System Tray icon turns active green; browser tab displays top execution bar.
7. **14:45:00**: User finishes work on desktop and taps `[ Done ]` on the desktop web app.
8. **14:45:01**: Web app calls `/api/tasks/complete`. Kernel mutates task to `completed`.
9. **14:45:02**: Backend sends silent push `TASK_COMPLETED`.
10. **14:45:03**: Phone automatically cancels the active execution notification and widget returns to idle state. **Zero residual clutter.**

---

## 20. OFFLINE OPERATION & FAILURE RECOVERY

```
┌────────────────────────────────────────────────────────────────────────┐
│                       OFFLINE ACTION QUEUE TOPOLOGY                    │
└────────────────────────────────────────────────────────────────────────┘

User Taps [Done] (No Network)
        │
        ▼
Is Network Connected? ──► YES ──► Kernel API ──► Confirmed Mutation
        │
        ▼ NO
Persist to Secure Room / SQLite Queue
(PendingAction: { actionId, type: "COMPLETE_TASK", payload, timestamp })
        │
        ▼
Update Surface Optimistically (Marked: "Done • Offline")
        │
        ▼
Network Monitor Detects Connectivity (WorkManager / ConnectivityManager)
        │
        ▼
Drain Queue in Chronological Sequence with Idempotency Keys
        │
        ▼
Reconcile with Authoritative State (Discard duplicates, report conflicts)
```

---

## 21. SECURITY, PRIVACY & LOCK-SCREEN COMPLIANCE

1. **Lock-Screen Privacy Redaction**: Notifications on the lock screen default to `VISIBILITY_PRIVATE`. Personal health metrics (calories, heart rate, therapy tasks) display generic titles (e.g. `"LifeOS: Scheduled Commitment"`) until the device is unlocked.
2. **Cryptographic Action Tokens**: Action buttons in notifications use short-lived, HMAC-signed action tokens to prevent malicious apps from triggering actions via spoofed Intents.
3. **Biometric Guard on Sensitive Actions**: Destructive actions (e.g. deleting goals, executing high-value purchases) cannot be approved headlessly from notifications; they deep-link into biometric authentication.

---

## 22. PERFORMANCE & BATTERY CONSTRAINTS

| Parameter | Target Limit | Enforcement Mechanism |
|---|---|---|
| **Background CPU Usage** | $< 0.5\%$ daily battery | Zero persistent polling loops; 100% push/alarm driven. |
| **Glance Widget Memory** | $< 25\text{MB}$ RAM | Lightweight remote views; no WebViews or heavy SVG rendering. |
| **Notification Action Latency** | $< 400\text{ms}$ tap-to-ack | Local optimistic UI ack in receiver before network completes. |
| **Spotlight HUD Launch** | $< 150\text{ms}$ hotkey-to-input | Pre-warmed hidden Tauri webview window. |

---

## 23. ACCESSIBILITY (A11Y)

1. **Screen Readers**: All notification actions include explicit `accessibilityLabel` attributes (e.g. `"Complete task: Submit budget proposal"` rather than `"Done"`).
2. **Haptic Feedback**: Meaningful haptic pulses on action triggers (light pulse on `Start`, success double-pulse on `Done`).
3. **Large Touch Targets**: Action buttons adhere to minimum $48\times 48\text{dp}$ touch targets on mobile and touch-friendly desktop interfaces.

---

## 24. NINE DETAILED USER JOURNEYS

### Journey 1: Scheduled Task $\to$ Notification $\to$ Start $\to$ Active Execution $\to$ Done
- **10:00 AM**: Notification fires: `"Draft Presentation (45m)"` $\to$ User taps `[Start]`.
- **In-Progress**: Notification changes to ongoing chronometer with `[Done]` button. Widget displays progress.
- **10:42 AM**: User taps `[Done]` directly on lock screen. Notification vanishes; widget returns to ambient state.

### Journey 2: Scheduled Task $\to$ Later $\to$ Intelligent Reschedule
- **14:00 PM**: Task notification fires $\to$ User is in a meeting, taps `[Later +30m]`.
- **System**: Kernel shifts block by 30 minutes, checks for collisions, and silences notifications until 14:30.

### Journey 3: Quick Capture Without Opening App
- **User thought**: "Need to buy HDMI cable."
- **Action**: User pulls down Android Quick Settings, taps `"Aven"`, speaks: *"Remind me to buy HDMI cable tomorrow morning"*.
- **Aven**: Replies with 1-sentence audio ack: *"Added to tomorrow morning's tasks."* Closes automatically.

### Journey 4: Voice Interaction on Desktop While Coding
- **User Action**: Presses `Ctrl+Alt+Space` inside VS Code.
- **HUD**: Translucent Spotlight appears centered. User says: *"What's my next meeting?"*
- **Aven**: Spoken audio replies: *"Sync with Alex at 3:00 PM in 18 minutes."* Pressing `Esc` dismisses the HUD.

### Journey 5: Cross-Surface Continuity (Web $\leftrightarrow$ Phone)
- User starts workout on Web App.
- Phone widget immediately switches to active workout mode with current exercise.
- User logs next set from phone; Web app reflects the logged set instantly via SSE.

### Journey 6: Offline Execution During Flight
- User on airplane taps `[Done]` on three tasks from the widget.
- Widget queues actions locally, marks items visually with a subtle cloud-sync icon.
- Phone lands, reconnects to LTE $\to$ WorkManager flushes queue, World Model reconciles with zero data loss.

### Journey 7: Multi-Device Conflict Resolution
- User has phone and laptop open.
- User marks task done on laptop.
- Phone receives silent push, dismisses the active notification, and updates widget within 1.5 seconds. No duplicate work.

### Journey 8: Proactive Aven Intervention (Burnout Detection)
- Phase 6 Cross-Domain engine detects 4 consecutive hours of intense meetings + poor sleep.
- Aven sends a gentle, low-priority nudge: `"Your cognitive readiness is dipping. Recommended: 15-minute screen break before client sync."` Actions: `[Block 15m Break]` | `[Dismiss]`.

### Journey 9: Ambient Silence (The Productive Flow State)
- User is in a scheduled 2-hour deep work block with no conflicts.
- LifeOS sends zero notifications, displays zero popups, and makes zero noise. The widget silently displays: `"Deep Work Focus (Remaining: 1h 14m)"`.

---

## 25. BACKEND INTEGRATION POINTS

1. **Surface Projection Generator**:
   - File: `packages/execution-kernel/src/experience/surface/InteractionSurfaceService.ts`
   - Purpose: Assembles `IInteractionSurfaceState` from `WorldModelV2` and `TemporalTimelineEngine`.
2. **Push Event Dispatcher**:
   - File: `packages/execution-kernel/src/notifications/PushDispatchService.ts`
   - Purpose: Dispatches FCM / APNs silent payloads when state transitions occur.
3. **Action Gateway Route**:
   - Route: `apps/web/app/api/kernel/dispatch/route.ts`
   - Purpose: Authenticated HTTP endpoint accepting `ActionProposal` from headless receivers.

---

## 26. KERNEL INTEGRATION REQUIREMENTS

- All headless surface actions must pass through `KernelCapabilityService.validateActionProposals()` and `executeAction()`.
- Idempotency keys must be formatted as: `idemp_surf_${actionType}_${entityId}_${timestampBucket}` to eliminate accidental double-taps.
- Undos must integrate with `AutonomousActionReverser.ts`, restoring prior state within the 24-hour window.

---

## 27. EXISTING CODE REUSE PLAN

- **Deprecate**: `apps/mobile/utils/persistentNotification.ts` (replace 15s polling service with event-driven Notifee manager).
- **Reuse**: `withNotifeeForegroundService.js` (retain for active execution chronometer notification).
- **Reuse**: `packages/execution-kernel/src/orchestration/supervisor/FastSemanticFiller.ts` (sub-180ms voice responses).
- **Reuse**: `apps/desktop/src-tauri/src/lib.rs` (extend with tray and global shortcut plugins).

---

## 28. REQUIRED NEW INFRASTRUCTURE (TO BE DESIGNED)

1. **Push Delivery Gateway**: Backend service to issue Firebase Cloud Messaging (FCM) and Apple Push Notification service (APNs) messages.
2. **Android Jetpack Glance Module**: Native Kotlin widget provider in `apps/mobile/android`.
3. **Headless Action BroadcastReceiver**: Kotlin receiver in `apps/mobile/android` to execute actions without mounting React Native.
4. **Tauri System Tray & Spotlight HUD**: Rust implementation in `apps/desktop/src-tauri`.

---

## 29. MIGRATION & IMPLEMENTATION PHASING

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              RECOMMENDED ROADMAP PHASES                                │
├───────────────┬────────────────────────────────────────────────────────────────────────┤
│ Phase 1       │ Interaction Surface State Projection & Headless Action Gateway (Kernel)│
├───────────────┼────────────────────────────────────────────────────────────────────────┤
│ Phase 2       │ Event-Driven Active Execution Notifications (Notifee / Headless Ack)   │
├───────────────┼────────────────────────────────────────────────────────────────────────┤
│ Phase 3       │ Android Jetpack Glance Widget (Home Screen Ambient Surface)            │
├───────────────┼────────────────────────────────────────────────────────────────────────┤
│ Phase 4       │ Desktop Tauri System Tray & Spotlight Quick-HUD (`Cmd+Shift+Space`)    │
├───────────────┼────────────────────────────────────────────────────────────────────────┤
│ Phase 5       │ Push Gateway (FCM/APNs) & Cross-Device Sync Engine                     │
├───────────────┼────────────────────────────────────────────────────────────────────────┤
│ Phase 6       │ Instant Voice/Text Assistant Bottom-Sheet (Quick Settings Tile)        │
└───────────────┴────────────────────────────────────────────────────────────────────────┘
```

---

## 30. TESTING STRATEGY

1. **Headless Action Roundtrip Tests**: Verify that sending an action from a simulated broadcast receiver mutates MongoDB through `KernelCapabilityService` in $< 150\text{ms}$.
2. **Idempotency & Double-Tap Stress Tests**: Fire 50 concurrent `complete_task` requests with identical idempotency keys; verify exactly one state mutation.
3. **Process Death & Offline Queue Tests**: Kill the app process, queue 5 offline actions, restore connectivity, and verify correct chronological replay.
4. **Battery & WakeLock Audit**: 24-hour Android battery benchmark measuring background CPU draw ($\le 0.5\%$).

---

## 31. OBSERVABILITY & TELEMETRY

- Every surface interaction records an event in the `ExecutionChronicle` with metadata: `{ sourceSurface: "ANDROID_NOTIFICATION" | "WIDGET" | "TAURI_TRAY" | "WEB" }`.
- Metrics tracked: Action Latency (tap to DB commit), Synchronization Lag (device A tap to device B update), and Offline Queue Depth.

---

## 32. RISKS & MITIGATIONS

1. **Risk: Android OEM Battery Aggression (Xiaomi, Samsung killing receivers)**
   - *Mitigation*: Register standard system broadcast receivers and utilize high-priority FCM data messages rather than custom long-running background loops.
2. **Risk: Network Flakiness Leading to Phantom State**
   - *Mitigation*: Local optimistic updates in notification UI backed by persistent local queue with SHA-256 idempotency.
3. **Risk: Notification Spam Accusations**
   - *Mitigation*: Strict dynamic de-escalation: notifications exist *only* while a task is running. Idle states are confined to widgets and tray icons.

---

## 33. REJECTED ALTERNATIVES & RATIONALE

1. **Persistent 24/7 Red Foreground Notification (Current Prototype)**:
   - *Rejected*: Drains battery, creates severe notification fatigue, violates Android 14 FGS rules.
2. **Floating Android Chat Heads / Overlays (`SYSTEM_ALERT_WINDOW`)**:
   - *Rejected*: Intrusive, breaks while using other apps, impossible on iOS, rejected by users.
3. **Client-Side Second Brain in SQLite / Realm**:
   - *Rejected*: Violates Constitutional Invariant 4 ("No Second Brain"). State logic belongs solely in the Kernel.

---

## 34. OPEN QUESTIONS & UNRESOLVED DECISIONS

1. **FCM vs WebSocket for Desktop**: Should the desktop client maintain a persistent WebSocket connection to the local sidecar, or should it use standard OS push? *(Recommendation: Local SSE to desktop sidecar).*
2. **iOS Live Activity Server Push vs Local Updates**: Should iOS Live Activities be updated via ActivityKit push tokens from the server, or scheduled locally via ActivityKit timeline? *(Recommendation: Hybrid—local timer for elapsed minutes, APNs for remote completion).*

---

## 35. FINAL ARCHITECTURAL SELF-CRITIQUE (SECTION 24 COMPLIANCE)

1. **What assumptions did you make?**
   - Assumed the user wants ambient access across mobile and desktop.
   - Assumed device network connectivity is intermittent, requiring local queues.
2. **Which parts are verified against the repository?**
   - Verified that Notifee is already installed (`@notifee/react-native 9.1.8`).
   - Verified that Tauri v2 is configured with deep-linking (`apps/desktop`).
   - Verified that `KernelCapabilityService` can handle headless `ActionProposal` dispatch.
3. **Which parts require external platform verification?**
   - Jetpack Glance integration within an Expo config plugin requires verification against Expo SDK 57 custom dev clients.
4. **Which parts are product recommendations rather than technical facts?**
   - Confining notifications strictly to active task intervals is a product ergonomics decision to avoid annoyance.
5. **What is the biggest architectural risk?**
   - Push delivery latency (FCM/APNs can occasionally be delayed by 2-10 seconds under cellular power-saving modes).
6. **What is the biggest UX risk?**
   - Users who do not place widgets on their home screen might miss ambient glanceability.
7. **What could make the interaction surface annoying?**
   - If task proposals trigger loud audible chimes during meetings. (Mitigated by `InterruptionCostEvaluator`).
8. **What could make it battery-heavy?**
   - Re-introducing any background polling timer. (Strictly prohibited).
9. **What could create a second brain?**
   - Implementing task filtering or priority sorting inside the mobile widget code. (All ordering must come from the server projection).
10. **What could cause state divergence?**
    - Executing local DB writes on the phone before kernel confirmation. (Prevented: UI is optimistic, but canonical state only updates via Kernel response).
11. **What could cause notification/widget stale state?**
    - Missing push delivery while device is asleep. (Solved by background wake-up sync on device unlock).
12. **What should NOT be implemented?**
    - Do NOT implement a 24/7 background service. Do NOT implement screen overlays. Do NOT implement mood sliders on widgets.
13. **What would you change if the first implementation fails?**
    - If Jetpack Glance is too complex within Expo, fall back to pure Android actionable notifications with standard remote views.
14. **What is the smallest viable version worth implementing first?**
    - **Phase 1 & 2**: A clean, event-driven Active Execution Notification with `[Start]` and `[Done]` buttons communicating headlessly to `/api/calendar/mutate`, removing the 15-second polling loop entirely.

---

## 36. FINAL ARCHITECTURAL DECISION

**ADOPT OPTION C: TIERED AMBIENT INTERACTION MESH.**

The architectural research concludes that LifeOS should **not** force itself onto the user's screen through intrusive floating bubbles or permanent red notifications. Instead, it must become **calm, peripheral, and instant**:
- **Glanceable** on widgets and system tray.
- **Active** only when execution is underway.
- **Instant** when summoned by voice or hotkey.
- **Sovereign** at all times through the authoritative LifeOS execution kernel.

*Architectural research complete. Ready for comparative evaluation against competing proposals.*
