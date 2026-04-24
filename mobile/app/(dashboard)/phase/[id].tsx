import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView
} from 'react-native';
import { ArrowLeft, Gauge, Activity, Compass, AlertTriangle } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWithAuth } from '../../../utils/api';

const C = {
  bg: '#0f1115', card: '#161922', border: '#232632',
  text: '#f3f4f6', subtext: '#9ca3af', muted: '#6b7280',
  indigo: '#818cf8', indigoDim: '#1e1f3b',
};

const PHASE_COLORS: Record<string, string> = {
  grind: '#60a5fa', burnout: '#f87171', recovery: '#4ade80',
  slump: '#facc15', balanced: '#d1d5db',
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value || 0) * 100);
  const barColor = pct > 70 ? '#f87171' : pct > 40 ? '#facc15' : '#4ade80';
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ color: C.subtext, fontSize: 13 }}>{label}</Text>
        <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>{pct}%</Text>
      </View>
      <View style={{ height: 6, backgroundColor: C.bg, borderRadius: 3, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: 3 }} />
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
      if (phaseRes.status === 'fulfilled' && phaseRes.value.ok) {
        setPhaseData(await phaseRes.value.json());
      }
      if (simRes.status === 'fulfilled' && simRes.value.ok) {
        setSimData(await simRes.value.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const phase = phaseData?.phase;
  const selfExplanation = phaseData?.selfExplanation;
  const simulations = simData?.simulations || [];
  const escapePaths = simulations.filter((s: any) => s.resultPhase !== phase?.phase);
  const phaseColor = PHASE_COLORS[phase?.phase] || '#9ca3af';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: 16 }}>
          <ArrowLeft color={C.subtext} size={18} />
        </TouchableOpacity>
        <View>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '900', textTransform: 'capitalize' }}>
            {phase?.phase?.replace(/_/g, ' ') || 'Life Phase'}
          </Text>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2 }}>Phase Analysis</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.indigo} size="large" />
        </View>
      ) : !phaseData ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Text style={{ color: C.muted, textAlign: 'center' }}>Phase not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

          {/* ── HERO ── */}
          <View style={{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: phaseColor, padding: 20, marginBottom: 16 }}>
            <Text style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>
              {phase?.startDate} → {phase?.endDate || 'Present'}
            </Text>
            <Text style={{ color: phaseColor, fontSize: 24, fontWeight: '900', textTransform: 'capitalize', marginBottom: 8 }}>
              {phase?.phase?.replace(/_/g, ' ')}
            </Text>
            {selfExplanation?.summary && (
              <Text style={{ color: C.subtext, fontSize: 14, lineHeight: 21 }}>{selfExplanation.summary}</Text>
            )}
          </View>

          {/* ── SYSTEM STATE ── */}
          {selfExplanation?.scores && (
            <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <Gauge size={15} color={C.indigo} />
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', marginLeft: 8 }}>System State</Text>
              </View>
              <ScoreBar label="Stress" value={selfExplanation.scores.stress} />
              <ScoreBar label="Energy" value={selfExplanation.scores.energy} />
              <ScoreBar label="Mood" value={selfExplanation.scores.mood} />
              <ScoreBar label="Sleep" value={selfExplanation.scores.sleep} />
              <ScoreBar label="Stability" value={selfExplanation.scores.stability} />
              <ScoreBar label="Load" value={selfExplanation.scores.load} />
            </View>
          )}

          {/* ── KEY SIGNALS ── */}
          {selfExplanation?.signals?.length > 0 && (
            <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Activity size={15} color={C.subtext} />
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', marginLeft: 8 }}>Key Signals</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {selfExplanation.signals.map((s: string, i: number) => (
                  <View key={i} style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}>
                    <Text style={{ color: C.subtext, fontSize: 12 }}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── EXIT PATHS ── */}
          <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Compass size={15} color={C.subtext} />
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', marginLeft: 8 }}>What Moves You Out</Text>
            </View>
            {escapePaths.length === 0 ? (
              <Text style={{ color: C.muted, fontSize: 13 }}>
                Small optimizations won't exit this phase.{'\n'}
                <Text style={{ color: C.subtext }}>This requires a structural shift.</Text>
              </Text>
            ) : (
              escapePaths.slice(0, 3).map((s: any, i: number) => (
                <View key={i} style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, marginBottom: 8 }}>
                  <Text style={{ color: C.text, fontWeight: '700', fontSize: 13, marginBottom: 4 }}>
                    If you {s.actions?.join(', ')}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 12 }}>
                    → Move to{' '}
                    <Text style={{ color: PHASE_COLORS[s.resultPhase] || C.indigo, fontWeight: '700' }}>{s.resultPhase}</Text>
                    {' '}({Math.round((s.confidence || 0) * 100)}%)
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* ── RISKS ── */}
          {selfExplanation?.risks?.length > 0 && (
            <View style={{ backgroundColor: '#2a1616', borderRadius: 16, borderWidth: 1, borderColor: '#7f1d1d44', padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <AlertTriangle size={15} color="#f87171" />
                <Text style={{ color: '#f87171', fontSize: 14, fontWeight: '700', marginLeft: 8 }}>Risks</Text>
              </View>
              {selfExplanation.risks.map((r: string, i: number) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                  <Text style={{ color: '#f87171', marginRight: 6 }}>•</Text>
                  <Text style={{ color: '#fca5a5', fontSize: 13, flex: 1 }}>{r}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
