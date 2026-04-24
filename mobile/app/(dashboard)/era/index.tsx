import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWithAuth } from '../../../utils/api';

const C = {
  bg: '#0f1115', card: '#161922', border: '#232632',
  text: '#f3f4f6', subtext: '#9ca3af', muted: '#6b7280',
};

const THEME_COLORS: Record<string, string> = {
  Growth: '#4ade80',
  Overextension: '#f87171',
  Contraction: '#facc15',
  Entropy: '#a78bfa',
  Restoration: '#60a5fa',
};

const DIR_LABELS: Record<string, string> = {
  up: '📈 Ascending', down: '📉 Declining', flat: '➖ Stable', chaotic: '🌪 Chaotic',
};

export default function ErasListScreen() {
  const router = useRouter();
  const [eras, setEras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/insights/eras');
      const d = await res.json();
      setEras((d.eras || []).reverse()); // Most recent first
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: 16 }}>
          <ArrowLeft color={C.subtext} size={18} />
        </TouchableOpacity>
        <View>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>Your Life Eras</Text>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, marginTop: 1 }}>High-level life chapters</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#10b981" size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          {eras.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ color: C.muted, fontSize: 15, textAlign: 'center' }}>
                No era data yet.{'\n'}Keep logging your daily data and Jarvis will detect life chapters.
              </Text>
            </View>
          ) : (
            eras.map((era, i) => {
              const themeColor = THEME_COLORS[era.narrative?.theme] || '#9ca3af';
              return (
                <TouchableOpacity
                  key={era.id || i}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/(dashboard)/era/${encodeURIComponent(era.id)}`)}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: C.border,
                    borderLeftWidth: 3,
                    borderLeftColor: themeColor,
                    padding: 20,
                    marginBottom: 14,
                    overflow: 'hidden',
                  }}
                >
                  {/* Top row */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.subtext, fontSize: 12, marginBottom: 4 }}>
                        {era.from} → {era.to || 'Now'}
                      </Text>
                      {era.narrative?.theme && (
                        <View style={{ alignSelf: 'flex-start', backgroundColor: themeColor + '20', borderWidth: 1, borderColor: themeColor + '40', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 }}>
                          <Text style={{ color: themeColor, fontSize: 10, fontWeight: '700' }}>{era.narrative.theme}</Text>
                        </View>
                      )}
                      <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 2 }}>
                        {era.narrative?.title || 'Untitled Era'}
                      </Text>
                      {era.narrative?.subtitle && (
                        <Text style={{ color: C.subtext, fontSize: 13 }} numberOfLines={2}>{era.narrative.subtitle}</Text>
                      )}
                    </View>
                    <View style={{ backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 12 }}>
                      <Text style={{ color: C.subtext, fontSize: 11 }}>{DIR_LABELS[era.direction] || '—'}</Text>
                    </View>
                  </View>

                  {/* Story snippet */}
                  {era.narrative?.story && (
                    <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }} numberOfLines={2}>
                      {era.narrative.story}
                    </Text>
                  )}

                  {/* Metrics */}
                  <View style={{ flexDirection: 'row', gap: 20, marginBottom: 10 }}>
                    <View>
                      <Text style={{ color: C.muted, fontSize: 10 }}>Stability</Text>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{Math.round((era.stability || 0) * 100)}%</Text>
                    </View>
                    <View>
                      <Text style={{ color: C.muted, fontSize: 10 }}>Volatility</Text>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{Math.round((era.volatility || 0) * 100)}%</Text>
                    </View>
                    <View>
                      <Text style={{ color: C.muted, fontSize: 10 }}>Phases</Text>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{era.phases?.length || 0}</Text>
                    </View>
                  </View>

                  {/* Mood/energy line */}
                  <Text style={{ color: C.muted, fontSize: 11 }}>
                    Mood: <Text style={{ color: C.subtext }}>{(era.summaryVector?.avgMood || 0).toFixed(1)}</Text>
                    {' · '}Energy: <Text style={{ color: C.subtext }}>{(era.summaryVector?.avgEnergy || 0).toFixed(1)}</Text>
                    {' · '}Stress: <Text style={{ color: C.subtext }}>{(era.summaryVector?.avgStress || 0).toFixed(1)}</Text>
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
