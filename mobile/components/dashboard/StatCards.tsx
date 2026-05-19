import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../utils/api';

export type Log = {
  date: string;
  mental?: { mood?: number; energy?: number; stress?: number; anxiety?: number; focus?: number; };
  sleep?: { hours?: number; quality?: number; };
  physical?: { gym?: boolean; };
  work?: { coded?: boolean; deepWorkHours?: number; };
  habits?: { noFap?: boolean; };
};

export function calculateStreak<T>(logs: T[], predicate: (log: T) => boolean): number {
  let streak = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    if (predicate(logs[i])) streak++;
    else break;
  }
  return streak;
}

export function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <View style={{ backgroundColor: '#1F2023', flex: 1, borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 14, padding: 16, margin: 4, minWidth: '45%' }}>
      <Text style={{ fontSize: 11, color: 'rgba(236, 231, 227, 0.5)', marginBottom: 4, textTransform: 'capitalize' }} numberOfLines={1}>{title}</Text>
      <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFFDFC' }}>{value}</Text>
    </View>
  );
}

export function SummaryGrid({ logs }: { logs: Log[] }) {
  const last7 = logs.slice(-7);
  const avgMood = average(last7.map((l) => l.mental?.mood || 0));
  const avgEnergy = average(last7.map((l) => l.mental?.energy || 0));
  const gymDays = last7.filter((l) => l.physical?.gym).length;
  const codingDays = last7.filter((l) => l.work?.coded).length;

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ color: '#FFFDFC', fontWeight: '700', marginBottom: 12, fontSize: 17, paddingHorizontal: 4 }}>7-Day Summary</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <StatCard title="Avg Mood" value={avgMood.toFixed(1)} />
        <StatCard title="Avg Energy" value={avgEnergy.toFixed(1)} />
        <StatCard title="Gym Hits" value={String(gymDays)} />
        <StatCard title="Coded" value={String(codingDays)} />
      </View>
    </View>
  );
}

export function SystemInsightCard() {
  const router = useRouter();
  const [insight, setInsight] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth('/insights/system')
      .then(r => r.json())
      .then(d => { if (d?.insight) setInsight(d.insight); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 20, alignItems: 'center', paddingVertical: 32 }}>
        <ActivityIndicator color="#E8414A" size="small" />
        <Text style={{ color: 'rgba(236, 231, 227, 0.5)', fontSize: 12, marginTop: 8 }}>Analyzing system...</Text>
      </View>
    );
  }

  if (!insight) {
    return (
      <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8414A', marginRight: 8 }} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFDFC' }}>Jarvis Insight</Text>
        </View>
        <Text style={{ color: 'rgba(236, 231, 227, 0.7)', fontSize: 13 }}>No daily logs yet. Start logging to get system intelligence.</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push('/(dashboard)/brain')}
      style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 20 }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8414A', marginRight: 8 }} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFDFC' }}>Jarvis Insight</Text>
        </View>
        <Text style={{ fontSize: 10, color: 'rgba(236, 231, 227, 0.5)', fontWeight: '700', letterSpacing: 1 }}>TAP TO CHAT</Text>
      </View>

      {/* System State */}
      <Text style={{ fontSize: 11, color: 'rgba(236, 231, 227, 0.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>System State</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFDFC', marginBottom: 14 }}>{insight.systemState}</Text>

      {/* Risks */}
      {insight.risks?.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 10, color: '#E8414A', textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', marginBottom: 6 }}>Risks</Text>
          {insight.risks.map((r: string, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
              <Text style={{ color: '#E8414A', marginRight: 6 }}>!</Text>
              <Text style={{ fontSize: 12, color: '#F9A8AC', flex: 1 }}>{r}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Observations */}
      {insight.observations?.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 10, color: 'rgba(236, 231, 227, 0.5)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', marginBottom: 6 }}>Observations</Text>
          {insight.observations.map((o: string, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
              <Text style={{ color: 'rgba(236, 231, 227, 0.5)', marginRight: 6 }}>•</Text>
              <Text style={{ fontSize: 12, color: 'rgba(236, 231, 227, 0.9)', flex: 1 }}>{o}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Recommendations */}
      {insight.recommendations?.length > 0 && (
        <View>
          <Text style={{ fontSize: 10, color: '#FFFDFC', textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', marginBottom: 6 }}>Recommendations</Text>
          {insight.recommendations.map((r: string, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
              <Text style={{ color: '#FFFDFC', marginRight: 6 }}>+</Text>
              <Text style={{ fontSize: 12, color: '#ECE7E3', opacity: 0.9, flex: 1 }}>{r}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

