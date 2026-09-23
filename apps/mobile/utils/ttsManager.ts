import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './api';

let activePlayer: AudioPlayer | null = null;
let activeSubscription: { remove: () => void } | null = null;

/**
 * Audio chime indicator.
 * Does NOT speak the word "Chime" (fixed robotic speech artifact).
 */
export async function playChime() {
  try {
    if (activePlayer) {
      activePlayer.pause();
      activePlayer.remove();
      activePlayer = null;
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

export function isAudioSpeaking(): boolean {
  return activePlayer !== null;
}

/**
 * Streams studio-grade neural voice synthesis from the LifeOS backend via expo-audio.
 * Falls back to expo-speech if offline or network unreachable.
 */
export async function speakAndListen(text: string, onFinish: () => void, voice: string = 'en-GB-RyanNeural') {
  try {
    // 1. Configure audio mode for high-fidelity playback while allowing microphone capture (full-duplex)
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });

    const cleanText = sanitizeSpeechText(text);
    if (!cleanText) {
      onFinish();
      return;
    }

    // 2. Stop and release any existing sound
    await stopSpeaking();

    // 3. Construct streaming neural TTS URL with universal phonetic parameter
    let userParam = '';
    try {
      const storedName = await AsyncStorage.getItem('user_name');
      const storedPhonetic = await AsyncStorage.getItem('user_phonetic_name');
      if (storedName) userParam += `&userName=${encodeURIComponent(storedName)}`;
      if (storedPhonetic) userParam += `&phoneticName=${encodeURIComponent(storedPhonetic)}`;
    } catch (_) {}

    const streamUrl = `${API_URL}/voice/tts?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(voice)}${userParam}`;

    try {
      const player = createAudioPlayer(streamUrl);
      activePlayer = player;

      let finished = false;
      const finishOnce = () => {
        if (finished) return;
        finished = true;
        if (activeSubscription) {
          activeSubscription.remove();
          activeSubscription = null;
        }
        if (activePlayer === player) {
          try {
            player.remove();
          } catch (_) {}
          activePlayer = null;
        }
        setTimeout(onFinish, 350);
      };

      activeSubscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish || status.playbackState === 'finished') {
          finishOnce();
        }
      });

      player.play();
    } catch (streamError) {
      console.warn('[MOBILE_TTS] Backend neural streaming failed, falling back to local TTS:', streamError);
      
      // Graceful offline fallback using expo-speech with British male voice preference
      let fallbackVoice: string | undefined;
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        // Prefer a British English male voice to match the Aven identity
        const britishMale = voices.find(v => 
          v.language?.startsWith('en-GB') && 
          (v.name?.toLowerCase().includes('male') || v.identifier?.toLowerCase().includes('male'))
        );
        const anyBritish = voices.find(v => v.language?.startsWith('en-GB'));
        fallbackVoice = (britishMale || anyBritish)?.identifier;
      } catch (_) {}

      Speech.speak(cleanText, {
        voice: fallbackVoice,
        language: 'en-GB',
        rate: 1.0,
        pitch: 0.9,
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
  if (activeSubscription) {
    activeSubscription.remove();
    activeSubscription = null;
  }
  if (activePlayer) {
    try {
      activePlayer.pause();
      activePlayer.remove();
    } catch (_) {}
    activePlayer = null;
  }
}
