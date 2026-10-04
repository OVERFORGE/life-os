import { Linking, Vibration, Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Inline types matching execution-kernel WakeWordContracts
// Mobile app does not have a direct workspace dependency on @life-os/execution-kernel
type WakeWordProviderType = 'LOCAL_ACOUSTIC' | 'SHERPA_ONNX' | 'PORCUPINE' | 'OPENWAKEWORD' | 'MOCK_LOCAL';

interface WakeWordConfig {
  provider: WakeWordProviderType;
  keyword: 'Aven' | 'Hey Aven';
  sensitivity?: number;
  sampleRateHz?: number;
  frameSize?: number;
}

interface WakeWordDetectionEvent {
  keyword: string;
  confidence: number;
  detectedAtMs: number;
  provider: WakeWordProviderType;
}

interface WakeWordDetectionResult {
  detected: boolean;
  keyword: string;
  confidence: number;
  timestampMs: number;
}

/**
 * Lightweight local acoustic wake-word engine for mobile.
 * Mirrors the canonical LocalAcousticWakeWordEngine from execution-kernel
 * but is self-contained for the React Native runtime.
 *
 * Invariant: Zero audio leaves device before wake confirmation.
 */
class MobileLocalWakeWordEngine {
  private config: WakeWordConfig | null = null;
  private listening: boolean = false;
  private onWakeCallback: ((event: WakeWordDetectionEvent) => void) | null = null;
  private lastTriggerTimeMs: number = 0;
  private readonly COOLDOWN_MS = 2000;

  // 1.5s circular buffer @ 16 kHz
  private readonly BUFFER_CAP = 24000;
  private audioBuffer: Float32Array = new Float32Array(this.BUFFER_CAP);
  private writePtr: number = 0;
  private totalSamples: number = 0;

  // Phonetic spectral profiles
  private readonly AVEN_PROFILE = [
    { low: 0.6, mid: 0.35, high: 0.05 },
    { low: 0.3, mid: 0.45, high: 0.25 },
    { low: 0.5, mid: 0.40, high: 0.10 },
    { low: 0.7, mid: 0.25, high: 0.05 },
  ];
  private readonly HEY_AVEN_PROFILE = [
    { low: 0.1, mid: 0.40, high: 0.50 },
    { low: 0.6, mid: 0.35, high: 0.05 },
    { low: 0.6, mid: 0.35, high: 0.05 },
    { low: 0.3, mid: 0.45, high: 0.25 },
    { low: 0.5, mid: 0.40, high: 0.10 },
    { low: 0.7, mid: 0.25, high: 0.05 },
  ];

  async initialize(config: WakeWordConfig): Promise<void> {
    this.config = {
      ...config,
      sensitivity: config.sensitivity ?? 0.65,
      sampleRateHz: config.sampleRateHz ?? 16000,
      frameSize: config.frameSize ?? 512,
    };
    this.audioBuffer.fill(0);
    this.writePtr = 0;
    this.totalSamples = 0;
    this.lastTriggerTimeMs = 0;
  }

  async startListening(onWake: (event: WakeWordDetectionEvent) => void): Promise<void> {
    if (!this.config) throw new Error('Engine must be initialized before startListening()');
    this.listening = true;
    this.onWakeCallback = onWake;
  }

  async stopListening(): Promise<void> {
    this.listening = false;
    this.onWakeCallback = null;
  }

  processAudioFrame(pcmFrame: Int16Array): WakeWordDetectionResult {
    const ts = Date.now();
    if (!this.listening || !this.config) {
      return { detected: false, keyword: '', confidence: 0, timestampMs: ts };
    }

    // Ingest PCM → normalized float circular buffer
    for (let i = 0; i < pcmFrame.length; i++) {
      this.audioBuffer[this.writePtr] = pcmFrame[i] / 32768.0;
      this.writePtr = (this.writePtr + 1) % this.BUFFER_CAP;
    }
    this.totalSamples += pcmFrame.length;

    if (this.totalSamples < 9600) {
      return { detected: false, keyword: '', confidence: 0, timestampMs: ts };
    }
    if (ts - this.lastTriggerTimeMs < this.COOLDOWN_MS) {
      return { detected: false, keyword: '', confidence: 0, timestampMs: ts };
    }

    // Extract 1.0s window
    const winLen = 16000;
    const buf = new Float32Array(winLen);
    let rp = (this.writePtr - winLen + this.BUFFER_CAP) % this.BUFFER_CAP;
    for (let i = 0; i < winLen; i++) {
      buf[i] = this.audioBuffer[rp];
      rp = (rp + 1) % this.BUFFER_CAP;
    }

    // RMS gate
    let eSum = 0;
    for (let i = 0; i < winLen; i++) eSum += buf[i] * buf[i];
    if (Math.sqrt(eSum / winLen) < 0.012) {
      return { detected: false, keyword: '', confidence: 0, timestampMs: ts };
    }

    // Multi-band temporal matching
    const profile = this.config.keyword === 'Hey Aven' ? this.HEY_AVEN_PROFILE : this.AVEN_PROFILE;
    const numSlices = profile.length;
    const sliceLen = Math.floor(winLen / (numSlices + 1));
    const stepLen = Math.floor((winLen - sliceLen) / (numSlices - 1));

    let score = 0;
    for (let s = 0; s < numSlices; s++) {
      const start = s * stepLen;
      const sub = buf.subarray(start, start + sliceLen);

      let lo = 0, mi = 0, hi = 0;
      for (let j = 1; j < sub.length; j++) {
        const v = Math.abs(sub[j]);
        const d = Math.abs(sub[j] - sub[j - 1]);
        if (d > 0.08) hi += d;
        else if (v > 0.02) mi += v;
        else lo += v;
      }
      const total = lo + mi + hi + 1e-6;
      const nLo = lo / total, nMi = mi / total, nHi = hi / total;
      const t = profile[s];
      score += Math.max(0, 1.0 - (Math.abs(nLo - t.low) * 0.5 + Math.abs(nMi - t.mid) * 0.35 + Math.abs(nHi - t.high) * 0.35));
    }

    const conf = score / numSlices;
    const sensitivity = this.config.sensitivity ?? 0.65;
    const detected = conf >= (1.0 - sensitivity * 0.55);

    if (detected) {
      this.lastTriggerTimeMs = ts;
      if (this.onWakeCallback) {
        this.onWakeCallback({
          keyword: this.config.keyword,
          confidence: Math.min(1.0, conf),
          detectedAtMs: ts,
          provider: 'LOCAL_ACOUSTIC',
        });
      }
    }

    return {
      detected,
      keyword: detected ? this.config.keyword : '',
      confidence: Math.min(1.0, conf),
      timestampMs: ts,
    };
  }

  isListening(): boolean { return this.listening; }
  async dispose(): Promise<void> { await this.stopListening(); }
}

/**
 * MobileWakeWordService
 *
 * Manages local wake-word detection for Android & iOS.
 * Constitutional Invariants:
 * 1. Zero Cloud Audio: Audio frames are analyzed strictly on-device.
 * 2. Canonical Aven Launch: Detection routes to the canonical conversational modal.
 * 3. Phrases: Evaluates "Aven" and "Hey Aven".
 */
export class MobileWakeWordService {
  private static instance: MobileWakeWordService;
  private engine: MobileLocalWakeWordEngine;
  private isRunning: boolean = false;
  private wakePhrase: 'Aven' | 'Hey Aven' = 'Hey Aven';

  private constructor() {
    this.engine = new MobileLocalWakeWordEngine();
  }

  public static getInstance(): MobileWakeWordService {
    if (!MobileWakeWordService.instance) {
      MobileWakeWordService.instance = new MobileWakeWordService();
    }
    return MobileWakeWordService.instance;
  }

  public async initialize(phrase: 'Aven' | 'Hey Aven' = 'Hey Aven'): Promise<void> {
    this.wakePhrase = phrase;
    const config: WakeWordConfig = {
      provider: 'LOCAL_ACOUSTIC',
      keyword: phrase,
      sensitivity: 0.65,
      sampleRateHz: 16000,
      frameSize: 512,
    };
    await this.engine.initialize(config);
  }

  public async startListening(): Promise<void> {
    if (this.isRunning) return;
    await this.initialize(this.wakePhrase);
    await this.engine.startListening((event: WakeWordDetectionEvent) => {
      this.handleWakeWordTriggered(event);
    });

    if (Platform.OS === 'android' && NativeModules.AvenWakeWordBridge?.startWakeWordService) {
      try {
        await NativeModules.AvenWakeWordBridge.startWakeWordService();
      } catch (err) {
        console.warn('[MobileWakeWordService] Failed to start native wake service:', err);
      }
    }

    this.isRunning = true;
    await AsyncStorage.setItem('@ambient_wake_enabled', 'true');
  }

  public async stopListening(): Promise<void> {
    if (!this.isRunning) return;
    await this.engine.stopListening();

    if (Platform.OS === 'android' && NativeModules.AvenWakeWordBridge?.stopWakeWordService) {
      try {
        await NativeModules.AvenWakeWordBridge.stopWakeWordService();
      } catch (err) {
        console.warn('[MobileWakeWordService] Failed to stop native wake service:', err);
      }
    }

    this.isRunning = false;
    await AsyncStorage.setItem('@ambient_wake_enabled', 'false');
  }

  public getIsListening(): boolean {
    return this.isRunning;
  }

  public ingestPcmFrame(pcmFrame: Int16Array): void {
    if (!this.isRunning) return;
    this.engine.processAudioFrame(pcmFrame);
  }

  private handleWakeWordTriggered(_event: WakeWordDetectionEvent): void {
    // 1. Subtle haptic confirmation (80ms)
    try {
      Vibration.vibrate(80);
    } catch { /* vibration unavailable */ }

    // 2. Launch canonical conversational entry surface
    Linking.openURL('mobile://chat-modal').catch((err: unknown) => {
      console.warn('[MobileWakeWordService] Failed to open Aven modal:', err);
    });
  }
}
