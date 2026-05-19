import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, Brain } from 'lucide-react-native';
import { fetchWithAuth } from '../../utils/api';

const PHASE_THEME: Record<string, { color: string; bg: string; border: string }> = {
  grind:    { color: '#E8414A', bg: 'rgba(232,65,74,0.08)',   border: 'rgba(232,65,74,0.25)'   },
  burnout:  { color: '#B42129', bg: 'rgba(180,33,41,0.08)',   border: 'rgba(180,33,41,0.25)'   },
  recovery: { color: '#ECE7E3', bg: 'rgba(236,231,227,0.06)', border: 'rgba(236,231,227,0.2)'  },
  slump:    { color: '#F9A8AC', bg: 'rgba(249,168,172,0.06)', border: 'rgba(249,168,172,0.2)'  },
  balanced: { color: '#FFFDFC', bg: 'rgba(255,253,252,0.04)', border: 'rgba(255,253,252,0.1)'  },
};

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return '—';
  try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return dateStr; }
}

export default function TrajectoryScreen() {
  const router = useRouter();
  const [phases, setPhases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth('/insights/phases')
      .then(res => res.json())
      .then(data => {
        if (data.timeline) setPhases([...data.timeline].reverse());
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#161618' }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#2A2B2F', flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}
        >
          <ArrowLeft color="rgba(236,231,227,0.7)" size={17} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Brain size={20} color="#E8414A" />
          <View>
            <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 17 }}>Life Trajectory</Text>
            <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Phase Timeline</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#E8414A" size="large" />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
          {phases.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 14, textAlign: 'center' }}>
                No phase history yet.{'\n'}Keep logging daily and Jarvis will detect life phases.
              </Text>
            </View>
          ) : (
            phases.map((phase, i) => {
              const label = phase.phase?.replace(/_/g, ' ') || 'Unknown';
              const theme = PHASE_THEME[phase.phase] || PHASE_THEME.balanced;
              // Only the very first item (most recent) with no endDate should be marked CURRENT
              const isCurrent = i === 0 && !phase.endDate;
              const days = phase.durationDays || phase.duration || 0;
              const confidence = phase.confidence ? Math.round(phase.confidence * 100) : null;

              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/(dashboard)/phase/${phase._id}`)}
                  style={{
                    backgroundColor: '#1F2023',
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#2A2B2F',
                    padding: 16,
                    marginBottom: 10,
                  }}
                >
                  {/* Top row */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}>
                        <Text style={{ color: theme.color, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>{label}</Text>
                      </View>
                      {isCurrent && (
                        <View style={{ backgroundColor: 'rgba(232,65,74,0.15)', borderWidth: 1, borderColor: 'rgba(232,65,74,0.35)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }}>
                          <Text style={{ color: '#E8414A', fontSize: 10, fontWeight: '700' }}>CURRENT</Text>
                        </View>
                      )}
                    </View>
                    <ChevronRight size={15} color="rgba(236,231,227,0.25)" />
                  </View>

                  {/* Reason */}
                  {phase.reason && (
                    <Text style={{ fontSize: 13, color: 'rgba(236,231,227,0.65)', lineHeight: 19, marginBottom: 12 }} numberOfLines={2}>
                      {phase.reason}
                    </Text>
                  )}

                  {/* Stat row */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, backgroundColor: '#161618', borderRadius: 8, padding: 8 }}>
                      <Text style={{ color: '#FFFDFC', fontSize: 14, fontWeight: '700' }}>{days}</Text>
                      <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, marginTop: 1 }}>Days</Text>
                    </View>
                    {confidence !== null && (
                      <View style={{ flex: 1, backgroundColor: '#161618', borderRadius: 8, padding: 8 }}>
                        <Text style={{ color: theme.color, fontSize: 14, fontWeight: '700' }}>{confidence}%</Text>
                        <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, marginTop: 1 }}>Confidence</Text>
                      </View>
                    )}
                    <View style={{ flex: 2, backgroundColor: '#161618', borderRadius: 8, padding: 8 }}>
                      <Text style={{ color: '#FFFDFC', fontSize: 11, fontWeight: '600' }}>
                        {formatDate(phase.startDate)} → {isCurrent ? 'Present' : formatDate(phase.endDate)}
                      </Text>
                      <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, marginTop: 1 }}>Period</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
