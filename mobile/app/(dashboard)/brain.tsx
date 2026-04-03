import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Bot, ArrowUp, User } from 'lucide-react-native';
import { fetchWithAuth } from '../../utils/api';

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
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetchWithAuth('/conversation', {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });

      if (res.ok) {
        const responseText = await res.text();
        setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Make sure the server is running.' }]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isUser = item.role === 'user';

    return (
      <View className={`mb-4 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Role indicator */}
        <View className={`flex-row items-center mb-1.5 ${isUser ? 'flex-row-reverse' : ''}`}>
          <View className={`w-6 h-6 rounded-full items-center justify-center ${isUser ? 'bg-white/10 ml-2' : 'bg-amber-500/20 mr-2'}`}>
            {isUser ? (
              <User size={12} color="#9ca3af" />
            ) : (
              <Bot size={12} color="#fbbf24" />
            )}
          </View>
          <Text className={`text-[10px] font-bold uppercase tracking-widest ${isUser ? 'text-gray-600' : 'text-amber-600'}`}>
            {isUser ? 'You' : 'LifeOS'}
          </Text>
        </View>

        {/* Message bubble */}
        <View
          className={`max-w-[85%] px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-[#1b1f2a] rounded-tr-sm'
              : 'bg-transparent'
          }`}
        >
          <Text className={`text-[15px] leading-6 ${isUser ? 'text-gray-200' : 'text-gray-400'}`}>
            {item.content}
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
        {/* Header */}
        <View className="px-6 pt-4 pb-4">
          <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-full bg-amber-500/20 items-center justify-center mr-3">
              <Bot size={20} color="#fbbf24" />
            </View>
            <View>
              <Text className="text-gray-100 font-bold text-lg">LifeOS Brain</Text>
              <Text className="text-gray-500 text-xs">Your intelligent assistant</Text>
            </View>
          </View>
        </View>

        {/* Divider */}
        <View className="h-px bg-[#232632]" />

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
            contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Loading indicator */}
        {loading && (
          <View className="px-6 pb-2 flex-row items-center">
            <ActivityIndicator color="#fbbf24" size="small" />
            <Text className="text-amber-500/60 text-xs ml-2 font-medium">Thinking...</Text>
          </View>
        )}

        {/* Input Bar */}
        <View className="px-4 pb-28 pt-3 border-t border-[#232632]">
          <View className="flex-row items-center bg-[#161922] rounded-full border border-[#232632] pl-5 pr-2 py-1">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Talk to your assistant..."
              placeholderTextColor="#4b5563"
              className="flex-1 text-white text-[15px] py-2.5"
              multiline={false}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              editable={!loading}
            />
            <TouchableOpacity
              onPress={sendMessage}
              disabled={loading || !input.trim()}
              className={`w-10 h-10 rounded-full items-center justify-center ml-2 ${
                input.trim() ? 'bg-white' : 'bg-gray-800'
              }`}
            >
              <ArrowUp size={18} color={input.trim() ? '#0f1115' : '#4b5563'} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
