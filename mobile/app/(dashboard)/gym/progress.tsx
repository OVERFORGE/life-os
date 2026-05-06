import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../../utils/api';
import { ArrowLeft, Target, TrendingUp, Flame, Dumbbell, Shield, Zap, AlertTriangle } from 'lucide-react-native';

export default function GymProgressDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/gym/progress');
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Elite': return '#8b5cf6';
      case 'Progressing': return '#10b981';
      case 'Stable': return '#3b82f6';
      case 'Plateau': return '#f59e0b';
      case 'Regressing': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <View className="flex-1 bg-[#0a0b0e]">
      {/* Header */}
      <View className="pt-[60px] pb-4 px-5 flex-row items-center justify-between border-b border-[#12141a]">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-full bg-[#12141a] border border-[#1e2029] items-center justify-center">
          <ArrowLeft color="#9ca3af" size={18} />
        </TouchableOpacity>
        <Text className="text-gray-100 font-bold text-lg">Fitness Intelligence</Text>
        <View className="w-10" />
      </View>

      <ScrollView 
        className="flex-1 px-5 pt-4"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor="#a78bfa" />}
      >
        {!data && !loading ? (
          <View className="items-center justify-center mt-20">
            <Text className="text-gray-500">Failed to load intelligence data.</Text>
          </View>
        ) : data ? (
          <>
            {/* Section A - Fitness Card */}
            <View className="mb-6">
              <Text className="text-gray-500 font-bold text-[11px] tracking-widest uppercase mb-3">Overall Profile</Text>
              
              <View className="bg-[#12141a] border border-[#1e2029] rounded-2xl p-5">
                <View className="flex-row justify-between items-center mb-6">
                  <View>
                    <Text className="text-gray-400 text-sm mb-1">Current Phase</Text>
                    <View className="flex-row items-center">
                      <View className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: getStatusColor(data.status) }} />
                      <Text className="text-gray-100 font-bold text-xl">{data.status}</Text>
                    </View>
                  </View>
                  <View className="w-16 h-16 rounded-full items-center justify-center border-2" style={{ borderColor: getStatusColor(data.status), backgroundColor: getStatusColor(data.status) + '1A' }}>
                    <Text className="text-white font-bold text-2xl">{data.score}</Text>
                  </View>
                </View>

                <View className="flex-row flex-wrap justify-between">
                  <View className="w-[48%] bg-[#1a1c23] rounded-xl p-4 mb-3 border border-[#2a2d3a]">
                    <View className="flex-row items-center mb-2">
                      <Flame size={14} color="#f59e0b" className="mr-1.5" />
                      <Text className="text-gray-400 text-xs">Consistency</Text>
                    </View>
                    <Text className="text-gray-100 font-bold text-lg">{data.consistencyScore}%</Text>
                  </View>
                  
                  <View className="w-[48%] bg-[#1a1c23] rounded-xl p-4 mb-3 border border-[#2a2d3a]">
                    <View className="flex-row items-center mb-2">
                      <Target size={14} color="#8b5cf6" className="mr-1.5" />
                      <Text className="text-gray-400 text-xs">Weekly Target</Text>
                    </View>
                    <Text className="text-gray-100 font-bold text-lg">{data.actualWeeklySessions} <Text className="text-gray-500 text-sm">/ {data.expectedWeeklySessions}</Text></Text>
                  </View>
                </View>

              </View>
            </View>

            {/* AI Insights (Mocked for dashboard, full details in drill-downs) */}
            <View className="mb-8">
              <Text className="text-gray-500 font-bold text-[11px] tracking-widest uppercase mb-3">Intelligence Assessment</Text>
              
              {data.status === 'Progressing' || data.status === 'Elite' ? (
                <View className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex-row items-start">
                  <TrendingUp size={20} color="#10b981" className="mt-0.5 mr-3" />
                  <View className="flex-1">
                    <Text className="text-emerald-400 font-bold mb-1">Excellent Trajectory</Text>
                    <Text className="text-emerald-500/80 text-sm leading-5">Your consistency is solid and you are maintaining progressive overload across multiple exercises. Keep up the intensity.</Text>
                  </View>
                </View>
              ) : data.status === 'Stable' ? (
                <View className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex-row items-start">
                  <Shield size={20} color="#3b82f6" className="mt-0.5 mr-3" />
                  <View className="flex-1">
                    <Text className="text-blue-400 font-bold mb-1">Maintaining Baseline</Text>
                    <Text className="text-blue-500/80 text-sm leading-5">You are completing your sessions but strength progression has flattened. Consider increasing volume or load next week.</Text>
                  </View>
                </View>
              ) : (
                <View className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex-row items-start">
                  <AlertTriangle size={20} color="#ef4444" className="mt-0.5 mr-3" />
                  <View className="flex-1">
                    <Text className="text-red-400 font-bold mb-1">Fatigue or Regression Detected</Text>
                    <Text className="text-red-500/80 text-sm leading-5">Your workout frequency has dropped, or your 1RM is regressing. Ensure you are eating enough and recovering properly.</Text>
                  </View>
                </View>
              )}
            </View>

          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
