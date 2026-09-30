import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Plug,
  Calendar,
  Music,
  FolderGit2,
  Mail,
  HardDrive,
  Globe,
  Check,
  X,
  AlertCircle,
} from 'lucide-react-native';
import { fetchWithAuth } from '../../../utils/api';

const C = {
  bg: '#161618',
  card: '#1F2023',
  border: '#2A2B2F',
  text: '#FFFDFC',
  subtext: 'rgba(236,231,227,0.7)',
  muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A',
  primaryBg: 'rgba(232,65,74,0.12)',
  primaryBdr: 'rgba(232,65,74,0.3)',
  emerald: '#10B981',
  emeraldBg: 'rgba(16,185,129,0.12)',
};

interface ConnectedItem {
  providerId: string;
  displayName: string;
  category: string;
  description: string;
  iconName: string;
  status: string;
  connectedAccount: string;
  lastSuccessfulSync?: string;
  humanPermissions: string[];
}

interface AvailableItem {
  providerId: string;
  displayName: string;
  category: string;
  description: string;
  iconName: string;
  humanPermissions: string[];
  authType: string;
}

export default function ConnectionsSettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [connected, setConnected] = useState<ConnectedItem[]>([]);
  const [available, setAvailable] = useState<AvailableItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ConnectedItem | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/connections');
      if (res.ok) {
        const json = await res.json();
        const data = json.data || json;
        setConnected(data.connected || []);
        setAvailable(data.available || []);
      } else {
        Alert.alert('Error', 'Failed to load connections');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Network request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (providerId: string, displayName: string) => {
    setActionLoading(providerId);
    try {
      const res = await fetchWithAuth(`/connections/${encodeURIComponent(providerId)}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        Alert.alert('Connected', `${displayName} is now connected. Aven can interact with this service.`);
        await loadConnections();
      } else {
        Alert.alert('Error', `Couldn't connect ${displayName}. Please try again.`);
      }
    } catch (e) {
      Alert.alert('Error', 'Connection failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    Alert.alert('Disconnect Service', 'Are you sure you want to disconnect this service from Aven?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(providerId);
          try {
            const res = await fetchWithAuth(`/connections/${encodeURIComponent(providerId)}`, {
              method: 'DELETE',
            });
            if (res.ok) {
              setSelectedItem(null);
              await loadConnections();
            } else {
              Alert.alert('Error', 'Failed to disconnect');
            }
          } catch (e) {
            Alert.alert('Error', 'Network request failed');
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const renderIcon = (iconName: string, size = 20, color = C.text) => {
    switch (iconName) {
      case 'Calendar':
        return <Calendar size={size} color={color} />;
      case 'Music':
        return <Music size={size} color={color} />;
      case 'FolderGit2':
        return <FolderGit2 size={size} color={color} />;
      case 'Mail':
        return <Mail size={size} color={color} />;
      case 'HardDrive':
        return <HardDrive size={size} color={color} />;
      case 'Globe':
        return <Globe size={size} color={color} />;
      default:
        return <Plug size={size} color={color} />;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: C.card,
            borderWidth: 1,
            borderColor: C.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Connections</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 }}>
        <Text style={{ color: C.subtext, fontSize: 13, marginBottom: 24, lineHeight: 18 }}>
          Connect the services Aven can use on your behalf.
        </Text>

        {/* SECTION 1: CONNECTED */}
        <Text
          style={{
            color: C.muted,
            fontSize: 10,
            fontWeight: '900',
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            marginBottom: 12,
            marginLeft: 4,
          }}
        >
          Connected ({connected.length})
        </Text>

        {connected.length === 0 ? (
          <View
            style={{
              backgroundColor: C.card,
              borderWidth: 1,
              borderColor: C.border,
              borderRadius: 20,
              padding: 24,
              alignItems: 'center',
              marginBottom: 24,
            }}
          >
            <Plug size={28} color={C.muted} style={{ marginBottom: 8 }} />
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>No connected services</Text>
            <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
              Connect services below so Aven can access your calendar or media.
            </Text>
          </View>
        ) : (
          connected.map((item) => (
            <View
              key={item.providerId}
              style={{
                backgroundColor: C.card,
                borderWidth: 1,
                borderColor: C.border,
                borderRadius: 20,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: C.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    {renderIcon(item.iconName, 20, C.text)}
                  </View>
                  <View>
                    <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>{item.displayName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.emerald, marginRight: 6 }} />
                      <Text style={{ color: C.emerald, fontSize: 11, fontWeight: '700' }}>Connected</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setSelectedItem(item)}
                  style={{
                    backgroundColor: C.border,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 10,
                  }}
                >
                  <Text style={{ color: C.text, fontSize: 11, fontWeight: '700' }}>Manage</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ color: C.subtext, fontSize: 12, lineHeight: 16, marginBottom: 8 }}>
                {item.description}
              </Text>

              <View
                style={{
                  backgroundColor: '#161618',
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: C.muted, fontSize: 10 }}>Account: {item.connectedAccount}</Text>
              </View>
            </View>
          ))
        )}

        {/* SECTION 2: AVAILABLE */}
        <Text
          style={{
            color: C.muted,
            fontSize: 10,
            fontWeight: '900',
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            marginTop: 16,
            marginBottom: 12,
            marginLeft: 4,
          }}
        >
          Available ({available.length})
        </Text>

        {available.map((item) => (
          <View
            key={item.providerId}
            style={{
              backgroundColor: C.card,
              borderWidth: 1,
              borderColor: C.border,
              borderRadius: 20,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: C.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  {renderIcon(item.iconName, 20, C.muted)}
                </View>
                <View>
                  <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>{item.displayName}</Text>
                  <Text style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', fontWeight: '700' }}>
                    {item.category}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => handleConnect(item.providerId, item.displayName)}
                disabled={actionLoading === item.providerId}
                style={{
                  backgroundColor: C.primaryBg,
                  borderWidth: 1,
                  borderColor: C.primaryBdr,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                {actionLoading === item.providerId ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <>
                    <Plug size={12} color={C.primary} style={{ marginRight: 4 }} />
                    <Text style={{ color: C.primary, fontSize: 11, fontWeight: '800' }}>Connect</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={{ color: C.subtext, fontSize: 12, lineHeight: 16 }}>{item.description}</Text>
          </View>
        ))}
      </ScrollView>

      {/* MANAGE MODAL */}
      {selectedItem && (
        <Modal visible transparent animationType="fade">
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.75)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <View
              style={{
                backgroundColor: C.card,
                borderWidth: 1,
                borderColor: C.border,
                borderRadius: 24,
                padding: 20,
                width: '100%',
                maxWidth: 400,
              }}
            >
              {/* Modal Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      backgroundColor: C.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    {renderIcon(selectedItem.iconName, 22, C.text)}
                  </View>
                  <View>
                    <Text style={{ color: C.text, fontWeight: '800', fontSize: 16 }}>{selectedItem.displayName}</Text>
                    <Text style={{ color: C.emerald, fontSize: 11, fontWeight: '700' }}>Connected</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedItem(null)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: C.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={16} color={C.subtext} />
                </TouchableOpacity>
              </View>

              {/* Permissions list */}
              <Text
                style={{
                  color: C.muted,
                  fontSize: 10,
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 8,
                }}
              >
                Aven can:
              </Text>
              <View
                style={{
                  backgroundColor: '#161618',
                  borderRadius: 14,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                {selectedItem.humanPermissions.map((perm, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Check size={14} color={C.emerald} style={{ marginRight: 8 }} />
                    <Text style={{ color: C.text, fontSize: 12 }}>{perm}</Text>
                  </View>
                ))}
              </View>

              {/* Connected Account */}
              <Text
                style={{
                  color: C.muted,
                  fontSize: 10,
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                Connected Account
              </Text>
              <View
                style={{
                  backgroundColor: '#161618',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  marginBottom: 20,
                }}
              >
                <Text style={{ color: C.text, fontSize: 12, fontFamily: 'monospace' }}>
                  {selectedItem.connectedAccount}
                </Text>
              </View>

              {/* Actions */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => handleDisconnect(selectedItem.providerId)}
                  style={{
                    backgroundColor: 'rgba(239,68,68,0.1)',
                    borderWidth: 1,
                    borderColor: 'rgba(239,68,68,0.2)',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                  }}
                >
                  <Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 12 }}>Disconnect</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setSelectedItem(null)}
                  style={{
                    backgroundColor: C.border,
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    borderRadius: 12,
                  }}
                >
                  <Text style={{ color: C.text, fontWeight: '700', fontSize: 12 }}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}
