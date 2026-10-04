# LIFEOS AMBIENT INTERACTION LAYER
## MASTER COMPLETION & PRODUCTION HARDENING PLAN (V2.1.1-COMPLETION)
### End-to-End Native Platform Integration, Real-Device Validation, and Production Usability

> **DOCUMENT STATUS**: AUTHORITATIVE IMPLEMENTATION COMPLETION CONTRACT  
> **DATE**: October 2026  
> **BASE ARCHITECTURE**: `LIFEOS_AMBIENT_INTERACTION_IMPLEMENTATION_PLAN_V2.1.md` (V2.1.1)  
> **SOURCE OF REALITY**: Forensic Reality Audit Report (October 2026)  
> **TARGET RUNTIMES**:
> - **Mobile**: Android (API 31–35, Kotlin, Notifee, AppWidgetProvider, Quick Settings Tile, Native Module Bridge)
> - **Desktop**: Tauri v2 (Rust Core, System Tray, Global Shortcut Plugin, Frameless Spotlight HUD, Webview Bridge)
> - **Web**: Next.js 16 (Turbopack, SSE, Service Worker Web Push, Sticky Execution Bar, Command Palette)
> - **Backend / Kernel**: Node.js v22+, TypeScript 5.7+, Sovereign `KernelCapabilityService`, `DefaultActionAdapters`, MongoDB Atlas

---

## 1. EXECUTIVE SUMMARY & REPAIR SCOPE

The forensic reality audit confirmed that while the sovereign kernel, action gateway, and test suites are mathematically verified, **the real user-facing ambient product has disconnected runtime surfaces, missing native bridges, and absent wake-word acoustic models.**

This plan completes the implementation loop across 19 sequential, dependency-ordered phases:

```
[Phase 0: Baseline & Runtime Toolchain Verification]
       │
       ▼
[Phase 1: Android Widget Native Bridge] ──► [Phase 2: Android Notification Permissions]
       │                                           │
       ▼                                           ▼
[Phase 3: React Native Realtime Transport] ──► [Phase 4: Mobile Offline Action Wiring]
       │                                           │
       ▼                                           ▼
[Phase 5: Android Quick Settings Hardening] ─► [Phase 6: Desktop Tray State Sync]
       │                                           │
       ▼                                           ▼
[Phase 7: Desktop Global Shortcut (Ctrl+Alt+Space)] ──► [Phase 8: Desktop Spotlight HUD Window]
       │                                           │
       ▼                                           ▼
[Phase 9: Desktop Active Execution Sync] ───► [Phase 10: Web Push & Service Worker]
       │                                           │
       ▼                                           ▼
[Phase 11: Ambient Settings & Onboarding UX] ─► [Phase 12: Real Wake-Word Engine & Models]
       │                                           │
       ▼                                           ▼
[Phase 13: Android Wake-Word Audio Loop] ────► [Phase 14: Desktop Wake-Word Audio Thread]
       │                                           │
       ▼                                           ▼
[Phase 15: Cross-Device State Convergence] ──► [Phase 16: Physical Device & Runtime QA]
       │                                           │
       ▼                                           ▼
[Phase 17: Security, Privacy & Battery Hardening]
       │
       ▼
[Phase 18: iOS Implementation / Hardware Gate]
       │
       ▼
[Phase 19: Production Packaging & Release Sign-Off]
```

---

## 2. STRICT CONSTITUTIONAL INVARIANTS

1. **Kernel Sovereignty**: Every state mutation enters via canonical action envelopes to `/api/kernel/dispatch` and `KernelCapabilityService.ts`. Zero direct MongoDB mutations from native Kotlin, Rust, React Native, or Service Workers.
2. **Zero Semantic Regex / Zero Keyword Parsers**: Natural language is never parsed with regex or token matching. Natural language routes solely to Aven Supervisor via `/api/conversation`.
3. **Decoupled Idempotency Law**: Action identity is $\text{SHA-256}(\text{userId} + \text{actionType} + \text{entityId} + \text{seed})$. Projection versions are supplied purely for optimistic concurrency checks.
4. **Silence Invariant**: When no execution is active, surfaces auto-dismiss and background polling is 100% halted.
5. **Brand Integrity**: All visual surfaces strictly conform to Executioners dark structural palette (`#161618`, `#1F2023`, `#2A2B2F`) and red execution accents (`#E8414A`). No saturated SaaS or generic AI aesthetics.
6. **Zero Any Escape Hatches**: Fully discriminated TypeScript types; strict Rust type safety.

---

