import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWithAuth } from '../../../utils/api';

const THEME_COLORS: Record<string, string> = {
  Growth: '#E8414A', Overextension: '#B42129', Contraction: '#F3767D',
  Entropy: '#F9A8AC', Restoration: '#ECE7E3',
};
const PHASE_COLORS: Record<string, string> = {
  grind: '#E8414A', burnout: '#B42129', recovery: '#ECE7E3',
  slump: '#F9A8AC', balanced: '#FFFDFC',
};

function MetricBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#161618', borderRadius: 10, padding: 12, alignItems: 'center' }}>
      <Text style={{ color: accent ? '#E8414A' : '#FFFDFC', fontSize: 17, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Text>
    </View>
  );
}

function formatMonth(dateStr: string | undefined) {
  if (!dateStr) return '—';
  try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  catch { return dateStr; }
}

export default function EraDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [era, setEra] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/insights/eras');
      const d = await res.json();
      const decodedId = decodeURIComponent(id as string);
      const all: any[] = d.eras || [];
      const found = all.find((e: any) => e.id === decodedId);
      // Determine if it's truly the current (most recent with no to)
      const sorted = [...all].reverse();
      const isCurrentEra = sorted[0]?.id === decodedId && !found?.to;
      setEra(found ? { ...found, _isCurrent: isCurrentEra } : null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const themeColor = era ? (THEME_COLORS[era.narrative?.theme] || '#E8414A') : '#E8414A';
  const totalDays = era?.phases?.reduce((a: number, p: any) => a + (p.durationDays || 0), 0) || 0;

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
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 16 }} numberOfLines={1}>
            {era?.narrative?.title || 'Era Detail'}
          </Text>
          <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 }}>Life Chapter</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#E8414A" size="large" />
        </View>
      ) : !era ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 14, textAlign: 'center' }}>Era not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: '#E8414A', fontSize: 14 }}>← Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>

          {/* Hero */}
          <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 20, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {era.narrative?.theme && (
                <View style={{ backgroundColor: themeColor + '18', borderWidth: 1, borderColor: themeColor + '35', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: themeColor, fontSize: 10, fontWeight: '700' }}>{era.narrative.theme}</Text>
                </View>
              )}
              {era._isCurrent && (
                <View style={{ backgroundColor: 'rgba(232,65,74,0.12)', borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: '#E8414A', fontSize: 10, fontWeight: '700' }}>ACTIVE</Text>
                </View>
              )}
            </View>
            <Text style={{ color: '#FFFDFC', fontSize: 22, fontWeight: '900', marginBottom: 6 }}>{era.narrative?.title || 'Untitled Era'}</Text>
            {era.narrative?.subtitle && (
              <Text style={{ color: 'rgba(236,231,227,0.6)', fontSize: 14, lineHeight: 20, marginBottom: 10 }}>{era.narrative.subtitle}</Text>
            )}
            <Text style={{ color: 'rgba(236,231,227,0.35)', fontSize: 12 }}>
              {formatMonth(era.from)} → {era._isCurrent ? 'Present' : formatMonth(era.to)}
            </Text>
          </View>

          {/* Metrics */}
          <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 18, marginBottom: 14 }}>
            {sectionLabel('Era Metrics')}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <MetricBox label="Days" value={String(totalDays)} />
              <MetricBox label="Phases" value={String(era.phases?.length || 0)} accent />
              <MetricBox label="Stability" value={`${Math.round((era.stability || 0) * 100)}%`} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <MetricBox label="Volatility" value={`${Math.round((era.volatility || 0) * 100)}%`} />
              <MetricBox label="Avg Mood" value={(era.summaryVector?.avgMood || 0).toFixed(1)} />
              <MetricBox label="Avg Energy" value={(era.summaryVector?.avgEnergy || 0).toFixed(1)} />
            </View>
          </View>

          {/* Story */}
          {era.narrative?.story && (
            <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 18, marginBottom: 14 }}>
              {sectionLabel('Story')}
              <Text style={{ color: 'rgba(236,231,227,0.7)', fontSize: 14, lineHeight: 22 }}>{era.narrative.story}</Text>
            </View>
          )}

          {/* AI Intelligence */}
          {era.explanation && (
            <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)', padding: 18, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Zap size={13} color="#E8414A" />
                {sectionLabel('Jarvis Intelligence')}
              </View>
              {era.explanation.summary && (
                <Text style={{ color: 'rgba(236,231,227,0.7)', fontSize: 13, lineHeight: 20, marginBottom: 10 }}>{era.explanation.summary}</Text>
              )}
              {era.explanation.keyPatterns?.length > 0 && (
                <>
                  <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>Key Patterns</Text>
                  {era.explanation.keyPatterns.map((p: string, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 }}>
                      <Text style={{ color: '#E8414A', marginRight: 8, marginTop: 1 }}>→</Text>
                      <Text style={{ color: 'rgba(236,231,227,0.65)', fontSize: 12, flex: 1, lineHeight: 18 }}>{p}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* Phase Timeline */}
          {era.phases?.length > 0 && (
            <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 18 }}>
              {sectionLabel('Phase Timeline')}
              {era.phases.map((phase: any, i: number) => {
                const pColor = PHASE_COLORS[phase.phase] || '#ECE7E3';
                return (
                  <View key={i} style={{
                    borderBottomWidth: i < era.phases.length - 1 ? 1 : 0,
                    borderBottomColor: '#2A2B2F',
                    paddingVertical: 12,
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                  }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: pColor, marginTop: 5, marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <Text style={{ color: pColor, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' }}>
                          {phase.phase?.replace(/_/g, ' ')}
                        </Text>
                        <Text style={{ color: 'rgba(236,231,227,0.35)', fontSize: 11 }}>{phase.durationDays || 0}d</Text>
                      </View>
                      <Text style={{ color: 'rgba(236,231,227,0.35)', fontSize: 11 }}>
                        {phase.startDate} → {phase.endDate || 'Present'}
                      </Text>
                      {phase.reason && (
                        <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 12, marginTop: 4 }} numberOfLines={2}>{phase.reason}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
