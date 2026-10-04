/**
 * LifeOS Ambient Interaction Layer — Wake Word Engine Contracts (Phase 10)
 * 
 * Strict Invariants:
 * 1. Provider Independence: The interface is the authority, not any specific vendor library.
 * 2. Privacy: Zero audio transmitted to cloud before local wake-word confirmation.
 * 3. Phrases: Evaluates both "Aven" and "Hey Aven".
 */

export type WakeWordProviderType =
  | "LOCAL_ACOUSTIC"
  | "SHERPA_ONNX"
  | "PORCUPINE"
  | "OPENWAKEWORD"
  | "MOCK_LOCAL";

export interface WakeWordConfig {
  provider: WakeWordProviderType;
  modelPath?: string;
  keyword: "Aven" | "Hey Aven";
  sensitivity?: number; // 0.0 to 1.0 (default 0.5)
  sampleRateHz?: number; // Typically 16000 Hz
  frameSize?: number; // Typically 512 samples
  accessKey?: string; // Required for proprietary engines like Porcupine
}

export interface WakeWordDetectionResult {
  detected: boolean;
  keyword: string;
  confidence: number;
  timestampMs: number;
}

export interface WakeWordDetectionEvent {
  keyword: string;
  confidence: number;
  detectedAtMs: number;
  provider: WakeWordProviderType;
}

export interface IWakeWordEngine {
  readonly provider: WakeWordProviderType;
  initialize(config: WakeWordConfig): Promise<void>;
  startListening(onWake: (event: WakeWordDetectionEvent) => void): Promise<void>;
  stopListening(): Promise<void>;
  processAudioFrame(pcmFrame: Int16Array): WakeWordDetectionResult;
  isListening(): boolean;
  dispose(): Promise<void>;
}
