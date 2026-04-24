import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Brain, ArrowRight, Activity, Flame, ChevronRight, Zap, TrendingDown, TrendingUp, Minus } from 'lucide-react-native';
import { fetchWithAuth } from '../../utils/api';

// ─── TrajectoryCard ──────────────────────────────────────────────────────────
export function TrajectoryCard({ data }: { data: any }) {
  const router = useRouter();
  if (!data) return null;

  const phaseLabel = data.phase?.replace(/_/g, ' ') || 'Unknown';
  const confidencePct = Math.round((data.confidence || 0) * 100);

  const phaseTheme: Record<string, { color: string; bg: string; border: string }> = {
    grind:    { color: '#60a5fa', bg: '#1e3a5f22', border: '#2563eb44' },
    burnout:  { color: '#f87171', bg: '#5f1e1e22', border: '#dc262644' },
    recovery: { color: '#4ade80', bg: '#1e5f2722', border: '#16a34a44' },
    slump:    { color: '#facc15', bg: '#5f4e1e22', border: '#ca8a0444' },
    balanced: { color: '#d1d5db', bg: '#2a2d3a22', border: '#4b556344' },
  };
  const theme = phaseTheme[data.phase] || phaseTheme.balanced;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => router.push('/(dashboard)/trajectory')}
      style={{
        backgroundColor: '#161922',
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderLeftWidth: 3,
        borderLeftColor: theme.color,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' }}>Life State</Text>
        <Brain size={18} color={theme.color} />
      </View>

      <Text style={{ fontSize: 24, fontWeight: '900', color: theme.color, textTransform: 'capitalize', marginBottom: 2 }}>
        {phaseLabel}
      </Text>
      <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>Confidence: {confidencePct}%</Text>

      <Text style={{ fontSize: 13, color: '#9ca3af', lineHeight: 20, marginBottom: 14 }} numberOfLines={2}>
        {data.reason || 'Analyzing trajectory...'}
      </Text>

      {data.insights?.length > 0 && (
        <View style={{ marginBottom: 14, gap: 4 }}>
          {data.insights.slice(0, 2).map((insight: string, idx: number) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.color, marginTop: 6, marginRight: 8, opacity: 0.7 }} />
              <Text style={{ fontSize: 12, color: '#6b7280', flex: 1 }}>{insight}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: '#232632', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '700', letterSpacing: 2 }}>VIEW TIMELINE</Text>
        <ArrowRight size={14} color="#6b7280" />
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
        // Find the current era (the last one, which may be ongoing)
        const current = eras.find(e => e.phases?.some((p: any) => !p.endDate)) || eras[eras.length - 1];
        setEra(current || null);
      })
      .catch(console.error);
  }, []);

  const themeColors: Record<string, string> = {
    Growth: '#4ade80', Overextension: '#f87171', Contraction: '#facc15',
    Entropy: '#a78bfa', Restoration: '#60a5fa',
  };
  const themeColor = era ? (themeColors[era.narrative?.theme] || '#f59e0b') : '#f59e0b';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => router.push('/(dashboard)/era/')}
      style={{
        backgroundColor: '#161922',
        borderWidth: 1,
        borderColor: '#232632',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        borderLeftWidth: 3,
        borderLeftColor: era ? themeColor : '#f59e0b',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' }}>Current Era</Text>
        <Flame size={18} color={themeColor} />
      </View>

      {era ? (
        <>
          {era.narrative?.theme && (
            <View style={{ backgroundColor: themeColor + '20', borderWidth: 1, borderColor: themeColor + '40', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 6 }}>
              <Text style={{ color: themeColor, fontSize: 10, fontWeight: '700' }}>{era.narrative.theme}</Text>
            </View>
          )}
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#f3f4f6', marginBottom: 2 }}>
            {era.narrative?.title || 'Untitled Era'}
          </Text>
          <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
            {era.from} → {era.to || 'Now'} · {era.phases?.length || 0} phases
          </Text>
          {era.narrative?.subtitle && (
            <Text style={{ fontSize: 13, color: '#9ca3af', lineHeight: 20, marginBottom: 4 }} numberOfLines={2}>
              {era.narrative.subtitle}
            </Text>
          )}
        </>
      ) : (
        <>
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#f59e0b', marginBottom: 4 }}>Your Life Eras</Text>
          <Text style={{ fontSize: 13, color: '#9ca3af' }}>High-level chapters of your life</Text>
        </>
      )}

      <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: '#232632', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '700', letterSpacing: 2 }}>VIEW ALL ERAS</Text>
        <ArrowRight size={14} color="#6b7280" />
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
      <View style={{ backgroundColor: '#161922', borderWidth: 1, borderColor: '#232632', borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' }}>Goal Load</Text>
          <Activity size={18} color="#3b82f6" />
        </View>
        <Text style={{ color: '#6b7280', fontSize: 13 }}>No goals yet. Create goals to start tracking pressure.</Text>
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

  let modeLabel = 'Stable System Load ✅';
  let modeColor = '#4ade80';
  if (avgScore > 0.75) { modeLabel = 'Overloaded ⚠️'; modeColor = '#f87171'; }
  else if (avgScore < 0.35) { modeLabel = 'Underutilized 💤'; modeColor = '#facc15'; }

  const barColor = avgScore > 0.75 ? '#f87171' : avgScore > 0.5 ? '#f59e0b' : '#4ade80';

  return (
    <View style={{ backgroundColor: '#161922', borderWidth: 1, borderColor: '#232632', borderRadius: 16, padding: 20, marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' }}>Goal Load</Text>
          <Text style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>Jarvis system-wide goal pressure</Text>
        </View>
        <Activity size={18} color="#3b82f6" />
      </View>

      {/* Score */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 13, color: '#9ca3af' }}>Load Score</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#f3f4f6' }}>{pct}%</Text>
      </View>
      <View style={{ height: 8, backgroundColor: '#1c1f2a', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: 4 }} />
      </View>

      <Text style={{ fontSize: 14, fontWeight: '700', color: modeColor, marginBottom: 4 }}>{modeLabel}</Text>
      <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
        {avgScore > 0.75 ? 'Too much pressure. Reduce cadence or recover.'
          : avgScore < 0.35 ? 'You have unused capacity. Add more challenge.'
          : 'Your goals are balanced with your life capacity.'}
      </Text>

      {/* Distribution grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[
          { label: 'Aligned', count: distribution.aligned, color: '#4ade80' },
          { label: 'Strained', count: distribution.strained, color: '#facc15' },
          { label: 'Conflicting', count: distribution.conflicting, color: '#f97316' },
          { label: 'Toxic', count: distribution.toxic, color: '#f87171' },
        ].map(item => (
          <View key={item.label} style={{ flex: 1, minWidth: '45%', flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#0f1115', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>{item.label}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: item.count > 0 ? item.color : '#4b5563' }}>{item.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
