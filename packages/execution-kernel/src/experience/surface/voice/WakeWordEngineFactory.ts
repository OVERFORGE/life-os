/**
 * LifeOS Ambient Interaction Layer — Wake Word Engine Factory (Phase 10)
 * 
 * Factory for instantiating provider-independent wake word engines.
 */

import {
  IWakeWordEngine,
  WakeWordConfig,
  WakeWordDetectionEvent,
  WakeWordDetectionResult,
  WakeWordProviderType,
} from "./contracts/WakeWordContracts";

export class MockLocalWakeWordEngine implements IWakeWordEngine {
  readonly provider: WakeWordProviderType = "MOCK_LOCAL";
  private config: WakeWordConfig | null = null;
  private listening: boolean = false;
  private onWakeCallback: ((event: WakeWordDetectionEvent) => void) | null = null;

  async initialize(config: WakeWordConfig): Promise<void> {
    this.config = config;
  }

  async startListening(onWake: (event: WakeWordDetectionEvent) => void): Promise<void> {
    this.listening = true;
    this.onWakeCallback = onWake;
  }

  async stopListening(): Promise<void> {
    this.listening = false;
    this.onWakeCallback = null;
  }

  processAudioFrame(pcmFrame: Int16Array): WakeWordDetectionResult {
    if (!this.listening || !this.config) {
      return { detected: false, keyword: "", confidence: 0, timestampMs: Date.now() };
    }

    // Energy threshold calculation to simulate speech detection
    let sum = 0;
    for (let i = 0; i < pcmFrame.length; i++) {
      sum += Math.abs(pcmFrame[i]);
    }
    const avgEnergy = sum / pcmFrame.length;

    // Simulated trigger if test frame passes high energy threshold (> 25000)
    const detected = avgEnergy > 25000;
    const confidence = detected ? 0.95 : 0.05;

    if (detected && this.onWakeCallback) {
      this.onWakeCallback({
        keyword: this.config.keyword,
        confidence,
        detectedAtMs: Date.now(),
        provider: this.provider,
      });
    }

    return {
      detected,
      keyword: detected ? this.config.keyword : "",
      confidence,
      timestampMs: Date.now(),
    };
  }

  isListening(): boolean {
    return this.listening;
  }

  async dispose(): Promise<void> {
    await this.stopListening();
  }
}

import { LocalAcousticWakeWordEngine } from "./LocalAcousticWakeWordEngine";

export class WakeWordEngineFactory {
  public static createEngine(config: WakeWordConfig): IWakeWordEngine {
    switch (config.provider) {
      case "MOCK_LOCAL":
        return new MockLocalWakeWordEngine();

      case "LOCAL_ACOUSTIC":
      case "SHERPA_ONNX":
      case "PORCUPINE":
      case "OPENWAKEWORD":
        // Instantiates real local acoustic keyword spotter with zero network audio transmission
        return new LocalAcousticWakeWordEngine(config.provider);

      default:
        throw new Error(`Unknown wake word provider: ${config.provider}`);
    }
  }
}
