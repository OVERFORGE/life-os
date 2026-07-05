import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ArrowLeft, Gauge, Activity, Compass, AlertTriangle } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWithAuth } from '../../../utils/api';

const PHASE_COLORS: Record<string, string> = {
  grind: '#E8414A', burnout: '#B42129', recovery: '#ECE7E3',
  slump: '#F9A8AC', balanced: '#FFFDFC',
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value || 0) * 100);
  const barColor = pct > 70 ? '#E8414A' : pct > 40 ? '#F9A8AC' : '#ECE7E3';
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ color: 'rgba(236,231,227,0.65)', fontSize: 13 }}>{label}</Text>
        <Text style={{ color: '#FFFDFC', fontSize: 13, fontWeight: '700' }}>{pct}%</Text>
      </View>
      <View style={{ height: 4, backgroundColor: '#161618', borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: 4 }} />
      </View>
    </View>
  );
}

export default function PhaseDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [phaseData, setPhaseData] = useState<any>(null);
  const [simData, setSimData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [phaseRes, simRes] = await Promise.allSettled([
        fetchWithAuth(`/insights/phases/${id}`),
        fetchWithAuth(`/insights/phases/${id}/simulate-compound`),
      ]);
      if (phaseRes.status === 'fulfilled' && phaseRes.value.ok) setPhaseData(await phaseRes.value.json());
      if (simRes.status === 'fulfilled' && simRes.value.ok) setSimData(await simRes.value.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const phase = phaseData?.phase;
  const selfExplanation = phaseData?.selfExplanation;
  const simulations = simData?.simulations || [];
  const escapePaths = simulations.filter((s: any) => s.resultPhase !== phase?.phase);
  const phaseColor = PHASE_COLORS[phase?.phase] || '#ECE7E3';

  const sectionLabel = (text: string) => (
    <Text style={{ color: 'rgba(236,231,227,0.4)', fontWeight: '700', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>
      {text}
    </Text>
  );

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
        <View>
          <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 16, textTransform: 'capitalize' }}>
            {phase?.phase?.replace(/_/g, ' ') || 'Life Phase'}
          </Text>
          <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 }}>Phase Analysis</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#E8414A" size="large" />
        </View>
      ) : !phaseData ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Text style={{ color: 'rgba(236,231,227,0.4)', textAlign: 'center' }}>Phase not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>

          {/* Hero */}
          <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 20, marginBottom: 14 }}>
            <View style={{ backgroundColor: phaseColor + '15', borderWidth: 1, borderColor: phaseColor + '30', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 12 }}>
              <Text style={{ color: phaseColor, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>
                {phase?.phase?.replace(/_/g, ' ')}
              </Text>
            </View>
            <Text style={{ color: 'rgba(236,231,227,0.45)', fontSize: 12, marginBottom: 10 }}>
              {phase?.startDate} → {phase?.endDate || 'Present'}
            </Text>
            {selfExplanation?.summary && (
              <Text style={{ color: 'rgba(236,231,227,0.75)', fontSize: 14, lineHeight: 22 }}>{selfExplanation.summary}</Text>
            )}
          </View>

          {/* System State */}
          {selfExplanation?.scores && (
            <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 18, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Gauge size={14} color="#E8414A" />
                {sectionLabel('System State')}
              </View>
              <ScoreBar label="Stress" value={selfExplanation.scores.stress} />
              <ScoreBar label="Energy" value={selfExplanation.scores.energy} />
              <ScoreBar label="Mood" value={selfExplanation.scores.mood} />
              <ScoreBar label="Sleep" value={selfExplanation.scores.sleep} />
              <ScoreBar label="Stability" value={selfExplanation.scores.stability} />
              <ScoreBar label="Load" value={selfExplanation.scores.load} />
            </View>
          )}

          {/* Key Signals */}
          {selfExplanation?.signals?.length > 0 && (
            <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 18, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Activity size={14} color="rgba(236,231,227,0.5)" />
                {sectionLabel('Key Signals')}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {selfExplanation.signals.map((s: string, i: number) => (
                  <View key={i} style={{ backgroundColor: '#161618', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 }}>
                    <Text style={{ color: 'rgba(236,231,227,0.65)', fontSize: 12 }}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Exit Paths */}
          <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 18, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Compass size={14} color="rgba(236,231,227,0.5)" />
              {sectionLabel('What Moves You Out')}
            </View>
            {escapePaths.length === 0 ? (
              <Text style={{ color: 'rgba(236,231,227,0.45)', fontSize: 13, lineHeight: 20 }}>
                Small optimizations won't exit this phase.{'\n'}
                <Text style={{ color: 'rgba(236,231,227,0.6)' }}>This requires a structural shift.</Text>
              </Text>
            ) : (
              escapePaths.slice(0, 3).map((s: any, i: number) => (
                <View key={i} style={{ backgroundColor: '#161618', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 12, padding: 14, marginBottom: 8 }}>
                  <Text style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 13, marginBottom: 4 }}>
                    If you {s.actions?.join(', ')}
                  </Text>
                  <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 12 }}>
                    → Move to{' '}
                    <Text style={{ color: PHASE_COLORS[s.resultPhase] || '#E8414A', fontWeight: '700' }}>{s.resultPhase}</Text>
                    {' '}({Math.round((s.confidence || 0) * 100)}%)
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* Risks */}
          {selfExplanation?.risks?.length > 0 && (
            <View style={{ backgroundColor: 'rgba(232,65,74,0.06)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)', padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <AlertTriangle size={14} color="#E8414A" />
                {sectionLabel('Risks')}
              </View>
              {selfExplanation.risks.map((r: string, i: number) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                  <Text style={{ color: '#E8414A', marginRight: 8 }}>•</Text>
                  <Text style={{ color: 'rgba(236,231,227,0.7)', fontSize: 13, flex: 1, lineHeight: 19 }}>{r}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
