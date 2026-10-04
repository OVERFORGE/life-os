/**
 * LifeOS Transient Aven Surface (V2.3)
 * Sovereign Ambient Interaction Surface
 * 
 * Distinct Voice and Text Modalities:
 * - MODE 1: VOICE AVEN (Widget -> Mic)
 *   - Voice-first, detached ambient surface.
 *   - Visual language: Canonical Aven Orb with concentric glow rings, pulse, and soundwaves.
 *   - Explicit state machine: IDLE -> LISTENING -> TRANSCRIBING -> THINKING -> SPEAKING -> LISTENING.
 *   - Conversational multi-turn continuity: after speech completes, re-arms listening automatically.
 *   - ZERO chat bubbles, ZERO text composer, ZERO send button.
 * 
 * - MODE 2: TEXT AVEN (Widget -> Message)
 *   - Text-first, detached ambient surface.
 *   - Instant user bubble display, streaming assistant markdown responses.
 *   - STRICTLY TEXT ONLY: ZERO microphone activation, ZERO TTS audio playback.
 * 
 * - Deterministic isolated task dismissal returning cleanly to previous Android surface.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Mic,
  MicOff,
  Send,
  X,
  Sparkles,
  AlertTriangle,
  Volume2,
  MessageSquare,
} from 'lucide-react-native';
import {
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
} from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VoiceRecorder, transcribeAudio } from '../utils/audioCapture';
import { speakAndListen, stopSpeaking } from '../utils/ttsManager';
import { fetchWithAuth, API_URL } from '../utils/api';
import { MobileMarkdown } from '../components/ui/MobileMarkdown';
import { WidgetSyncBridge } from '../services/WidgetSyncBridge';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export type AmbientAvenMode = 'VOICE' | 'TEXT';

export type VoiceState =
  | 'IDLE'
  | 'CHECKING_PERMISSION'
  | 'PERMISSION_DENIED'
  | 'AUDIO_BUSY'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'THINKING'
  | 'SPEAKING'
  | 'ERROR';

export type TextState = 'IDLE' | 'THINKING' | 'ERROR';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

interface AvenTransientProps {
  initialMode?: 'voice' | 'text';
}

export default function AvenTransientModal(props: AvenTransientProps) {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ mode?: string }>();

  // Determine initial mode from props, route params, or bridge
  const [mode, setMode] = useState<AmbientAvenMode>(() => {
    const raw = (props?.initialMode || routeParams?.mode || 'voice').toLowerCase();
    return raw === 'text' ? 'TEXT' : 'VOICE';
  });

  // Query native bridge on mount as safety fallback
  useEffect(() => {
    WidgetSyncBridge.getInstance()
      .getAvenSessionMode()
      .then((bridgeMode) => {
        if (bridgeMode === 'text') {
          setMode('TEXT');
        } else if (bridgeMode === 'voice') {
          setMode('VOICE');
        }
      })
      .catch(() => {});
  }, []);

  // Shared Conversation ID for context continuity across turns
  const conversationIdRef = useRef<string | null>(null);
  const isActiveRef = useRef<boolean>(true);
  const isCancelledRef = useRef<boolean>(false);

  // ---------------------------------------------------------------------------
  // VOICE MODE STATE & CONTROLS
  // ---------------------------------------------------------------------------
  const [voiceStatus, setVoiceStatus] = useState<VoiceState>('IDLE');
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string>('');
  const [userSpokenText, setUserSpokenText] = useState<string>('');
  const [assistantSpokenText, setAssistantSpokenText] = useState<string>('');
  const [audioVolume, setAudioVolume] = useState<number>(0);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const voiceRecorderRef = useRef<VoiceRecorder>(new VoiceRecorder());

  // ---------------------------------------------------------------------------
  // TEXT MODE STATE & CONTROLS
  // ---------------------------------------------------------------------------
  const [textStatus, setTextStatus] = useState<TextState>('IDLE');
  const [textErrorMessage, setTextErrorMessage] = useState<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);

  // ---------------------------------------------------------------------------
  // ANIMATIONS (Reanimated Canonical Aven Orb)
  // ---------------------------------------------------------------------------
  const orbPulse = useSharedValue(1);
  const orbGlow = useSharedValue(0.2);
  const breathe = useSharedValue(0);
  const modalOpacity = useSharedValue(0);
  const modalTranslateY = useSharedValue(20);

  // Continuous breathing animation
  useEffect(() => {
    breathe.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );

    modalOpacity.value = withTiming(1, { duration: 180 });
    modalTranslateY.value = withTiming(0, { duration: 180 });

    isActiveRef.current = true;
    isCancelledRef.current = false;

    // Hardware back gesture dismissal
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissModal();
      return true;
    });

    return () => {
      isActiveRef.current = false;
      isCancelledRef.current = true;
      backSub.remove();
      cleanupAllAudio();
    };
  }, []);

  // Orb dynamic pulse based on voice status
  useEffect(() => {
    if (mode !== 'VOICE') return;

    if (voiceStatus === 'SPEAKING') {
      orbPulse.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 400 }),
          withTiming(1.0, { duration: 400 })
        ),
        -1,
        true
      );
      orbGlow.value = withTiming(1, { duration: 300 });
    } else if (voiceStatus === 'LISTENING') {
      orbPulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 350 }),
          withTiming(1.0, { duration: 350 })
        ),
        -1,
        true
      );
      orbGlow.value = withTiming(0.7, { duration: 300 });
    } else if (voiceStatus === 'THINKING' || voiceStatus === 'TRANSCRIBING') {
      orbPulse.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 600 }),
          withTiming(0.96, { duration: 600 })
        ),
        -1,
        true
      );
      orbGlow.value = withTiming(0.5, { duration: 300 });
    } else {
      orbPulse.value = withSpring(1);
      orbGlow.value = withTiming(0.2, { duration: 500 });
    }
  }, [voiceStatus, mode]);

  const orbAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbPulse.value }],
  }));

  const glowAnimStyle = useAnimatedStyle(() => {
    const scale = interpolate(breathe.value, [0, 1], [1, 1.15]);
    return {
      transform: [{ scale: scale * orbPulse.value }],
      opacity: interpolate(orbGlow.value, [0, 1], [0.15, 0.35]),
    };
  });

  const ringAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbPulse.value * 1.1 }],
    opacity: interpolate(orbGlow.value, [0, 1], [0.1, 0.3]),
  }));

  const modalContainerAnimStyle = useAnimatedStyle(() => ({
    opacity: modalOpacity.value,
    transform: [{ translateY: modalTranslateY.value }],
  }));

  // ---------------------------------------------------------------------------
  // LIFECYCLE & DISMISSAL
  // ---------------------------------------------------------------------------
  const cleanupAllAudio = () => {
    try {
      voiceRecorderRef.current.cancelRecording();
    } catch (_) {}
    try {
      stopSpeaking();
    } catch (_) {}
  };

  const dismissModal = () => {
    isCancelledRef.current = true;
    cleanupAllAudio();

    modalOpacity.value = withTiming(0, { duration: 120 });
    modalTranslateY.value = withTiming(20, { duration: 120 });

    setTimeout(async () => {
      try {
        const finished = await WidgetSyncBridge.getInstance().dismissAvenSurface();
        if (finished) return;
      } catch (_) {}

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(dashboard)');
      }
    }, 120);
  };

  // ---------------------------------------------------------------------------
  // MODE 1: VOICE PIPELINE & MULTI-TURN CONTINUITY
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (mode === 'VOICE') {
      startVoiceListening();
    }
  }, [mode]);

  const startVoiceListening = async () => {
    if (!isActiveRef.current || isCancelledRef.current || isMicMuted) return;

    try {
      setVoiceStatus('CHECKING_PERMISSION');
      setVoiceErrorMessage('');

      const permissionStatus = await getRecordingPermissionsAsync();
      if (!permissionStatus.granted) {
        const req = await requestRecordingPermissionsAsync();
        if (!req.granted) {
          setVoiceStatus('PERMISSION_DENIED');
          setVoiceErrorMessage('Microphone permission required for Voice Aven.');
          return;
        }
      }

      setVoiceStatus('LISTENING');

      const started = await voiceRecorderRef.current.startRecording(
        async (uri) => {
          if (!isActiveRef.current || isCancelledRef.current) return;
          await handleVoiceCaptured(uri);
        },
        {
          onVolume: (vol) => {
            if (isActiveRef.current && !isCancelledRef.current) {
              setAudioVolume(Math.min(1, Math.max(0, vol)));
            }
          },
        }
      );

      if (!started) {
        setVoiceStatus('AUDIO_BUSY');
        setVoiceErrorMessage('Microphone busy or in use by another app.');
      }
    } catch (e: any) {
      setVoiceStatus('ERROR');
      setVoiceErrorMessage(e?.message || 'Failed to start microphone.');
    }
  };

  const handleVoiceCaptured = async (uri: string) => {
    setVoiceStatus('TRANSCRIBING');
    try {
      const { text, error } = await transcribeAudio(uri);
      if (!isActiveRef.current || isCancelledRef.current) return;

      if (error || !text) {
        setVoiceStatus('ERROR');
        setVoiceErrorMessage(error || "Couldn't transcribe audio. Tap orb to retry.");
        return;
      }

      const cleaned = text.trim();
      if (cleaned.length <= 2 || /^[.\s,!?]+$/.test(cleaned)) {
        // Ignored acoustic jitter / breath, auto-rearm listening
        startVoiceListening();
        return;
      }

      setUserSpokenText(cleaned);
      await sendVoiceQueryToAven(cleaned);
    } catch (e: any) {
      setVoiceStatus('ERROR');
      setVoiceErrorMessage('Audio transcription error.');
    }
  };

  const sendVoiceQueryToAven = async (query: string) => {
    setVoiceStatus('THINKING');
    setAssistantSpokenText('');
    setVoiceErrorMessage('');

    try {
      const token = await AsyncStorage.getItem('user_token');
      const res = await fetchWithAuth('/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: query,
          conversationId: conversationIdRef.current || undefined,
          model: 'llama-3.3-70b-versatile',
          mode: 'general',
          streamFormat: 'events',
          clientPlatform: 'mobile',
        }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setVoiceStatus('ERROR');
          setVoiceErrorMessage('Session expired. Open LifeOS to authenticate.');
          return;
        }
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const resText = await res.text();
      let extracted = '';

      if (resText.includes('data: ')) {
        const lines = resText.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const ev = JSON.parse(trimmed.slice(6));
              if (ev.conversationId && !conversationIdRef.current) {
                conversationIdRef.current = ev.conversationId;
              }
              if (ev.type === 'assistant_delta' && ev.text) {
                extracted += ev.text;
                setAssistantSpokenText(extracted);
              }
            } catch (_) {}
          }
        }
      } else {
        try {
          const parsed = JSON.parse(resText);
          if (parsed.conversationId && !conversationIdRef.current) {
            conversationIdRef.current = parsed.conversationId;
          }
          extracted = parsed.message?.content || parsed.response || resText;
        } catch (_) {
          extracted = resText;
        }
        setAssistantSpokenText(extracted);
      }

      // Filter out internal thinking tags for voice synthesis
      const cleanVoiceOutput = extracted.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();

      if (cleanVoiceOutput.length > 0 && isActiveRef.current && !isCancelledRef.current) {
        setVoiceStatus('SPEAKING');

        // Play assistant voice via TTS
        speakAndListen(cleanVoiceOutput, () => {
          // CRITICAL MULTI-TURN CONTINUITY:
          // When Aven finishes speaking, automatically re-arm listening for turn 2, 3, etc.
          if (isActiveRef.current && !isCancelledRef.current && !isMicMuted) {
            setVoiceStatus('IDLE');
            setTimeout(() => {
              if (isActiveRef.current && !isCancelledRef.current && !isMicMuted) {
                startVoiceListening();
              }
            }, 300);
          } else {
            setVoiceStatus('IDLE');
          }
        });
      } else {
        // Empty response fallback
        setVoiceStatus('IDLE');
        setTimeout(() => {
          if (isActiveRef.current && !isCancelledRef.current) {
            startVoiceListening();
          }
        }, 300);
      }
    } catch (e: any) {
      setVoiceStatus('ERROR');
      setVoiceErrorMessage('Connection lost. Tap orb to retry.');
    }
  };

  const handleOrbPress = () => {
    if (voiceStatus === 'LISTENING') {
      // Tap orb while listening to trigger immediate audio capture
      try {
        voiceRecorderRef.current.stopRecording();
      } catch (_) {}
    } else if (voiceStatus === 'SPEAKING') {
      // Tap orb while speaking to interrupt and return to listening
      stopSpeaking();
      setVoiceStatus('IDLE');
      setTimeout(() => startVoiceListening(), 200);
    } else if (voiceStatus === 'ERROR' || voiceStatus === 'IDLE') {
      startVoiceListening();
    }
  };

  const toggleMicMute = () => {
    if (isMicMuted) {
      setIsMicMuted(false);
      startVoiceListening();
    } else {
      setIsMicMuted(true);
      cleanupAllAudio();
      setVoiceStatus('IDLE');
    }
  };

  // ---------------------------------------------------------------------------
  // MODE 2: TEXT PIPELINE (STRICTLY SILENT & TEXT ONLY)
  // ---------------------------------------------------------------------------
  const handleTextSubmit = async () => {
    const query = textInput.trim();
    if (!query) return;

    setTextInput('');
    setTextErrorMessage('');

    // Rule 11 & 22: Immediately insert user message bubble
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setTextStatus('THINKING');

    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 50);

    try {
      const token = await AsyncStorage.getItem('user_token');
      const res = await fetchWithAuth('/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: query,
          conversationId: conversationIdRef.current || undefined,
          model: 'llama-3.3-70b-versatile',
          mode: 'general',
          streamFormat: 'events',
          clientPlatform: 'mobile',
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const resText = await res.text();
      let extracted = '';

      if (resText.includes('data: ')) {
        const lines = resText.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const ev = JSON.parse(trimmed.slice(6));
              if (ev.conversationId && !conversationIdRef.current) {
                conversationIdRef.current = ev.conversationId;
              }
              if (ev.type === 'assistant_delta' && ev.text) {
                extracted += ev.text;
              }
            } catch (_) {}
          }
        }
      } else {
        try {
          const parsed = JSON.parse(resText);
          if (parsed.conversationId && !conversationIdRef.current) {
            conversationIdRef.current = parsed.conversationId;
          }
          extracted = parsed.message?.content || parsed.response || resText;
        } catch (_) {
          extracted = resText;
        }
      }

      const finalResponse = extracted.trim() || 'Received.';

      // Insert assistant message bubble
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: finalResponse,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setTextStatus('IDLE');

      // STRICT TEXT INVARIANT: ZERO TTS! DO NOT CALL speakAndListen!
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 50);
    } catch (err: any) {
      setTextStatus('ERROR');
      setTextErrorMessage('Failed to send message. Please retry.');
    }
  };

  // Soundwave bar multiplier heights
  const barMultipliers = [0.4, 0.7, 1.0, 0.6, 0.3];

  return (
    <View style={styles.scrimContainer}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      {/* Dismissal Backdrop Tap Area */}
      <TouchableOpacity
        style={styles.backdropTapArea}
        activeOpacity={1}
        onPress={dismissModal}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}>
        <Reanimated.View style={[styles.modalCard, modalContainerAnimStyle]}>
          {/* Header Row: Title, Mode Indicator, Dismiss Button */}
          <View style={styles.headerRow}>
            <View style={styles.headerBrandGroup}>
              {mode === 'VOICE' ? (
                <Sparkles size={16} color="#E8414A" />
              ) : (
                <MessageSquare size={16} color="#E8414A" />
              )}
              <Text style={styles.headerTitle}>Aven</Text>
              <Text style={styles.headerSubtitle}>
                {mode === 'VOICE' ? '• Ambient Voice' : '• Ambient Text'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={dismissModal}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.closeButton}>
              <X size={18} color="#88888E" />
            </TouchableOpacity>
          </View>

          {/* =============================================================== */}
          {/* MODE 1: VOICE SURFACE                                           */}
          {/* =============================================================== */}
          {mode === 'VOICE' && (
            <View style={styles.voiceContainer}>
              {/* Center Orb Stage with Concentric Glow Rings */}
              <View style={styles.orbStage}>
                <Reanimated.View style={[glowAnimStyle, styles.glowRing3]} />
                <Reanimated.View style={[glowAnimStyle, styles.glowRing2]} />
                <Reanimated.View style={[glowAnimStyle, styles.glowRing1]} />
                <Reanimated.View style={[ringAnimStyle, styles.accentRingOuter]} />
                <Reanimated.View style={[ringAnimStyle, styles.accentRingInner]} />

                {/* Core Interactive Orb */}
                <TouchableOpacity onPress={handleOrbPress} activeOpacity={0.85}>
                  <Reanimated.View style={[orbAnimStyle, styles.coreOrb]}>
                    <View style={styles.orbTopHighlight} />
                    <View style={styles.orbInnerRing} />

                    {voiceStatus === 'LISTENING' && <Mic size={34} color="#F6F3F1" />}
                    {voiceStatus === 'TRANSCRIBING' && (
                      <ActivityIndicator size="small" color="#F6F3F1" />
                    )}
                    {voiceStatus === 'THINKING' && (
                      <Sparkles size={32} color="#E8414A" />
                    )}
                    {voiceStatus === 'SPEAKING' && <Volume2 size={34} color="#E8414A" />}
                    {voiceStatus === 'ERROR' && (
                      <AlertTriangle size={32} color="#E8414A" />
                    )}
                    {(voiceStatus === 'IDLE' || voiceStatus === 'CHECKING_PERMISSION') && (
                      <Mic size={34} color="#88888E" />
                    )}
                  </Reanimated.View>
                </TouchableOpacity>

                {/* Dynamic Soundwave Volume Bars */}
                <View style={styles.soundwaveRow}>
                  {barMultipliers.map((mult, idx) => {
                    let barH = 4;
                    let barC = 'rgba(232,65,74,0.2)';

                    if (voiceStatus === 'SPEAKING') {
                      barH = 6 + Math.sin(Date.now() / 150 + idx) * 12 * mult;
                      barC = '#E8414A';
                    } else if (voiceStatus === 'LISTENING') {
                      barH = 4 + audioVolume * 22 * mult;
                      barC = audioVolume > 0.05 ? '#F6F3F1' : 'rgba(246,243,241,0.25)';
                    } else if (voiceStatus === 'THINKING' || voiceStatus === 'TRANSCRIBING') {
                      barH = 4 + Math.sin(Date.now() / 200 + idx) * 6;
                      barC = '#E8414A';
                    }

                    return (
                      <View
                        key={idx}
                        style={[
                          styles.soundwaveBar,
                          { height: Math.max(4, barH), backgroundColor: barC },
                        ]}
                      />
                    );
                  })}
                </View>
              </View>

              {/* Status Indicator Label */}
              <View style={styles.voiceStatusContainer}>
                {voiceStatus === 'LISTENING' && (
                  <Text style={styles.statusLabelActive}>Listening…</Text>
                )}
                {voiceStatus === 'TRANSCRIBING' && (
                  <Text style={styles.statusLabelMuted}>Transcribing speech…</Text>
                )}
                {voiceStatus === 'THINKING' && (
                  <Text style={styles.statusLabelAccent}>Thinking…</Text>
                )}
                {voiceStatus === 'SPEAKING' && (
                  <Text style={styles.statusLabelAccent}>Aven is speaking…</Text>
                )}
                {voiceStatus === 'IDLE' && (
                  <Text style={styles.statusLabelMuted}>Tap orb to speak</Text>
                )}
                {voiceStatus === 'ERROR' && (
                  <Text style={styles.statusLabelError}>
                    {voiceErrorMessage || 'Voice session error'}
                  </Text>
                )}
              </View>

              {/* Live Transcript Feedback (Clean typographic presentation) */}
              {userSpokenText.length > 0 && (
                <View style={styles.transcriptCard}>
                  <Text style={styles.transcriptText} numberOfLines={2}>
                    "{userSpokenText}"
                  </Text>
                </View>
              )}

              {/* Minimalist Functional Control Row */}
              <View style={styles.voiceControlsRow}>
                <TouchableOpacity
                  onPress={toggleMicMute}
                  style={[
                    styles.voiceMuteButton,
                    isMicMuted && styles.voiceMuteButtonActive,
                  ]}>
                  {isMicMuted ? (
                    <MicOff size={16} color="#E8414A" />
                  ) : (
                    <Mic size={16} color="#88888E" />
                  )}
                  <Text
                    style={[
                      styles.voiceMuteLabel,
                      isMicMuted && styles.voiceMuteLabelActive,
                    ]}>
                    {isMicMuted ? 'Muted' : 'Mic Active'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* =============================================================== */}
          {/* MODE 2: TEXT SURFACE                                            */}
          {/* =============================================================== */}
          {mode === 'TEXT' && (
            <View style={styles.textContainer}>
              {/* Message History Feed */}
              <ScrollView
                ref={scrollViewRef}
                style={styles.chatScroll}
                contentContainerStyle={styles.chatContentContainer}
                showsVerticalScrollIndicator={false}>
                {messages.length === 0 ? (
                  <View style={styles.emptyChatPlaceholder}>
                    <Text style={styles.emptyChatPrompt}>
                      How can LifeOS assist your execution?
                    </Text>
                  </View>
                ) : (
                  messages.map((item) => (
                    <View
                      key={item.id}
                      style={[
                        styles.bubbleWrapper,
                        item.role === 'user'
                          ? styles.bubbleUserWrapper
                          : styles.bubbleAssistantWrapper,
                      ]}>
                      <View
                        style={[
                          styles.bubbleBase,
                          item.role === 'user'
                            ? styles.bubbleUser
                            : styles.bubbleAssistant,
                        ]}>
                        {item.role === 'user' ? (
                          <Text style={styles.bubbleUserText}>{item.content}</Text>
                        ) : (
                          <MobileMarkdown content={item.content} />
                        )}
                      </View>
                    </View>
                  ))
                )}

                {/* Thinking / Streaming Indicator */}
                {textStatus === 'THINKING' && (
                  <View style={styles.thinkingIndicatorRow}>
                    <Sparkles size={13} color="#E8414A" />
                    <Text style={styles.thinkingIndicatorText}>
                      Aven is thinking…
                    </Text>
                  </View>
                )}

                {textStatus === 'ERROR' && (
                  <View style={styles.errorBannerRow}>
                    <AlertTriangle size={13} color="#E8414A" />
                    <Text style={styles.errorBannerText}>{textErrorMessage}</Text>
                  </View>
                )}
              </ScrollView>

              {/* Bottom Text Composer Bar */}
              <View style={styles.textComposerRow}>
                <TextInput
                  style={styles.textComposerInput}
                  placeholder="Ask Aven anything…"
                  placeholderTextColor="#88888E"
                  value={textInput}
                  onChangeText={setTextInput}
                  onSubmitEditing={handleTextSubmit}
                  returnKeyType="send"
                  multiline={false}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={handleTextSubmit}
                  disabled={!textInput.trim() || textStatus === 'THINKING'}
                  style={[
                    styles.textSendButton,
                    (!textInput.trim() || textStatus === 'THINKING') &&
                      styles.textSendButtonDisabled,
                  ]}>
                  <Send size={15} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Reanimated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrimContainer: {
    flex: 1,
    backgroundColor: 'rgba(11, 11, 12, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropTapArea: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  keyboardAvoid: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#161618',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#2A2B2F',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#202124',
  },
  headerBrandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFDFC',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#88888E',
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },

  // ---------------------------------------------------------------------------
  // VOICE SURFACE STYLES
  // ---------------------------------------------------------------------------
  voiceContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  orbStage: {
    width: 240,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing3: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 1,
    borderColor: 'rgba(232, 65, 74, 0.04)',
    backgroundColor: 'rgba(232, 65, 74, 0.03)',
  },
  glowRing2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(232, 65, 74, 0.06)',
    backgroundColor: 'rgba(232, 65, 74, 0.04)',
  },
  glowRing1: {
    position: 'absolute',
    width: 175,
    height: 175,
    borderRadius: 87,
    borderWidth: 1,
    borderColor: 'rgba(232, 65, 74, 0.08)',
    backgroundColor: 'rgba(232, 65, 74, 0.05)',
  },
  accentRingOuter: {
    position: 'absolute',
    width: 155,
    height: 155,
    borderRadius: 78,
    borderWidth: 1,
    borderColor: 'rgba(232, 65, 74, 0.15)',
  },
  accentRingInner: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(232, 65, 74, 0.25)',
  },
  coreOrb: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1C1F',
    borderWidth: 2,
    borderColor: 'rgba(232, 65, 74, 0.35)',
    shadowColor: '#E8414A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  orbTopHighlight: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    height: 56,
    borderTopLeftRadius: 58,
    borderTopRightRadius: 58,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  orbInnerRing: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: 'rgba(232, 65, 74, 0.12)',
  },
  soundwaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 24,
    marginTop: 18,
  },
  soundwaveBar: {
    width: 3.5,
    borderRadius: 2,
  },
  voiceStatusContainer: {
    marginTop: 14,
    alignItems: 'center',
  },
  statusLabelActive: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFDFC',
    letterSpacing: 0.2,
  },
  statusLabelMuted: {
    fontSize: 13,
    color: '#88888E',
  },
  statusLabelAccent: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E8414A',
  },
  statusLabelError: {
    fontSize: 12,
    color: '#E8414A',
    textAlign: 'center',
  },
  transcriptCard: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1F2023',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2B2F',
    maxWidth: '92%',
  },
  transcriptText: {
    fontSize: 13,
    color: 'rgba(236, 231, 227, 0.85)',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  voiceControlsRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voiceMuteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#1F2023',
    borderWidth: 1,
    borderColor: '#2A2B2F',
  },
  voiceMuteButtonActive: {
    borderColor: 'rgba(232, 65, 74, 0.4)',
    backgroundColor: 'rgba(232, 65, 74, 0.1)',
  },
  voiceMuteLabel: {
    fontSize: 12,
    color: '#88888E',
    fontWeight: '500',
  },
  voiceMuteLabelActive: {
    color: '#E8414A',
  },

  // ---------------------------------------------------------------------------
  // TEXT SURFACE STYLES
  // ---------------------------------------------------------------------------
  textContainer: {
    height: Math.min(460, SCREEN_HEIGHT * 0.6),
    justifyContent: 'space-between',
  },
  chatScroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  chatContentContainer: {
    paddingVertical: 14,
    gap: 10,
  },
  emptyChatPlaceholder: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChatPrompt: {
    fontSize: 13,
    color: '#88888E',
    textAlign: 'center',
  },
  bubbleWrapper: {
    width: '100%',
  },
  bubbleUserWrapper: {
    alignItems: 'flex-end',
  },
  bubbleAssistantWrapper: {
    alignItems: 'flex-start',
  },
  bubbleBase: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleUser: {
    backgroundColor: '#2A2B2F',
    borderBottomRightRadius: 4,
  },
  bubbleUserText: {
    fontSize: 14,
    color: '#FFFDFC',
    lineHeight: 20,
  },
  bubbleAssistant: {
    backgroundColor: '#1F2023',
    borderWidth: 1,
    borderColor: '#2A2B2F',
    borderBottomLeftRadius: 4,
  },
  thinkingIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  thinkingIndicatorText: {
    fontSize: 12,
    color: '#E8414A',
    fontStyle: 'italic',
  },
  errorBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(232, 65, 74, 0.1)',
  },
  errorBannerText: {
    fontSize: 12,
    color: '#E8414A',
  },
  textComposerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#202124',
    backgroundColor: '#161618',
  },
  textComposerInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#1F2023',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2B2F',
    paddingHorizontal: 16,
    color: '#FFFDFC',
    fontSize: 13,
  },
  textSendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E8414A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textSendButtonDisabled: {
    opacity: 0.4,
  },
});
