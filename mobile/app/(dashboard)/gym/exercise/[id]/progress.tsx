import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, SafeAreaView, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { fetchWithAuth } from '../../../../../utils/api';
import { ArrowLeft, Target, TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react-native';
import { LineChart } from 'react-native-chart-kit';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)',
};

const SCREEN_W = Dimensions.get('window').width;

/** Map performance grade to a palette-only tint */
function gradeStyle(grade: string): { color: string; bg: string; border: string } {
  switch (grade) {
    case 'S': return { color: C.text,    bg: 'rgba(255,253,252,0.08)', border: 'rgba(255,253,252,0.2)' };
    case 'A': return { color: C.subtext, bg: 'rgba(236,231,227,0.08)', border: 'rgba(236,231,227,0.2)' };
    case 'B': return { color: C.subtext, bg: 'rgba(236,231,227,0.06)', border: 'rgba(236,231,227,0.15)' };
    case 'C': return { color: C.muted,   bg: 'rgba(42,43,47,0.6)',     border: C.border };
    case 'D': return { color: C.primary, bg: C.primaryBg,              border: 'rgba(232,65,74,0.2)' };
    case 'F': return { color: C.primary, bg: C.primaryBg,              border: 'rgba(232,65,74,0.4)' };
    default:  return { color: C.muted,   bg: C.card,                   border: C.border };
  }
}

/** Score → single color from palette */
function scoreColor(score: number) {
  if (score >= 70) return C.text;
  if (score >= 40) return C.subtext;
  return C.primary;
}

export default function ExerciseProgressScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const equipmentName = id ? decodeURIComponent(id as string) : '';

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/gym/exercise-progress?equipmentName=${encodeURIComponent(equipmentName)}`);
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (equipmentName) loadData(); }, [equipmentName]);

  // ── Chart: date vs average weight of that session's sets ────────
  const buildChart = () => {
    if (!data?.history?.length) return null;
    // history is newest first; reverse for chronological
    const chrono = [...data.history].reverse().slice(-10);
    const labels = chrono.map((h: any) =>
      new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    );
    const weights = chrono.map((h: any) => h.weight || 0);
    if (!weights.some(w => w > 0)) return null;
    return { labels: labels.length > 5 ? labels.filter((_, i) => i % 2 === 0) : labels, weights };
  };

  const chart = buildChart();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.card, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
          <ArrowLeft size={20} color={C.subtext} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '900', color: C.text, flex: 1, textAlign: 'center' }}>{equipmentName}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor={C.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={{ color: C.muted, marginTop: 16, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Loading Intelligence...</Text>
          </View>
        ) : !data ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 80, backgroundColor: C.card, padding: 32, borderRadius: 24, borderWidth: 1, borderColor: C.border }}>
            <BarChart2 color={C.border} size={48} style={{ marginBottom: 16 }} />
            <Text style={{ color: C.text, fontWeight: '900', fontSize: 18, marginBottom: 8 }}>No data yet</Text>
            <Text style={{ color: C.muted, textAlign: 'center', fontSize: 14 }}>Log this exercise at least once to unlock AI analysis.</Text>
          </View>
        ) : (
          <>
            {/* ── Score Card ── */}
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 24, marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: C.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>Intelligence Score</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={{ color: scoreColor(data.score), fontWeight: '900', fontSize: 44 }}>{data.score}</Text>
                  <Text style={{ color: C.muted, fontSize: 18, marginLeft: 4 }}>/100</Text>
                </View>
              </View>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${scoreColor(data.score)}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: `${scoreColor(data.score)}40` }}>
                <Text style={{ color: scoreColor(data.score), fontWeight: '900', fontSize: 22 }}>{data.score >= 70 ? '↑' : data.score >= 40 ? '→' : '↓'}</Text>
              </View>
            </View>

            {/* ── Weight Chart ── */}
            {chart && (
              <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 20, marginBottom: 24 }}>
                <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
                  Weight Trend (kg)
                </Text>
                <LineChart
                  data={{ labels: chart.labels, datasets: [{ data: chart.weights }] }}
                  width={SCREEN_W - 80}
                  height={180}
                  yAxisSuffix="kg"
                  chartConfig={{
                    backgroundColor: C.card,
                    backgroundGradientFrom: C.card,
                    backgroundGradientTo: C.card,
                    decimalPlaces: 1,
                    color: (opacity = 1) => `rgba(232,65,74,${opacity})`,
                    labelColor: () => 'rgba(236,231,227,0.4)',
                    style: { borderRadius: 16 },
                    propsForDots: { r: '5', strokeWidth: '2', stroke: C.primary },
                    propsForBackgroundLines: { stroke: C.border },
                  }}
                  bezier
                  style={{ marginLeft: -10, borderRadius: 16 }}
                />
              </View>
            )}

            {/* ── AI Insights ── */}
            {data.insights?.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, marginLeft: 4 }}>AI Analysis</Text>
                {data.insights.map((insight: string, idx: number) => (
                  <View key={idx} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Target size={15} color={C.primary} style={{ marginTop: 2, marginRight: 12 }} />
                    <Text style={{ color: C.subtext, lineHeight: 22, fontWeight: '600', flex: 1, fontSize: 14 }}>{insight}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── History Breakdown ── */}
            <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, marginLeft: 4 }}>
              Set History
            </Text>

            {data.history?.map((set: any, idx: number) => {
              const grade = set.progression?.overloadGrade || 'N/A';
              const gs = gradeStyle(grade);
              const dateLabel = new Date(set.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const delta = set.progression?.progressionDelta ?? 0;

              return (
                <View key={idx} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 20, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ color: C.text, fontWeight: '900', fontSize: 14 }}>{dateLabel}</Text>
                      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginLeft: 10 }}>Set {set.setIndex}</Text>
                    </View>
                    <View style={{ backgroundColor: gs.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: gs.border }}>
                      <Text style={{ color: gs.color, fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Grade {grade}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Performance</Text>
                      <Text style={{ color: C.text, fontWeight: '900', fontSize: 16 }}>{set.weight}kg × {set.reps}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Target</Text>
                      <Text style={{ color: C.text, fontWeight: '900', fontSize: 16 }}>{set.targetReps} reps</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Change</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {delta > 0
                          ? <TrendingUp size={13} color={C.text} />
                          : delta < 0
                          ? <TrendingDown size={13} color={C.primary} />
                          : <Minus size={13} color={C.muted} />}
                        <Text style={{ color: delta > 0 ? C.text : delta < 0 ? C.primary : C.muted, fontWeight: '900', fontSize: 14, marginLeft: 4 }}>
                          {delta > 0 ? '+' : ''}{typeof delta === 'number' ? delta.toFixed(1) : delta}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}

            {(!data.history || data.history.length === 0) && (
              <View style={{ padding: 32, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, borderRadius: 20 }}>
                <Text style={{ color: C.muted, fontWeight: '600' }}>No set history available yet.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
