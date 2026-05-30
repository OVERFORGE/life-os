import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Send, Mic } from 'lucide-react-native';
import { fetchWithAuth } from '../utils/api';
import { VoiceRecorder, transcribeAudio } from '../utils/audioCapture';
import { isVoiceAssistantEnabledAtCurrentLocation } from '../utils/locationManager';
import { speakAndListen, stopSpeaking } from '../utils/ttsManager';


export default function ChatModalScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceRecorder] = useState(() => new VoiceRecorder());
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Auto-focus the input when modal opens
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    return () => {
      stopSpeaking();
    };
  }, []);

  const sendPrompt = async (forcedText?: string) => {
    const text = (forcedText || input).trim();
    if (!text) return;
    setLoading(true);
    setResponse('');
    
    // Optimistic update to track metadata

    try {
      const res = await fetchWithAuth('/conversation', {
        method: 'POST',
        body: JSON.stringify({ message: text, model: 'llama-3.3-70b-versatile', mode: 'general' }),
      });

      if (res.ok) {
        const data = await res.json();
        const textResponse = data.message?.content || data.response;
        setResponse(textResponse);
        
        // Handle TTS and auto-listen
        const isVoiceAllowed = await isVoiceAssistantEnabledAtCurrentLocation();
        if (isVoiceAllowed && textResponse?.trim().length > 0) {
          speakAndListen(textResponse.trim(), () => {
             startVoiceInput();
          });
        }
      } else {
        setResponse('Sorry, something went wrong.');
      }
    } catch (e) {
      setResponse('Network error.');
    } finally {
      setLoading(false);
    }
  };

  const startVoiceInput = async () => {
    if (loading) return;
    setIsRecording(true);
    setInput('Listening...');
    
    const success = await voiceRecorder.startRecording(async (uri) => {
      setIsRecording(false);
      setInput('Transcribing...');
      const { text, error } = await transcribeAudio(uri);
      
      if (text) {
        setInput('');
        await sendPrompt(text);
      } else {
        setInput('');
        setResponse(error || 'Failed to transcribe audio.');
      }
    });

    if (!success) {
      setIsRecording(false);
      setInput('');
      setResponse('Mic permission denied.');
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}
    >
      <View style={{ 
        width: '90%', 
        backgroundColor: '#1F2023', 
        borderRadius: 24, 
        borderWidth: 1, 
        borderColor: '#2A2B2F',
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10
      }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <View>
            <Text style={{ color: '#FFFDFC', fontSize: 18, fontWeight: 'bold' }}>LifeOS Assistant</Text>
            <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 12 }}>Quick Command</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, backgroundColor: '#2A2B2F', borderRadius: 20 }}>
            <X size={20} color="#FFFDFC" />
          </TouchableOpacity>
        </View>

        {/* Response Area */}
        {loading && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator color="#E8414A" />
            <Text style={{ color: 'rgba(236,231,227,0.7)', marginTop: 10, fontSize: 14 }}>Thinking...</Text>
          </View>
        )}
        
        {!loading && response ? (
          <View style={{ backgroundColor: 'rgba(232,65,74,0.1)', padding: 16, borderRadius: 16, marginBottom: 16 }}>
            <Text style={{ color: '#FFFDFC', fontSize: 14, lineHeight: 20 }}>{response}</Text>
          </View>
        ) : null}

        {/* Input Box */}
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center', 
          backgroundColor: '#161618', 
          borderRadius: 20, 
          borderWidth: 1, 
          borderColor: '#2A2B2F',
          paddingHorizontal: 16,
          paddingVertical: 12
        }}>
          <TextInput
            ref={inputRef}
            style={{ flex: 1, color: '#FFFDFC', fontSize: 16 }}
            placeholder="Type your command..."
            placeholderTextColor="rgba(236,231,227,0.4)"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={sendPrompt}
            multiline={false}
            returnKeyType="send"
          />
          {/* Mic Button */}
          <TouchableOpacity 
            onPress={startVoiceInput}
            disabled={loading}
            style={{ 
              marginLeft: 10, 
              backgroundColor: isRecording ? 'rgba(232,65,74,0.2)' : '#2A2B2F', 
              padding: 10, 
              borderRadius: 16 
            }}
          >
            {isRecording ? <ActivityIndicator size="small" color="#E8414A" /> : <Mic size={18} color={isRecording ? '#E8414A' : '#FFFDFC'} />}
          </TouchableOpacity>
          {/* Send Button */}
          <TouchableOpacity 
            onPress={() => sendPrompt()} 
            disabled={!input.trim() || loading}
            style={{ 
              marginLeft: 8, 
              backgroundColor: input.trim() ? '#E8414A' : '#2A2B2F', 
              padding: 10, 
              borderRadius: 16 
            }}
          >
            <Send size={18} color={input.trim() ? '#FFFDFC' : 'rgba(236,231,227,0.4)'} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
