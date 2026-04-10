import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Calendar, Trash2, Clock, PenLine } from 'lucide-react-native';
import { useState, useCallback } from 'react';
import { fetchWithAuth } from '../../../utils/api';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';

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
    <View className="flex-1 bg-[#0f1115]">
      {/* Header */}
      <View className="flex-row items-center px-5 pt-12 pb-4 border-b border-[#232632] bg-[#0f1115]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 mr-2 bg-[#1b1f2a] rounded-full">
          <ArrowLeft size={20} color="#fcd34d" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-100 flex-1">Workout History</Text>
      </View>

      <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>
        {loading ? (
          <ActivityIndicator color="#fcd34d" className="mt-10" />
        ) : weeklyGroups.length === 0 ? (
          <View className="bg-[#161922] border border-[#232632] rounded-xl p-6 items-center mt-4">
            <Calendar size={40} color="#4b5563" className="mb-4" />
            <Text className="text-gray-300 font-semibold mb-2 text-lg">No Workouts Found</Text>
            <Text className="text-gray-500 text-center text-sm">
              You haven't logged any past sessions. They will show up here once you do.
            </Text>
          </View>
        ) : (
          weeklyGroups.map((week) => (
            <View key={week.monday.toISOString()} className="mb-6">
              <View className="flex-row items-center justify-between mb-3 border-b border-[#232632] pb-2">
                <Text className="text-gray-400 font-semibold uppercase tracking-wider text-xs">
                  {week.label}
                </Text>
                <Text className="text-gray-500 text-xs">{week.sessions.length} sessions</Text>
              </View>

              {week.sessions.map((s) => (
                <View key={s._id} className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-3 flex-row justify-between items-center">
                  <View className="flex-1">
                    <Text className="text-gray-100 font-bold text-base mb-1">{s.splitDayName || 'Freestyle Session'}</Text>
                    
                    <View className="flex-row items-center">
                      <Calendar size={12} color="#6b7280" />
                      <Text className="text-gray-500 text-xs ml-1.5 mr-3">
                        {new Date(s.date || s.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                      
                      <Clock size={12} color="#6b7280" />
                      <Text className="text-gray-500 text-xs ml-1.5 mr-3">
                        {formatDuration(s.durationSeconds)}
                      </Text>

                      {s.exercises && s.exercises.length > 0 && (
                        <Text className="text-amber-500/80 text-xs font-semibold">
                          {s.exercises.length} exercises
                        </Text>
                      )}
                    </View>
                  </View>
                  
                  <View className="flex-row space-x-2">
                    <TouchableOpacity 
                      onPress={() => router.push({ pathname: '/(dashboard)/gym/edit-session', params: { id: s._id } })}
                      className="p-3 bg-[#1b1f2a] rounded-full border border-[#232632]"
                    >
                      <PenLine size={16} color="#fcd34d" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => deleteSession(s._id)} 
                      className="p-3 bg-[#1b1f2a] rounded-full border border-[#232632]"
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
    </View>
  );
}
