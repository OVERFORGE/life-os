import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import type { AudioRecorder, RecorderState, RecordingOptions } from 'expo-audio';


// Build correct RecordingOptions using the SDK preset as a base,
// with metering enabled for VAD/visualizer and voice_communication
// audio source on Android for echo cancellation + AGC.
const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    audioSource: 'voice_communication' as const,
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
  },
};

export interface VoiceRecorderOptions {
  isBargeIn?: boolean;
  onBargeIn?: () => void;
  onVolume?: (volume: number, db: number) => void;
  onSpeechDetected?: () => void;
}

export class VoiceRecorder {
  private recorder: AudioRecorder | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private onSilenceCb: ((uri: string | null) => void) | null = null;
  private onBargeInCb: (() => void) | null = null;
  private onVolumeCb: ((volume: number, db: number) => void) | null = null;
  private onSpeechDetectedCb: (() => void) | null = null;
  private isBargeInActive = false;
  private hasDetectedSpeech = false;
  private speechStartTime: number | null = null;
  private lastSpeechTime: number | null = null;
  private peakMetering = -160;

  async startRecording(
    onSilence: (uri: string | null) => void,
    options?: VoiceRecorderOptions
  ): Promise<boolean> {
    try {
      // Cancel any existing recording
      await this.cleanupRecorder();

      this.onSilenceCb = onSilence;
      this.onBargeInCb = options?.onBargeIn || null;
      this.onVolumeCb = options?.onVolume || null;
      this.onSpeechDetectedCb = options?.onSpeechDetected || null;
      this.isBargeInActive = options?.isBargeIn || false;
      this.hasDetectedSpeech = false;
      this.speechStartTime = null;
      this.lastSpeechTime = null;
      this.peakMetering = -160;
      
      let perm = await getRecordingPermissionsAsync();
      if (perm.status !== 'granted') {
        perm = await requestRecordingPermissionsAsync();
      }
      if (perm.status !== 'granted') {
        console.log('[VoiceRecorder] Audio permission not granted.');
        return false;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });

      console.log('[VoiceRecorder] Creating AudioRecorder with options:', JSON.stringify(VOICE_RECORDING_OPTIONS));
      const recorder = new AudioModule.AudioRecorder(VOICE_RECORDING_OPTIONS);
      console.log('[VoiceRecorder] Preparing to record...');
      await recorder.prepareToRecordAsync(VOICE_RECORDING_OPTIONS);
      console.log('[VoiceRecorder] Starting recording...');
      recorder.record();
      this.recorder = recorder;

      // Start metering polling interval (every 80ms) for high-responsiveness VAD and visualizer
      let pollCount = 0;
      this.pollingInterval = setInterval(() => {
        if (!this.recorder) return;
        try {
          const status = this.recorder.getStatus();
          pollCount++;
          if (pollCount <= 3 || pollCount % 30 === 0) {
            console.log('[VoiceRecorder] Poll #' + pollCount + ' status:', JSON.stringify(status));
          }
          this.onStatusUpdate(status);
        } catch (e) {
          console.warn('[VoiceRecorder] getStatus error:', e);
        }
      }, 80);

      return true;
    } catch (err) {
      console.error('Failed to start recording', err);
      await this.cleanupRecorder();
      return false;
    }
  }

  private onStatusUpdate(status: RecorderState) {
    if (!status.isRecording) return;

    const db = status.metering !== undefined ? status.metering : -160;
    if (db > this.peakMetering) this.peakMetering = db;
    const now = Date.now();

    // Compute normalized volume (0.0 to 1.0) for UI soundwave feedback
    // -55 dB is silence floor (ignores fan noise), -10 dB is loud voice
    let normVolume = 0;
    if (db > -55) {
      normVolume = Math.min(1, Math.max(0.05, (db + 55) / 40));
    }
    this.onVolumeCb?.(normVolume, db);

    // 1. Barge-in detection while assistant is speaking
    if (this.isBargeInActive) {
      // Direct speech cuts above speaker audio
      if (db >= -28) {
        console.log('[MOBILE_VAD] Barge-in speech detected during playback! Metering:', db);
        this.isBargeInActive = false;
        this.hasDetectedSpeech = true;
        this.speechStartTime = now;
        this.lastSpeechTime = now;
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
        this.onSpeechDetectedCb?.();
        this.onBargeInCb?.();
        return;
      }
      return;
    }

    // 2. Voice thresholds tuned for voice_communication source
    // Raised to ignore ambient noise (fans, AC) — voice_communication
    // already applies hardware noise suppression + AGC
    const SPEECH_ONSET_DB = -40;
    const SPEECH_HOLD_DB = -48;

    if (db >= SPEECH_HOLD_DB) {
      // User is vocalizing or trailing off naturally
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      if (db >= SPEECH_ONSET_DB) {
        if (!this.hasDetectedSpeech) {
          console.log('[MOBILE_VAD] User speech onset detected! dB:', db);
          this.hasDetectedSpeech = true;
          this.onSpeechDetectedCb?.();
        }
        if (!this.speechStartTime) this.speechStartTime = now;
        this.lastSpeechTime = now;
      }
    } else {
      // Metering below hold threshold: potential pause or end of turn
      if (this.hasDetectedSpeech && !this.silenceTimer) {
        const vocalDuration = (this.lastSpeechTime || now) - (this.speechStartTime || now);
        // Natural conversational pause: allow comfortable breathing
        const requiredSilenceMs = vocalDuration < 1500 ? 1400 : 1150;

        this.silenceTimer = setTimeout(() => {
          console.log(`[MOBILE_VAD] Natural pause reached (${requiredSilenceMs}ms). Submitting speech turn...`);
          this.stopRecording();
        }, requiredSilenceMs);
      } else if (!this.hasDetectedSpeech && !this.silenceTimer) {
        // Generous 25-second idle ceiling before resetting, so user doesn't get cancelled while preparing to speak
        this.silenceTimer = setTimeout(() => {
          console.log('[MOBILE_VAD] Idle timeout (25s) with no speech. Resetting.');
          this.cancelRecording();
        }, 25000);
      }
    }
  }

  private async cleanupRecorder() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.recorder) {
      try {
        await this.recorder.stop();
      } catch (_) {}
      this.recorder = null;
    }
  }

  async stopRecording(): Promise<string | null> {
    if (!this.recorder) return null;
    try {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      const uri = this.recorder.uri;
      try {
        await this.recorder.stop();
      } catch (_) {}
      this.recorder = null;

      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      
      if (this.onSilenceCb) {
        if (uri) {
          console.log('[VoiceRecorder] Submitting audio for transcription:', uri);
          this.onSilenceCb(uri);
        } else {
          this.onSilenceCb(null);
        }
        this.onSilenceCb = null;
      }
      return uri;
    } catch (err) {
      console.error('Failed to stop recording', err);
      return null;
    }
  }

  async cancelRecording() {
    await this.cleanupRecorder();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    if (this.onSilenceCb) {
      this.onSilenceCb(null); // null = cancelled / no speech
      this.onSilenceCb = null;
    }
  }
}

export async function transcribeAudio(uri: string): Promise<{ text?: string; error?: string }> {
  try {
    const { fetchWithAuth } = await import('./api');
    
    const formData = new FormData();
    const filename = uri.split('/').pop() || 'audio.m4a';

    // React Native 0.86+ new arch fetch no longer accepts the legacy
    // {uri, name, type} object for FormData. Convert the local file
    // to a proper Blob first via fetch(), then append.
    console.log('[Transcribe] Reading audio file as blob:', uri);
    const fileResponse = await fetch(uri);
    const blob = await fileResponse.blob();
    console.log('[Transcribe] Blob created, size:', blob.size, 'type:', blob.type);

    formData.append('file', blob, filename);

    const res = await fetchWithAuth('/voice/transcribe', {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
        // Let fetch auto-generate the multipart boundary
        'Content-Type': 'multipart/form-data',
      }
    });

    if (res.ok) {
      const data = await res.json();
      return { text: data.text };
    } else {
      const errText = await res.text();
      console.error('[Transcribe] Server error:', res.status, errText);
      return { error: `Server error ${res.status}: ${errText}` };
    }
  } catch (error: any) {
    console.error('[Transcribe] Error:', error);
    return { error: error?.message || 'Network error' };
  }
}
