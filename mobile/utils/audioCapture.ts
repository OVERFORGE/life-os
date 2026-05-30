import { Audio } from 'expo-av';
import { Platform } from 'react-native';

export class VoiceRecorder {
  private recording: Audio.Recording | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private onSilenceCb: ((uri: string) => void) | null = null;

  async startRecording(onSilence: (uri: string) => void): Promise<boolean> {
    try {
      this.onSilenceCb = onSilence;
      
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
      // Metering is usually between -160 (silence) and 0 (loudest)
      if (status.metering > -45) {
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            this.stopRecording();
          }, 2500); // 2.5 seconds of silence ends recording
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
      
      if (uri && this.onSilenceCb) {
        this.onSilenceCb(uri);
        this.onSilenceCb = null; // Prevent double-trigger
      }
      return uri;
    } catch (err) {
      console.error('Failed to stop recording', err);
      return null;
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
