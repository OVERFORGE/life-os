import { Audio } from 'expo-av';
import { Platform } from 'react-native';

export class VoiceRecorder {
  private recording: Audio.Recording | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private onSilenceCb: ((uri: string | null) => void) | null = null;
  private hasDetectedSpeech = false;
  // Track peak metering to decide if the user actually spoke
  private peakMetering = -160;

  async startRecording(onSilence: (uri: string | null) => void): Promise<boolean> {
    try {
      this.onSilenceCb = onSilence;
      this.hasDetectedSpeech = false;
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
        250 // Metering update interval in ms
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
      
      // -35 dB is a confident voice threshold. Anything louder = speech detected.
      if (db > -35) {
        this.hasDetectedSpeech = true;
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else {
        // Only start silence countdown AFTER actual speech was detected
        if (this.hasDetectedSpeech && !this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            this.stopRecording();
          }, 2000); // 2s of silence after speech ends recording
        } else if (!this.hasDetectedSpeech && !this.silenceTimer) {
          // No speech detected yet — start a max-wait timer of 6 seconds
          this.silenceTimer = setTimeout(() => {
            // If still no speech detected, cancel (don't transcribe)
            this.cancelRecording();
          }, 6000);
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
    const res = await fetchWithAuth('/transcribe', {
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
