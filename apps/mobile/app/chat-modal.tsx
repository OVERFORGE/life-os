// CACHE BUST 
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Modal,
  Alert,
  SafeAreaView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  X,
  Send,
  Mic,
  Volume2,
  Calendar,
  Music,
  FolderGit2,
  Mail,
  HardDrive,
  Globe,
  Plug,
  Check,
  AlertCircle,
  Menu,
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  CloudSun,
  Compass,
  Plane,
  Building,
  ShoppingBag,
} from 'lucide-react-native';
import { fetchWithAuth } from '../utils/api';
import { VoiceRecorder, transcribeAudio } from '../utils/audioCapture';
import { isVoiceAssistantEnabledAtCurrentLocation } from '../utils/locationManager';
import { speakAndListen, stopSpeaking } from '../utils/ttsManager';
import { MobileMarkdown } from '../components/ui/MobileMarkdown';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolActivities?: ToolActivity[];
  confirmation?: Confirmation | null;
  missingConnection?: MissingConnection | null;
  timestamp?: number;
}

interface ConversationItem {
  conversationId: string;
  title: string;
  messageCount?: number;
  lastMessageAt?: string | null;
  createdAt: string;
}

export default function ChatModalScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState('New Chat');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitleInput, setNewTitleInput] = useState('');

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceRecorder] = useState(() => new VoiceRecorder());

  const inputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadConversations();
    return () => {
      stopSpeaking();
    };
  }, []);

  const loadConversations = async () => {
    try {
      const res = await fetchWithAuth('/conversations');
      if (res.ok) {
        const list: ConversationItem[] = await res.json();
        setConversations(list);
        if (list.length > 0 && !activeConversationId) {
          selectConversation(list[0].conversationId, list[0].title);
        }
      }
    } catch (_) {}
  };

  const selectConversation = async (convId: string, title?: string) => {
    setActiveConversationId(convId);
    if (title) setActiveTitle(title);
    setIsDrawerOpen(false);
    setLoading(true);

    try {
      const res = await fetchWithAuth(`/chat?conversationId=${convId}`);
      if (res.ok) {
        const data = await res.json();
        const historyMsgs: ChatMessageItem[] = (data.messages || []).map((m: any) => ({
          id: m._id || m.id || `msg_${Math.random()}`,
          role: m.role,
          content: m.content || '',
          toolActivities: m.toolActivities,
          timestamp: new Date(m.createdAt || Date.now()).getTime(),
        }));
        setMessages(historyMsgs);
      }
    } catch (_) {
    } finally {
      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const createNewChat = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Conversation' }),
      });
      if (res.ok) {
        const newConv = await res.json();
        const convId = newConv.conversationId || newConv._id;
        setActiveConversationId(convId);
        setActiveTitle('New Conversation');
        setMessages([]);
        setIsDrawerOpen(false);
        await loadConversations();
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  const renameConversation = async (convId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    try {
      await fetchWithAuth(`/conversations/${convId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: trimmed }),
      });
      setActiveTitle(trimmed);
      setIsEditingTitle(false);
      await loadConversations();
    } catch (_) {}
  };

  const deleteConversation = async (convId: string) => {
    Alert.alert('Delete Chat', 'Are you sure you want to delete this conversation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await fetchWithAuth(`/conversations/${convId}`, { method: 'DELETE' });
            if (activeConversationId === convId) {
              setMessages([]);
              setActiveConversationId(null);
              setActiveTitle('New Chat');
            }
            await loadConversations();
          } catch (_) {}
        },
      },
    ]);
  };

  const renderIcon = (iconName: string) => {
    switch (iconName) {
      case 'Calendar':
        return <Calendar size={16} color="#FFFDFC" />;
      case 'Music':
        return <Music size={16} color="#FFFDFC" />;
      case 'FolderGit2':
        return <FolderGit2 size={16} color="#FFFDFC" />;
      case 'Mail':
        return <Mail size={16} color="#FFFDFC" />;
      case 'HardDrive':
        return <HardDrive size={16} color="#FFFDFC" />;
      case 'Globe':
        return <Globe size={16} color="#FFFDFC" />;
      case 'CloudSun':
      case 'CloudRain':
        return <CloudSun size={16} color="#FFFDFC" />;
      case 'Compass':
        return <Compass size={16} color="#FFFDFC" />;
      case 'Plane':
        return <Plane size={16} color="#FFFDFC" />;
      case 'Building':
        return <Building size={16} color="#FFFDFC" />;
      case 'ShoppingBag':
        return <ShoppingBag size={16} color="#FFFDFC" />;
      default:
        return <Plug size={16} color="#FFFDFC" />;
    }
  };

  const sendPrompt = async (forcedText?: string) => {
    const text = (forcedText || input).trim();
    if (!text) return;

    setInput('');
    const userMsgId = `user_${Date.now()}`;
    const userMsg: ChatMessageItem = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    const assistantMsgId = `asst_${Date.now()}`;
    let currentAssistantMsg: ChatMessageItem = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      toolActivities: [],
      timestamp: Date.now(),
    };

    try {
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const res = await fetchWithAuth('/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
          'x-timezone': localTz,
        },
        body: JSON.stringify({
          message: text,
          conversationId: activeConversationId || undefined,
          model: 'llama-3.3-70b-versatile',
          mode: 'general',
          streamFormat: 'events',
          clientPlatform: 'mobile',
          timezone: localTz,
        }),
      });

      if (res.ok) {
        const resText = await res.text();
        let extractedResponse = '';
        const activities: ToolActivity[] = [];
        let conf: Confirmation | null = null;
        let missingConn: MissingConnection | null = null;

        if (resText.includes('data: ')) {
          const lines = resText.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const ev = JSON.parse(trimmed.slice(6));
                if (ev.type === 'assistant_delta') {
                  extractedResponse += ev.text || '';
                } else if (ev.type === 'tool_activity') {
                  const existingIdx = activities.findIndex(
                    (a) => a.capabilityURN === ev.capabilityURN && a.providerId === ev.providerId
                  );
                  const actObj: ToolActivity = {
                    providerId: ev.providerId,
                    providerDisplayName: ev.providerDisplayName,
                    capabilityURN: ev.capabilityURN,
                    iconName: ev.iconName,
                    humanMessage: ev.humanMessage,
                    state: ev.state,
                  };
                  if (existingIdx !== -1) {
                    activities[existingIdx] = actObj;
                  } else {
                    activities.push(actObj);
                  }
                } else if (ev.type === 'confirmation_required') {
                  conf = ev;
                } else if (ev.type === 'missing_connection') {
                  missingConn = ev;
                }
              } catch (_) {}
            }
          }
        } else {
          try {
            const data = JSON.parse(resText);
            extractedResponse = data.message?.content || data.response || resText;
          } catch (_) {
            extractedResponse = resText;
          }
        }

        const textResponse = extractedResponse.trim();
        currentAssistantMsg = {
          id: assistantMsgId,
          role: 'assistant',
          content: textResponse,
          toolActivities: activities,
          confirmation: conf,
          missingConnection: missingConn,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, currentAssistantMsg]);

        // Auto-refresh conversation list in case title was generated
        loadConversations();

        // Handle TTS if enabled
        const isVoiceAllowed = await isVoiceAssistantEnabledAtCurrentLocation();
        if (isVoiceAllowed && textResponse.length > 0) {
          setIsSpeaking(true);
          speakAndListen(textResponse, () => {
            setIsSpeaking(false);
            startVoiceInput();
          });

          voiceRecorder.startRecording(async (uri) => {
            if (uri) {
              const { text: bargeText } = await transcribeAudio(uri);
              if (bargeText && bargeText.trim().length > 2) {
                stopSpeaking();
                setIsSpeaking(false);
                sendPrompt(bargeText.trim());
              }
            }
          });
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            content: 'Sorry, I encountered an error communicating with the server.',
            timestamp: Date.now(),
          },
        ]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: 'Network connection error. Please verify your connection.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const cancelVoice = () => {
    setIsSpeaking(false);
    setIsRecording(false);
    setInput('');
    stopSpeaking();
    voiceRecorder.cancelRecording();
  };

  const startVoiceInput = async () => {
    if (loading) return;
    setIsRecording(true);
    setInput('Listening...');
    const success = await voiceRecorder.startRecording(async (uri) => {
      setIsRecording(false);
      if (!uri) {
        setInput('');
        return;
      }
      setInput('Thinking...');
      const { text, error } = await transcribeAudio(uri);

      if (text) {
        const cleaned = text.trim();
        const isJunk = cleaned.length <= 2 || /^[.\s,!?]+$/.test(cleaned);
        if (isJunk) {
          setInput('');
          return;
        }
        setInput('');
        await sendPrompt(text);
      } else {
        setInput('');
      }
    });

    if (!success) {
      setIsRecording(false);
      setInput('');
      Alert.alert('Microphone Access', 'Please enable microphone permissions in your device settings.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        {/* Top Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setIsDrawerOpen(true)}
            style={styles.headerIconButton}
            activeOpacity={0.7}
          >
            <Menu size={20} color="#FFFDFC" />
          </TouchableOpacity>

          {/* Active Conversation Title */}
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

          {/* New Chat & Close Buttons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={createNewChat}
              style={[styles.headerIconButton, { backgroundColor: '#E8414A' }]}
              activeOpacity={0.7}
            >
              <Plus size={18} color="#FFFDFC" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerIconButton}
              activeOpacity={0.7}
            >
              <X size={20} color="#FFFDFC" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Message Thread ScrollView */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesScroll}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && !loading && (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyIconCircle}>
                <MessageSquare size={28} color="#E8414A" />
              </View>
              <Text style={styles.emptyStateTitle}>How can Aven help you today?</Text>
              <Text style={styles.emptyStateSubtitle}>
                Ask for weather, curate travel plans, search flights, compare shopping deals, or schedule your calendar.
              </Text>

              <View style={styles.suggestionChips}>
                {[
                  "What's the weather today?",
                  'Plan a 2-day trip to Delhi',
                  'Find flights from Delhi to Patna',
                  'Compare prices for PS5 controller',
                ].map((s, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => sendPrompt(s)}
                    style={styles.suggestionChip}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.suggestionChipText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <View
                key={msg.id || idx}
                style={[
                  styles.messageRow,
                  isUser ? styles.messageRowUser : styles.messageRowAssistant,
                ]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant,
                  ]}
                >
                  {/* Tool Activities */}
                  {msg.toolActivities && msg.toolActivities.length > 0 && (
                    <View style={styles.toolActivitiesContainer}>
                      {msg.toolActivities.map((act, aIdx) => (
                        <View key={aIdx} style={styles.toolActivityCard}>
                          <View style={styles.toolActivityIconCircle}>
                            {renderIcon(act.iconName)}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.toolActivityTitle}>{act.providerDisplayName}</Text>
                            <Text style={styles.toolActivityDesc}>{act.humanMessage}</Text>
                          </View>
                          {act.state === 'completed' ? (
                            <Check size={14} color="#10B981" />
                          ) : act.state === 'started' ? (
                            <ActivityIndicator size="small" color="#E8414A" />
                          ) : (
                            <AlertCircle size={14} color="#ef4444" />
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Message Content */}
                  {isUser ? (
                    <Text style={styles.userMessageText}>{msg.content}</Text>
                  ) : (
                    <MobileMarkdown content={msg.content} />
                  )}

                  {/* Confirmation Card */}
                  {msg.confirmation && (
                    <View style={styles.confirmationCard}>
                      <Text style={styles.confirmationTitle}>{msg.confirmation.title}</Text>
                      <Text style={styles.confirmationMsg}>{msg.confirmation.message}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <TouchableOpacity
                          onPress={() => sendPrompt('Yes, confirm.')}
                          style={styles.confirmButton}
                        >
                          <Text style={styles.confirmButtonText}>
                            {msg.confirmation.confirmLabel || 'Allow'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => sendPrompt('No, cancel.')}
                          style={styles.cancelButton}
                        >
                          <Text style={styles.cancelButtonText}>
                            {msg.confirmation.cancelLabel || 'Deny'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Missing Connection Card */}
                  {msg.missingConnection && (
                    <View style={styles.missingConnectionCard}>
                      <Text style={styles.missingConnTitle}>
                        {msg.missingConnection.providerDisplayName} Required
                      </Text>
                      <Text style={styles.missingConnMsg}>{msg.missingConnection.message}</Text>
                      <TouchableOpacity
                        onPress={() => router.push('/(dashboard)/settings/connections' as any)}
                        style={styles.connectButton}
                      >
                        <Text style={styles.connectButtonText}>
                          Connect {msg.missingConnection.providerDisplayName}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}

          {loading && (
            <View style={styles.thinkingRow}>
              <View style={styles.thinkingBubble}>
                <ActivityIndicator size="small" color="#E8414A" />
                <Text style={styles.thinkingText}>Aven is thinking...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Voice Speaking Barge-in Banner */}
        {isSpeaking && (
          <TouchableOpacity
            onPress={cancelVoice}
            activeOpacity={0.8}
            style={styles.speakingBanner}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Volume2 size={16} color="#E8414A" />
              <Text style={{ color: '#FFFDFC', fontSize: 13, fontWeight: '700' }}>
                Speaking...
              </Text>
              <Text style={{ color: 'rgba(236,231,227,0.6)', fontSize: 11 }}>
                (Tap to stop)
              </Text>
            </View>
            <View style={styles.stopButtonBadge}>
              <Text style={{ color: '#FFFDFC', fontSize: 10, fontWeight: '800' }}>STOP</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Bottom Input Area */}
        <View style={styles.inputAreaContainer}>
          <View style={styles.inputBox}>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              placeholder="Ask Aven anything..."
              placeholderTextColor="rgba(236,231,227,0.4)"
              multiline
              style={styles.textInput}
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {/* Mic Button */}
              <TouchableOpacity
                onPress={isRecording ? cancelVoice : startVoiceInput}
                style={[
                  styles.actionButton,
                  isRecording && { backgroundColor: '#E8414A' },
                ]}
                activeOpacity={0.7}
              >
                <Mic size={18} color="#FFFDFC" />
              </TouchableOpacity>

              {/* Send Button */}
              <TouchableOpacity
                onPress={() => sendPrompt()}
                disabled={loading || !input.trim()}
                style={[
                  styles.actionButton,
                  { backgroundColor: input.trim() ? '#E8414A' : '#1F2023' },
                ]}
                activeOpacity={0.7}
              >
                <Send size={16} color="#FFFDFC" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Conversations Drawer Modal */}
        <Modal
          visible={isDrawerOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setIsDrawerOpen(false)}
        >
          <View style={styles.drawerBackdrop}>
            <View style={styles.drawerContent}>
              <View style={styles.drawerHeader}>
                <View>
                  <Text style={styles.drawerTitle}>Conversations</Text>
                  <Text style={styles.drawerSubtitle}>{conversations.length} saved chats</Text>
                </View>

                <TouchableOpacity
                  onPress={createNewChat}
                  style={styles.drawerNewChatBtn}
                  activeOpacity={0.8}
                >
                  <Plus size={16} color="#FFFDFC" />
                  <Text style={styles.drawerNewChatText}>New Chat</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {conversations.map((c) => {
                  const isActive = c.conversationId === activeConversationId;
                  return (
                    <TouchableOpacity
                      key={c.conversationId}
                      onPress={() => selectConversation(c.conversationId, c.title)}
                      style={[
                        styles.conversationItem,
                        isActive && styles.conversationItemActive,
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.conversationItemTitle,
                            isActive && { color: '#E8414A', fontWeight: '800' },
                          ]}
                        >
                          {c.title || 'Untitled Chat'}
                        </Text>
                        <Text style={styles.conversationItemDate}>
                          {c.lastMessageAt
                            ? new Date(c.lastMessageAt).toLocaleDateString()
                            : new Date(c.createdAt).toLocaleDateString()}
                        </Text>
                      </View>

                      <TouchableOpacity
                        onPress={() => deleteConversation(c.conversationId)}
                        style={styles.deleteChatButton}
                      >
                        <Trash2 size={14} color="rgba(236,231,227,0.4)" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                onPress={() => setIsDrawerOpen(false)}
                style={styles.closeDrawerButton}
              >
                <Text style={styles.closeDrawerText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#161618',
  },
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#161618',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#26282E',
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
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  headerTitleText: {
    color: '#FFFDFC',
    fontSize: 15,
    fontWeight: '800',
    maxWidth: 160,
  },
  headerTitleInput: {
    color: '#FFFDFC',
    fontSize: 15,
    fontWeight: '800',
    backgroundColor: '#1F2023',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8414A',
  },
  headerSubtitleText: {
    color: 'rgba(236,231,227,0.4)',
    fontSize: 11,
    fontWeight: '600',
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(232,65,74,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(232,65,74,0.25)',
  },
  emptyStateTitle: {
    color: '#FFFDFC',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    color: 'rgba(236,231,227,0.6)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 24,
  },
  suggestionChips: {
    width: '100%',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#1F2023',
    borderWidth: 1,
    borderColor: '#2A2B2F',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  suggestionChipText: {
    color: '#ECE7E3',
    fontSize: 13,
    fontWeight: '600',
  },
  messageRow: {
    marginBottom: 14,
    flexDirection: 'row',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '92%',
    borderRadius: 20,
    padding: 14,
  },
  messageBubbleUser: {
    backgroundColor: '#E8414A',
    borderBottomRightRadius: 4,
  },
  messageBubbleAssistant: {
    backgroundColor: '#1F2023',
    borderWidth: 1,
    borderColor: '#2A2B2F',
    borderBottomLeftRadius: 4,
  },
  userMessageText: {
    color: '#FFFDFC',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  thinkingRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1F2023',
    borderWidth: 1,
    borderColor: '#2A2B2F',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  thinkingText: {
    color: 'rgba(236,231,227,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  toolActivitiesContainer: {
    marginBottom: 10,
  },
  toolActivityCard: {
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: '#2A2B2F',
    borderRadius: 12,
    padding: 8,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolActivityIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#1F2023',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolActivityTitle: {
    color: '#FFFDFC',
    fontSize: 12,
    fontWeight: '700',
  },
  toolActivityDesc: {
    color: 'rgba(236,231,227,0.5)',
    fontSize: 10,
  },
  confirmationCard: {
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: '#2A2B2F',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  confirmationTitle: {
    color: '#FFFDFC',
    fontSize: 13,
    fontWeight: '800',
  },
  confirmationMsg: {
    color: 'rgba(236,231,227,0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#E8414A',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#FFFDFC',
    fontSize: 12,
    fontWeight: '800',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#1F2023',
    borderWidth: 1,
    borderColor: '#2A2B2F',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'rgba(236,231,227,0.7)',
    fontSize: 12,
    fontWeight: '700',
  },
  missingConnectionCard: {
    backgroundColor: 'rgba(232,65,74,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(232,65,74,0.3)',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  missingConnTitle: {
    color: '#E8414A',
    fontSize: 13,
    fontWeight: '800',
  },
  missingConnMsg: {
    color: 'rgba(236,231,227,0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  connectButton: {
    backgroundColor: 'rgba(232,65,74,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(232,65,74,0.4)',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  connectButtonText: {
    color: '#E8414A',
    fontSize: 12,
    fontWeight: '800',
  },
  speakingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(232,65,74,0.15)',
    borderColor: 'rgba(232,65,74,0.4)',
    borderWidth: 1,
    borderRadius: 14,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
  },
  stopButtonBadge: {
    backgroundColor: 'rgba(232,65,74,0.3)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  inputAreaContainer: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 8 : 14,
    paddingTop: 8,
    backgroundColor: '#161618',
    borderTopWidth: 1,
    borderTopColor: '#26282E',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2023',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#2A2B2F',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  textInput: {
    flex: 1,
    color: '#FFFDFC',
    fontSize: 14,
    maxHeight: 100,
    marginRight: 8,
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#26282E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-start',
  },
  drawerContent: {
    width: '80%',
    height: '100%',
    backgroundColor: '#18181B',
    borderRightWidth: 1,
    borderRightColor: '#27272A',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
  },
  drawerTitle: {
    color: '#FFFDFC',
    fontSize: 18,
    fontWeight: '900',
  },
  drawerSubtitle: {
    color: 'rgba(255,253,252,0.4)',
    fontSize: 11,
    fontWeight: '600',
  },
  drawerNewChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8414A',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  drawerNewChatText: {
    color: '#FFFDFC',
    fontSize: 12,
    fontWeight: '800',
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2023',
    borderWidth: 1,
    borderColor: '#2A2B2F',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  conversationItemActive: {
    borderColor: '#E8414A',
    backgroundColor: 'rgba(232,65,74,0.08)',
  },
  conversationItemTitle: {
    color: '#ECE7E3',
    fontSize: 13,
    fontWeight: '600',
  },
  conversationItemDate: {
    color: 'rgba(236,231,227,0.4)',
    fontSize: 11,
    marginTop: 2,
  },
  deleteChatButton: {
    padding: 6,
  },
  closeDrawerButton: {
    backgroundColor: '#27272A',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  closeDrawerText: {
    color: '#FFFDFC',
    fontSize: 13,
    fontWeight: '700',
  },
});
