import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, Dimensions } from 'react-native';
import { ArrowLeft, ChevronLeft, ChevronRight, Flame } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWithAuth } from '../../../utils/api';

const { width: SCREEN_W } = Dimensions.get('window');

const C = {
  bg: '#0f1115', card: '#161922', border: '#232632', border2: '#374151',
  text: '#f3f4f6', subtext: '#9ca3af', muted: '#6b7280',
  emerald: '#10b981', amber: '#f59e0b', red: '#ef4444',
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getLocalDateString(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekBounds(weekOffset: number): { start: Date; end: Date } {
  const now = new Date();
  // Go to start of current week (Monday)
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

function formatWeekLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function CaloriesChartScreen() {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [targetCalories, setTargetCalories] = useState(2000);

  const { start: weekStart, end: weekEnd } = getWeekBounds(weekOffset);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const startStr = getLocalDateString(weekStart);
      const endStr = getLocalDateString(weekEnd);
      const [logsRes, ctxRes] = await Promise.allSettled([
        fetchWithAuth(`/nutrition/log?startDate=${startStr}&endDate=${endStr}&_t=${Date.now()}`),
        fetchWithAuth('/health/context'),
      ]);
      if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
        const d = await logsRes.value.json();
        setLogs(d.logs || []);
      }
      if (ctxRes.status === 'fulfilled' && ctxRes.value.ok) {
        const d = await ctxRes.value.json();
        setTargetCalories(d.data?.biometrics?.targetCalories || 2000);
      }
    } catch (e) {
      console.error('Calories chart error:', e);
    } finally {
      setLoading(false);
    }
  }, [weekOffset]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Build 7-day array
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr = getLocalDateString(d);
    const log = logs.find(l => l.date === dateStr);
    return {
      date: d,
      dateStr,
      dayName: DAY_NAMES[i],
      calories: log?.dailyTotals?.calories || 0,
      hasData: !!log,
    };
  });

  const maxCal = Math.max(...days.map(d => d.calories || 0), (targetCalories || 2000) * 1.3, 500);
  const safeMax = isNaN(maxCal) || maxCal <= 0 ? 2600 : maxCal;
  const BAR_H = 180;

  const barColor = (cals: number) => {
    if (cals === 0) return C.border;
    if (cals <= targetCalories * 0.95) return C.emerald;
    if (cals <= targetCalories * 1.1) return C.amber;
    return C.red;
  };

  const todayStr = getLocalDateString(new Date());
  const totalCals = days.reduce((s, d) => s + d.calories, 0);
  const daysLogged = days.filter(d => d.hasData).length;
  const avgCals = daysLogged > 0 ? Math.round(totalCals / daysLogged) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: 16 }}>
          <ArrowLeft color={C.subtext} size={18} />
        </TouchableOpacity>
        <View>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>Calorie History</Text>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, marginTop: 1 }}>Weekly View</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* Week Navigator */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20 }}>
          <TouchableOpacity onPress={() => setWeekOffset(o => o - 1)} style={{ padding: 8, backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.border }}>
            <ChevronLeft color={C.subtext} size={18} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>{formatWeekLabel(weekStart, weekEnd)}</Text>
            <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginTop: 2, letterSpacing: 1 }}>
              {weekOffset === 0 ? 'Current Week' : weekOffset === -1 ? 'Last Week' : `${Math.abs(weekOffset)} weeks ago`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setWeekOffset(o => Math.min(0, o + 1))}
            style={{ padding: 8, backgroundColor: weekOffset === 0 ? C.border : C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.border, opacity: weekOffset === 0 ? 0.4 : 1 }}
            disabled={weekOffset === 0}
          >
            <ChevronRight color={C.subtext} size={18} />
          </TouchableOpacity>
        </View>

        {/* Summary Stats */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
          <View style={{ flex: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: C.text, fontSize: 22, fontWeight: '900' }}>{avgCals || '—'}</Text>
            <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>Avg / Day</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: C.text, fontSize: 22, fontWeight: '900' }}>{targetCalories}</Text>
            <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>Target</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: C.text, fontSize: 22, fontWeight: '900' }}>{daysLogged}/7</Text>
            <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>Days Logged</Text>
          </View>
        </View>

        {/* Bar Chart */}
        {loading ? (
          <View style={{ height: 250, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border }}>
            <ActivityIndicator color={C.emerald} size="large" />
          </View>
        ) : (
          <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <Flame color={C.amber} size={14} />
              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', marginLeft: 8 }}>Daily Calories</Text>
            </View>

            {/* Target line label */}
            <View style={{ position: 'relative', height: BAR_H + 32 }}>
              {/* Target dashed line */}
              <View style={{
                position: 'absolute',
                left: 0, right: 0,
                top: BAR_H - ((targetCalories || 2000) / safeMax) * BAR_H,
                height: 1,
                borderStyle: 'dashed',
                borderWidth: 1,
                borderColor: C.amber + '80',
              }} />
              <Text style={{
                position: 'absolute',
                right: 0,
                top: BAR_H - ((targetCalories || 2000) / safeMax) * BAR_H - 14,
                color: C.amber,
                fontSize: 9,
                fontWeight: '700',
              }}>{targetCalories} target</Text>

              {/* Bars */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_H, gap: 6 }}>
                {days.map((day, i) => {
                  const barH = day.calories > 0 ? Math.max(10, (day.calories / safeMax) * BAR_H) : 4;
                  const isToday = day.dateStr === todayStr;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: BAR_H }}>
                      {day.calories > 0 && (
                        <Text style={{ color: C.text, fontSize: 8, fontWeight: '700', marginBottom: 2 }}>
                          {Math.round(day.calories)}
                        </Text>
                      )}
                      <View style={{
                        width: '100%',
                        height: barH,
                        backgroundColor: barColor(day.calories),
                        borderRadius: 6,
                        borderWidth: isToday ? 1 : 0,
                        borderColor: C.text,
                        opacity: isToday ? 1 : 0.8,
                      }} />
                    </View>
                  );
                })}
              </View>

              {/* X axis day names */}
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                {days.map((day, i) => {
                  const isToday = day.dateStr === todayStr;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ color: isToday ? C.emerald : C.muted, fontSize: 9, fontWeight: isToday ? '800' : '600' }}>{day.dayName}</Text>
                      <Text style={{ color: C.muted, fontSize: 8 }}>{day.date.getDate()}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Legend */}
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[{ color: C.emerald, label: 'Under target' }, { color: C.amber, label: 'On target' }, { color: C.red, label: 'Over target' }].map(l => (
                <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
                  <Text style={{ color: C.muted, fontSize: 10 }}>{l.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
