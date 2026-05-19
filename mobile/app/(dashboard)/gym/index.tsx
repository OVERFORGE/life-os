import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Dumbbell, Play, ChevronRight, Trash2, ChevronDown, ChevronUp, Clock, Calendar, Flame, ArrowLeft } from 'lucide-react-native';
import { fetchWithAuth } from '../../../utils/api';
import { useFocusEffect } from '@react-navigation/native';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

function getWeekRange(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
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
      weeks[key] = { label: `${formatDate(monday)} — ${formatDate(sunday)}`, monday, sunday, sessions: [] };
    }
    weeks[key].sessions.push(s);
  });
  return Object.values(weeks).sort((a, b) => b.monday.getTime() - a.monday.getTime());
}

function isCurrentWeek(monday: Date) {
  const now = new Date();
  const { monday: curMon } = getWeekRange(now);
  return monday.toDateString() === curMon.toDateString();
}

export default function GymHub() {
  const router = useRouter();
  const [gyms, setGyms] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRoutine, setExpandedRoutine] = useState<string | null>(null);

  const loadGymData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, routRes, sessRes] = await Promise.all([
        fetchWithAuth('/gym/inventory'),
        fetchWithAuth('/gym/routines'),
        fetchWithAuth('/gym/session'),
      ]);
      if (invRes.ok) {
        const invData = await invRes.json();
        setGyms(invData.userGyms || []);
      }
      if (routRes.ok) setRoutines(await routRes.json());
      if (sessRes.ok) setSessions(await sessRes.json());
    } catch (e) {
      console.error("Failed to load gym data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadGymData(); }, [loadGymData]));

  const deleteRoutine = (id: string) => {
    Alert.alert("Delete Routine", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            const res = await fetchWithAuth(`/gym/routines/${id}`, { method: 'DELETE' });
            if (res.ok) loadGymData();
            else Alert.alert("Error", "Failed to delete routine");
          } catch { Alert.alert("Error", "Network failed"); }
        }
      }
    ]);
  };

  const deleteGym = (id: string) => {
    Alert.alert("Delete Gym", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            const res = await fetchWithAuth(`/gym/inventory/${id}`, { method: 'DELETE' });
            if (res.ok) loadGymData();
            else Alert.alert("Error", "Failed to delete gym");
          } catch { Alert.alert("Error", "Network failed"); }
        }
      }
    ]);
  };

  const deleteSession = (id: string) => {
    Alert.alert("Delete Session", "Are you sure you want to delete this logged session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            const res = await fetchWithAuth(`/gym/session/${id}`, { method: 'DELETE' });
            if (res.ok) loadGymData();
            else Alert.alert("Error", "Failed to delete session");
          } catch { Alert.alert("Error", "Network failed"); }
        }
      }
    ]);
  };

  const weeklyGroups = groupSessionsByWeek(sessions);
  const currentWeekSessions = weeklyGroups.find(w => isCurrentWeek(w.monday))?.sessions || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => router.push('/(dashboard)/health')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
              <ArrowLeft color={C.subtext} size={18} />
            </TouchableOpacity>
            <View>
              <Text style={{ fontSize: 24, fontWeight: '900', color: C.text, letterSpacing: -0.5 }}>Gym Protocol</Text>
              <Text style={{ fontSize: 10, fontWeight: '800', color: C.muted, marginTop: 2, letterSpacing: 2, textTransform: 'uppercase' }}>Strength Telemetry</Text>
            </View>
          </View>
          <TouchableOpacity 
            onPress={() => router.push('/(dashboard)/gym/progress')}
            style={{ backgroundColor: C.primaryBg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)', flexDirection: 'row', alignItems: 'center' }}
          >
            <Flame size={14} color={C.primary} />
            <Text style={{ color: C.primary, fontWeight: '800', fontSize: 11, marginLeft: 6, letterSpacing: 1, textTransform: 'uppercase' }}>Intell</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Start */}
        <View style={{ marginBottom: 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Play size={16} color={C.primary} fill={C.primary} />
            <Text style={{ fontSize: 15, fontWeight: '900', color: C.text, marginLeft: 8 }}>Quick Start</Text>
          </View>

          {loading ? <ActivityIndicator color={C.primary} /> : routines.length === 0 ? (
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 24, alignItems: 'center' }}>
              <Text style={{ color: C.subtext, fontSize: 14, fontWeight: '700' }}>Create a routine to start a session.</Text>
            </View>
          ) : (
            routines.map(r => (
              <View key={r._id} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, marginBottom: 12, overflow: 'hidden' }}>
                <TouchableOpacity 
                  onPress={() => setExpandedRoutine(expandedRoutine === r._id ? null : r._id)}
                  style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>{r.routineName}</Text>
                  {expandedRoutine === r._id ? <ChevronUp color={C.muted} size={20} /> : <ChevronDown color={C.muted} size={20} />}
                </TouchableOpacity>
                
                {expandedRoutine === r._id && (
                  <View style={{ padding: 16, paddingTop: 0, backgroundColor: C.card }}>
                    <View style={{ height: 1, backgroundColor: C.border, marginBottom: 16 }} />
                    {r.splitDays.map((day: any, idx: number) => (
                      <TouchableOpacity 
                        key={idx}
                        onPress={() => router.push({ pathname: '/(dashboard)/gym/live-session', params: { routineId: r._id, dayName: day.dayName } })}
                        style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, padding: 14, borderRadius: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <View>
                          <Text style={{ color: C.primary, fontWeight: '800', fontSize: 14 }}>{day.dayName}</Text>
                          <Text style={{ color: C.subtext, fontSize: 11, fontWeight: '600', marginTop: 4 }}>{day.exercises?.length || 0} exercises</Text>
                        </View>
                        <View style={{ backgroundColor: C.primary, padding: 10, borderRadius: 20 }}>
                          <Play size={14} color="#FFFDFC" fill="#FFFDFC" />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))
          )}
          
          <TouchableOpacity
            onPress={() => router.push('/(dashboard)/gym/log-past')}
            style={{ marginTop: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
          >
            <Calendar size={18} color={C.subtext} />
            <Text style={{ color: C.text, fontWeight: '800', fontSize: 14, marginLeft: 8 }}>Log Past Workout</Text>
          </TouchableOpacity>
        </View>

        {/* This Week */}
        <View style={{ marginBottom: 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Flame size={16} color={C.primary} />
            <Text style={{ fontSize: 15, fontWeight: '900', color: C.text, marginLeft: 8 }}>This Week</Text>
            <View style={{ backgroundColor: C.primaryBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 12 }}>
              <Text style={{ color: C.primary, fontSize: 10, fontWeight: '900' }}>{currentWeekSessions.length} sessions</Text>
            </View>
          </View>

          {currentWeekSessions.length === 0 ? (
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 24, alignItems: 'center' }}>
              <Text style={{ color: C.subtext, fontSize: 14, fontWeight: '700' }}>No sessions logged this week yet.</Text>
            </View>
          ) : (
            currentWeekSessions.map(s => (
              <View key={s._id} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>{s.splitDayName || 'Freestyle'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                      <Calendar size={12} color={C.muted} />
                      <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>
                        {new Date(s.date || s.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                      <Clock size={12} color={C.muted} style={{ marginLeft: 16 }} />
                      <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>{formatDuration(s.durationSeconds)}</Text>
                    </View>
                    <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', marginTop: 8 }}>{s.exercises?.length || 0} EXERCISES</Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteSession(s._id)} style={{ padding: 8, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border }}>
                    <Trash2 size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* All Sessions History Link */}
        <View style={{ marginBottom: 32, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.push('/(dashboard)/gym/history')}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border }}
          >
            <Clock size={16} color={C.subtext} />
            <Text style={{ color: C.text, fontWeight: '800', fontSize: 14, marginLeft: 8 }}>View Full History</Text>
            <ChevronRight size={16} color={C.subtext} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>

        {/* Routines */}
        <View style={{ marginBottom: 32 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '900', color: C.text }}>Your Routines</Text>
            <TouchableOpacity onPress={() => router.push('/(dashboard)/gym/create-routine')}>
              <Text style={{ color: C.primary, fontWeight: '800', fontSize: 13 }}>+ Add Routine</Text>
            </TouchableOpacity>
          </View>

          {loading ? <ActivityIndicator color={C.primary} /> : routines.length === 0 ? (
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 24, alignItems: 'center' }}>
              <Text style={{ color: C.subtext, fontSize: 14, fontWeight: '700' }}>No workout routines created yet.</Text>
            </View>
          ) : (
            routines.map(r => (
              <View key={r._id} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/(dashboard)/gym/create-routine', params: { id: r._id } })}
                  style={{ flex: 1 }}
                >
                  <View>
                    <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>{r.routineName}</Text>
                    <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600', marginTop: 4 }}>{r.splitDays?.length || 0} Split Days</Text>
                  </View>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => deleteRoutine(r._id)} style={{ padding: 8, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginRight: 12 }}>
                    <Trash2 size={16} color="#ef4444" />
                  </TouchableOpacity>
                  <ChevronRight color={C.muted} size={18} />
                </View>
              </View>
            ))
          )}
        </View>

        {/* Gym Environments */}
        <View style={{ marginBottom: 32 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '900', color: C.text }}>Gym Environments</Text>
            <TouchableOpacity onPress={() => router.push('/(dashboard)/gym/create-gym')}>
              <Text style={{ color: C.primary, fontWeight: '800', fontSize: 13 }}>+ Add Gym</Text>
            </TouchableOpacity>
          </View>

          {loading ? <ActivityIndicator color={C.primary} /> : gyms.length === 0 ? (
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 24, alignItems: 'center' }}>
              <Text style={{ color: C.subtext, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>Define your gym inventory to get customized routines.</Text>
            </View>
          ) : (
            gyms.map(g => (
              <View key={g._id} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/(dashboard)/gym/create-gym', params: { id: g._id } })}
                  style={{ flex: 1 }}
                >
                  <View>
                    <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>{g.name}</Text>
                    <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600', marginTop: 4 }}>{g.selectedPreSeeded?.length || 0} Equipments Available</Text>
                  </View>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => deleteGym(g._id)} style={{ padding: 8, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginRight: 12 }}>
                    <Trash2 size={16} color="#ef4444" />
                  </TouchableOpacity>
                  <ChevronRight color={C.muted} size={18} />
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
