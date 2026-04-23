import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { Bot, ArrowUp, Copy, Check, ArrowDown, Leaf } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithAuth, API_URL } from '../../utils/api';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function BrainScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isHealthMode = mode === 'health';
  const accentColor = isHealthMode ? '#10b981' : '#fbbf24';

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  
  // Track if user is scrolling up to prevent auto-scroll jumps
  const isUserScrolling = useRef(false);

  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");

  const GROQ_MODELS = [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B (Best)" },
    { id: "qwen/qwen3-32b", name: "Qwen3 32B (Great)" },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B" },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B (Fastest)" },
  ];

  useEffect(() => {
    loadHistory();
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
      // Wait a tick then scroll to bottom initially
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: 'user', content: text };
    
    // Add user message and empty placeholder for assistant
    setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);
    isUserScrolling.current = false; // Force scroll down for new message

    try {
      const token = await AsyncStorage.getItem('user_token');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/conversation`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 3 || xhr.readyState === 4) {
          if (xhr.responseText) {
            setMessages(prev => {
              const updated = [...prev];
              // Update only the last message
              updated[updated.length - 1].content = xhr.responseText;
              return updated;
            });
          }
        }
      };

      xhr.onload = () => {
        setLoading(false);
      };

      xhr.onerror = () => {
        setLoading(false);
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].content = 'Network error. Make sure the server is running.';
          return updated;
        });
      };

      xhr.send(JSON.stringify({ message: text, model: selectedModel, mode: mode || 'general' }));

    } catch (e) {
      setLoading(false);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Make sure the server is running.' }]);
    }
  };

  const MessageItem = ({ item, loading }: { item: Message; loading: boolean }) => {
    const isUser = item.role === 'user';
    const [copied, setCopied] = useState(false);
    
    // Clean up <think> tags from model reasoning
    const displayContent = (item.content || '').replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();
    const hasContent = displayContent.length > 0;

    const handleCopy = async () => {
      if (hasContent) {
        await Clipboard.setStringAsync(displayContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };

    return (
      <View className={`mb-6 flex-row ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && (
          <View className="w-8 h-8 rounded-full border border-[#232632] bg-[#161922] items-center justify-center mr-3 mt-1">
            <Bot size={16} color="#fbbf24" />
          </View>
        )}
        
        <View className="flex-col max-w-[80%]">
          <View
            className={`px-4 py-3 ${
              isUser
                ? 'bg-[#232632] rounded-2xl rounded-tr-sm'
                : 'bg-transparent'
            }`}
          >
            <Text className={`text-[16px] leading-[24px] ${isUser ? 'text-gray-100' : 'text-gray-300'}`}>
              {displayContent || (loading && !isUser && item.content === '' ? '...' : displayContent)}
            </Text>
          </View>

          {/* Copy Icon */}
          {hasContent && (
            <TouchableOpacity 
              onPress={handleCopy} 
              className={`mt-2 flex-row items-center gap-1.5 ${isUser ? 'self-end mr-2' : 'ml-2'}`}
            >
              {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} color="#6b7280" />}
              <Text className={`${copied ? 'text-emerald-500' : 'text-gray-500'} text-xs font-medium`}>{copied ? 'Copied' : 'Copy'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1 bg-[#0f1115]"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
    >
      <View className="flex-1">
        {/* Messages */}
        {historyLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#fcd34d" size="large" />
            <Text className="text-gray-500 mt-4 text-sm">Loading conversation...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View className="flex-1 items-center justify-center px-10">
            <View className="w-16 h-16 rounded-full bg-amber-500/10 items-center justify-center mb-6">
              <Bot size={32} color="#fbbf24" />
            </View>
            <Text className="text-gray-300 text-lg font-bold text-center mb-2">Talk to LifeOS</Text>
            <Text className="text-gray-500 text-sm text-center leading-5">
              Ask me anything about your goals, habits, daily logs, or let me help you plan your next move.
            </Text>
          </View>
        ) : (
          <View className="flex-1 relative">
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => <MessageItem item={item} loading={loading} />}
              contentContainerStyle={{ padding: 20, paddingTop: 40 }}
              showsVerticalScrollIndicator={false}
              onScroll={(e) => {
                const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                const isScrolledUp = contentSize.height - layoutMeasurement.height - contentOffset.y > 150;
                isUserScrolling.current = isScrolledUp;
                setShowScrollButton(isScrolledUp);
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
                className="absolute bottom-4 right-4 w-10 h-10 bg-[#232632]/90 rounded-full items-center justify-center border border-white/10 shadow-lg"
              >
                <ArrowDown size={20} color="#fbbf24" style={{ transform: [{ translateY: 1 }] }} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Input Bar */}
        <View className="px-4 pb-6 pt-3 bg-[#0f1115]">
          <View className="mb-3">
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={GROQ_MODELS}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isSelected = selectedModel === item.id;
                  return (
                    <TouchableOpacity
                      onPress={() => setSelectedModel(item.id)}
                      className={`mr-2 px-3 py-1.5 rounded-full border ${
                        isSelected ? 'bg-amber-500/20 border-amber-500/50' : 'bg-[#1a1d24] border-[#2a2d36]'
                      }`}
                    >
                      <Text className={`text-xs ${isSelected ? 'text-amber-400 font-medium' : 'text-gray-400'}`}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
          </View>
          <View className="flex-row items-end bg-[#1a1d24] rounded-[24px] border border-[#2a2d36] pl-5 pr-2 py-2">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Message LifeOS..."
              placeholderTextColor="#6b7280"
              className="flex-1 text-white text-[16px] py-1.5 max-h-32 min-h-[30px]"
              multiline={true}
              onSubmitEditing={sendMessage}
              editable={!loading}
            />
            <TouchableOpacity
              onPress={sendMessage}
              disabled={loading || !input.trim()}
              className={`w-[36px] h-[36px] rounded-full items-center justify-center ml-2 mb-0.5 ${
                input.trim() ? 'bg-white' : 'bg-gray-800'
              }`}
            >
              {loading && !input.trim() ? (
                 <ActivityIndicator size="small" color="#0f1115" />
              ) : (
                 <ArrowUp size={18} color={input.trim() ? '#0f1115' : '#4b5563'} strokeWidth={3} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
