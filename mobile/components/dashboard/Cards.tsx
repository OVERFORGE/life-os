import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Activity, ChevronRight } from 'lucide-react-native';
import { fetchWithAuth } from '../../utils/api';

// ─── TrajectoryCard ──────────────────────────────────────────────────────────
export function TrajectoryCard({ data }: { data: any }) {
  const router = useRouter();
  if (!data) return null;

  const phaseLabel = data.phase?.replace(/_/g, ' ') || 'Unknown';
  const confidencePct = Math.round((data.confidence || 0) * 100);

  const phaseTheme: Record<string, { color: string; bg: string; border: string }> = {
    grind:    { color: '#E8414A', bg: 'rgba(232,65,74,0.08)',   border: 'rgba(232,65,74,0.25)'   },
    burnout:  { color: '#B42129', bg: 'rgba(180,33,41,0.08)',   border: 'rgba(180,33,41,0.25)'   },
    recovery: { color: '#ECE7E3', bg: 'rgba(236,231,227,0.06)', border: 'rgba(236,231,227,0.2)'  },
    slump:    { color: '#F9A8AC', bg: 'rgba(249,168,172,0.06)', border: 'rgba(249,168,172,0.2)'  },
    balanced: { color: '#FFFDFC', bg: 'rgba(255,253,252,0.04)', border: 'rgba(255,253,252,0.1)'  },
  };
  const theme = phaseTheme[data.phase] || phaseTheme.balanced;
  const insightCount = data.insights?.length || 0;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => router.push('/(dashboard)/trajectory')}
      style={{
        backgroundColor: '#1F2023',
        borderWidth: 1,
        borderColor: '#2A2B2F',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.4)', fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Life State</Text>
        <View style={{ backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ color: theme.color, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>{phaseLabel}</Text>
        </View>
      </View>

      <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFFDFC', marginBottom: 6 }}>
        {phaseLabel}
      </Text>

      <Text style={{ fontSize: 13, color: 'rgba(236,231,227,0.65)', lineHeight: 18, marginBottom: 16 }} numberOfLines={2}>
        {data.reason || 'Analyzing system trajectory...'}
      </Text>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <View style={{ flex: 1, backgroundColor: '#161618', borderRadius: 10, padding: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.color }}>{confidencePct}%</Text>
          <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Confidence</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#161618', borderRadius: 10, padding: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFDFC' }}>{insightCount}</Text>
          <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Insights</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, borderTopWidth: 1, borderTopColor: '#2A2B2F' }}>
        <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.4)', fontWeight: '700', letterSpacing: 1.5 }}>VIEW TRAJECTORY</Text>
        <ArrowRight size={14} color="rgba(236,231,227,0.5)" />
      </View>
    </TouchableOpacity>
  );
}

