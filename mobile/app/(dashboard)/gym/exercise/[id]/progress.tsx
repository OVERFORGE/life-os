import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { fetchWithAuth } from '../../../../../utils/api';
import { ArrowLeft, Target, TrendingUp, TrendingDown, Activity, AlertCircle } from 'lucide-react-native';

export default function ExerciseProgressScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // id is the equipmentName (URI encoded)
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const equipmentName = id ? decodeURIComponent(id as string) : '';

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/gym/exercise-progress?equipmentName=${encodeURIComponent(equipmentName)}`);
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
    if (equipmentName) loadData();
  }, [equipmentName]);

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'S': return '#8b5cf6'; // Purple
      case 'A': return '#10b981'; // Green
      case 'B': return '#3b82f6'; // Blue
      case 'C': return '#6b7280'; // Gray
      case 'D': return '#f59e0b'; // Orange
      case 'F': return '#ef4444'; // Red
      default: return '#3a3d4a';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#8b5cf6';
    if (score >= 70) return '#10b981';
    if (score >= 40) return '#3b82f6';
    if (score >= 20) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <View className="flex-1 bg-[#0a0b0e]">
      {/* Header */}
      <View className="pt-[60px] pb-4 px-5 flex-row items-center justify-between border-b border-[#12141a]">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-full bg-[#12141a] border border-[#1e2029] items-center justify-center">
          <ArrowLeft color="#9ca3af" size={18} />
        </TouchableOpacity>
        <Text className="text-gray-100 font-bold text-lg">{equipmentName}</Text>
        <View className="w-10" />
      </View>

      <ScrollView 
        className="flex-1 px-5 pt-4"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor="#a78bfa" />}
      >
        {!data && !loading ? (
          <View className="items-center justify-center mt-20">
            <Text className="text-gray-500">No data found for this exercise.</Text>
          </View>
        ) : data ? (
          <>
            {/* Score Card */}
            <View className="bg-[#12141a] border border-[#1e2029] rounded-2xl p-5 mb-6 flex-row items-center justify-between">
              <View>
                <Text className="text-gray-400 text-sm mb-1">Exercise Intelligence Score</Text>
                <Text className="text-gray-100 font-bold text-3xl" style={{ color: getScoreColor(data.score) }}>{data.score} <Text className="text-gray-600 text-lg">/ 100</Text></Text>
              </View>
              <Activity size={32} color={getScoreColor(data.score)} />
            </View>

            {/* AI Insights */}
            <View className="mb-6">
              <Text className="text-gray-500 font-bold text-[11px] tracking-widest uppercase mb-3">AI Analysis</Text>
              {data.insights?.length > 0 ? (
                data.insights.map((insight: string, idx: number) => (
                  <View key={idx} className="bg-[#1a1c23] border border-[#2a2d3a] rounded-xl p-4 mb-2 flex-row items-start">
                    <Target size={16} color="#8b5cf6" className="mt-0.5 mr-3" />
                    <Text className="text-gray-300 leading-5 flex-1">{insight}</Text>
                  </View>
                ))
              ) : (
                <Text className="text-gray-600 italic">Not enough data to generate insights.</Text>
              )}
            </View>

            {/* History Breakdown */}
            <View className="mb-10">
              <Text className="text-gray-500 font-bold text-[11px] tracking-widest uppercase mb-3">Set History & Overload Grades</Text>
              
              {data.history?.map((set: any, idx: number) => {
                const grade = set.progression?.overloadGrade || 'N/A';
                const dateLabel = new Date(set.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                
                return (
                  <View key={idx} className="bg-[#12141a] border border-[#1e2029] rounded-xl p-4 mb-3">
                    <View className="flex-row justify-between items-center mb-3">
                      <View className="flex-row items-center">
                        <Text className="text-gray-300 font-bold">{dateLabel}</Text>
                        <Text className="text-gray-600 text-xs ml-2">Set {set.setIndex}</Text>
                      </View>
                      
                      <View className="flex-row items-center px-2.5 py-1 rounded-md" style={{ backgroundColor: getGradeColor(grade) + '20', borderWidth: 1, borderColor: getGradeColor(grade) + '50' }}>
                        <Text className="font-bold text-xs" style={{ color: getGradeColor(grade) }}>Grade {grade}</Text>
                      </View>
                    </View>

                    <View className="flex-row justify-between">
                      <View className="w-[30%]">
                        <Text className="text-gray-500 text-xs mb-1">Performance</Text>
                        <Text className="text-gray-100 font-bold">{set.weight}kg × {set.reps}</Text>
                      </View>
                      
                      <View className="w-[30%]">
                        <Text className="text-gray-500 text-xs mb-1">Target Reps</Text>
                        <Text className="text-gray-100 font-bold">{set.targetReps}</Text>
                      </View>
                      
                      <View className="w-[30%]">
                        <Text className="text-gray-500 text-xs mb-1">Est. 1RM</Text>
                        <View className="flex-row items-center">
                          <Text className="text-gray-100 font-bold mr-1">{set.progression?.estimated1RM || 0}</Text>
                          {set.progression?.progressionDelta > 0 && <TrendingUp size={12} color="#10b981" />}
                          {set.progression?.progressionDelta < 0 && <TrendingDown size={12} color="#ef4444" />}
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
              
              {(!data.history || data.history.length === 0) && (
                <View className="py-8 items-center border border-dashed border-[#2a2d3a] rounded-xl">
                  <Text className="text-gray-500">No set history available.</Text>
                </View>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
