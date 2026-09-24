import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { ArrowLeft, Monitor, Smartphone, Tablet, Globe, LogOut, Shield, RefreshCw, Laptop } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../../utils/api';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

interface SessionEntry {
  id: string;
  deviceType: "mobile" | "desktop" | "tablet" | "web";
  platform: string;
  browser: string;
  os: string;
  ipAddress: string;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getPlatformLabel(platform: string, browser: string, os: string): string {
  if (platform === "Desktop App") return `LifeOS Desktop · ${os}`;
  if (platform === "Mobile App") return `LifeOS Mobile · ${os}`;
  return `${browser} · ${os}`;
}

export default function DevicesScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/sessions');
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) setSessions(data.sessions);
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not load sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const revokeSession = async (id: string) => {
    setRevoking(id);
    try {
      const res = await fetchWithAuth(`/sessions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
      } else {
        Alert.alert("Error", "Failed to revoke session.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Network request failed.");
    } finally {
      setRevoking(null);
    }
  };

  const revokeAllOthers = () => {
    Alert.alert(
      "Sign out all other devices?",
      "You'll stay signed in on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out All",
          style: "destructive",
          onPress: async () => {
            setRevokingAll(true);
            try {
              const res = await fetchWithAuth("/sessions/all", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ revokeAll: true }),
              });
              if (res.ok) {
                await fetchSessions();
              } else {
                Alert.alert("Error", "Failed to revoke all sessions.");
              }
            } catch (e) {
              console.error(e);
            } finally {
              setRevokingAll(false);
            }
          }
        }
      ]
    );
  };

  const renderIcon = (s: SessionEntry, color: string) => {
    if (s.platform === "Mobile App") return <Smartphone size={22} color={color} />;
    if (s.platform === "Desktop App") return <Laptop size={22} color={color} />;
    if (s.deviceType === "tablet") return <Tablet size={22} color={color} />;
    if (s.deviceType === "mobile") return <Smartphone size={22} color={color} />;
    if (s.deviceType === "desktop") return <Monitor size={22} color={color} />;
    return <Globe size={22} color={color} />;
  };

  const otherSessions = sessions.filter((s) => !s.isCurrent);
  const currentSession = sessions.find((s) => s.isCurrent);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}
          >
            <ArrowLeft size={20} color={C.text} />
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: 20, fontWeight: '900', color: C.text }}>Devices</Text>
            <Text style={{ fontSize: 10, fontWeight: '900', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>Active Sessions</Text>
          </View>
        </View>
        <TouchableOpacity 
          onPress={fetchSessions}
          disabled={loading}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <RefreshCw size={16} color={C.subtext} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        
        {loading && !sessions.length ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Current Device */}
            {currentSession && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, marginLeft: 4 }}>This Device</Text>
                <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                      {renderIcon(currentSession, C.primary)}
                    </View>
                    
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                        <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginRight: 8 }}>
                          {getPlatformLabel(currentSession.platform, currentSession.browser, currentSession.os)}
                        </Text>
                        <View style={{ backgroundColor: C.primaryBg, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                          <Text style={{ color: C.primary, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>Current</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary, marginRight: 6 }} />
                        <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600' }}>Active now · {currentSession.platform}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Other Sessions */}
            {otherSessions.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginLeft: 4, marginRight: 4 }}>
                  <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 }}>Other Devices ({otherSessions.length})</Text>
                  {otherSessions.length > 1 && (
                    <TouchableOpacity onPress={revokeAllOthers} disabled={revokingAll}>
                      <Text style={{ color: C.primary, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>
                        {revokingAll ? "Signing Out..." : "Sign Out All"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {otherSessions.map((s) => (
                  <View key={s.id} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                        {renderIcon(s, C.text)}
                      </View>
                      
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 4 }} numberOfLines={1}>
                          {getPlatformLabel(s.platform, s.browser, s.os)}
                        </Text>
                        <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                          Last active {formatRelativeTime(s.lastActive)}
                          {s.ipAddress ? ` · ${s.ipAddress}` : ''}
                        </Text>
                      </View>

                      <TouchableOpacity 
                        onPress={() => revokeSession(s.id)}
                        disabled={revoking === s.id}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: C.primaryBg, borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)' }}
                      >
                        {revoking === s.id ? (
                          <ActivityIndicator size="small" color={C.primary} style={{ width: 14, height: 14 }} />
                        ) : (
                          <LogOut size={14} color={C.primary} />
                        )}
                        <Text style={{ color: C.primary, fontWeight: '900', fontSize: 10, letterSpacing: 1, marginLeft: 6, textTransform: 'uppercase' }}>
                          {revoking === s.id ? "..." : "Logout"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* No other sessions */}
            {otherSessions.length === 0 && !loading && (
              <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 32, alignItems: 'center', marginBottom: 24 }}>
                <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: C.primaryBg, borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Shield size={28} color={C.primary} />
                </View>
                <Text style={{ color: C.text, fontWeight: '900', fontSize: 18, marginBottom: 8 }}>Only You</Text>
                <Text style={{ color: C.subtext, fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 20 }}>
                  No other active sessions found. Your account is only signed in on this device.
                </Text>
              </View>
            )}

            <View style={{ backgroundColor: C.primaryBg, borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)', borderRadius: 20, padding: 20 }}>
              <Text style={{ color: C.primary, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Security</Text>
              <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', lineHeight: 20 }}>
                Sessions are automatically tracked when you sign in. Logging out a device immediately revokes its access — they'll be signed out on their next action.
              </Text>
            </View>

          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
