import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { fetchWithAuth } from '../../../../../../utils/api';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react-native';
import { LineChart } from 'react-native-chart-kit';

export default function SpecificSetProgressScreen() {
  const router = useRouter();
  const { id, index } = useLocalSearchParams(); // equipmentName, setIndex
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);

  const equipmentName = id ? decodeURIComponent(id as string) : '';
  const setIndex = parseInt((index as string) || "1", 10);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/gym/exercise-progress/set?equipmentName=${encodeURIComponent(equipmentName)}&setIndex=${setIndex}`);
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (equipmentName) loadData();
  }, [equipmentName, setIndex]);

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

  // Prepare chart data
  const screenWidth = Dimensions.get("window").width - 40; // padding 20 on each side
  
  // We want chronological for the chart (history from API is chronological)
  const chartLabels = history.map(h => new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).slice(-10); // Last 10 sessions
  const chartData = history.map(h => h.progression?.estimated1RM || h.weight).slice(-10);

  const hasData = chartData.length > 0;

  return (
    <View className="flex-1 bg-[#0a0b0e]">
      {/* Header */}
      <View className="pt-[60px] pb-4 px-5 flex-row items-center justify-between border-b border-[#12141a]">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-full bg-[#12141a] border border-[#1e2029] items-center justify-center">
          <ArrowLeft color="#9ca3af" size={18} />
        </TouchableOpacity>
        <View className="items-center">
          <Text className="text-gray-100 font-bold text-lg">{equipmentName}</Text>
          <Text className="text-amber-500 font-bold text-xs uppercase tracking-widest">Set {setIndex}</Text>
        </View>
        <View className="w-10" />
      </View>

      <ScrollView 
        className="flex-1 px-5 pt-4"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor="#a78bfa" />}
      >
        {!hasData && !loading ? (
          <View className="items-center justify-center mt-20">
            <Text className="text-gray-500">No data found for this specific set.</Text>
          </View>
        ) : hasData ? (
          <>
            {/* Chart Card */}
            <View className="bg-[#12141a] border border-[#1e2029] rounded-2xl p-5 mb-8">
              <Text className="text-gray-500 font-bold text-[11px] tracking-widest uppercase mb-4">Estimated 1RM Trend (Last 10)</Text>
              
              <LineChart
                data={{
                  labels: chartLabels.length > 5 ? chartLabels.filter((_, i) => i % 2 === 0) : chartLabels, // sparse labels if too many
                  datasets: [{ data: chartData }]
                }}
                width={screenWidth}
                height={220}
                yAxisSuffix="kg"
                chartConfig={{
                  backgroundColor: "#12141a",
                  backgroundGradientFrom: "#12141a",
                  backgroundGradientTo: "#12141a",
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(252, 211, 77, ${opacity})`, // Amber 500
                  labelColor: (opacity = 1) => `rgba(156, 163, 175, ${opacity})`, // Gray 400
                  style: { borderRadius: 16 },
                  propsForDots: {
                    r: "4",
                    strokeWidth: "2",
                    stroke: "#b45309"
                  }
                }}
                bezier
                style={{
                  marginVertical: 8,
                  borderRadius: 16,
                  marginLeft: -10
                }}
              />
            </View>

            {/* Set History Breakdown */}
            <View className="mb-10">
              <Text className="text-gray-500 font-bold text-[11px] tracking-widest uppercase mb-3">Performance History</Text>
              
              {[...history].reverse().map((set: any, idx: number) => {
                const grade = set.progression?.overloadGrade || 'N/A';
                const dateLabel = new Date(set.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                
                return (
                  <View key={idx} className="bg-[#12141a] border border-[#1e2029] rounded-xl p-4 mb-3">
                    <View className="flex-row justify-between items-center mb-3">
                      <Text className="text-gray-300 font-bold">{dateLabel}</Text>
                      
                      <View className="flex-row items-center px-2.5 py-1 rounded-md" style={{ backgroundColor: getGradeColor(grade) + '20', borderWidth: 1, borderColor: getGradeColor(grade) + '50' }}>
                        <Text className="font-bold text-xs" style={{ color: getGradeColor(grade) }}>Grade {grade}</Text>
                      </View>
                    </View>

                    <View className="flex-row justify-between">
                      <View className="w-[30%]">
                        <Text className="text-gray-500 text-xs mb-1">Weight</Text>
                        <Text className="text-gray-100 font-bold">{set.weight}kg</Text>
                      </View>
                      
                      <View className="w-[30%]">
                        <Text className="text-gray-500 text-xs mb-1">Reps</Text>
                        <Text className="text-gray-100 font-bold">{set.reps} <Text className="text-gray-600 text-xs font-normal">/ {set.targetReps}</Text></Text>
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
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
