import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Brain, ArrowLeft } from 'lucide-react-native';
import { fetchWithAuth } from '../../utils/api';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function TrajectoryScreen() {
  const router = useRouter();
  const [phases, setPhases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth('/insights/phases')
      .then(res => res.json())
      .then(data => {
        if (data.timeline) setPhases(data.timeline);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <View className="flex-1 bg-[#0f1115] pt-12">
      <TouchableOpacity onPress={() => router.back()} className="mb-6 px-6 flex-row items-center">
        <ArrowLeft size={20} color="#9ca3af" />
        <Text className="text-gray-400 ml-2 font-medium">Dashboard</Text>
      </TouchableOpacity>

      <View className="flex-row items-center mb-6 px-6">
        <Brain size={28} color="#60a5fa" />
        <Text className="text-2xl font-bold text-gray-100 ml-3">Life Trajectory</Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#60a5fa" />
      ) : (
        <ScrollView className="px-6 flex-1 mb-20" showsVerticalScrollIndicator={false}>
          {phases.length === 0 ? (
            <Text className="text-gray-500">No phase history recorded yet.</Text>
          ) : (
            phases.map((phase, i) => {
              const label = phase.phase?.replace("_", " ") || "Unknown";
              return (
                <Animated.View 
                  key={i} 
                  entering={FadeInDown.delay(i * 100).springify()}
                  className="bg-[#161922] border border-[#232632] rounded-xl p-5 mb-4 relative overflow-hidden"
                >
                  <View className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-lg font-bold capitalize text-gray-100">{label}</Text>
                    <Text className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{phase.duration} Days</Text>
                  </View>
                  <Text className="text-gray-400 text-sm leading-relaxed mb-3">{phase.reason}</Text>
                  <Text className="text-xs text-gray-500">{new Date(phase.startDate).toLocaleDateString()} - {phase.endDate ? new Date(phase.endDate).toLocaleDateString() : 'Present'}</Text>
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
