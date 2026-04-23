import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, Dimensions } from 'react-native';
import { ArrowLeft, ChevronLeft, ChevronRight, Scale, Flame } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWithAuth } from '../../../utils/api';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 48;

const C = {
  bg: '#0f1115', card: '#161922', border: '#232632', border2: '#374151',
  text: '#f3f4f6', subtext: '#9ca3af', muted: '#6b7280',
  emerald: '#10b981', emeraldBg: 'rgba(16,185,129,0.1)',
  amber: '#f59e0b', purple: '#818cf8',
};

function LineChart({ data, color = C.emerald, unit = 'kg' }: { data: { label: string; value: number | null }[]; color?: string; unit?: string }) {
  const values = data.map(d => d.value).filter(v => v !== null) as number[];
  if (values.length === 0) return (
    <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.muted, fontSize: 13 }}>No data available</Text>
    </View>
  );

  const min = Math.min(...values) - 0.5;
  const max = Math.max(...values) + 0.5;
  const range = max - min || 1;
  const H = 140;
  const W = CHART_W - 32;
  const step = W / Math.max(data.length - 1, 1);

  const toY = (v: number) => H - ((v - min) / range) * H;

  // Build SVG-style path points
  const points = data.map((d, i) => ({
    x: i * step,
    y: d.value !== null ? toY(d.value) : null,
    label: d.label,
    value: d.value,
  }));

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
      {/* Y axis labels */}
      <View style={{ position: 'absolute', left: 0, top: 8, bottom: 8, justifyContent: 'space-between' }}>
        <Text style={{ color: C.muted, fontSize: 9 }}>{max.toFixed(1)}</Text>
        <Text style={{ color: C.muted, fontSize: 9 }}>{((max + min) / 2).toFixed(1)}</Text>
        <Text style={{ color: C.muted, fontSize: 9 }}>{min.toFixed(1)}</Text>
      </View>
      {/* Chart area */}
      <View style={{ marginLeft: 28, height: H + 24 }}>
        {/* Grid lines */}
        {[0, 0.5, 1].map(p => (
          <View key={p} style={{ position: 'absolute', left: 0, right: 0, top: p * H, height: 1, backgroundColor: C.border, opacity: 0.5 }} />
        ))}
        {/* Line segments */}
        {points.map((pt, i) => {
          if (i === 0 || pt.y === null) return null;
          const prev = points[i - 1];
          if (prev.y === null) return null;
          const dx = pt.x - prev.x;
          const dy = pt.y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View key={i} style={{
              position: 'absolute',
              left: prev.x,
              top: prev.y,
              width: len,
              height: 2,
              backgroundColor: color,
              opacity: 0.8,
              transformOrigin: '0 50%',
              transform: [{ rotate: `${angle}deg` }],
            }} />
          );
        })}
        {/* Dots + labels */}
        {points.map((pt, i) => pt.y !== null && (
          <View key={i} style={{ position: 'absolute', left: pt.x - 4, top: pt.y - 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, borderWidth: 2, borderColor: C.bg }} />
            {pt.value !== null && i % Math.max(1, Math.floor(points.length / 5)) === 0 && (
              <Text style={{ position: 'absolute', top: -18, left: -12, color: C.text, fontSize: 9, fontWeight: '700', width: 32, textAlign: 'center' }}>
                {pt.value.toFixed(1)}{unit}
              </Text>
            )}
          </View>
        ))}
        {/* X axis labels */}
        <View style={{ position: 'absolute', top: H + 6, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between' }}>
          {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 5)) === 0 || i === points.length - 1).map((pt, i) => (
            <Text key={i} style={{ color: C.muted, fontSize: 8 }}>{pt.label}</Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function BarChart({ data, color = C.purple }: { data: { label: string; value: number | null }[]; color?: string }) {
  const values = data.map(d => d.value).filter(v => v !== null) as number[];
  if (values.length === 0) return (
    <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.muted, fontSize: 13 }}>Not enough data yet</Text>
    </View>
  );

  const max = Math.max(...values);
  const H = 100;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H + 24, paddingHorizontal: 8, gap: 6 }}>
      {data.map((d, i) => {
        const barH = d.value !== null ? (d.value / max) * H : 0;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            {d.value !== null && (
              <Text style={{ color: C.text, fontSize: 9, fontWeight: '700', marginBottom: 4 }}>
                {Math.round(d.value)}
              </Text>
            )}
            <View style={{
              width: '100%',
              height: barH || 4,
              backgroundColor: d.value !== null ? color : C.border,
              borderRadius: 4,
              opacity: d.value !== null ? 0.85 : 0.3,
            }} />
            <Text style={{ color: C.muted, fontSize: 8, marginTop: 4, textAlign: 'center' }}>{d.label.replace(/\s*\(.*?\)/, '')}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function WeightTrendScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/health/weight-trend?_t=${Date.now()}`);
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error('Weight trend load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const weightLogs: { date: string; weight: number }[] = data?.weightLogs || [];
  const weeklyData: any[] = data?.weeklyData || [];
  const monthlyAvg: number | null = data?.monthlyAvg ?? null;
  const currentWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight : null;

  // Weight chart — show up to 30 data points
  const weightChartData = weightLogs.slice(-30).map(w => ({
    label: w.date.slice(5), // MM-DD
    value: w.weight,
  }));

  // Maintenance chart
  const maintenanceChartData = weeklyData.map(w => ({
    label: w.weekLabel,
    value: w.maintenanceEstimate,
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: 16 }}>
          <ArrowLeft color={C.subtext} size={18} />
        </TouchableOpacity>
        <View>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>Weight Trend</Text>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, marginTop: 1 }}>Monthly Overview</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.emerald} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

          {/* Stats Row */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
            <View style={{ flex: 1, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16, alignItems: 'center' }}>
              <Scale color={C.emerald} size={18} style={{ marginBottom: 6 }} />
              <Text style={{ color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: -1 }}>{currentWeight ?? '—'}</Text>
              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Current (kg)</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16, alignItems: 'center' }}>
              <Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Monthly Avg</Text>
              <Text style={{ color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: -1 }}>{monthlyAvg ?? '—'}</Text>
              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>kg</Text>
            </View>
          </View>

          {/* Weight Line Chart */}
          <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 20, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Scale color={C.emerald} size={14} />
              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', marginLeft: 8 }}>Weight History</Text>
            </View>
            {weightChartData.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 32 }}>
                <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center' }}>
                  No weight data yet.{'\n'}Tell the Health AI "I weigh 85kg" to start tracking.
                </Text>
              </View>
            ) : (
              <LineChart data={weightChartData} color={C.emerald} unit="kg" />
            )}
          </View>

          {/* Maintenance Calorie Estimate Chart */}
          <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 20, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Flame color={C.amber} size={14} />
              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', marginLeft: 8 }}>Estimated Maintenance Calories</Text>
            </View>
            <Text style={{ color: C.muted, fontSize: 11, marginBottom: 16, lineHeight: 16 }}>
              Calculated from weekly weight change vs. average calories eaten. Based on ≈7700 kcal per kg of body mass.
            </Text>
            <BarChart data={maintenanceChartData} color={C.amber} />
          </View>

          {/* Weekly Breakdown */}
          <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 20 }}>
            <Text style={{ color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 }}>Weekly Breakdown</Text>
            {weeklyData.map((week, i) => (
              <View key={i} style={{ borderBottomWidth: i < weeklyData.length - 1 ? 1 : 0, borderBottomColor: C.border, paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>{week.weekLabel}</Text>
                  {week.maintenanceEstimate ? (
                    <View style={{ backgroundColor: C.amber + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                      <Text style={{ color: C.amber, fontSize: 11, fontWeight: '800' }}>{Math.round(week.maintenanceEstimate)} kcal maint.</Text>
                    </View>
                  ) : (
                    <Text style={{ color: C.muted, fontSize: 11 }}>Insufficient data</Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                  {week.startWeight && <Text style={{ color: C.muted, fontSize: 11 }}>Start: <Text style={{ color: C.subtext }}>{week.startWeight}kg</Text></Text>}
                  {week.endWeight && <Text style={{ color: C.muted, fontSize: 11 }}>End: <Text style={{ color: C.subtext }}>{week.endWeight}kg</Text></Text>}
                  {week.avgCalories && <Text style={{ color: C.muted, fontSize: 11 }}>Avg: <Text style={{ color: C.subtext }}>{week.avgCalories} kcal/day</Text></Text>}
                </View>
              </View>
            ))}
          </View>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}
