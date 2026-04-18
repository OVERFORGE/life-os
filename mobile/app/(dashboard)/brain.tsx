import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Bot, ArrowUp, User } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithAuth, API_URL } from '../../utils/api';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function BrainScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  
  // Track if user is scrolling up to prevent auto-scroll jumps
  const isUserScrolling = useRef(false);

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

      xhr.send(JSON.stringify({ message: text }));

    } catch (e) {
      setLoading(false);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Make sure the server is running.' }]);
    }
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isUser = item.role === 'user';

    return (
      <View className={`mb-6 flex-row ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && (
          <View className="w-8 h-8 rounded-full border border-[#232632] bg-[#161922] items-center justify-center mr-3 mt-1">
            <Bot size={16} color="#fbbf24" />
          </View>
        )}
        
        <View
          className={`max-w-[75%] px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-[#232632] rounded-tr-sm'
              : 'bg-transparent border border-[#232632] rounded-tl-sm'
          }`}
        >
          <Text className={`text-[16px] leading-[24px] ${isUser ? 'text-gray-100' : 'text-gray-300'}`}>
            {item.content || (loading && !isUser && item.content === '' ? '...' : item.content)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#0f1115]"
      keyboardVerticalOffset={0}
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
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderMessage}
            contentContainerStyle={{ padding: 20, paddingTop: 40 }}
            showsVerticalScrollIndicator={false}
            onScroll={(e) => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              const paddingToBottom = 50;
              const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
              isUserScrolling.current = !isAtBottom;
            }}
            scrollEventThrottle={16}
            onContentSizeChange={() => {
              if (!isUserScrolling.current) {
                flatListRef.current?.scrollToEnd({ animated: true });
              }
            }}
          />
        )}

        {/* Input Bar */}
        <View className="px-4 pb-[110px] pt-3 bg-[#0f1115]">
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
