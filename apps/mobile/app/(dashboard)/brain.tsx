// CACHE BUST 
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, Image,
  Modal, ScrollView, StyleSheet, Dimensions, Alert
} from 'react-native';
import {
  Bot, ArrowUp, Copy, Check, ArrowDown, Phone, X,
  Menu, Plus, Edit2, Trash2, MessageSquare, AlertCircle,
  Calendar, Mail, FolderGit2, HardDrive, Cloud, Users, Activity,
  Music, CheckSquare, Zap, MapPin, Plane, Building, ShoppingBag,
  ShoppingCart, Car, Utensils
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { fetchWithAuth, API_URL } from '../../utils/api';
import { scheduleAllTaskReminders } from '../../utils/notifications';
import { ActiveExecutionNotificationManager } from '../../services/ActiveExecutionNotificationManager';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { stopSpeaking } from '../../utils/ttsManager';
import { MobileMarkdown } from '../../components/ui/MobileMarkdown';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

interface ToolActivity {
  providerId: string;
  providerDisplayName: string;
  capabilityURN: string;
  iconName: string;
  humanMessage: string;
  state: 'started' | 'completed' | 'failed';
}

interface Confirmation {
  actionId: string;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface MissingConnection {
  providerId: string;
  providerDisplayName: string;
  iconName: string;
  message: string;
  connectUrl: string;
}

type Message = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  toolActivities?: ToolActivity[];
  confirmation?: Confirmation | null;
  missingConnection?: MissingConnection | null;
  createdAt?: string;
};

interface ConversationItem {
  conversationId: string;
  title: string;
  messageCount?: number;
  lastMessageAt?: string | null;
  createdAt: string;
}

function renderToolIcon(iconName: string) {
  switch (iconName?.toLowerCase()) {
    case 'calendar': return <Calendar size={13} color="#E8414A" />;
    case 'mail': return <Mail size={13} color="#E8414A" />;
    case 'cloud': return <Cloud size={13} color="#E8414A" />;
    case 'foldergit2': return <FolderGit2 size={13} color="#E8414A" />;
    case 'activity': return <Activity size={13} color="#E8414A" />;
    case 'music': return <Music size={13} color="#E8414A" />;
    case 'checksquare': return <CheckSquare size={13} color="#E8414A" />;
    case 'car': return <Car size={13} color="#E8414A" />;
    case 'utensils': return <Utensils size={13} color="#E8414A" />;
    case 'zap': return <Zap size={13} color="#E8414A" />;
    case 'shoppingbag':
    case 'shoppingcart': return <ShoppingCart size={13} color="#E8414A" />;
    case 'plane': return <Plane size={13} color="#E8414A" />;
    case 'building': return <Building size={13} color="#E8414A" />;
    case 'mappin': return <MapPin size={13} color="#E8414A" />;
    default: return <Zap size={13} color="#E8414A" />;
  }
}

function MessageItem({
  item,
  isLast,
  loading,
  onConfirmAction
}: {
  item: Message;
  isLast: boolean;
  loading: boolean;
  onConfirmAction: (text: string) => void;
}) {
  const isUser = item.role === 'user';
  const [copied, setCopied] = useState(false);

  const rawContent = (item.content || '').replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();
  const hasContent = rawContent.length > 0;

  const handleCopy = async () => {
    if (hasContent) {
      await Clipboard.setStringAsync(rawContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <View style={{ marginBottom: 20, flexDirection: 'row', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      {!isUser && (
        <View style={{
          width: 32, height: 32, borderRadius: 16,
          borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
          alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 4
        }}>
          <Bot size={16} color={C.primary} />
        </View>
      )}

      <View style={{ flexDirection: 'column', maxWidth: isUser ? '85%' : '90%', flex: isUser ? 0 : 1 }}>
        {/* Tool Activity Indicators */}
        {item.toolActivities && item.toolActivities.length > 0 && (
          <View style={{ marginBottom: 8, gap: 6 }}>
            {item.toolActivities.map((act, aIdx) => (
              <View
                key={aIdx}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: '#1F2023', paddingHorizontal: 12, paddingVertical: 8,
                  borderRadius: 12, borderWidth: 1, borderColor: '#2A2B2F'
                }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(232,65,74,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  {renderToolIcon(act.iconName)}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFFDFC', fontSize: 11, fontWeight: '700' }}>{act.providerDisplayName}</Text>
                  <Text style={{ color: 'rgba(236,231,227,0.7)', fontSize: 10 }} numberOfLines={1}>{act.humanMessage}</Text>
                </View>
                {act.state === 'completed' ? (
                  <Check size={13} color="#10B981" />
                ) : act.state === 'started' ? (
                  <ActivityIndicator size="small" color="#E8414A" />
                ) : (
                  <AlertCircle size={13} color="#ef4444" />
                )}
              </View>
            ))}
          </View>
        )}

        {/* Message bubble */}
        <View style={{
          paddingHorizontal: isUser ? 16 : 0,
          paddingVertical: isUser ? 12 : 0,
          backgroundColor: isUser ? C.card : 'transparent',
          borderRadius: 18,
          borderTopRightRadius: isUser ? 4 : 18,
          borderWidth: isUser ? 1 : 0,
          borderColor: C.border,
        }}>
          {isUser ? (
            <Text style={{ color: C.text, fontSize: 16, lineHeight: 24 }}>
              {rawContent}
            </Text>
          ) : (
            <MobileMarkdown content={rawContent || (loading && isLast ? '...' : '')} />
          )}
        </View>

        {/* Confirmation Card (HITL) */}
        {item.confirmation && (
          <View style={{
            marginTop: 10, padding: 14, borderRadius: 14,
            backgroundColor: '#1F2023', borderWidth: 1, borderColor: 'rgba(232,65,74,0.4)'
          }}>
            <Text style={{ color: '#FFFDFC', fontSize: 13, fontWeight: '800', marginBottom: 4 }}>
              {item.confirmation.title}
            </Text>
            <Text style={{ color: 'rgba(236,231,227,0.8)', fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
              {item.confirmation.message}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => onConfirmAction('Yes, confirm.')}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#E8414A', alignItems: 'center' }}
              >
                <Text style={{ color: '#FFFDFC', fontSize: 12, fontWeight: '700' }}>
                  {item.confirmation.confirmLabel || 'Allow'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onConfirmAction('No, cancel.')}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#26282E', borderWidth: 1, borderColor: '#2A2B2F', alignItems: 'center' }}
              >
                <Text style={{ color: 'rgba(236,231,227,0.8)', fontSize: 12, fontWeight: '600' }}>
                  {item.confirmation.cancelLabel || 'Deny'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Copy button */}
        {hasContent && (
          <TouchableOpacity
            onPress={handleCopy}
            style={{
              marginTop: 6, flexDirection: 'row', alignItems: 'center',
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              marginRight: isUser ? 4 : 0, marginLeft: isUser ? 0 : 4
            }}
          >
            {copied ? <Check size={12} color={C.primary} /> : <Copy size={12} color={C.muted} />}
            <Text style={{ color: copied ? C.primary : C.muted, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
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
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState('Brain Intelligence');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitleInput, setNewTitleInput] = useState('');

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  const [displayCount, setDisplayCount] = useState(30);

  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const isUserScrolling = useRef(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    loadConversations();
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const loadConversations = async () => {
    try {
      const res = await fetchWithAuth('/conversations');
      if (res.ok) {
        const data = await res.json();
        const list: ConversationItem[] = Array.isArray(data) ? data : data.conversations || [];
        setConversations(list);

        if (list.length > 0 && !activeConversationId) {
          const first = list[0];
          setActiveConversationId(first.conversationId);
          setActiveTitle(first.title || 'Brain Intelligence');
          loadConversationMessages(first.conversationId);
          return;
        }
      }
    } catch (_) {}
    loadDefaultHistory();
  };

  const loadConversationMessages = async (convId: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetchWithAuth(`/conversations/${convId}/messages`);
      if (res.ok) {
        const data = await res.json();
        const rawMsgs = Array.isArray(data) ? data : data.messages || [];
        const formatted: Message[] = rawMsgs.map((m: any) => ({
          id: m._id || m.id || `msg_${Date.now()}_${Math.random()}`,
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content || '',
          createdAt: m.createdAt,
        }));
        setMessages(formatted);
      } else {
        loadDefaultHistory();
      }
    } catch (_) {
      loadDefaultHistory();
    } finally {
      setHistoryLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 120);
    }
  };

  const loadDefaultHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetchWithAuth('/conversation/history');
      if (res.ok) {
        const data = await res.json();
        const sorted = (Array.isArray(data) ? data : []).sort((a: any, b: any) => {
          const tA = new Date(a.createdAt || 0).getTime();
          const tB = new Date(b.createdAt || 0).getTime();
          if (tA !== tB) return tA - tB;
          return 0;
        });
        setMessages(sorted.map((m: any) => ({ role: m.role, content: m.content })));
      }
    } catch (e) {
      console.error('Failed to load chat history:', e);
    } finally {
      setHistoryLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    }
  };

  const createNewChat = () => {
    setIsDrawerOpen(false);
    setActiveConversationId(null);
    setActiveTitle('New Chat');
    setMessages([]);
  };

  const switchConversation = (item: ConversationItem) => {
    setIsDrawerOpen(false);
    setActiveConversationId(item.conversationId);
    setActiveTitle(item.title || 'Brain Intelligence');
    loadConversationMessages(item.conversationId);
  };

  const renameConversation = async (convId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      await fetchWithAuth(`/conversations/${convId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      setActiveTitle(newTitle.trim());
      setConversations((prev) =>
        prev.map((c) => (c.conversationId === convId ? { ...c, title: newTitle.trim() } : c))
      );
    } catch (_) {}
    setIsEditingTitle(false);
  };

  const deleteConversation = async (convId: string) => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetchWithAuth(`/conversations/${convId}`, { method: 'DELETE' });
              setConversations((prev) => prev.filter((c) => c.conversationId !== convId));
              if (activeConversationId === convId) {
                createNewChat();
              }
            } catch (_) {}
          },
        },
      ]
    );
  };

  const sendMessage = async (forcedText?: string) => {
    const text = (forcedText || input).trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);
    isUserScrolling.current = false;

    try {
      const token = await AsyncStorage.getItem('user_token');
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const res = await fetchWithAuth('/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-timezone': localTz,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          conversationId: activeConversationId || undefined,
          model: selectedModel,
          mode: mode || 'general',
          timezone: localTz,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.message?.content || data.response || 'Action completed.';
        const toolActs = data.toolActivities || [];
        const confirm = data.confirmation || null;
        const missing = data.missingConnection || null;

        if (data.conversationId && !activeConversationId) {
          setActiveConversationId(data.conversationId);
          loadConversations();
        }

        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: 'assistant',
            content: reply,
            toolActivities: toolActs,
            confirmation: confirm,
            missingConnection: missing,
          };
          return copy;
        });

        scheduleAllTaskReminders().catch(console.error);
        ActiveExecutionNotificationManager.getInstance().refreshState().catch(() => {});
      } else {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: 'assistant',
            content: 'Failed to process your request. Please try again.',
          };
          return copy;
        });
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Network error. Make sure the server is reachable.' },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const visibleMessages = messages.slice(-displayCount);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: C.bg }}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => setIsDrawerOpen(true)}
          style={styles.headerIconButton}
          activeOpacity={0.7}
        >
          <Menu size={20} color="#FFFDFC" />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          {isEditingTitle ? (
            <TextInput
              value={newTitleInput}
              onChangeText={setNewTitleInput}
              onBlur={() => {
                if (activeConversationId && newTitleInput.trim()) {
                  renameConversation(activeConversationId, newTitleInput);
                } else {
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
              style={styles.headerTitleInput}
            />
          ) : (
            <TouchableOpacity
              onPress={() => {
                setNewTitleInput(activeTitle);
                setIsEditingTitle(true);
              }}
              activeOpacity={0.8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Text numberOfLines={1} style={styles.headerTitleText}>
                {activeTitle}
              </Text>
              <Edit2 size={12} color="rgba(236,231,227,0.4)" />
            </TouchableOpacity>
          )}
          <Text style={styles.headerSubtitleText}>Aven Cognitive Assistant</Text>
        </View>

        <TouchableOpacity
          onPress={createNewChat}
          style={[styles.headerIconButton, { backgroundColor: '#E8414A' }]}
          activeOpacity={0.7}
        >
          <Plus size={18} color="#FFFDFC" />
        </TouchableOpacity>
      </View>

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
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
            <View style={{ width: 68, height: 68, borderRadius: 16, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)' }}>
              <Image
                source={require('../../assets/images/logo.png')}
                style={{ width: 44, height: 44, borderRadius: 10 }}
                resizeMode="contain"
              />
            </View>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 6 }}>
              Talk to Aven
            </Text>
            <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 20 }}>
              Your execution intelligence. Ask for cabs, check 10-minute groceries, search flights, or manage your commitments.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {[
                "Look for a cab to Phagwara station",
                "Order milk and bread from Zepto",
                "What's the weather today?",
                "Find best Italian restaurants",
              ].map((s, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => sendMessage(s)}
                  style={{ backgroundColor: '#1F2023', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#2A2B2F' }}
                >
                  <Text style={{ color: '#ECE7E3', fontSize: 12, fontWeight: '600' }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
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
                  onConfirmAction={(txt) => sendMessage(txt)}
                />
              )}
              contentContainerStyle={{ padding: 16, paddingTop: 10 }}
              showsVerticalScrollIndicator={false}
              onScroll={(e) => {
                const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                const isScrolledUp = contentSize.height - layoutMeasurement.height - contentOffset.y > 150;
                isUserScrolling.current = isScrolledUp;
                setShowScrollButton(isScrolledUp);
                if (contentOffset.y < 50 && displayCount < messages.length) {
                  setDisplayCount((prev) => prev + 20);
                }
              }}
              scrollEventThrottle={16}
              onContentSizeChange={() => {
                if (!isUserScrolling.current) {
                  flatListRef.current?.scrollToEnd({ animated: false });
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

      {/* Input bar */}
      <View style={{ backgroundColor: C.bg, paddingHorizontal: 16, paddingTop: 10, paddingBottom: keyboardVisible ? (Platform.OS === 'ios' ? 24 : 36) : 90, borderTopWidth: 1, borderTopColor: C.border }}>
        {/* Model selector */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={GROQ_MODELS}
          keyExtractor={(item) => item.id}
          style={{ marginBottom: 8 }}
          renderItem={({ item }) => {
            const isSelected = selectedModel === item.id;
            return (
              <TouchableOpacity
                onPress={() => setSelectedModel(item.id)}
                style={{
                  marginRight: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99,
                  backgroundColor: isSelected ? C.primaryBg : C.card,
                  borderWidth: 1,
                  borderColor: isSelected ? 'rgba(232,65,74,0.5)' : C.border,
                }}
              >
                <Text style={{ fontSize: 11, color: isSelected ? C.primary : C.muted, fontWeight: isSelected ? '700' : '500' }}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* Text input row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, paddingLeft: 18, paddingRight: 8, paddingVertical: 6 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Message Aven..."
            placeholderTextColor={C.muted}
            style={{ flex: 1, color: C.text, fontSize: 15, paddingVertical: 6, maxHeight: 110, minHeight: 30 }}
            multiline
            onSubmitEditing={() => sendMessage()}
            editable={!loading}
          />

          {/* Voice Call button */}
          <TouchableOpacity
            onPress={() => router.push('/(dashboard)/voice-call')}
            disabled={loading}
            style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 6, marginBottom: 1 }}
          >
            <Phone size={17} color={C.muted} />
          </TouchableOpacity>

          {/* Send button */}
          <TouchableOpacity
            onPress={() => sendMessage()}
            disabled={loading || !input.trim()}
            style={{
              width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
              marginLeft: 4, marginBottom: 1,
              backgroundColor: input.trim() ? C.primary : 'transparent',
            }}
          >
            {loading && !input.trim() ? (
              <ActivityIndicator size="small" color={C.text} />
            ) : (
              <ArrowUp size={17} color={input.trim() ? C.text : C.muted} strokeWidth={3} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Slide-out Conversations Drawer */}
      <Modal
        visible={isDrawerOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsDrawerOpen(false)}
      >
        <View style={styles.drawerBackdrop}>
          <View style={styles.drawerContainer}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Conversations</Text>
              <TouchableOpacity
                onPress={() => setIsDrawerOpen(false)}
                style={styles.drawerCloseButton}
              >
                <X size={18} color="#FFFDFC" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={createNewChat}
              style={styles.drawerNewChatButton}
              activeOpacity={0.8}
            >
              <Plus size={16} color="#FFFDFC" />
              <Text style={styles.drawerNewChatText}>New Conversation</Text>
            </TouchableOpacity>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {conversations.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 13 }}>No previous chats found.</Text>
                </View>
              ) : (
                conversations.map((item) => {
                  const isActive = item.conversationId === activeConversationId;
                  return (
                    <TouchableOpacity
                      key={item.conversationId}
                      onPress={() => switchConversation(item)}
                      style={[
                        styles.conversationRow,
                        isActive && styles.conversationRowActive,
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.conversationItemTitle,
                            isActive && { color: '#E8414A', fontWeight: '800' },
                          ]}
                        >
                          {item.title || 'Untitled Conversation'}
                        </Text>
                        <Text style={styles.conversationItemTime}>
                          {item.lastMessageAt
                            ? new Date(item.lastMessageAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Active session'}
                        </Text>
                      </View>

                      <TouchableOpacity
                        onPress={() => deleteConversation(item.conversationId)}
                        style={{ padding: 8 }}
                      >
                        <Trash2 size={14} color="rgba(236,231,227,0.3)" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2B2F',
    backgroundColor: '#161618',
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1F2023',
    borderWidth: 1,
    borderColor: '#2A2B2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitleText: {
    color: '#FFFDFC',
    fontSize: 14,
    fontWeight: '800',
    maxWidth: SCREEN_WIDTH - 140,
  },
  headerTitleInput: {
    color: '#FFFDFC',
    fontSize: 14,
    fontWeight: '800',
    backgroundColor: '#1F2023',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E8414A',
  },
  headerSubtitleText: {
    color: 'rgba(236,231,227,0.4)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-start',
  },
  drawerContainer: {
    width: '82%',
    height: '100%',
    backgroundColor: '#161618',
    borderRightWidth: 1,
    borderRightColor: '#2A2B2F',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  drawerTitle: {
    color: '#FFFDFC',
    fontSize: 18,
    fontWeight: '900',
  },
  drawerCloseButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1F2023',
  },
  drawerNewChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8414A',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  drawerNewChatText: {
    color: '#FFFDFC',
    fontSize: 13,
    fontWeight: '700',
  },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: 'rgba(31,32,35,0.4)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  conversationRowActive: {
    backgroundColor: '#1F2023',
    borderColor: 'rgba(232,65,74,0.4)',
  },
  conversationItemTitle: {
    color: '#ECE7E3',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  conversationItemTime: {
    color: 'rgba(236,231,227,0.4)',
    fontSize: 10,
  },
});
