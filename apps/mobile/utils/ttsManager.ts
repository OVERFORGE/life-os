import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { API_URL } from './api';

let soundObj: Audio.Sound | null = null;

/**
 * Audio chime indicator.
 * Does NOT speak the word "Chime" (fixed robotic speech artifact).
 */
export async function playChime() {
  try {
    if (soundObj) {
      await soundObj.unloadAsync();
      soundObj = null;
    }
  } catch (e) {
    console.warn("Failed to play chime", e);
  }
}

/**
 * Sanitizes markdown, asterisks, brackets, and code blocks
 * for clean, natural conversational cadence.
 */
function sanitizeSpeechText(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^[#>-]+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Streams studio-grade neural voice synthesis from the LifeOS backend via expo-av.
 * Falls back to expo-speech if offline or network unreachable.
 */
export async function speakAndListen(text: string, onFinish: () => void, voice: string = 'en-US-JennyNeural') {
  try {
    // 1. Configure audio mode for high-fidelity playback
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });

    const cleanText = sanitizeSpeechText(text);
    if (!cleanText) {
      onFinish();
      return;
    }

    // 2. Stop and release any existing sound
    await stopSpeaking();

    // 3. Construct streaming neural TTS URL
    const streamUrl = `${API_URL}/voice/tts?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(voice)}`;

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: streamUrl },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            soundObj = null;
            setTimeout(onFinish, 350);
          }
        }
      );

      soundObj = sound;
    } catch (streamError) {
      console.warn('[MOBILE_TTS] Backend neural streaming failed, falling back to local TTS:', streamError);
      
      // Graceful offline fallback using expo-speech
      Speech.speak(cleanText, {
        language: 'en-US',
        rate: 1.0,
        pitch: 1.0,
        onDone: () => {
          setTimeout(onFinish, 350);
        },
        onError: () => {
          onFinish();
        },
        onStopped: () => {
          onFinish();
        },
      });
    }
  } catch (e) {
    console.error('Failed speakAndListen:', e);
    onFinish();
  }
}

/**
 * Instantly terminates active speech playback for seamless barge-in interruption.
 */
export async function stopSpeaking() {
  Speech.stop();
  if (soundObj) {
    try {
      await soundObj.stopAsync();
      await soundObj.unloadAsync();
    } catch (_) {}
    soundObj = null;
  }
}
