import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWithAuth } from '../../../../utils/api';
import { ArrowLeft, Plus } from 'lucide-react-native';

export default function GoalsListScreen() {
  const router = useRouter();
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    try {
      const [goalsRes, pressureRes] = await Promise.all([
        fetchWithAuth('/goals/list'),
        fetchWithAuth('/insights/goal-adaptations')
      ]);

      let goalsData = [];
      let pressureData = { suggestions: [] };

      if (goalsRes.ok) goalsData = await goalsRes.json();
      if (pressureRes.ok) pressureData = await pressureRes.json();

      const pressureMap = new Map((pressureData?.suggestions || []).map((s: any) => [s.goalId, s]));

      const merged = goalsData.map((g: any) => ({
        ...g,
        pressure: pressureMap.get(g._id)?.pressure || null,
      }));

      setGoals(merged);
    } catch (e) {
      console.error("Error loading goals:", e);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadGoals(); }, [loadGoals]));

  async function bootstrap() {
    setBootstrapping(true);
    await fetchWithAuth('/goals/bootstrap', { method: 'POST' });
    await loadGoals();
    setBootstrapping(false);
  }

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: '#161618', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#E8414A" />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#161618' }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#2A2B2F', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}
          >
            <ArrowLeft color="rgba(236,231,227,0.7)" size={17} />
          </TouchableOpacity>
          <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 17 }}>Global Goals</Text>
        </View>
        <TouchableOpacity 
          onPress={() => router.push('/(dashboard)/tools/goals/new')}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(232,65,74,0.1)', borderWidth: 1, borderColor: 'rgba(232,65,74,0.25)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Plus size={18} color="#E8414A" />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {goals.length === 0 ? (
          <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 30, alignItems: 'center', marginTop: 40 }}>
            <Text style={{ color: 'rgba(236,231,227,0.6)', textAlign: 'center', marginBottom: 24, fontSize: 14 }}>
              You don't have any goals yet.
            </Text>
            <TouchableOpacity 
              onPress={bootstrap} 
              disabled={bootstrapping}
              style={{ backgroundColor: '#E8414A', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 }}
            >
              <Text style={{ color: '#FFFDFC', fontWeight: '800' }}>{bootstrapping ? 'Creating...' : 'Create Starter Goals'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          goals.map(g => {
            const score = g.stats?.currentScore ?? 0;
            const state = g.stats?.state ?? 'unknown';

            return (
              <TouchableOpacity
                key={g._id}
                activeOpacity={0.8}
                onPress={() => router.push(`/(dashboard)/tools/goals/${g._id}`)}
                style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 12 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <View style={{ flex: 1, marginRight: 16 }}>
                    <Text style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 16, marginBottom: 4 }}>{g.title}</Text>
                    {g.pressure?.status && g.pressure.status !== 'aligned' && (
                      <Text style={{ color: '#E8414A', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' }}>{g.pressure.status} Load</Text>
                    )}
                  </View>
                  <StateBadge state={state} />
                </View>

                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Progress</Text>
                    <Text style={{ color: '#FFFDFC', fontSize: 12, fontWeight: '800' }}>{score}%</Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: '#161618', borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: '100%', backgroundColor: score > 70 ? '#E8414A' : '#ECE7E3', width: `${score}%`, borderRadius: 3 }} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: any = {
    on_track: { bg: 'rgba(232,65,74,0.1)', text: '#E8414A', border: 'rgba(232,65,74,0.3)' }, // Using red for positive too since it's the brand accent
    slow: { bg: 'rgba(249,168,172,0.1)', text: '#F9A8AC', border: 'rgba(249,168,172,0.3)' },
    drifting: { bg: 'rgba(180,33,41,0.1)', text: '#B42129', border: 'rgba(180,33,41,0.3)' },
    stalled: { bg: 'rgba(236,231,227,0.05)', text: 'rgba(236,231,227,0.5)', border: 'rgba(236,231,227,0.15)' },
    recovering: { bg: 'rgba(255,253,252,0.08)', text: '#FFFDFC', border: 'rgba(255,253,252,0.2)' },
    unknown: { bg: 'rgba(236,231,227,0.05)', text: 'rgba(236,231,227,0.3)', border: 'rgba(236,231,227,0.1)' },
  };

  const style = map[state] || map.unknown;

  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1, backgroundColor: style.bg, borderColor: style.border }}>
      <Text style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', color: style.text }}>{state.replace('_', ' ')}</Text>
    </View>
  );
}
