// CACHE BUST 
// FORCE CACHE BUST 1
import { useEffect, useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../utils/api';
import { TrajectoryCard, CurrentEraCard, GoalLoadCard } from '../../components/dashboard/Cards';
import { SummaryGrid, SystemInsightCard } from '../../components/dashboard/StatCards';
import { StreakGrid, PersonalRecords, InsightsGrid, Heatmap } from '../../components/dashboard/Lists';
import { MoodEnergyChart } from '../../components/dashboard/Graphs';
import { DashboardTaskCard } from '../../components/dashboard/TaskCard';

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
      <View style={{ flex: 1, backgroundColor: '#161618', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#D62C35" />
        <Text style={{ color: 'rgba(236,231,227,0.7)', marginTop: 16 }}>Syncing Telemetry...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#161618' }}>
      {/* Dynamic Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={{ width: 32, height: 32, borderRadius: 8 }}
            resizeMode="contain"
          />
          <Text style={{ fontSize: 24, fontWeight: 'bold', letterSpacing: -0.5, color: '#FFFDFC' }}>Overview</Text>
        </View>
        <TouchableOpacity 
          onPress={() => router.push('/notifications')}
          style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#2A2B2F', backgroundColor: '#1F2023', alignItems: 'center', justifyContent: 'center' }}
        >
          <Bell color="#FFFDFC" size={18} />
          {/* Optional: Add a red dot if unread */}
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {/* Top Cards */}
        <View className="mb-2">
          <TrajectoryCard data={phase} />
          <CurrentEraCard />
        </View>

        <GoalLoadCard goalLoad={goalLoad} />

        {/* Task Manager Card */}
        <DashboardTaskCard />

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
