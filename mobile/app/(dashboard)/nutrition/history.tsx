import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, Activity } from 'lucide-react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWithAuth } from '../../../utils/api';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
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

  // Use focus effect so going back from Daily Log forces a refetch of history
  useFocusEffect(useCallback(() => { 
    // Always enforce the current weekStart when refocused to prevent stale UI
    loadHistory(); 
  }, [loadHistory]));

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
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 10, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: 16 }}>
          <ArrowLeft color={C.subtext} size={18} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 20, fontWeight: '900' }}>History</Text>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>Weekly Nutrition Logs</Text>
        </View>
      </View>

      {/* Week Selector */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.bg }}>
        <TouchableOpacity onPress={goToPrevWeek} style={{ padding: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border }}>
          <ChevronLeft color={C.subtext} size={20} />
        </TouchableOpacity>
        
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '900' }}>
            {formatShortDate(weekStart)} - {formatShortDate(weekEnd)}
          </Text>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginTop: 4, letterSpacing: 1 }}>Selected Week</Text>
        </View>

        <TouchableOpacity onPress={goToNextWeek} style={{ padding: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border }}>
          <ChevronRight color={C.subtext} size={20} />
        </TouchableOpacity>
      </View>

      {/* Daily Logs List */}
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <ActivityIndicator color={C.primary} size="large" />
          </View>
        ) : (
          daysOfWeek.map((dayDate, idx) => {
            const dateStr = getLocalDateString(dayDate);
            const logEntry = logs.find(l => l.date === dateStr);
            const isToday = dateStr === getLocalDateString(new Date());

            return (
              <TouchableOpacity
                key={dateStr}
                onPress={() => router.push(`/(dashboard)/nutrition/daily-log?date=${dateStr}`)}
                activeOpacity={0.8}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: isToday ? 'rgba(232,65,74,0.3)' : C.border,
                  padding: 20,
                  marginBottom: 16,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <CalendarDays color={isToday ? C.primary : C.muted} size={16} />
                    <Text style={{ color: isToday ? C.primary : C.text, fontSize: 15, fontWeight: '900', marginLeft: 8 }}>
                      {getDayName(dayDate)}, {formatShortDate(dayDate)} {isToday && '(Today)'}
                    </Text>
                  </View>
                  <ChevronRight color={C.border} size={16} />
                </View>

                {logEntry && logEntry.meals?.length > 0 ? (
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 16 }}>
                      <Text style={{ color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: -1 }}>
                        {Math.round(logEntry.dailyTotals?.calories || 0)}
                      </Text>
                      <Text style={{ color: C.primary, fontSize: 11, fontWeight: '900', marginLeft: 6, letterSpacing: 1 }}>KCAL</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 16 }}>
                      <View><Text style={{ color: C.text, fontSize: 15, fontWeight: '900' }}>{Math.round(logEntry.dailyTotals?.protein || 0)}g</Text><Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Protein</Text></View>
                      <View><Text style={{ color: C.text, fontSize: 15, fontWeight: '900' }}>{Math.round(logEntry.dailyTotals?.carbs || 0)}g</Text><Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Carbs</Text></View>
                      <View><Text style={{ color: C.text, fontSize: 15, fontWeight: '900' }}>{Math.round(logEntry.dailyTotals?.fats || 0)}g</Text><Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Fats</Text></View>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Activity color={C.muted} size={14} />
                    <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600', marginLeft: 8 }}>No data logged</Text>
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