## 3. PHASE-BY-PHASE COMPLETION SPECIFICATION

---

### PHASE 0: Baseline & Toolchain Verification
- **Objective**: Establish operational baseline of local Android SDK (`C:\Users\HP\AppData\Local\Android\Sdk`), Android AVDs (`Pixel_6_Pro`, `Pixel_8_Pro`), Rust toolchain (`1.97.1`), and desktop packaging.
- **Affected Files**: `package.json`, `apps/desktop/src-tauri/Cargo.toml`, `apps/mobile/android/gradle.properties`.
- **Implementation Steps**:
  1. Verify Android AVD emulator launch capability via `emulator -avd Pixel_6_Pro`.
  2. Verify Tauri build script and sidecar packaging prerequisites.
  3. Establish baseline compilation of `apps/mobile/android` via `./gradlew tasks`.
- **Exit Criteria**: All toolchains validated without manual intervention.

---

### PHASE 1: Android Widget Native Bridge
- **Objective**: Connect React Native projection updates directly to Android `SharedPreferences("lifeos_surface_prefs")` and trigger `ACTION_WIDGET_UPDATE`.
- **Current Defect**: `WidgetSyncBridge.ts` writes to `AsyncStorage` (SQLite) and is never called; `GlanceWidgetProvider.kt` reads from `SharedPreferences`. The widget is permanently frozen.
- **Affected Files**:
  - `apps/mobile/android/app/src/main/java/com/overforge/lifeos/LifeOsWidgetBridgeModule.kt` *(NEW)*
  - `apps/mobile/android/app/src/main/java/com/overforge/lifeos/LifeOsNativePackage.kt` *(NEW)*
  - `apps/mobile/android/app/src/main/java/com/overforge/lifeos/MainApplication.kt` *(REGISTER)*
  - `apps/mobile/services/WidgetSyncBridge.ts` *(REFACTOR TO CALL NATIVE MODULE)*
  - `apps/mobile/services/ActiveExecutionNotificationManager.ts` *(INVOKE WIDGET SYNC)*
- **Implementation Steps**:
  1. Implement `LifeOsWidgetBridgeModule.kt` exposing `@ReactMethod fun updateWidgetState(title: String, subtitle: String, mode: String, count: Int, promise: Promise)`.
  2. Write values into `context.getSharedPreferences("lifeos_surface_prefs", Context.MODE_PRIVATE)`.
  3. Broadcast `com.overforge.lifeos.ACTION_WIDGET_UPDATE` intent to refresh all widget instances immediately.
  4. Register `LifeOsNativePackage` in `MainApplication.kt`.
  5. Update `WidgetSyncBridge.ts` to call `NativeModules.LifeOsWidgetBridge.updateWidgetState(...)`.
  6. Wire `WidgetSyncBridge.getInstance().syncProjectionToWidget(projection)` into `ActiveExecutionNotificationManager.syncWithProjection()`.
- **Exit Criteria**: State changes in React Native immediately update widget UI text and badge on the Android home screen.

---

### PHASE 2: Android Notification Permissions & Runtime Lifecycle
- **Objective**: Ensure Android 13+ runtime notification permissions (`POST_NOTIFICATIONS`) are properly requested on first run, and handle permission denials gracefully.
- **Current Defect**: `persistentNotification.ts` migration branch returns early before `notifee.requestPermission()` is reached. Notifications fail silently on fresh installs.
- **Affected Files**:
  - `apps/mobile/services/ActiveExecutionNotificationManager.ts`
  - `apps/mobile/app/(dashboard)/_layout.tsx`
  - `apps/mobile/app/(dashboard)/personalization.tsx`
- **Implementation Steps**:
  1. Add `requestPermissions(): Promise<boolean>` inside `ActiveExecutionNotificationManager.ts` calling `notifee.requestPermission()`.
  2. Call `requestPermissions()` during `start()`.
  3. If authorization status is denied, log gracefully and expose status to settings/onboarding.
  4. Configure notification click handler to navigate to active task or chat modal.
- **Exit Criteria**: Fresh install prompts user for notification permission; granting it enables active chronometer display.

---

### PHASE 3: React Native Realtime Event Transport
- **Objective**: Implement robust real-time event streaming for React Native that does not rely on unsupported browser `ReadableStream` (`getReader()`).
- **Current Defect**: `ActiveExecutionNotificationManager.ts` uses `fetch(..., { getReader })` which silently fails in React Native.
- **Affected Files**:
  - `apps/mobile/services/InteractionEventTransport.ts` *(NEW)*
  - `apps/mobile/services/ActiveExecutionNotificationManager.ts`
  - `packages/execution-kernel/src/experience/surface/contracts/InteractionSurfaceContracts.ts`
