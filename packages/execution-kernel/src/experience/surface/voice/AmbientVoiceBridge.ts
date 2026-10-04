/**
 * LifeOS Ambient Interaction Layer — Ambient Voice Bridge (Phase 11)
 * 
 * Manages low-latency voice capture state machine for ambient entries
 * (both wake-word activation and push-to-talk buttons).
 */

export type VoiceSessionStatus =
  | "IDLE"
  | "LISTENING"
  | "PROCESSING"
  | "RESPONDING"
  | "ERROR";

export interface VoiceSessionState {
  status: VoiceSessionStatus;
  triggerSource: "WAKE_WORD" | "PUSH_TO_TALK" | "NOTIFICATION_MIC";
  startedAtMs: number;
  durationMs: number;
  transcriptSnippet?: string;
  errorMessage?: string;
}

export type VoiceStateListener = (state: VoiceSessionState) => void;

export class AmbientVoiceBridge {
  private static instance: AmbientVoiceBridge;
  private state: VoiceSessionState = {
    status: "IDLE",
    triggerSource: "PUSH_TO_TALK",
    startedAtMs: 0,
    durationMs: 0,
  };
  private listeners: Set<VoiceStateListener> = new Set();

  private constructor() {}

  public static getInstance(): AmbientVoiceBridge {
    if (!AmbientVoiceBridge.instance) {
      AmbientVoiceBridge.instance = new AmbientVoiceBridge();
    }
    return AmbientVoiceBridge.instance;
  }

  public getState(): VoiceSessionState {
    return { ...this.state };
  }

  public subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getState());
      } catch (e) {
        console.error("[AmbientVoiceBridge] Listener error:", e);
      }
    }
  }

  /**
   * Starts listening upon wake word trigger or push-to-talk press.
   */
  public startSession(source: "WAKE_WORD" | "PUSH_TO_TALK" | "NOTIFICATION_MIC" = "PUSH_TO_TALK"): void {
    this.state = {
      status: "LISTENING",
      triggerSource: source,
      startedAtMs: Date.now(),
      durationMs: 0,
    };
    this.notify();
  }

  /**
   * Called when speech input completes and is sent for transcription/processing.
   */
  public markProcessing(): void {
    this.state = {
      ...this.state,
      status: "PROCESSING",
      durationMs: Date.now() - this.state.startedAtMs,
    };
    this.notify();
  }

  /**
   * Called when Aven begins speaking or streaming back response.
   */
  public markResponding(transcriptSnippet?: string): void {
    this.state = {
      ...this.state,
      status: "RESPONDING",
      transcriptSnippet,
      durationMs: Date.now() - this.state.startedAtMs,
    };
    this.notify();
  }

  /**
   * Resets session to IDLE (Silence invariant).
   */
  public endSession(): void {
    this.state = {
      status: "IDLE",
      triggerSource: "PUSH_TO_TALK",
      startedAtMs: 0,
      durationMs: 0,
    };
    this.notify();
  }

  /**
   * Flags error in voice session.
   */
  public flagError(errorMessage: string): void {
    this.state = {
      ...this.state,
      status: "ERROR",
      errorMessage,
      durationMs: Date.now() - this.state.startedAtMs,
    };
    this.notify();
  }
}
