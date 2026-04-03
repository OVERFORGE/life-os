import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Dumbbell, Play, ChevronRight, Trash2, ChevronDown, ChevronUp, Clock, Calendar, Flame } from 'lucide-react-native';
import { useState } from 'react';
import { fetchWithAuth } from '../../../utils/api';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback } from 'react';

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
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

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

  useFocusEffect(
    useCallback(() => {
      loadGymData();
    }, [loadGymData])
  );

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

  const toggleWeek = (key: string) => {
    const next = new Set(expandedWeeks);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedWeeks(next);
  };

  const weeklyGroups = groupSessionsByWeek(sessions);
  const currentWeekSessions = weeklyGroups.find(w => isCurrentWeek(w.monday))?.sessions || [];

  return (
    <ScrollView className="flex-1 bg-[#0f1115] px-5 pt-4" contentContainerStyle={{ paddingBottom: 120 }}>
      <View className="flex-row justify-between items-center mb-8">
        <View className="flex-row items-center">
          <Dumbbell size={28} color="#fcd34d" />
          <Text className="text-2xl font-bold text-gray-100 ml-3">Gym Session</Text>
        </View>
      </View>

      {/* Start Live Session */}
      <TouchableOpacity
        onPress={() => router.push('/(dashboard)/gym/live-session')}
        className="bg-amber-500 rounded-2xl p-5 mb-8 flex-row items-center justify-between shadow-xl shadow-amber-500/20"
      >
        <View>
          <Text className="font-bold text-black text-xl mb-1">Start Workout</Text>
          <Text className="text-amber-900 font-medium">Log your active session</Text>
        </View>
        <View className="bg-black/10 rounded-full p-2">
          <Play size={24} color="#000" fill="#000" />
        </View>
      </TouchableOpacity>

      {/* This Week */}
      <View className="mb-8">
        <View className="flex-row items-center mb-4">
          <Flame size={18} color="#f97316" />
          <Text className="text-lg font-semibold text-gray-100 ml-2">This Week</Text>
          <View className="bg-amber-500/20 px-2 py-0.5 rounded-full ml-3">
            <Text className="text-amber-400 text-xs font-bold">{currentWeekSessions.length} sessions</Text>
          </View>
        </View>

        {currentWeekSessions.length === 0 ? (
          <View className="bg-[#161922] border border-[#232632] rounded-xl p-5 items-center">
            <Text className="text-gray-500">No sessions logged this week yet. Start one!</Text>
          </View>
        ) : (
          currentWeekSessions.map(s => (
            <View key={s._id} className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-3">
              <View className="flex-row justify-between items-start">
                <View className="flex-1">
                  <Text className="text-gray-100 font-semibold text-base">{s.splitDayName || 'Freestyle'}</Text>
                  <View className="flex-row items-center mt-1.5">
                    <Calendar size={12} color="#6b7280" />
                    <Text className="text-gray-500 text-xs ml-1.5">
                      {new Date(s.date || s.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                    <Clock size={12} color="#6b7280" className="ml-3" />
                    <Text className="text-gray-500 text-xs ml-1.5">{formatDuration(s.durationSeconds)}</Text>
                  </View>
                  <Text className="text-gray-600 text-xs mt-1">{s.exercises?.length || 0} exercises</Text>
                </View>
                <TouchableOpacity onPress={() => deleteSession(s._id)} className="p-2">
                  <Trash2 size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* All Sessions (Collapsible by Week) */}
      <View className="mb-8">
        <TouchableOpacity
          onPress={() => setShowAllSessions(!showAllSessions)}
          className="flex-row items-center justify-between mb-4"
        >
          <View className="flex-row items-center">
            <Calendar size={18} color="#6b7280" />
            <Text className="text-lg font-semibold text-gray-100 ml-2">All Sessions</Text>
          </View>
          {showAllSessions ? <ChevronUp size={20} color="#6b7280" /> : <ChevronDown size={20} color="#6b7280" />}
        </TouchableOpacity>

        {showAllSessions && (
          <View>
            {weeklyGroups.length === 0 ? (
              <View className="bg-[#161922] border border-[#232632] rounded-xl p-5 items-center">
                <Text className="text-gray-500">No sessions recorded yet.</Text>
              </View>
            ) : (
              weeklyGroups.map(week => {
                const weekKey = week.monday.toISOString();
                const isExpanded = expandedWeeks.has(weekKey);
                return (
                  <View key={weekKey} className="mb-3">
                    <TouchableOpacity
                      onPress={() => toggleWeek(weekKey)}
                      className="bg-[#1b1f2a] border border-[#232632] rounded-xl p-4 flex-row items-center justify-between"
                    >
                      <View>
                        <Text className="text-gray-200 font-semibold">{week.label}</Text>
                        <Text className="text-gray-500 text-xs mt-0.5">{week.sessions.length} session{week.sessions.length !== 1 ? 's' : ''}</Text>
                      </View>
                      {isExpanded ? <ChevronUp size={18} color="#4b5563" /> : <ChevronDown size={18} color="#4b5563" />}
                    </TouchableOpacity>

                    {isExpanded && (
                      <View className="mt-2 pl-3">
                        {week.sessions.map(s => (
                          <View key={s._id} className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-2">
                            <View className="flex-row justify-between items-start">
                              <View className="flex-1">
                                <Text className="text-gray-100 font-semibold">{s.splitDayName || 'Freestyle Session'}</Text>
                                <View className="flex-row items-center mt-1">
                                  <Text className="text-gray-500 text-xs">
                                    {new Date(s.date || s.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                  </Text>
                                  <Text className="text-gray-600 text-xs ml-3">{formatDuration(s.durationSeconds)}</Text>
                                  <Text className="text-gray-600 text-xs ml-3">{s.exercises?.length || 0} exercises</Text>
                                </View>
                              </View>
                              <TouchableOpacity onPress={() => deleteSession(s._id)} className="p-2">
                                <Trash2 size={14} color="#ef4444" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>

      {/* Routines */}
      <View className="mb-8">
        <View className="flex-row justify-between items-end mb-4">
          <Text className="text-lg font-semibold text-gray-100">Your Routines</Text>
          <TouchableOpacity onPress={() => router.push('/(dashboard)/gym/create-routine')}>
            <Text className="text-amber-500 font-medium">+ Add Routine</Text>
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator color="#fcd34d" /> : routines.length === 0 ? (
          <View className="bg-[#161922] border border-[#232632] rounded-xl p-5 items-center">
            <Text className="text-gray-500">No workout routines created yet.</Text>
          </View>
        ) : (
          routines.map(r => (
            <View key={r._id} className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-3 flex-row justify-between items-center">
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/(dashboard)/gym/create-routine', params: { id: r._id } })}
                className="flex-1"
              >
                <View>
                  <Text className="text-gray-100 font-semibold text-base">{r.routineName}</Text>
                  <Text className="text-gray-500 text-sm mt-1">{r.splitDays?.length || 0} Split Days</Text>
                </View>
              </TouchableOpacity>
              <View className="flex-row items-center">
                <TouchableOpacity onPress={() => deleteRoutine(r._id)} className="p-2">
                  <Trash2 size={18} color="#ef4444" />
                </TouchableOpacity>
                <ChevronRight color="#4b5563" size={20} />
              </View>
            </View>
          ))
        )}
      </View>

      {/* Gym Environments */}
      <View className="mb-8">
        <View className="flex-row justify-between items-end mb-4">
          <Text className="text-lg font-semibold text-gray-100">Gym Environments</Text>
          <TouchableOpacity onPress={() => router.push('/(dashboard)/gym/create-gym')}>
            <Text className="text-amber-500 font-medium">+ Add Gym</Text>
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator color="#fcd34d" /> : gyms.length === 0 ? (
          <View className="bg-[#161922] border border-[#232632] rounded-xl p-5 items-center">
            <Text className="text-gray-500 text-center">Define your gym inventory to get customized routines.</Text>
          </View>
        ) : (
          gyms.map(g => (
            <View key={g._id} className="bg-[#1b1f2a] border border-[#232632] rounded-xl p-4 mb-3 flex-row justify-between items-center">
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/(dashboard)/gym/create-gym', params: { id: g._id } })}
                className="flex-1"
              >
                <View>
                  <Text className="text-gray-200 font-semibold">{g.name}</Text>
                  <Text className="text-gray-500 text-xs mt-1">{g.selectedPreSeeded?.length || 0} Equipments Available</Text>
                </View>
              </TouchableOpacity>
              <View className="flex-row items-center">
                <TouchableOpacity onPress={() => deleteGym(g._id)} className="p-2">
                  <Trash2 size={18} color="#ef4444" />
                </TouchableOpacity>
                <ChevronRight color="#4b5563" size={20} />
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
