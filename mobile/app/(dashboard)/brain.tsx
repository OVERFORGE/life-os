import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard
} from 'react-native';
import { Bot, ArrowUp, Copy, Check, ArrowDown, Mic } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithAuth, API_URL } from '../../utils/api';
import { scheduleAllTaskReminders } from '../../utils/notifications';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';

type Message = { role: 'user' | 'assistant'; content: string };

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)',
};

const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile',                    name: 'Llama 3.3 70B (Best)' },
  { id: 'qwen/qwen3-32b',                              name: 'Qwen3 32B (Great)' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct',   name: 'Llama 4 Scout 17B' },
  { id: 'llama-3.1-8b-instant',                        name: 'Llama 3.1 8B (Fastest)' },
];

// Word-by-word reveal helper
function useStreamedText(rawText: string, speed = 18) {
  const [displayed, setDisplayed] = useState('');
  const prevRawRef = useRef('');

  useEffect(() => {
    if (!rawText) { setDisplayed(''); return; }

    // Only animate the newly appended portion
    const prev = prevRawRef.current;
    prevRawRef.current = rawText;

    if (rawText.startsWith(prev)) {
      const newPart = rawText.slice(prev.length);
      const words = newPart.split(' ');
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setDisplayed(prev + words.slice(0, i).join(' ') + (i < words.length ? ' ' : ''));
        if (i >= words.length) clearInterval(interval);
      }, speed);
      return () => clearInterval(interval);
    } else {
      // Full reset (e.g. history load)
      setDisplayed(rawText);
    }
  }, [rawText]);

  return displayed;
}

