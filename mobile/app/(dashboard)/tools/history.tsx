import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { fetchWithAuth } from '../../../utils/api';
import { ArrowLeft, Smile, Zap, Dumbbell, Code2 } from 'lucide-react-native';

export default function HistoryScreen() {
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth('/daily-log/list?limit=30')
      .then(res => res.json())
      .then(data => {
        // API returns array directly
        if (Array.isArray(data)) setLogs(data);
        else if (Array.isArray(data?.logs)) setLogs(data.logs);
        else setLogs([]);
      })
      .catch(e => { console.error(e); setLogs([]); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <View className="flex-1 bg-[#0f1115] justify-center items-center">
      <ActivityIndicator size="large" color="#10b981" />
    </View>
  );

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* Header */}
      <BlurView intensity={20} tint="dark" className="pt-16 pb-4 px-4 border-b border-[#232632] flex-row items-center z-10">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center mr-2">
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg">History</Text>
      </BlurView>

      <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>
        {logs.length === 0 ? (
          <Text className="text-gray-400 text-center mt-10">No logs found.</Text>
        ) : (
          logs.map(log => {
            // Support both old static schema and new dynamic signals
            const mood = log.signals?.mood ?? log.mental?.mood ?? '-';
            const energy = log.signals?.energy ?? log.mental?.energy ?? '-';
            const gym = log.signals?.gym ?? log.physical?.gym;
            const coded = log.signals?.coded ?? log.work?.coded;

            return (
              <TouchableOpacity
                key={log._id}
                activeOpacity={0.7}
                onPress={() => router.push(`/(dashboard)/tools/history/${log.date}`)}
                className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-3 flex-row justify-between items-center"
              >
                <View>
                  <Text className="text-white font-medium text-base mb-2">{log.date}</Text>
                  <View className="flex-row items-center gap-4">
                    <View className="flex-row items-center gap-1.5">
                      <Smile size={14} color="#9ca3af" />
                      <Text className="text-gray-400 text-xs">{mood}/10</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <Zap size={14} color="#f59e0b" />
                      <Text className="text-gray-400 text-xs">{energy}/10</Text>
                    </View>
                  </View>
                </View>

                <View className="flex-row items-center gap-3">
                  <Dumbbell size={20} color={gym ? "#4ade80" : "#4b5563"} />
                  <Code2 size={20} color={coded ? "#60a5fa" : "#4b5563"} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
