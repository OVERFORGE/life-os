import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { fetchWithAuth } from '../../../../utils/api';
import { ArrowLeft, Plus } from 'lucide-react-native';

export default function GoalsListScreen() {
  const router = useRouter();
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);

  async function loadGoals() {
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
  }

  useEffect(() => {
    loadGoals();
  }, []);

  async function bootstrap() {
    setBootstrapping(true);
    await fetchWithAuth('/goals/bootstrap', { method: 'POST' });
    await loadGoals();
    setBootstrapping(false);
  }

  if (loading) return (
    <View className="flex-1 bg-[#0f1115] justify-center items-center">
      <ActivityIndicator size="large" color="#f59e0b" />
    </View>
  );

  return (
    <View className="flex-1 bg-[#0f1115]">
      <BlurView intensity={20} tint="dark" className="pt-16 pb-4 px-4 border-b border-[#232632] flex-row justify-between items-center z-10">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center mr-2">
            <ArrowLeft color="#fff" size={24} />
          </TouchableOpacity>
          <Text className="text-white font-bold text-lg">Global Goals</Text>
        </View>
        <TouchableOpacity 
          onPress={() => router.push('/(dashboard)/tools/goals/new')}
          className="w-10 h-10 rounded-full bg-[#161922] border border-[#232632] items-center justify-center"
        >
          <Plus size={20} color="#f59e0b" />
        </TouchableOpacity>
      </BlurView>

      <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>
        {goals.length === 0 ? (
          <View className="bg-[#161922] border border-[#232632] rounded-xl p-8 items-center mt-10">
            <Text className="text-gray-300 text-center mb-6">You don't have any goals yet.</Text>
            <TouchableOpacity 
              onPress={bootstrap} 
              disabled={bootstrapping}
              className="bg-white px-6 py-3 rounded-xl"
            >
              <Text className="text-black font-bold">{bootstrapping ? 'Creating...' : 'Create Starter Goals'}</Text>
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
                className="bg-[#161922] border border-[#232632] rounded-2xl p-5 mb-4"
              >
                <View className="flex-row justify-between items-start mb-4">
                  <View className="flex-1 mr-4">
                    <Text className="text-white font-semibold text-lg">{g.title}</Text>
                    {g.pressure?.status && g.pressure.status !== 'aligned' && (
                      <Text className="text-red-400 text-xs mt-1 capitalize">{g.pressure.status} Load</Text>
                    )}
                  </View>
                  <StateBadge state={state} />
                </View>

                <View>
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-gray-400 text-xs">Progress</Text>
                    <Text className="text-gray-400 text-xs">{score}%</Text>
                  </View>
                  <View className="h-2 bg-[#0f1115] rounded-full overflow-hidden">
                    <View className="h-full bg-white" style={{ width: `${score}%` }} />
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
    on_track: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
    slow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    drifting: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
    stalled: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
    recovering: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
    unknown: { bg: 'bg-gray-500/10', text: 'text-gray-500', border: 'border-gray-500/20' },
  };

  const style = map[state] || map.unknown;

  return (
    <View className={`px-2.5 py-1 rounded-full border ${style.bg} ${style.border}`}>
      <Text className={`text-[10px] font-semibold uppercase ${style.text}`}>{state.replace('_', ' ')}</Text>
    </View>
  );
}
