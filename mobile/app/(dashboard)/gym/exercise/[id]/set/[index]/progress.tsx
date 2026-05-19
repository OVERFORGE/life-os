import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Dimensions, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { fetchWithAuth } from '../../../../../../../utils/api';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react-native';
import { LineChart } from 'react-native-chart-kit';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)',
};

const SCREEN_W = Dimensions.get('window').width;

export default function SpecificSetProgressScreen() {
  const router = useRouter();
  const { id, index } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);

  const equipmentName = id ? decodeURIComponent(id as string) : '';
  const setIndex = parseInt((index as string) || '1', 10);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(
        `/gym/exercise-progress/set?equipmentName=${encodeURIComponent(equipmentName)}&setIndex=${setIndex}`
      );
      if (res.ok) setHistory(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (equipmentName) loadData(); }, [equipmentName, setIndex]);

  // ── Chart: date vs weight ──────────────────────────────────────
  const chartItems = history.slice(-10);
  const chartLabels = chartItems.map(h =>
    new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
  const chartData = chartItems.map(h => h.weight || 0);
  const hasData = chartData.length > 0 && chartData.some(v => v > 0);

  // ── Grade → Executioners color ─────────────────────────────────
  const gradeLabel = (grade: string) => {
    switch (grade) {
      case 'S': return { label: 'S', color: C.text };
      case 'A': return { label: 'A', color: C.text };
      case 'B': return { label: 'B', color: C.subtext };
      case 'C': return { label: 'C', color: C.muted };
      case 'D': return { label: 'D', color: C.primary };
      case 'F': return { label: 'F', color: C.primary };
      default:  return { label: grade, color: C.border };
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.card, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
          <ArrowLeft size={20} color={C.subtext} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: C.text, fontWeight: '900', fontSize: 18 }}>{equipmentName}</Text>
          <Text style={{ color: C.primary, fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>Set {setIndex}</Text>
        </View>
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
          </View>
        ) : !hasData ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 80, backgroundColor: C.card, padding: 32, borderRadius: 24, borderWidth: 1, borderColor: C.border }}>
            <BarChart2 color={C.border} size={48} style={{ marginBottom: 16 }} />
            <Text style={{ color: C.text, fontWeight: '900', fontSize: 18, marginBottom: 8 }}>No data yet</Text>
            <Text style={{ color: C.muted, textAlign: 'center', fontSize: 14 }}>Complete this set at least once to see your progress chart.</Text>
          </View>
        ) : (
          <>
            {/* Weight Chart */}
            <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 20, marginBottom: 24 }}>
              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
                Weight Over Time (kg)
              </Text>
              <LineChart
                data={{
                  labels: chartLabels.length > 5 ? chartLabels.filter((_, i) => i % 2 === 0) : chartLabels,
                  datasets: [{ data: chartData.length > 0 ? chartData : [0] }],
                }}
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

            {/* History list */}
            <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, marginLeft: 4 }}>
              Performance History
            </Text>
            {[...history].reverse().map((set: any, idx: number) => {
              const grade = set.progression?.overloadGrade || 'N/A';
              const { label, color } = gradeLabel(grade);
              const dateLabel = new Date(set.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              const delta = set.progression?.progressionDelta ?? 0;

              return (
                <View key={idx} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 20, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
                    <Text style={{ color: C.text, fontWeight: '900', fontSize: 14 }}>{dateLabel}</Text>
                    <View style={{ backgroundColor: `${color}20`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: `${color}50` }}>
                      <Text style={{ color, fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Grade {label}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View>
                      <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Weight</Text>
                      <Text style={{ color: C.text, fontWeight: '900', fontSize: 16 }}>{set.weight}kg</Text>
                    </View>
                    <View>
                      <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Reps</Text>
                      <Text style={{ color: C.text, fontWeight: '900', fontSize: 16 }}>
                        {set.reps}
                        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}> / {set.targetReps}</Text>
                      </Text>
                    </View>
                    <View>
                      <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Change</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {delta > 0
                          ? <TrendingUp size={14} color={C.text} />
                          : delta < 0
                          ? <TrendingDown size={14} color={C.primary} />
                          : <Minus size={14} color={C.muted} />
                        }
                        <Text style={{ color: delta > 0 ? C.text : delta < 0 ? C.primary : C.muted, fontWeight: '900', fontSize: 13, marginLeft: 4 }}>
                          {delta > 0 ? '+' : ''}{delta.toFixed ? delta.toFixed(1) : delta}kg
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
