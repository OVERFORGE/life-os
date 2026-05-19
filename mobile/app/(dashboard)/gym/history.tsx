import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Calendar, Trash2, Clock, PenLine } from 'lucide-react-native';
import { useState, useCallback } from 'react';
import { fetchWithAuth } from '../../../utils/api';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

function getWeekRange(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  return `${m} min`;
}

function groupSessionsByWeek(sessions: any[]) {
  const weeks: Record<string, { label: string; monday: Date; sunday: Date; sessions: any[] }> = {};

  sessions.forEach(s => {
    const date = new Date(s.date || s.createdAt);
    const { monday, sunday } = getWeekRange(date);
    const key = monday.toISOString();
    if (!weeks[key]) {
      weeks[key] = {
        label: `${formatDate(monday)} — ${formatDate(sunday)}`,
        monday,
        sunday,
        sessions: [],
      };
    }
    weeks[key].sessions.push(s);
  });

  return Object.values(weeks).sort((a, b) => b.monday.getTime() - a.monday.getTime());
}

export default function HistoryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/gym/session');
      if (res.ok) {
        setSessions(await res.json());
      }
    } catch (e) {
      console.error("Failed to load sessions:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions])
  );

  const deleteSession = (id: string) => {
    Alert.alert("Delete Session", "Are you sure you want to delete this logged session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            const res = await fetchWithAuth(`/gym/session/${id}`, { method: 'DELETE' });
            if (res.ok) loadSessions();
            else Alert.alert("Error", "Failed to delete session");
          } catch { Alert.alert("Error", "Network failed"); }
        }
      }
    ]);
  };

  const weeklyGroups = groupSessionsByWeek(sessions);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.card, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
          <ArrowLeft size={18} color={C.subtext} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '900', color: C.text, marginLeft: 16 }}>Workout History</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
        ) : weeklyGroups.length === 0 ? (
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 24, alignItems: 'center', marginTop: 16 }}>
            <Calendar size={40} color={C.muted} style={{ marginBottom: 16 }} />
            <Text style={{ color: C.text, fontWeight: '800', fontSize: 18, marginBottom: 8 }}>No Workouts Found</Text>
            <Text style={{ color: C.subtext, textAlign: 'center', fontSize: 14 }}>
              You haven't logged any past sessions. They will show up here once you do.
            </Text>
          </View>
        ) : (
          weeklyGroups.map((week) => (
            <View key={week.monday.toISOString()} style={{ marginBottom: 32 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 8 }}>
                <Text style={{ color: C.muted, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 11 }}>
                  {week.label}
                </Text>
                <Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700' }}>{week.sessions.length} sessions</Text>
              </View>

              {week.sessions.map((s) => (
                <View key={s._id} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 6 }}>{s.splitDayName || 'Freestyle Session'}</Text>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Calendar size={12} color={C.muted} />
                      <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600', marginLeft: 6, marginRight: 12 }}>
                        {new Date(s.date || s.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                      
                      <Clock size={12} color={C.muted} />
                      <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600', marginLeft: 6, marginRight: 12 }}>
                        {formatDuration(s.durationSeconds)}
                      </Text>

                      {s.exercises && s.exercises.length > 0 && (
                        <Text style={{ color: C.primary, fontSize: 12, fontWeight: '800' }}>
                          {s.exercises.length} exercises
                        </Text>
                      )}
                    </View>
                  </View>
                  
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity 
                      onPress={() => router.push({ pathname: '/(dashboard)/gym/edit-session', params: { id: s._id } })}
                      style={{ padding: 10, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border }}
                    >
                      <PenLine size={16} color={C.subtext} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => deleteSession(s._id)} 
                      style={{ padding: 10, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border }}
                    >
                      <Trash2 size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
