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
    <View style={{ backgroundColor: '#161922', flex: 1, borderWidth: 1, borderColor: '#232632', borderRadius: 14, padding: 16, margin: 4, minWidth: '45%' }}>
      <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, textTransform: 'capitalize' }} numberOfLines={1}>{title}</Text>
      <Text style={{ fontSize: 20, fontWeight: '900', color: '#f3f4f6' }}>{value}</Text>
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
      <Text style={{ color: '#f3f4f6', fontWeight: '700', marginBottom: 12, fontSize: 17, paddingHorizontal: 4 }}>7-Day Summary</Text>
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
      <View style={{ backgroundColor: '#161922', borderWidth: 1, borderColor: '#232632', borderRadius: 16, padding: 20, marginBottom: 20, alignItems: 'center', paddingVertical: 32 }}>
        <ActivityIndicator color="#3b82f6" size="small" />
        <Text style={{ color: '#4b5563', fontSize: 12, marginTop: 8 }}>Analyzing system...</Text>
      </View>
    );
  }

  if (!insight) {
    return (
      <View style={{ backgroundColor: '#161922', borderWidth: 1, borderColor: '#232632', borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3b82f6', marginRight: 8 }} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#d1d5db' }}>Jarvis Insight</Text>
        </View>
        <Text style={{ color: '#6b7280', fontSize: 13 }}>No daily logs yet. Start logging to get system intelligence.</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push('/(dashboard)/brain')}
      style={{ backgroundColor: '#161922', borderWidth: 1, borderColor: '#232632', borderRadius: 16, padding: 20, marginBottom: 20 }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3b82f6', marginRight: 8 }} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#d1d5db' }}>Jarvis Insight</Text>
        </View>
        <Text style={{ fontSize: 10, color: '#4b5563', fontWeight: '700', letterSpacing: 1 }}>TAP TO CHAT</Text>
      </View>

      {/* System State */}
      <Text style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>System State</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: '#f3f4f6', marginBottom: 14 }}>{insight.systemState}</Text>

      {/* Risks */}
      {insight.risks?.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 10, color: '#f87171', textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', marginBottom: 6 }}>Risks</Text>
          {insight.risks.map((r: string, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
              <Text style={{ color: '#f87171', marginRight: 6 }}>⚠️</Text>
              <Text style={{ fontSize: 12, color: '#fca5a5', flex: 1 }}>{r}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Observations */}
      {insight.observations?.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', marginBottom: 6 }}>Observations</Text>
          {insight.observations.map((o: string, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
              <Text style={{ color: '#6b7280', marginRight: 6 }}>•</Text>
              <Text style={{ fontSize: 12, color: '#d1d5db', flex: 1 }}>{o}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Recommendations */}
      {insight.recommendations?.length > 0 && (
        <View>
          <Text style={{ fontSize: 10, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', marginBottom: 6 }}>Recommendations</Text>
          {insight.recommendations.map((r: string, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
              <Text style={{ marginRight: 6 }}>💡</Text>
              <Text style={{ fontSize: 12, color: '#86efac', flex: 1 }}>{r}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

