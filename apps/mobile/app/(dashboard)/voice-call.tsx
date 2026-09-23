import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Dimensions, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Mic, MicOff, PhoneOff, Volume2, Radio, Sparkles, Send,
} from 'lucide-react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, withSpring, Easing, interpolate,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VoiceRecorder, transcribeAudio } from '../../utils/audioCapture';
import { speakAndListen, stopSpeaking } from '../../utils/ttsManager';
import { fetchWithAuth, API_URL } from '../../utils/api';
import { scheduleAllTaskReminders } from '../../utils/notifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)',
};

type VoiceStatus = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

export default function VoiceCallScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [hasDetectedSpeech, setHasDetectedSpeech] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantTranscript, setAssistantTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedModel] = useState('llama-3.3-70b-versatile');

  const voiceRecorderRef = useRef(new VoiceRecorder());
  const cancelledRef = useRef(false);
  const isActiveRef = useRef(true);

  // Animated values for the orb
  const orbPulse = useSharedValue(1);
  const orbGlow = useSharedValue(0);
  const breathe = useSharedValue(0);

  // Breathing animation
  useEffect(() => {
    breathe.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  // Orb pulse based on status
  useEffect(() => {
    if (status === 'speaking') {
      orbPulse.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 400 }),
          withTiming(1.0, { duration: 400 }),
        ),
        -1,
        true
      );
      orbGlow.value = withTiming(1, { duration: 300 });
    } else if (status === 'listening' && hasDetectedSpeech) {
      orbPulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 300 }),
          withTiming(1.0, { duration: 300 }),
        ),
        -1,
        true
      );
      orbGlow.value = withTiming(0.7, { duration: 300 });
    } else if (status === 'thinking' || status === 'transcribing') {
      orbPulse.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 600 }),
          withTiming(0.97, { duration: 600 }),
        ),
        -1,
        true
      );
      orbGlow.value = withTiming(0.5, { duration: 300 });
    } else {
      orbPulse.value = withSpring(1);
      orbGlow.value = withTiming(0.2, { duration: 500 });
    }
  }, [status, hasDetectedSpeech]);

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

  // Auto-start session on mount
  useEffect(() => {
    isActiveRef.current = true;
    cancelledRef.current = false;
    startListening();

    return () => {
      isActiveRef.current = false;
      cancelledRef.current = true;
      stopSpeaking();
      voiceRecorderRef.current.cancelRecording();
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!isActiveRef.current || cancelledRef.current || isMuted) return;
    
    setStatus('listening');
    setHasDetectedSpeech(false);
    setAudioVolume(0);
    setUserTranscript('');
    setErrorMessage('');

    const success = await voiceRecorderRef.current.startRecording(
      async (uri) => {
        if (!isActiveRef.current || cancelledRef.current) return;
        setAudioVolume(0);
        
        if (!uri) {
          // No speech detected — restart listening
          if (isActiveRef.current && !cancelledRef.current) {
            startListening();
          }
          return;
        }

        setStatus('transcribing');
        const { text, error } = await transcribeAudio(uri);
        
        if (!isActiveRef.current || cancelledRef.current) return;

        if (text) {
          const cleaned = text.trim();
          const isJunk = cleaned.length <= 2 || /^[.\s,!?]+$/.test(cleaned);
          if (isJunk) {
            startListening();
            return;
          }
          setUserTranscript(cleaned);
          await sendToAven(cleaned);
        } else {
          if (error) {
            setErrorMessage(error);
            setStatus('error');
          } else {
            startListening();
          }
        }
      },
      {
        onVolume: (vol) => {
          if (isActiveRef.current && !cancelledRef.current) {
            setAudioVolume(vol);
          }
        },
        onSpeechDetected: () => {
          if (isActiveRef.current && !cancelledRef.current) {
            setHasDetectedSpeech(true);
          }
        },
      }
    );

    if (!success) {
      console.error('[VOICE-CALL] Microphone recording failed to start. Check permissions and expo-audio plugin config.');
      setErrorMessage('Could not access microphone. Check permissions in Settings.');
      setStatus('error');
    }
  }, [isMuted]);

  const sendToAven = async (text: string) => {
    if (!isActiveRef.current || cancelledRef.current) return;
    
    setStatus('thinking');
    
    try {
      const token = await AsyncStorage.getItem('user_token');
      const res = await fetchWithAuth('/conversation', {
        method: 'POST',
        body: JSON.stringify({ 
          message: text, 
          model: selectedModel, 
          mode: 'general' 
        }),
      });

      if (!isActiveRef.current || cancelledRef.current) return;

      if (res.ok) {
        const data = await res.json();
        const parsed = data.message?.content || data.response || '';
        
        if (parsed.trim().length > 0) {
          setAssistantTranscript(parsed.trim());
          setStatus('speaking');

          // Speak the response with Aven's voice
          speakAndListen(parsed.trim(), () => {
            if (!isActiveRef.current || cancelledRef.current) return;
            setStatus('idle');
            // Auto-listen for the next turn
            setTimeout(() => {
              if (isActiveRef.current && !cancelledRef.current) {
                startListening();
              }
            }, 300);
          });

          // Also start barge-in monitoring
          voiceRecorderRef.current.startRecording(
            async (uri) => {
              if (!isActiveRef.current || cancelledRef.current) return;
              if (!uri) return;
              
              setStatus('transcribing');
              const { text: bargeText } = await transcribeAudio(uri);
              if (bargeText) {
                const cleaned = bargeText.trim();
                const isJunk = cleaned.length <= 2 || /^[.\s,!?]+$/.test(cleaned);
                if (!isJunk) {
                  setUserTranscript(cleaned);
                  await sendToAven(cleaned);
                } else {
                  startListening();
                }
              } else {
                startListening();
              }
            },
            {
              isBargeIn: true,
              onBargeIn: () => {
                console.log('[VOICE-CALL] Barge-in detected! Interrupting Aven...');
                stopSpeaking();
                setStatus('listening');
                setHasDetectedSpeech(true);
                setAssistantTranscript('');
              },
              onVolume: (vol) => {
                if (isActiveRef.current && !cancelledRef.current) {
                  setAudioVolume(vol);
                }
              },
              onSpeechDetected: () => {
                if (isActiveRef.current && !cancelledRef.current) {
                  setHasDetectedSpeech(true);
                }
              },
            }
          );
        } else {
          startListening();
        }

        scheduleAllTaskReminders().catch(() => {});
      } else {
        setErrorMessage('Failed to get response from Aven.');
        setStatus('error');
      }
    } catch (e: any) {
      if (!isActiveRef.current || cancelledRef.current) return;
      setErrorMessage(e?.message || 'Network error');
      setStatus('error');
    }
  };

  const interruptAssistant = () => {
    stopSpeaking();
    voiceRecorderRef.current.cancelRecording();
    setStatus('idle');
    setAssistantTranscript('');
    setTimeout(() => startListening(), 200);
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      setTimeout(() => startListening(), 100);
    } else {
      setIsMuted(true);
      voiceRecorderRef.current.cancelRecording();
      stopSpeaking();
      setStatus('idle');
    }
  };

  const endCall = () => {
    cancelledRef.current = true;
    isActiveRef.current = false;
    stopSpeaking();
    voiceRecorderRef.current.cancelRecording();
    router.back();
  };

  const handleOrbPress = () => {
    if (status === 'speaking') {
      interruptAssistant();
    } else if (status === 'error') {
      setErrorMessage('');
      startListening();
    } else if (status === 'listening') {
      // Tap orb anytime while listening to submit recording immediately
      voiceRecorderRef.current.stopRecording();
    }
  };

  const getStatusLabel = () => {
    if (isMuted) return 'Microphone Muted';
    switch (status) {
      case 'speaking': return 'Aven Speaking';
      case 'thinking': return 'Thinking...';
      case 'transcribing': return 'Processing...';
      case 'error': return 'Connection Interrupted';
      case 'listening':
        return hasDetectedSpeech ? 'Hearing You... (Pause to send)' : 'Listening...';
      default: return 'Ready';
    }
  };

  const getOrbIcon = () => {
    if (status === 'speaking') {
      return <Volume2 size={48} color={C.primary} />;
    } else if (status === 'thinking' || status === 'transcribing') {
      return <Sparkles size={48} color={C.primary} />;
    } else if (isMuted) {
      return <MicOff size={48} color={C.muted} />;
    } else if (hasDetectedSpeech) {
      return <Send size={48} color={C.text} />;
    } else {
      return <Mic size={48} color={C.text} />;
    }
  };

  // Soundwave bar animation
  const barMultipliers = [0.25, 0.5, 0.8, 1.0, 0.7, 0.9, 0.6, 0.4, 0.2];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Top Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{
            width: 40, height: 40, borderRadius: 14, backgroundColor: C.bg,
            borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Radio size={20} color={C.primary} />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>LifeOS Voice</Text>
              <View style={{
                paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99,
                backgroundColor: 'rgba(232,65,74,0.15)', borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)',
              }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: C.primary, textTransform: 'uppercase' }}>Aven</Text>
              </View>
            </View>
            <Text style={{ fontSize: 11, color: C.muted }}>Real-Time Voice Kernel</Text>
          </View>
        </View>

        {/* Live indicator */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
          backgroundColor: C.bg, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)',
        }}>
          <Volume2 size={14} color={C.primary} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: C.subtext }}>LIVE</Text>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary }} />
        </View>
      </View>

      {/* Center Orb Stage */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {/* Layered concentric glow rings (simulates blur glow without CSS blur) */}
        <Animated.View style={[
          glowAnimStyle,
          {
            position: 'absolute', width: 280, height: 280, borderRadius: 140,
            borderWidth: 1, borderColor: 'rgba(232,65,74,0.04)',
            backgroundColor: 'rgba(232,65,74,0.03)',
          },
        ]} />
        <Animated.View style={[
          glowAnimStyle,
          {
            position: 'absolute', width: 250, height: 250, borderRadius: 125,
            borderWidth: 1, borderColor: 'rgba(232,65,74,0.06)',
            backgroundColor: 'rgba(232,65,74,0.04)',
          },
        ]} />
        <Animated.View style={[
          glowAnimStyle,
          {
            position: 'absolute', width: 220, height: 220, borderRadius: 110,
            borderWidth: 1, borderColor: 'rgba(232,65,74,0.08)',
            backgroundColor: 'rgba(232,65,74,0.05)',
          },
        ]} />

        {/* Ring 1 — outer accent ring */}
        <Animated.View style={[
          ringAnimStyle,
          {
            position: 'absolute', width: 195, height: 195, borderRadius: 100,
            borderWidth: 1, borderColor: 'rgba(232,65,74,0.15)',
          },
        ]} />

        {/* Ring 2 — inner accent ring */}
        <Animated.View style={[
          ringAnimStyle,
          {
            position: 'absolute', width: 178, height: 178, borderRadius: 89,
            borderWidth: 1, borderColor: 'rgba(232,65,74,0.25)',
          },
        ]} />

        {/* Core Orb */}
        <TouchableOpacity onPress={handleOrbPress} activeOpacity={0.85}>
          <Animated.View style={[
            orbAnimStyle,
            {
              width: 150, height: 150, borderRadius: 75,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#1A1C1F',
              borderWidth: 2, borderColor: 'rgba(232,65,74,0.35)',
              shadowColor: '#E8414A', shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.25, shadowRadius: 24, elevation: 12,
            },
          ]}>
            {/* Subtle top highlight */}
            <View style={{
              position: 'absolute', top: 2, left: 2, right: 2, height: 70,
              borderTopLeftRadius: 73, borderTopRightRadius: 73,
              backgroundColor: 'rgba(255,255,255,0.04)',
            }} />
            {/* Inner subtle ring */}
            <View style={{
              position: 'absolute', top: 6, left: 6, right: 6, bottom: 6,
              borderRadius: 69, borderWidth: 1, borderColor: 'rgba(232,65,74,0.12)',
            }} />
            {getOrbIcon()}
          </Animated.View>
        </TouchableOpacity>

        {/* Soundwave bars */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 5, height: 36, marginTop: 24,
        }}>
          {barMultipliers.map((mult, idx) => {
            let barHeight = 4;
            let barColor = 'rgba(232,65,74,0.2)';

            if (status === 'speaking') {
              barHeight = 4 + mult * 22;
              barColor = C.primary;
            } else if (status === 'listening') {
              if (audioVolume > 0.04) {
                // Live voice reaction: bar bounces proportionally to voice volume
                barHeight = Math.min(34, Math.max(5, 4 + audioVolume * mult * 36));
                barColor = 'rgba(232,65,74,0.95)';
              } else if (hasDetectedSpeech) {
                // Speech detected, brief pause
                barHeight = 4 + mult * 12;
                barColor = 'rgba(232,65,74,0.6)';
              }
            }

            return (
              <View
                key={idx}
                style={{
                  width: 3.5, borderRadius: 2, height: barHeight,
                  backgroundColor: barColor,
                }}
              />
            );
          })}
        </View>

        {/* Status pill */}
        <View style={{
          marginTop: 16, paddingHorizontal: 16, paddingVertical: 8,
          borderRadius: 99, borderWidth: 1,
          borderColor: status === 'speaking' || (status === 'listening' && (hasDetectedSpeech || audioVolume > 0.04))
            ? 'rgba(232,65,74,0.5)' : C.border,
          backgroundColor: status === 'speaking'
            ? 'rgba(232,65,74,0.15)' : 'rgba(22,22,24,0.9)',
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}>
          <View style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: status === 'error' ? '#FF6B6B' : C.primary,
          }} />
          <Text style={{
            fontSize: 12, fontWeight: '600', color: C.text,
            letterSpacing: 0.5,
          }}>
            {getStatusLabel()}
          </Text>
        </View>

        {/* Action hint */}
        {status === 'speaking' && (
          <TouchableOpacity onPress={interruptAssistant} style={{
            marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99,
            backgroundColor: 'rgba(232,65,74,0.15)', borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)',
          }}>
            <Mic size={12} color={C.primary} />
            <Text style={{ fontSize: 11, fontWeight: '500', color: C.subtext }}>Tap to interrupt</Text>
          </TouchableOpacity>
        )}

        {status === 'listening' && (
          <TouchableOpacity 
            onPress={() => voiceRecorderRef.current.stopRecording()} 
            style={{
              marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99,
              backgroundColor: hasDetectedSpeech ? C.primary : 'rgba(232,65,74,0.18)',
              borderWidth: 1, 
              borderColor: hasDetectedSpeech ? 'rgba(232,65,74,0.5)' : 'rgba(232,65,74,0.3)',
            }}
          >
            <Send size={12} color={C.text} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.text }}>
              {hasDetectedSpeech ? 'Tap to Send Now' : 'Tap to Send'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Transcript card */}
        <View style={{
          marginTop: 24, marginHorizontal: 24, width: SCREEN_WIDTH - 48,
          minHeight: 80, maxHeight: 120,
          paddingHorizontal: 20, paddingVertical: 14,
          borderRadius: 18, backgroundColor: 'rgba(22,22,24,0.95)',
          borderWidth: 1, borderColor: C.border,
        }}>
          {errorMessage ? (
            <View>
              <Text style={{ fontSize: 12, color: '#FF6B6B' }}>{errorMessage}</Text>
              <TouchableOpacity onPress={() => { setErrorMessage(''); startListening(); }} style={{
                marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                backgroundColor: 'rgba(232,65,74,0.2)', borderWidth: 1, borderColor: 'rgba(232,65,74,0.4)',
                alignSelf: 'flex-start',
              }}>
                <Text style={{ fontSize: 11, color: C.subtext }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : assistantTranscript && (status === 'speaking' || status === 'idle') ? (
            <View>
              <Text style={{ fontSize: 10, fontWeight: '700', color: C.primary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>AVEN</Text>
              <Text style={{ fontSize: 13, color: C.text, lineHeight: 18 }} numberOfLines={4}>{assistantTranscript}</Text>
            </View>
          ) : userTranscript ? (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.primary }} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: C.primary, letterSpacing: 1.5, textTransform: 'uppercase' }}>LIVE TRANSCRIPT</Text>
              </View>
              <Text style={{ fontSize: 13, color: C.text, lineHeight: 18, fontStyle: 'italic' }}>"{userTranscript}"</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <Text style={{ fontSize: 12, color: C.subtext, fontWeight: '500' }}>
                Ready. Speak naturally or tap the orb.
              </Text>
              <Text style={{ fontSize: 10, color: C.muted, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                LifeOS Neural Voice Architecture
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Bottom Dock */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 30, paddingTop: 16,
      }}>
        {/* Mute */}
        <TouchableOpacity onPress={toggleMute} style={{
          width: 56, height: 56, borderRadius: 18,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: isMuted ? 'rgba(232,65,74,0.2)' : C.bg,
          borderWidth: 1, borderColor: isMuted ? 'rgba(232,65,74,0.4)' : C.border,
        }}>
          {isMuted
            ? <MicOff size={24} color={C.primary} />
            : <Mic size={24} color={C.subtext} />}
        </TouchableOpacity>

        {/* End Call */}
        <TouchableOpacity onPress={endCall} style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 24, height: 56, borderRadius: 18,
          backgroundColor: C.primary, borderWidth: 1, borderColor: 'rgba(232,65,74,0.4)',
        }}>
          <PhoneOff size={20} color={C.text} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>End Call</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
