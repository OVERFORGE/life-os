import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

let soundObj: Audio.Sound | null = null;

export async function playChime() {
  try {
    if (soundObj) {
      await soundObj.unloadAsync();
    }
    // Note: requires a chime.wav or similar in assets. We will use a system sound or simple expo-av synth if possible,
    // but without an asset, we can just skip or use Speech to say "Ding"
    // Since we don't have a local chime asset, we'll use a fast TTS 'Ding' for now, or just leave it blank if no asset.
    Speech.speak("Chime", { rate: 1.5, pitch: 1.5 });
  } catch (e) {
    console.error("Failed to play chime", e);
  }
}

export async function speakAndListen(text: string, onFinish: () => void) {
  try {
    // Ensure audio mode allows playback
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });
    
    // Strip markdown formatting to make the speech sound natural and fluent
    const cleanText = text
      .replace(/\*/g, '')
      .replace(/#/g, '')
      .replace(/`/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // replace links with just their text
      .trim();

    Speech.speak(cleanText, {
      language: 'en-US',
      rate: 1.0, // Normal speaking rate
      pitch: 1.0, // Normal pitch
      onDone: () => {
        // Wait half a second before triggering listen to avoid mic feedback
        setTimeout(onFinish, 500);
      },
      onError: (err) => {
        console.error("TTS Error:", err);
        onFinish();
      },
      onStopped: () => {
        onFinish();
      }
    });
  } catch (e) {
    console.error("Failed TTS", e);
    onFinish();
  }
}

export function stopSpeaking() {
  Speech.stop();
}