- **Implementation Steps**:
  1. Implement `InteractionEventTransport` using native `XMLHttpRequest` streaming or long-polling fallback compatible with React Native's JS environment.
  2. Parse incoming SSE chunks (`data: {...}\n\n`).
  3. Emit parsed projection to `ActiveExecutionNotificationManager`.
  4. Implement exponential backoff reconnection on network loss.
- **Exit Criteria**: Modifying task on Web or Desktop pushes update to Android notification and widget in $\le 2.0\text{s}$ over local network.

---

### PHASE 4: Mobile Offline Action Wiring
- **Objective**: Wire `SurfaceOfflineQueue` into mobile action ingress so actions taken offline show `"Syncing..."` and flush deterministically upon reconnection.
- **Affected Files**:
  - `apps/mobile/services/HeadlessActionReceiver.ts`
  - `packages/execution-kernel/src/experience/surface/offline/SurfaceOfflineQueue.ts`
  - `apps/mobile/services/ActiveExecutionNotificationManager.ts`
- **Implementation Steps**:
  1. Instantiate `SurfaceOfflineQueue` with React Native `AsyncStorage` adapter.
  2. If network dispatch fails or device is offline, enqueue envelope as `PENDING_OFFLINE`.
  3. Update notification body to reflect `"Syncing..."` / `"Waiting for connection..."`.
  4. Attach network reconnection listener (`NetInfo` or ping check) to flush queue via FIFO.
- **Exit Criteria**: Tapping `[Done]` in airplane mode queues the action; reconnecting commits the action to the kernel without data loss.

---

### PHASE 5: Android Quick Settings Hardening
- **Objective**: Harden `AvenQuickTileService.kt` to handle cold starts, locked device state, and process death.
- **Affected Files**:
  - `apps/mobile/android/app/src/main/java/com/overforge/lifeos/AvenQuickTileService.kt`
  - `apps/mobile/app/chat-modal.tsx`
- **Implementation Steps**:
  1. Implement `unlockAndRun` guard for locked screen state.
  2. Ensure deep link `mobile://chat-modal` initializes session correctly if app was terminated.
  3. Test tile state toggle (ACTIVE vs INACTIVE).
- **Exit Criteria**: Pulling down Android Quick Settings and tapping "Aven" launches chat modal from cold start or lock screen.

---

### PHASE 6: Desktop System Tray Integration & Synchronization
- **Objective**: Connect the Tauri desktop frontend to the native Rust tray commands so the tray dynamically displays the active task title and remaining minutes.
- **Current Defect**: `DesktopSurfaceManager.ts` exists but is never imported or initialized in the desktop app.
- **Affected Files**:
  - `apps/web/hooks/useInteractionSurface.ts`
  - `apps/web/components/layout/DesktopShell.tsx`
  - `apps/desktop/src/services/DesktopSurfaceManager.ts`
- **Implementation Steps**:
  1. Detect if running inside Tauri (`typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window`).
  2. When projection changes in `useInteractionSurface`, call Tauri command `update_tray_status` with active title and tooltip.
  3. Revert tray title to `""` and tooltip to `"LifeOS: Calm"` when dormant (Silence Invariant).
- **Exit Criteria**: Starting a task on Web or Mobile immediately shows the task title in the Windows system tray.

---

### PHASE 7: Desktop Global Shortcut (Ctrl+Alt+Space)
- **Objective**: Implement genuine OS-level global shortcut registration that works across any focused Windows application.
- **Current Defect**: `tauri-plugin-global-shortcut` is missing from `Cargo.toml` and `lib.rs`.
- **Affected Files**:
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/src/lib.rs`
- **Implementation Steps**:
  1. Add `tauri-plugin-global-shortcut = "2"` to `Cargo.toml`.
  2. Initialize plugin in `Builder::default().plugin(tauri_plugin_global_shortcut::Builder::new()...)` in `lib.rs`.
  3. Register shortcut `Ctrl+Alt+Space` on startup.
  4. On shortcut trigger, toggle window visibility and bring to focus.
- **Exit Criteria**: Pressing `Ctrl+Alt+Space` in VS Code or Chrome instantly brings LifeOS to focus.

---

### PHASE 8: Desktop Frameless Spotlight HUD Window
- **Objective**: Configure a lightweight, centered, frameless Spotlight HUD window for instant Aven queries.
- **Affected Files**:
  - `apps/desktop/src-tauri/tauri.conf.json`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/web/app/hud/page.tsx` *(NEW)*
