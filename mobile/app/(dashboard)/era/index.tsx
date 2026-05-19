import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWithAuth } from '../../../utils/api';

const THEME_COLORS: Record<string, string> = {
  Growth: '#E8414A', Overextension: '#B42129', Contraction: '#F3767D',
  Entropy: '#F9A8AC', Restoration: '#ECE7E3',
};

function DirectionIcon({ dir }: { dir: string }) {
  if (dir === 'up') return <TrendingUp size={13} color="#E8414A" />;
  if (dir === 'down') return <TrendingDown size={13} color="rgba(236,231,227,0.5)" />;
  return <Minus size={13} color="rgba(236,231,227,0.4)" />;
}

function formatMonth(dateStr: string | undefined) {
  if (!dateStr) return '—';
  try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  catch { return dateStr; }
}

export default function ErasListScreen() {
  const router = useRouter();
  const [eras, setEras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/insights/eras');
      const d = await res.json();
      setEras((d.eras || []).reverse());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
          <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 17 }}>Life Eras</Text>
          <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Life chapters</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#E8414A" size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
          {eras.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 14, textAlign: 'center' }}>
                No era data yet.{'\n'}Keep logging daily data and Jarvis will detect life chapters.
              </Text>
            </View>
          ) : (
            eras.map((era, i) => {
              const themeColor = THEME_COLORS[era.narrative?.theme] || '#ECE7E3';
              // Only first item (most recent) with no endDate is truly current
              const isCurrent = i === 0 && !era.to;

              return (
                <TouchableOpacity
                  key={era.id || i}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/(dashboard)/era/${encodeURIComponent(era.id)}`)}
                  style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 18, marginBottom: 12 }}
                >
                  {/* Top row */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <View style={{ flex: 1 }}>
                      {/* Theme + Current badges */}
                      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        {era.narrative?.theme && (
                          <View style={{ backgroundColor: themeColor + '18', borderWidth: 1, borderColor: themeColor + '35', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}>
                            <Text style={{ color: themeColor, fontSize: 10, fontWeight: '700' }}>{era.narrative.theme}</Text>
                          </View>
                        )}
                        {isCurrent && (
                          <View style={{ backgroundColor: 'rgba(232,65,74,0.12)', borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ color: '#E8414A', fontSize: 10, fontWeight: '700' }}>ACTIVE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: '#FFFDFC', fontSize: 17, fontWeight: '800', marginBottom: 3 }}>
                        {era.narrative?.title || 'Untitled Era'}
                      </Text>
                      {era.narrative?.subtitle && (
                        <Text style={{ color: 'rgba(236,231,227,0.55)', fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
                          {era.narrative.subtitle}
                        </Text>
                      )}
                    </View>
                    <ChevronRight size={16} color="rgba(236,231,227,0.25)" style={{ marginLeft: 8, marginTop: 2 }} />
                  </View>

                  {/* Story snippet */}
                  {era.narrative?.story && (
                    <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 12, lineHeight: 17, marginBottom: 12 }} numberOfLines={2}>
                      {era.narrative.story}
                    </Text>
                  )}

                  {/* Stat grid */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                    <View style={{ flex: 1, backgroundColor: '#161618', borderRadius: 8, padding: 8 }}>
                      <Text style={{ color: '#FFFDFC', fontSize: 13, fontWeight: '700' }}>{era.phases?.length || 0}</Text>
                      <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, marginTop: 1 }}>Phases</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: '#161618', borderRadius: 8, padding: 8 }}>
                      <Text style={{ color: '#FFFDFC', fontSize: 13, fontWeight: '700' }}>{Math.round((era.stability || 0) * 100)}%</Text>
                      <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, marginTop: 1 }}>Stability</Text>
                    </View>
                    <View style={{ flex: 2, backgroundColor: '#161618', borderRadius: 8, padding: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <DirectionIcon dir={era.direction} />
                        <Text style={{ color: '#FFFDFC', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' }}>{era.direction || 'Unknown'}</Text>
                      </View>
                      <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, marginTop: 1 }}>Direction</Text>
                    </View>
                  </View>

                  {/* Date footer */}
                  <Text style={{ color: 'rgba(236,231,227,0.3)', fontSize: 11 }}>
                    {formatMonth(era.from)} → {isCurrent ? 'Present' : formatMonth(era.to)}
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
