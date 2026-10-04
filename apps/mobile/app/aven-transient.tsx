/**
 * LifeOS Transient Aven Surface (Phase 5 & Phase 6)
 * Version 2.2.2-PRODUCTION-HARDENED
 * 
 * Focused floating modal summoned from widget or launcher.
 * Product Invariant: "I summoned Aven", NOT "I opened LifeOS".
 * Reuses existing sovereign Aven pipeline (VoiceRecorder -> transcribeAudio -> /api/conversation).
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  BackHandler,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Mic,
  MicOff,
  Send,
  X,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Volume2,
} from 'lucide-react-native';
import {
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
} from 'expo-audio';
import { VoiceRecorder, transcribeAudio } from '../utils/audioCapture';
import { speakAndListen, stopSpeaking } from '../utils/ttsManager';
import { fetchWithAuth } from '../utils/api';
import { MobileMarkdown } from '../components/ui/MobileMarkdown';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type AudioUiState =
  | 'IDLE'
  | 'CHECKING_PERMISSION'
  | 'PERMISSION_DENIED'
  | 'AUDIO_BUSY'
  | 'RECORDING'
  | 'TRANSCRIBING'
  | 'STREAMING'
  | 'SPEAKING'
  | 'ERROR';

export default function AvenTransientModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode = params.mode || 'voice';

  const [uiState, setUiState] = useState<AudioUiState>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const [userQuery, setUserQuery] = useState<string>('');
  const [assistantResponse, setAssistantResponse] = useState<string>('');
  const [audioVolume, setAudioVolume] = useState<number>(0);

  const voiceRecorderRef = useRef<VoiceRecorder>(new VoiceRecorder());
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Animate modal appearance
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();

    // Android back gesture dismissal
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissModal();
      return true;
    });

    return () => {
      backSub.remove();
      cleanupAudio();
    };
  }, []);

  // Pulsing animation for active recording / speaking
  useEffect(() => {
    if (uiState === 'RECORDING' || uiState === 'SPEAKING') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [uiState]);

  // Auto-start recording if summoned in voice mode
  useEffect(() => {
    if (initialMode === 'voice') {
      startConditionalRecording();
    } else {
      setUiState('IDLE');
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [initialMode]);

  const cleanupAudio = () => {
    try {
      voiceRecorderRef.current.cancelRecording();
      stopSpeaking();
    } catch (_) {}
  };

  const dismissModal = () => {
    cleanupAudio();
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(dashboard)');
      }
    });
  };

  /**
   * Conditional Microphone Auto-Start State Machine (Section 7.2)
   */
  const startConditionalRecording = async () => {
    try {
      setUiState('CHECKING_PERMISSION');
      setErrorMessage('');

      // Step 1: Check Microphone Permission
      const permissionStatus = await getRecordingPermissionsAsync();
      if (!permissionStatus.granted) {
        const req = await requestRecordingPermissionsAsync();
        if (!req.granted) {
          setUiState('PERMISSION_DENIED');
          return;
        }
      }

      // Step 2: Initialize Recording with live volume callback
      setUiState('RECORDING');
      const started = await voiceRecorderRef.current.startRecording(
        async (uri) => {
          // Silence detected: proceed to transcription
          if (!uri) {
            setUiState('IDLE');
            return;
          }
          await handleAudioCaptured(uri);
        },
        {
          onVolume: (vol) => {
            setAudioVolume(Math.min(1, Math.max(0, vol)));
          },
        }
      );

      if (!started) {
        setUiState('AUDIO_BUSY');
        setErrorMessage('Microphone in use by another app.');
        setTimeout(() => inputRef.current?.focus(), 200);
      }
    } catch (e: any) {
      setUiState('ERROR');
      setErrorMessage(e?.message || 'Failed to start microphone.');
    }
  };

  const handleAudioCaptured = async (uri: string) => {
    setUiState('TRANSCRIBING');
    try {
      const { text, error } = await transcribeAudio(uri);
      if (error || !text) {
        setUiState('ERROR');
        setErrorMessage(error || "Couldn't transcribe audio. Tap mic to retry or type below.");
        return;
      }

      const cleaned = text.trim();
      if (cleaned.length <= 2) {
        setUiState('IDLE');
        return;
      }

      setUserQuery(cleaned);
      await dispatchConversationQuery(cleaned);
    } catch (e: any) {
      setUiState('ERROR');
      setErrorMessage('Audio transcription error.');
    }
  };

  const handleTextSubmit = async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');
    setUserQuery(text);
    cleanupAudio();
    await dispatchConversationQuery(text);
  };

  /**
   * Dispatches user query to sovereign Aven conversation pipeline.
   */
  const dispatchConversationQuery = async (query: string) => {
    setUiState('STREAMING');
    setAssistantResponse('');
    setErrorMessage('');

    try {
      const res = await fetchWithAuth('/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
        },
        body: JSON.stringify({
          message: query,
          model: 'llama-3.3-70b-versatile',
          mode: 'general',
          streamFormat: 'events',
          clientPlatform: 'mobile',
        }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setUiState('ERROR');
          setErrorMessage('Session expired. Tap sign in below.');
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
              if (ev.type === 'assistant_delta' && ev.text) {
                extracted += ev.text;
                setAssistantResponse(extracted);
              }
            } catch (_) {}
          }
        }
      } else {
        try {
          const parsed = JSON.parse(resText);
          extracted = parsed.message?.content || parsed.response || resText;
        } catch (_) {
          extracted = resText;
        }
        setAssistantResponse(extracted);
      }

      const finalSpeech = extracted.trim();
      if (finalSpeech.length > 0) {
        setUiState('SPEAKING');
        speakAndListen(finalSpeech, () => {
          setUiState('IDLE');
        });
      } else {
        setUiState('IDLE');
      }
    } catch (e: any) {
      setUiState('ERROR');
      setErrorMessage('Connection lost. Tap retry below.');
    }
  };

  return (
    <View style={styles.scrimContainer}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      {/* Dismissal Backdrop */}
      <TouchableOpacity
        style={styles.backdropTapArea}
        activeOpacity={1}
        onPress={dismissModal}
      />

      <Animated.View
        style={[
          styles.modalCard,
          {
            opacity: fadeAnim,
            transform: [
              {
                translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 0],
                }),
              },
            ],
          },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.innerCard}
        >
          {/* Header Row */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.avenIconDot}>
                <Sparkles size={13} color="#E8414A" />
              </View>
              <Text style={styles.headerTitle}>Aven</Text>
              <Text style={styles.headerSubtitle}>• Ambient Assistant</Text>
            </View>

            <TouchableOpacity
              onPress={dismissModal}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={18} color="#88888E" />
            </TouchableOpacity>
          </View>

          {/* Dynamic Content Body */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.contentScroll}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* User Speech / Query Preview */}
            {userQuery.length > 0 && (
              <View style={styles.userQueryBubble}>
                <Text style={styles.userQueryText}>{userQuery}</Text>
              </View>
            )}

            {/* Assistant Streaming Response */}
            {assistantResponse.length > 0 && (
              <View style={styles.assistantResponseContainer}>
                <MobileMarkdown content={assistantResponse} />
              </View>
            )}

            {/* Live Audio Visualizer / Listening State */}
            {uiState === 'RECORDING' && (
              <View style={styles.voiceCenterContainer}>
                <Animated.View
                  style={[
                    styles.voiceWaveRing,
                    {
                      transform: [{ scale: pulseAnim }],
                      opacity: 0.2 + audioVolume * 0.5,
                    },
                  ]}
                />
                <TouchableOpacity
                  style={styles.voiceOrbButton}
                  onPress={() => voiceRecorderRef.current.cancelRecording()}
                  activeOpacity={0.8}
                >
                  <Mic size={28} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.listeningText}>Listening…</Text>
                <Text style={styles.subListeningText}>Tap to pause</Text>
              </View>
            )}

            {/* Transcribing / Thinking Spinner */}
            {(uiState === 'TRANSCRIBING' || uiState === 'STREAMING') && assistantResponse.length === 0 && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#E8414A" />
                <Text style={styles.loadingText}>
                  {uiState === 'TRANSCRIBING' ? 'Transcribing speech…' : 'Thinking…'}
                </Text>
              </View>
            )}

            {/* Permission Denied View (Section 7.3) */}
            {uiState === 'PERMISSION_DENIED' && (
              <View style={styles.alertBanner}>
                <AlertTriangle size={20} color="#F59E0B" />
                <Text style={styles.alertText}>Microphone access required for voice mode.</Text>
                <View style={styles.alertActionsRow}>
                  <TouchableOpacity
                    style={styles.alertPrimaryButton}
                    onPress={startConditionalRecording}
                  >
                    <Text style={styles.alertPrimaryButtonText}>Allow Microphone</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.alertSecondaryButton}
                    onPress={() => {
                      setUiState('IDLE');
                      inputRef.current?.focus();
                    }}
                  >
                    <Text style={styles.alertSecondaryButtonText}>Type Instead</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Hardware Busy / Error View */}
            {(uiState === 'AUDIO_BUSY' || uiState === 'ERROR') && (
              <View style={styles.alertBanner}>
                <AlertTriangle size={20} color="#E8414A" />
                <Text style={styles.alertText}>{errorMessage || 'An error occurred.'}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => {
                    if (userQuery) {
                      dispatchConversationQuery(userQuery);
                    } else {
                      startConditionalRecording();
                    }
                  }}
                >
                  <RotateCcw size={14} color="#F6F3F1" />
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Bottom Bar: Unified Input & Voice Summon */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[
                styles.micToggleBtn,
                uiState === 'RECORDING' && styles.micToggleBtnActive,
              ]}
              onPress={() => {
                if (uiState === 'RECORDING') {
                  voiceRecorderRef.current.cancelRecording();
                  setUiState('IDLE');
                } else {
                  startConditionalRecording();
                }
              }}
            >
              {uiState === 'RECORDING' ? (
                <MicOff size={18} color="#FFFFFF" />
              ) : (
                <Mic size={18} color="#88888E" />
              )}
            </TouchableOpacity>

            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask Aven anything…"
              placeholderTextColor="#66666D"
              onSubmitEditing={handleTextSubmit}
              returnKeyType="send"
            />

            {inputText.trim().length > 0 && (
              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleTextSubmit}
              >
                <Send size={16} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrimContainer: {
    flex: 1,
    backgroundColor: 'rgba(11, 11, 12, 0.82)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdropTapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: Math.min(SCREEN_WIDTH - 24, 480),
    maxHeight: SCREEN_HEIGHT * 0.75,
    minHeight: 280,
    backgroundColor: '#161618',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#2A2B2F',
    marginBottom: Platform.OS === 'ios' ? 36 : 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },
  innerCard: {
    flex: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222327',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avenIconDot: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(232, 65, 74, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  headerTitle: {
    color: '#F6F3F1',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  headerSubtitle: {
    color: '#88888E',
    fontSize: 12,
    marginLeft: 4,
  },
  closeButton: {
    padding: 4,
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: 12,
  },
  userQueryBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#222327',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    marginBottom: 12,
    maxWidth: '85%',
  },
  userQueryText: {
    color: '#F6F3F1',
    fontSize: 14,
  },
  assistantResponseContainer: {
    marginBottom: 12,
  },
  voiceCenterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  voiceWaveRing: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#E8414A',
  },
  voiceOrbButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8414A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#E8414A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  listeningText: {
    color: '#F6F3F1',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  subListeningText: {
    color: '#88888E',
    fontSize: 12,
    marginTop: 4,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  loadingText: {
    color: '#88888E',
    fontSize: 13,
    marginLeft: 8,
  },
  alertBanner: {
    backgroundColor: '#1F2023',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A2B2F',
    alignItems: 'center',
    marginVertical: 12,
  },
  alertText: {
    color: '#F6F3F1',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  alertActionsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  alertPrimaryButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  alertPrimaryButtonText: {
    color: '#161618',
    fontSize: 12,
    fontWeight: '600',
  },
  alertSecondaryButton: {
    backgroundColor: '#2A2B2F',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  alertSecondaryButtonText: {
    color: '#F6F3F1',
    fontSize: 12,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2B2F',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginTop: 10,
    gap: 6,
  },
  retryButtonText: {
    color: '#F6F3F1',
    fontSize: 12,
    fontWeight: '500',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#222327',
  },
  micToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1F2023',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  micToggleBtnActive: {
    backgroundColor: '#E8414A',
  },
  textInput: {
    flex: 1,
    height: 38,
    backgroundColor: '#1F2023',
    borderRadius: 19,
    paddingHorizontal: 14,
    color: '#F6F3F1',
    fontSize: 13,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E8414A',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});
