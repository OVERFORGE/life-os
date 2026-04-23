import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, Activity } from 'lucide-react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWithAuth } from '../../../utils/api';

const COLORS = {
  bg: '#0f1115', card: '#161922', border: '#232632', border2: '#374151',
  text: '#f3f4f6', subtext: '#9ca3af', muted: '#6b7280',
  emerald: '#10b981', emeraldBg: 'rgba(16,185,129,0.1)',
};

// --- Date Utils ---
function getMonday(d: Date) {
  d = new Date(d);
  var day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1); 
  return new Date(d.setDate(diff));
}

function addDays(d: Date, days: number) {
  var copy = new Date(Number(d));
  copy.setDate(d.getDate() + days);
  return copy;
}

// Ensure we get the local YYYY-MM-DD string, avoiding UTC timezone drift
function getLocalDateString(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDayName(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export default function NutritionHistoryScreen() {
  const router = useRouter();
  
  // Base date for the week being viewed, initialized to today's week
  const [weekStart, setWeekStart] = useState<Date>(getMonday(new Date()));
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const startStr = getLocalDateString(weekStart);
      const endStr = getLocalDateString(weekEnd);
      
      const res = await fetchWithAuth(`/nutrition/log?startDate=${startStr}&endDate=${endStr}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('History Fetch Error:', err);
      }
    } catch (e) {
      console.error('Network Error:', e);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useFocusEffect(useCallback(() => { loadHistory(); }, [loadHistory]));

  // Generate 7 days for the current week
  const daysOfWeek = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(weekStart, i));
    }
    return days;
  }, [weekStart]);

  const goToPrevWeek = () => setWeekStart(prev => addDays(prev, -7));
  const goToNextWeek = () => setWeekStart(prev => addDays(prev, 7));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, marginRight: 16 }}>
          <ArrowLeft color={COLORS.subtext} size={18} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '800' }}>History</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 1 }}>Weekly Nutrition Logs</Text>
        </View>
      </View>

      {/* Week Selector */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <TouchableOpacity onPress={goToPrevWeek} style={{ padding: 10, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border }}>
          <ChevronLeft color={COLORS.subtext} size={20} />
        </TouchableOpacity>
        
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '800' }}>
            {formatShortDate(weekStart)} - {formatShortDate(weekEnd)}
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 2, letterSpacing: 1 }}>Current Week</Text>
        </View>

        <TouchableOpacity onPress={goToNextWeek} style={{ padding: 10, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border }}>
          <ChevronRight color={COLORS.subtext} size={20} />
        </TouchableOpacity>
      </View>

      {/* Daily Logs List */}
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <ActivityIndicator color={COLORS.emerald} size="large" />
          </View>
        ) : (
          daysOfWeek.map((dayDate, idx) => {
            const dateStr = getLocalDateString(dayDate);
            const logEntry = logs.find(l => l.date === dateStr);
            const isToday = dateStr === getLocalDateString(new Date());

            return (
              <TouchableOpacity
                key={dateStr}
                onPress={() => router.push(`/nutrition/daily-log?date=${dateStr}`)}
                activeOpacity={0.8}
                style={{
                  backgroundColor: COLORS.card,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: isToday ? COLORS.emerald + '40' : COLORS.border,
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <CalendarDays color={isToday ? COLORS.emerald : COLORS.subtext} size={16} />
                    <Text style={{ color: isToday ? COLORS.emerald : COLORS.text, fontSize: 14, fontWeight: '800', marginLeft: 8 }}>
                      {getDayName(dayDate)}, {formatShortDate(dayDate)} {isToday && '(Today)'}
                    </Text>
                  </View>
                  <ChevronRight color={COLORS.border2} size={16} />
                </View>

                {logEntry && logEntry.meals?.length > 0 ? (
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 }}>
                      <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: '900', letterSpacing: -1 }}>
                        {Math.round(logEntry.dailyTotals?.calories || 0)}
                      </Text>
                      <Text style={{ color: COLORS.emerald, fontSize: 12, fontWeight: '800', marginLeft: 6 }}>KCAL</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 }}>
                      <View><Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '700' }}>{Math.round(logEntry.dailyTotals?.protein || 0)}g</Text><Text style={{ color: COLORS.muted, fontSize: 10, textTransform: 'uppercase' }}>Protein</Text></View>
                      <View><Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '700' }}>{Math.round(logEntry.dailyTotals?.carbs || 0)}g</Text><Text style={{ color: COLORS.muted, fontSize: 10, textTransform: 'uppercase' }}>Carbs</Text></View>
                      <View><Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '700' }}>{Math.round(logEntry.dailyTotals?.fats || 0)}g</Text><Text style={{ color: COLORS.muted, fontSize: 10, textTransform: 'uppercase' }}>Fats</Text></View>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', opacity: 0.5 }}>
                    <Activity color={COLORS.muted} size={14} />
                    <Text style={{ color: COLORS.muted, fontSize: 13, fontWeight: '600', marginLeft: 6 }}>No data logged</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
