import { Audio } from 'expo-av';
import { Platform } from 'react-native';

export class VoiceRecorder {
  private recording: Audio.Recording | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private onSilenceCb: ((uri: string | null) => void) | null = null;
  private onBargeInCb: (() => void) | null = null;
  private isBargeInActive = false;
  private hasDetectedSpeech = false;
  private speechStartTime: number | null = null;
  private lastSpeechTime: number | null = null;
  // Track peak metering to decide if the user actually spoke
  private peakMetering = -160;

  async startRecording(
    onSilence: (uri: string | null) => void,
    options?: { isBargeIn?: boolean; onBargeIn?: () => void }
  ): Promise<boolean> {
    try {
      this.onSilenceCb = onSilence;
      this.onBargeInCb = options?.onBargeIn || null;
      this.isBargeInActive = options?.isBargeIn || false;
      this.hasDetectedSpeech = false;
      this.speechStartTime = null;
      this.lastSpeechTime = null;
      this.peakMetering = -160;
      
      let perm = await Audio.getPermissionsAsync();
      if (perm.status !== 'granted') {
        perm = await Audio.requestPermissionsAsync();
      }
      if (perm.status !== 'granted') {
        console.log('Audio permission not granted.');
        return false;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        this.onStatusUpdate.bind(this),
        100 // Metering update interval in ms for real-time responsiveness
      );
      this.recording = recording;
      return true;
    } catch (err) {
      console.error('Failed to start recording', err);
      return false;
    }
  }

  private onStatusUpdate(status: Audio.RecordingStatus) {
    if (status.isRecording && status.metering !== undefined) {
      const db = status.metering;
      if (db > this.peakMetering) this.peakMetering = db;
      const now = Date.now();

      // 1. Barge-in detection while assistant is speaking
      if (this.isBargeInActive) {
        // Voice directly into phone mic produces >= -26 dB, cutting above speaker audio
        if (db >= -26) {
          console.log('[MOBILE_VAD] Barge-in speech detected during playback! Metering:', db);
          this.isBargeInActive = false;
          this.hasDetectedSpeech = true;
          this.speechStartTime = now;
          this.lastSpeechTime = now;
          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
          }
          this.onBargeInCb?.();
          return;
        }
        return;
      }

      // 2. Confident voice and hold thresholds
      const SPEECH_ONSET_DB = -36;
      const SPEECH_HOLD_DB = -44;

      if (db >= SPEECH_HOLD_DB) {
        // User is vocalizing or trailing off naturally
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }

        if (db >= SPEECH_ONSET_DB) {
          this.hasDetectedSpeech = true;
          if (!this.speechStartTime) this.speechStartTime = now;
          this.lastSpeechTime = now;
        }
      } else {
        // Metering below hold threshold: potential pause or end of turn
        if (this.hasDetectedSpeech && !this.silenceTimer) {
          const vocalDuration = (this.lastSpeechTime || now) - (this.speechStartTime || now);
          // Natural conversational pause: allow breathing without mid-sentence cut-off
          const requiredSilenceMs = vocalDuration < 1500 ? 1200 : 1050;

          this.silenceTimer = setTimeout(() => {
            console.log(`[MOBILE_VAD] Natural pause reached (${requiredSilenceMs}ms). Submitting speech turn...`);
            this.stopRecording();
          }, requiredSilenceMs);
        } else if (!this.hasDetectedSpeech && !this.silenceTimer) {
          // No speech detected yet — max wait ceiling of 7 seconds before cancelling
          this.silenceTimer = setTimeout(() => {
            this.cancelRecording();
          }, 7000);
        }
      }
    }
  }

  async stopRecording() {
    if (!this.recording) return null;
    try {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      await this.recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = this.recording.getURI();
      this.recording = null;
      
      if (this.onSilenceCb) {
        if (this.hasDetectedSpeech && uri) {
          // Only transcribe if we actually detected meaningful speech
          this.onSilenceCb(uri);
        } else {
          // No speech detected — signal caller with null so it can reset silently
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
    if (!this.recording) return;
    try {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      await this.recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      this.recording = null;
      if (this.onSilenceCb) {
        this.onSilenceCb(null); // null = cancelled / no speech
        this.onSilenceCb = null;
      }
    } catch (err) {
      console.error('Failed to cancel recording', err);
    }
  }
}

export async function transcribeAudio(uri: string): Promise<{ text?: string; error?: string }> {
  try {
    const { fetchWithAuth } = await import('./api');
    
    const formData = new FormData();
    const filename = uri.split('/').pop() || 'audio.m4a';
    
    formData.append('file', {
      uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
      name: filename,
      type: 'audio/m4a',
    } as any);

    // We must pass multipart form data. fetchWithAuth should allow overriding headers or omitting Content-Type
    // so the browser/fetch polyfill can auto-generate the boundary.
    const res = await fetchWithAuth('/voice/transcribe', {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'multipart/form-data',
      }
    });

    if (res.ok) {
      const data = await res.json();
      return { text: data.text };
    } else {
      const errText = await res.text();
      console.error('Transcription failed:', res.status, errText);
      return { error: `Server error ${res.status}: ${errText}` };
    }
  } catch (error: any) {
    console.error('Transcription error:', error);
    return { error: error?.message || 'Network error' };
  }
}