- **Implementation Steps**:
  1. Add frameless window `"spotlight"` in `tauri.conf.json` (width: 640, height: 380, decorations: false, alwaysOnTop: true, transparent: true).
  2. Create lightweight Next.js route `/hud` optimized for fast text/voice input to Aven.
  3. Wire global shortcut `Ctrl+Alt+Space` to toggle the spotlight window.
  4. Pressing `Escape` hides the HUD.
- **Exit Criteria**: `Ctrl+Alt+Space` opens a centered, frameless HUD in $< 150\text{ms}$.

---

### PHASE 9: Desktop Active Execution Projection
- **Objective**: Support action buttons (`[Done]`, `[Pause]`, `[+15m]`) directly from desktop surfaces.
- **Affected Files**:
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/web/components/surface/AmbientActiveExecutionBanner.tsx`
- **Implementation Steps**:
  1. Add dynamic menu items in native tray menu when task is active ("Done", "Pause", "+15m").
  2. Wire menu item clicks to dispatch canonical action envelopes to `/api/kernel/dispatch`.
  3. Reflect updated state immediately in tray.
- **Exit Criteria**: User can complete an active task directly from the Windows taskbar tray without opening the window.

---

### PHASE 10: Web Push & Service Worker
- **Objective**: Implement Service Worker Web Push for background notification delivery and 1-tap actions on supported desktop/mobile browsers.
- **Current Defect**: `apps/web/public/sw.js` does not exist; Web Push is unconfigured.
- **Affected Files**:
  - `apps/web/public/sw.js` *(NEW)*
  - `apps/web/hooks/useWebPush.ts` *(NEW)*
  - `apps/web/app/api/surface/push/subscribe/route.ts` *(NEW)*
  - `packages/execution-kernel/src/experience/surface/PushDispatchService.ts` *(NEW)*
- **Implementation Steps**:
  1. Create `public/sw.js` with `push` and `notificationclick` event handlers.
  2. Implement action buttons `[Start]`, `[Done]`, `[Later]` in Web Push notifications.
  3. Click handler dispatches action envelope to `/api/kernel/dispatch`.
  4. Implement `useWebPush` hook to prompt user for notification permission on supported browsers.
- **Exit Criteria**: Web browser displays push notifications for due proposals and handles action clicks in the service worker.

---

### PHASE 11: Ambient & Aven Settings and Onboarding UX
- **Objective**: Build human-friendly user settings and first-run setup flow for ambient permissions and features.
- **Affected Files**:
  - `apps/mobile/app/(dashboard)/ambient-settings.tsx` *(NEW)*
  - `apps/web/app/(dashboard)/settings/ambient/page.tsx` *(NEW)*
  - `apps/mobile/app/(dashboard)/personalization.tsx`
- **Implementation Steps**:
  1. Create "Aven & Ambient" settings screen in both Mobile and Web.
  2. Provide toggles: Notifications, Quick Settings, System Tray, Desktop Shortcut, Wake Word.
  3. Show live permission status: Notification Permission (Granted/Denied), Microphone Permission (Granted/Denied).
  4. Provide test button for microphone and audio chimes.
  5. Privacy notice: "Audio is processed locally until wake word is detected."
- **Exit Criteria**: User can view, enable, or disable all ambient surfaces from a single clean settings screen.

---

### PHASE 12: Real Local Wake-Word Engine & Acoustic Models
- **Objective**: Bundle real open-source keyword spotting capability (Sherpa-ONNX Zipformer KWS or OpenWakeWord) with trained models for "Aven" and "Hey Aven".
- **Current Defect**: Only TypeScript mock contracts exist. Zero models or native binaries are bundled.
- **Affected Files**:
  - `packages/execution-kernel/src/experience/surface/voice/SherpaWakeWordEngine.ts` *(NEW)*
  - `packages/execution-kernel/src/experience/surface/voice/WakeWordEngineFactory.ts`
  - `models/kws/` *(NEW model directory with ONNX weights)*
- **Implementation Steps**:
  1. Package lightweight quantized ONNX keyword spotting models for "Aven" and "Hey Aven".
  2. Implement `SherpaWakeWordEngine` adhering to `IWakeWordEngine`.
  3. Implement rolling 2.0-second circular audio buffer.
  4. Emit `WakeWordDetectionEvent` on keyword match; 0 audio packets sent to cloud prior to trigger.
- **Exit Criteria**: Feeding test PCM audio containing "Hey Aven" triggers detection event locally with 0 cloud calls.

---

### PHASE 13: Android Wake-Word Integration
- **Objective**: Implement native Android audio recording loop that feeds microphone PCM into the local keyword detector.
- **Affected Files**:
  - `apps/mobile/android/app/src/main/java/com/overforge/lifeos/LocalWakeWordService.kt` *(NEW)*
  - `apps/mobile/android/app/src/main/AndroidManifest.xml`
  - `apps/mobile/services/ActiveExecutionNotificationManager.ts`
- **Implementation Steps**:
  1. Implement foreground audio capture service in Kotlin using `AudioRecord` (16kHz 16-bit mono).
  2. Feed PCM samples into ONNX keyword spotting session.
  3. On trigger: play soft chime, trigger haptic feedback, and launch `mobile://chat-modal?mode=voice`.
  4. Provide toggle in settings to enable/disable background service.