// ─── CurrentEraCard ──────────────────────────────────────────────────────────
export function CurrentEraCard() {
  const router = useRouter();
  const [era, setEra] = useState<any>(null);

  useEffect(() => {
    fetchWithAuth('/insights/eras')
      .then(r => r.json())
      .then(d => {
        const eras: any[] = d.eras || [];
        // Determine the most recent era (since backend logic may vary, we take the last generated or active)
        const sorted = [...eras].reverse();
        // first one with no 'to' is active, else fallback to just the most recent
        const current = sorted.find((e: any) => !e.to) || sorted[0];
        setEra(current || null);
      })
      .catch(console.error);
  }, []);

  const themeColors: Record<string, string> = {
    Growth: '#E8414A', Overextension: '#B42129', Contraction: '#F3767D',
    Entropy: '#F9A8AC', Restoration: '#ECE7E3',
  };
  const themeColor = era ? (themeColors[era.narrative?.theme] || '#ECE7E3') : '#ECE7E3';

  const activePhases = era?.phases?.filter((p: any) => !p.endDate).length || 0;
  const totalPhases = era?.phases?.length || 0;

  function formatMonth(dateStr: string | undefined) {
    if (!dateStr) return '—';
    try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
    catch { return dateStr; }
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => router.push('/(dashboard)/era/')}
      style={{
        backgroundColor: '#1F2023',
        borderWidth: 1,
        borderColor: '#2A2B2F',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.4)', fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Current Era</Text>
        {era?.narrative?.theme && (
          <View style={{ backgroundColor: themeColor + '18', borderWidth: 1, borderColor: themeColor + '35', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ color: themeColor, fontSize: 10, fontWeight: '700' }}>{era.narrative.theme}</Text>
          </View>
        )}
      </View>

      <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFFDFC', marginBottom: 6 }}>
        {era?.narrative?.title || 'Your Life Eras'}
      </Text>

      {era?.narrative?.subtitle && (
        <Text style={{ fontSize: 13, color: 'rgba(236,231,227,0.65)', lineHeight: 18, marginBottom: 16 }} numberOfLines={2}>
          {era.narrative.subtitle}
        </Text>
      )}

      {era && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          <View style={{ flex: 1, backgroundColor: '#161618', borderRadius: 10, padding: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFDFC' }}>{totalPhases}</Text>
            <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phases</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#161618', borderRadius: 10, padding: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: activePhases > 0 ? '#E8414A' : '#FFFDFC' }}>{activePhases}</Text>
            <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Active</Text>
          </View>
          <View style={{ flex: 1.5, backgroundColor: '#161618', borderRadius: 10, padding: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFDFC' }} numberOfLines={1}>{formatMonth(era.from)}</Text>
            <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Started</Text>
          </View>
        </View>
      )}

      <View style={{ paddingTop: 14, borderTopWidth: 1, borderTopColor: '#2A2B2F', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.4)', fontWeight: '700', letterSpacing: 1.5 }}>VIEW ALL ERAS</Text>
        <ArrowRight size={14} color="rgba(236,231,227,0.5)" />
      </View>
    </TouchableOpacity>
  );
}

// ─── GoalLoadCard ────────────────────────────────────────────────────────────
export function GoalLoadCard({ goalLoad }: { goalLoad: any }) {
  if (!goalLoad) return null;

  const perGoal = goalLoad.perGoal ?? [];
  if (perGoal.length === 0) {
    return (
      <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.4)', fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Goal Load</Text>
          <Activity size={18} color="#E8414A" />
        </View>
        <Text style={{ color: 'rgba(236,231,227,0.6)', fontSize: 13 }}>No goals yet. Create goals to start tracking pressure.</Text>
      </View>
    );
  }

  const avgScore = perGoal.reduce((s: number, g: any) => s + (g.pressureScore || 0), 0) / perGoal.length;
  const pct = Math.round(avgScore * 100);
  const distribution = {
    aligned:    perGoal.filter((g: any) => g.status === 'aligned').length,
    strained:   perGoal.filter((g: any) => g.status === 'strained').length,
    conflicting:perGoal.filter((g: any) => g.status === 'conflicting').length,
    toxic:      perGoal.filter((g: any) => g.status === 'toxic').length,
  };

  let modeLabel = 'Stable System Load';
  let modeColor = '#FFFDFC';
  if (avgScore > 0.75) { modeLabel = 'Overloaded'; modeColor = '#B42129'; }
  else if (avgScore < 0.35) { modeLabel = 'Underutilized'; modeColor = '#F9A8AC'; }

  const barColor = avgScore > 0.75 ? '#B42129' : avgScore > 0.5 ? '#E8414A' : '#ECE7E3';

  return (
    <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.4)', fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Goal Load</Text>
          <Text style={{ fontSize: 11, color: 'rgba(236,231,227,0.3)', marginTop: 2 }}>Jarvis system-wide goal pressure</Text>
        </View>
        <Activity size={18} color="#E8414A" />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 13, color: 'rgba(236,231,227,0.65)' }}>Load Score</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFDFC' }}>{pct}%</Text>
      </View>
      <View style={{ height: 6, backgroundColor: '#161618', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: 4 }} />
      </View>

      <Text style={{ fontSize: 14, fontWeight: '700', color: modeColor, marginBottom: 4 }}>{modeLabel}</Text>
      <Text style={{ fontSize: 12, color: 'rgba(236,231,227,0.5)', marginBottom: 16 }}>
        {avgScore > 0.75 ? 'Too much pressure. Reduce cadence or recover.'
          : avgScore < 0.35 ? 'You have unused capacity. Add more challenge.'
          : 'Your goals are balanced with your life capacity.'}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[
          { label: 'Aligned', count: distribution.aligned, color: '#ECE7E3' },
          { label: 'Strained', count: distribution.strained, color: '#F9A8AC' },
          { label: 'Conflicting', count: distribution.conflicting, color: '#E8414A' },
          { label: 'Toxic', count: distribution.toxic, color: '#B42129' },
        ].map(item => (
          <View key={item.label} style={{ flex: 1, minWidth: '45%', flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#161618', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text style={{ fontSize: 12, color: 'rgba(236,231,227,0.6)' }}>{item.label}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: item.count > 0 ? item.color : 'rgba(236,231,227,0.25)' }}>{item.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
