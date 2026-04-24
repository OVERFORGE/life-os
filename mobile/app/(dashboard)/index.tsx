import { useEffect, useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../utils/api';
import { TrajectoryCard, CurrentEraCard, GoalLoadCard } from '../../components/dashboard/Cards';
import { SummaryGrid, SystemInsightCard } from '../../components/dashboard/StatCards';
import { StreakGrid, PersonalRecords, InsightsGrid, Heatmap } from '../../components/dashboard/Lists';
import { MoodEnergyChart } from '../../components/dashboard/Graphs';

export default function DashboardFeed() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<any>(null);
  const [goalLoad, setGoalLoad] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [dashRes, trajRes, goalRes] = await Promise.all([
          fetchWithAuth('/daily-log/dashboard'),
          fetchWithAuth('/insights/trajectory'),
          fetchWithAuth('/dashboard/goal-load')
        ]);
        
        if (dashRes.ok) setLogs(await dashRes.json());
        if (trajRes.ok) setPhase(await trajRes.json());
        if (goalRes.ok) {
          const goalData = await goalRes.json();
          setGoalLoad(goalData.goalLoad ?? goalData); // API returns { ok, goalLoad: {...} }
        }
      } catch (e) {
        console.error("Dashboard data load error:", e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <View className="flex-1 bg-[#0f1115] items-center justify-center">
        <ActivityIndicator color="#4b5563" />
        <Text className="text-gray-400 mt-4">Syncing Telemetry...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* Dynamic Header */}
      <View className="flex-row items-center justify-between px-6 pt-16 pb-4">
        <Text className="text-2xl font-bold text-gray-100">Overview</Text>
        <TouchableOpacity 
          onPress={() => router.push('/notifications')}
          className="w-10 h-10 rounded-full border border-[#232632] bg-[#161922] items-center justify-center relative"
        >
          <Bell color="#f3f4f6" size={18} />
          {/* Optional: Add a red dot if unread */}
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {/* Top Cards */}
        <View className="mb-2">
          <TrajectoryCard data={phase} />
          <CurrentEraCard />
        </View>

        <GoalLoadCard goalLoad={goalLoad} />
        <SystemInsightCard />
        
        {/* Data Visualization */}
        <SummaryGrid logs={logs} />
        <StreakGrid logs={logs} />
        <PersonalRecords logs={logs} />
        <MoodEnergyChart logs={logs} />
        <InsightsGrid logs={logs} />
        <Heatmap logs={logs} />
        
      </ScrollView>
    </View>
  );
}