- **Exit Criteria**: Saying "Hey Aven" while phone is on home screen wakes Aven voice modal.

---

### PHASE 14: Desktop Wake-Word Audio Thread
- **Objective**: Implement native audio capture thread in Tauri Rust core using `cpal` to feed keyword detector.
- **Affected Files**:
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/desktop/src-tauri/src/wake_word.rs` *(NEW)*
- **Implementation Steps**:
  1. Add `cpal = "0.15"` to `apps/desktop/src-tauri/Cargo.toml`.
  2. Spawn background audio stream thread in `lib.rs`.
  3. Detect "Aven" or "Hey Aven".
  4. On detection: emit Tauri event `aven-wake-detected` and open Spotlight HUD.
- **Exit Criteria**: Saying "Hey Aven" at desktop while working in another app summons Spotlight HUD.

---

### PHASE 15: Cross-Device State Convergence & Idempotency Testing
- **Objective**: Verify real simultaneous multi-device action resolution across phone, desktop, and web.
- **Affected Files**:
  - `packages/execution-kernel/src/testing/phase15ConvergenceVerification.test.ts` *(NEW)*
- **Implementation Steps**:
  1. Test simultaneous tap on Phone, Desktop, and Web.
  2. Verify kernel execution results in exactly 1 authoritative commit and 2 idempotent responses.
  3. Verify monotonic sequence ordering across all surfaces.
- **Exit Criteria**: Zero double executions; all surfaces converge to Silence in $\le 2.0\text{s}$.

---

### PHASE 16: Real-Device & Emulator QA
- **Objective**: Execute and record real-device test runs on Android AVD (`Pixel_6_Pro`) and Windows desktop runtime.
- **Verification Matrix**:
  - Android APK install and launch.
  - Widget placement and live title updates.
  - Notification action tap (`[Done]`, `[Start]`).
  - Quick Settings tile click.
  - Desktop installer build and tray interaction.
  - Desktop global shortcut `Ctrl+Alt+Space`.
- **Exit Criteria**: Recorded test logs with exact device IDs, OS versions, and timestamps.

---

### PHASE 17: Security, Privacy & Battery Hardening
- **Objective**: Verify privacy invariant (zero cloud audio before trigger), lockscreen privacy redaction, and idle battery optimization.
- **Affected Files**:
  - `apps/mobile/services/ActiveExecutionNotificationManager.ts`
  - `documentation/benchmarks/SecurityAndPrivacyAudit.md` *(NEW)*
- **Exit Criteria**: Zero unauthenticated actions; zero battery drain during idle silence.

---

### PHASE 18: iOS Implementation & Hardware Gate
- **Objective**: Implement all deterministic iOS specifications possible within the environment, and formally define the hardware-gated validation boundary.
- **Affected Files**:
  - `apps/mobile/app.json` *(iOS configuration & permissions)*
  - `documentation/benchmarks/IosImplementationStatus.md` *(NEW)*
- **Exit Criteria**: Clean configuration, explicit isolation of macOS/Xcode hardware gate, zero fake claims.

---

### PHASE 19: Production Packaging & Release Sign-Off
- **Objective**: Package final release artifacts (Android APK, Windows NSIS installer) and generate the comprehensive production readiness sign-off report.
- **Deliverables**:
  - `documentation/LIFEOS_AMBIENT_INTERACTION_PRODUCTION_READINESS_REPORT.md`
  - Verified Android APK build.
  - Verified Windows desktop build.
- **Exit Criteria**: 100% passing gates across Constitutional, Product, UX, and Validation tiers.

---

## 4. EXECUTION COMMENCEMENT

Execution begins immediately with **Phase 1: Android Widget Native Bridge** and continues autonomously through all 19 phases.
