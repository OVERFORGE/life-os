import { useEffect, useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator } from 'react-native';
import { fetchWithAuth } from '../../utils/api';
import { TrajectoryCard, CurrentEraCard, GoalLoadCard } from '../../components/dashboard/Cards';
import { SummaryGrid, SystemInsightCard } from '../../components/dashboard/StatCards';
import { StreakGrid, PersonalRecords, InsightsGrid, Heatmap } from '../../components/dashboard/Lists';
import { MoodEnergyChart } from '../../components/dashboard/Graphs';

export default function DashboardFeed() {
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
        if (goalRes.ok) setGoalLoad(await goalRes.json());
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
    <ScrollView className="flex-1 bg-[#0f1115]" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      
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
  );
}
