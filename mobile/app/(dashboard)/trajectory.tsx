import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Brain, ArrowLeft, ChevronRight } from 'lucide-react-native';
import { fetchWithAuth } from '../../utils/api';

const PHASE_THEME: Record<string, { color: string; bg: string; border: string }> = {
  grind:    { color: '#60a5fa', bg: '#1e3a5f22', border: '#2563eb44' },
  burnout:  { color: '#f87171', bg: '#5f1e1e22', border: '#dc262644' },
  recovery: { color: '#4ade80', bg: '#1e5f2722', border: '#16a34a44' },
  slump:    { color: '#facc15', bg: '#5f4e1e22', border: '#ca8a0444' },
  balanced: { color: '#d1d5db', bg: '#2a2d3a22', border: '#4b556344' },
};

export default function TrajectoryScreen() {
  const router = useRouter();
  const [phases, setPhases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth('/insights/phases')
      .then(res => res.json())
      .then(data => {
        if (data.timeline) setPhases([...data.timeline].reverse()); // Most recent first
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#0f1115', paddingTop: 52 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 20, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center' }}>
        <ArrowLeft size={20} color="#9ca3af" />
        <Text style={{ color: '#9ca3af', marginLeft: 8, fontWeight: '600' }}>Dashboard</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 24 }}>
        <Brain size={26} color="#60a5fa" />
        <View style={{ marginLeft: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#f3f4f6', letterSpacing: -0.5 }}>Life Trajectory</Text>
          <Text style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 2, marginTop: 1 }}>Phase Timeline</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#60a5fa" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {phases.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ color: '#6b7280', fontSize: 15, textAlign: 'center' }}>No phase history yet.{'\n'}Keep logging daily and Jarvis will detect life phases.</Text>
            </View>
          ) : (
            phases.map((phase, i) => {
              const label = phase.phase?.replace(/_/g, ' ') || 'Unknown';
              const theme = PHASE_THEME[phase.phase] || PHASE_THEME.balanced;
              const isCurrent = !phase.endDate;
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/(dashboard)/phase/${phase._id}`)}
                  style={{
                    backgroundColor: '#161922',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderLeftWidth: 3,
                    borderLeftColor: theme.color,
                    padding: 18,
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: theme.color, textTransform: 'capitalize' }}>{label}</Text>
                      {isCurrent && (
                        <View style={{ backgroundColor: theme.color + '25', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 }}>
                          <Text style={{ color: theme.color, fontSize: 10, fontWeight: '700' }}>CURRENT</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>{phase.durationDays || phase.duration || '?'} days</Text>
                      <ChevronRight size={14} color="#4b5563" />
                    </View>
                  </View>
                  {phase.reason && (
                    <Text style={{ fontSize: 13, color: '#9ca3af', lineHeight: 19, marginBottom: 6 }} numberOfLines={2}>{phase.reason}</Text>
                  )}
                  <Text style={{ fontSize: 11, color: '#4b5563' }}>
                    {new Date(phase.startDate).toLocaleDateString()} → {phase.endDate ? new Date(phase.endDate).toLocaleDateString() : 'Present'}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