function MessageItem({ item, isLast, loading }: { item: Message; isLast: boolean; loading: boolean }) {
  const isUser = item.role === 'user';
  const [copied, setCopied] = useState(false);

  const rawContent = (item.content || '').replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();
  const displayed = useStreamedText(isLast && !isUser ? rawContent : rawContent, 18);
  const showContent = isLast && !isUser ? displayed : rawContent;
  const hasContent = showContent.length > 0;

  const handleCopy = async () => {
    if (hasContent) {
      await Clipboard.setStringAsync(showContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <View style={{ marginBottom: 24, flexDirection: 'row', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      {!isUser && (
        <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 4 }}>
          <Bot size={16} color={C.primary} />
        </View>
      )}
      <View style={{ flexDirection: 'column', maxWidth: '80%' }}>
        <View style={{
          paddingHorizontal: isUser ? 16 : 0,
          paddingVertical: isUser ? 12 : 0,
          backgroundColor: isUser ? C.card : 'transparent',
          borderRadius: 18,
          borderTopRightRadius: isUser ? 4 : 18,
          borderWidth: isUser ? 1 : 0,
          borderColor: C.border,
        }}>
          <Text style={{ color: isUser ? C.text : 'rgba(236,231,227,0.9)', fontSize: 16, lineHeight: 24 }}>
            {showContent || (loading && !isUser && item.content === '' ? '...' : '')}
          </Text>
        </View>
        {hasContent && (
          <TouchableOpacity
            onPress={handleCopy}
            style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', alignSelf: isUser ? 'flex-end' : 'flex-start', marginRight: isUser ? 4 : 0, marginLeft: isUser ? 0 : 4 }}
          >
            {copied ? <Check size={12} color={C.primary} /> : <Copy size={12} color={C.muted} />}
            <Text style={{ color: copied ? C.primary : C.muted, fontSize: 12, fontWeight: '600', marginLeft: 4 }}>
              {copied ? 'Copied' : 'Copy'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function BrainScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  const [displayCount, setDisplayCount] = useState(20);

  const flatListRef = useRef<FlatList>(null);
  const isUserScrolling = useRef(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    loadHistory();
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetchWithAuth('/conversation/history');
      if (res.ok) {
        const data = await res.json();
        setMessages(data.map((m: any) => ({ role: m.role, content: m.content })));
      }
    } catch (e) {
      console.error('Failed to load chat history:', e);
    } finally {
      setHistoryLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setMessages(prev => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);
    isUserScrolling.current = false;

    try {
      const token = await AsyncStorage.getItem('user_token');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/conversation`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.onreadystatechange = () => {
        if ((xhr.readyState === 3 || xhr.readyState === 4) && xhr.responseText) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: xhr.responseText };
            return updated;
          });
        }
      };

      xhr.onload = () => {
        setLoading(false);
        scheduleAllTaskReminders().catch(console.error);
      };

      xhr.onerror = () => {
        setLoading(false);
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: 'Network error. Make sure the server is running.' };
          return updated;
        });
      };

      xhr.send(JSON.stringify({ message: text, model: selectedModel, mode: mode || 'general' }));
    } catch (e) {
      setLoading(false);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Make sure the server is running.' }]);
    }
  };

  const visibleMessages = messages.slice(-displayCount);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: C.bg }}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Messages area */}
      <View style={{ flex: 1 }}>
        {historyLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={{ color: C.muted, marginTop: 16, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
              Loading conversation...
            </Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)' }}>
              <Bot size={32} color={C.primary} />
            </View>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 8 }}>
              Talk to LifeOS
            </Text>
            <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
              Ask me anything about your goals, habits, daily logs, or let me help you plan your next move.
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              ref={flatListRef}
              data={visibleMessages}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item, index }) => (
                <MessageItem
                  item={item}
                  isLast={index === visibleMessages.length - 1}
                  loading={loading}
                />
              )}
              contentContainerStyle={{ padding: 20, paddingTop: 40 }}
              showsVerticalScrollIndicator={false}
              onScroll={(e) => {
                const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                const isScrolledUp = contentSize.height - layoutMeasurement.height - contentOffset.y > 150;
                isUserScrolling.current = isScrolledUp;
                setShowScrollButton(isScrolledUp);
                if (contentOffset.y < 50 && displayCount < messages.length) {
                  setDisplayCount(prev => prev + 20);
                }
              }}
              scrollEventThrottle={16}
              onContentSizeChange={() => {
                if (!isUserScrolling.current) {
                  flatListRef.current?.scrollToEnd({ animated: true });
                }
              }}
            />
            {showScrollButton && (
              <TouchableOpacity
                onPress={() => {
                  flatListRef.current?.scrollToEnd({ animated: true });
                  setShowScrollButton(false);
                  isUserScrolling.current = false;
                }}
                style={{ position: 'absolute', bottom: 16, right: 16, width: 40, height: 40, backgroundColor: C.card, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}
              >
                <ArrowDown size={20} color={C.primary} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Input bar — anchored above keyboard */}
      <View style={{ backgroundColor: C.bg, paddingHorizontal: 16, paddingTop: 12, paddingBottom: keyboardVisible ? (Platform.OS === 'ios' ? 28 : 44) : 100, borderTopWidth: 1, borderTopColor: C.border }}>
        {/* Model selector */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={GROQ_MODELS}
          keyExtractor={item => item.id}
          style={{ marginBottom: 10 }}
          renderItem={({ item }) => {
            const isSelected = selectedModel === item.id;
            return (
              <TouchableOpacity
                onPress={() => setSelectedModel(item.id)}
                style={{
                  marginRight: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99,
                  backgroundColor: isSelected ? C.primaryBg : C.card,
                  borderWidth: 1,
                  borderColor: isSelected ? 'rgba(232,65,74,0.5)' : C.border,
                }}
              >
                <Text style={{ fontSize: 12, color: isSelected ? C.primary : C.muted, fontWeight: isSelected ? '700' : '500' }}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* Text input row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, paddingLeft: 18, paddingRight: 8, paddingVertical: 8 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Message LifeOS..."
            placeholderTextColor={C.muted}
            style={{ flex: 1, color: C.text, fontSize: 16, paddingVertical: 6, maxHeight: 120, minHeight: 30 }}
            multiline
            onSubmitEditing={sendMessage}
            editable={!loading}
          />

          {/* Mic icon (placeholder) */}
          <TouchableOpacity
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 6, marginBottom: 1 }}
          >
            <Mic size={18} color={C.muted} />
          </TouchableOpacity>

          {/* Send button */}
          <TouchableOpacity
            onPress={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
              marginLeft: 4, marginBottom: 1,
              backgroundColor: input.trim() ? C.primary : 'transparent',
            }}
          >
            {loading && !input.trim()
              ? <ActivityIndicator size="small" color={C.text} />
              : <ArrowUp size={18} color={input.trim() ? C.text : C.muted} strokeWidth={3} />
            }
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
