import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView
} from 'react-native';
import { ArrowLeft, Flame, TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWithAuth } from '../../../utils/api';

const C = {
  bg: '#0f1115', card: '#161922', border: '#232632',
  text: '#f3f4f6', subtext: '#9ca3af', muted: '#6b7280',
  emerald: '#10b981', amber: '#f59e0b', red: '#f87171',
};

const THEME_COLORS: Record<string, string> = {
  Growth: '#4ade80', Overextension: '#f87171', Contraction: '#facc15',
  Entropy: '#a78bfa', Restoration: '#60a5fa',
};

const PHASE_COLORS: Record<string, string> = {
  grind: '#60a5fa', burnout: '#f87171', recovery: '#4ade80',
  slump: '#facc15', balanced: '#d1d5db',
};

function MetricPill({ label, value, color = C.subtext }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, flex: 1, alignItems: 'center' }}>
      <Text style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</Text>
      <Text style={{ color, fontSize: 18, fontWeight: '800' }}>{value}</Text>
    </View>
  );
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
      const found = (d.eras || []).find((e: any) => e.id === decodedId);
      setEra(found || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const themeColor = era ? (THEME_COLORS[era.narrative?.theme] || '#f59e0b') : '#f59e0b';
  const totalDays = era?.phases?.reduce((a: number, p: any) => a + (p.durationDays || 0), 0) || 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: 16 }}>
          <ArrowLeft color={C.subtext} size={18} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.5 }} numberOfLines={1}>
            {era?.narrative?.title || 'Era Detail'}
          </Text>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, marginTop: 1 }}>Life Chapter</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.emerald} size="large" />
        </View>
      ) : !era ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Text style={{ color: C.muted, fontSize: 15, textAlign: 'center' }}>Era not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: C.emerald, fontSize: 14 }}>← Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

          {/* ── HERO ── */}
          <View style={{ backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: themeColor, padding: 20, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ color: C.subtext, fontSize: 12 }}>{era.from} → {era.to || 'Now'}</Text>
              <View style={{ backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: C.subtext, fontSize: 11 }}>
                  {era.direction === 'up' ? '📈 Ascending' : era.direction === 'down' ? '📉 Declining' : era.direction === 'chaotic' ? '🌪 Chaotic' : '➖ Stable'}
                </Text>
              </View>
            </View>
            {era.narrative?.theme && (
              <View style={{ alignSelf: 'flex-start', backgroundColor: themeColor + '20', borderWidth: 1, borderColor: themeColor + '40', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 }}>
                <Text style={{ color: themeColor, fontSize: 11, fontWeight: '700' }}>{era.narrative.theme}</Text>
              </View>
            )}
            <Text style={{ color: C.text, fontSize: 22, fontWeight: '900', marginBottom: 4 }}>{era.narrative?.title || 'Untitled Era'}</Text>
            {era.narrative?.subtitle && <Text style={{ color: C.subtext, fontSize: 14, marginBottom: 8 }}>{era.narrative.subtitle}</Text>}
          </View>

          {/* ── STORY ── */}
          {era.narrative?.story && (
            <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 16 }}>
              <Text style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700', marginBottom: 8 }}>Story</Text>
              <Text style={{ color: C.subtext, fontSize: 14, lineHeight: 22 }}>{era.narrative.story}</Text>
            </View>
          )}

          {/* ── METRICS ── */}
          <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 16 }}>
            <Text style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700', marginBottom: 12 }}>Era Metrics</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <MetricPill label="Days" value={String(totalDays)} color={C.text} />
              <MetricPill label="Phases" value={String(era.phases?.length || 0)} color={C.emerald} />
              <MetricPill label="Stability" value={`${Math.round((era.stability || 0) * 100)}%`} color="#60a5fa" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <MetricPill label="Volatility" value={`${Math.round((era.volatility || 0) * 100)}%`} color={C.amber} />
              <MetricPill label="Avg Mood" value={(era.summaryVector?.avgMood || 0).toFixed(1)} color="#a78bfa" />
              <MetricPill label="Avg Energy" value={(era.summaryVector?.avgEnergy || 0).toFixed(1)} color={C.emerald} />
            </View>
          </View>

          {/* ── AI INTELLIGENCE ── */}
          {era.explanation && (
            <View style={{ backgroundColor: '#1a1f2e', borderRadius: 16, borderWidth: 1, borderColor: '#2d3561', padding: 18, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Zap size={14} color="#818cf8" />
                <Text style={{ color: '#818cf8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700', marginLeft: 6 }}>Jarvis Intelligence</Text>
              </View>
              {era.explanation.summary && (
                <Text style={{ color: '#c7d2fe', fontSize: 13, lineHeight: 20, marginBottom: 10 }}>{era.explanation.summary}</Text>
              )}
              {era.explanation.keyPatterns?.length > 0 && (
                <>
                  <Text style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Key Patterns</Text>
                  {era.explanation.keyPatterns.map((p: string, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
                      <Text style={{ color: '#818cf8', marginRight: 6 }}>→</Text>
                      <Text style={{ color: '#a5b4fc', fontSize: 12, flex: 1 }}>{p}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* ── PHASE TIMELINE ── */}
          {era.phases?.length > 0 && (
            <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18 }}>
              <Text style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700', marginBottom: 14 }}>Phase Timeline</Text>
              {era.phases.map((phase: any, i: number) => {
                const pColor = PHASE_COLORS[phase.phase] || '#9ca3af';
                return (
                  <View key={i} style={{
                    borderBottomWidth: i < era.phases.length - 1 ? 1 : 0,
                    borderBottomColor: C.border,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                  }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pColor, marginTop: 5, marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <Text style={{ color: pColor, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' }}>
                          {phase.phase?.replace(/_/g, ' ')}
                        </Text>
                        <Text style={{ color: C.muted, fontSize: 11 }}>{phase.durationDays || 0}d</Text>
                      </View>
                      <Text style={{ color: C.muted, fontSize: 11 }}>
                        {phase.startDate} → {phase.endDate || 'Present'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
