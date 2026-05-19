import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchWithAuth } from '../../../../utils/api';
import { ArrowLeft, Trash2, Plus, Zap, AlertTriangle } from 'lucide-react-native';

export default function GoalDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [draftSignals, setDraftSignals] = useState<{ key: string; weight: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const [availableSignals, setAvailableSignals] = useState<any[]>([]);
  const [selectedSignalKey, setSelectedSignalKey] = useState('');

  useEffect(() => { loadAll(); }, [id]);

  async function loadAll() {
    setLoading(true);
    try {
      const [goalRes, sigRes] = await Promise.all([
        fetchWithAuth(`/goals/${id}`),
        fetchWithAuth('/signals'),
      ]);

      if (goalRes.ok) {
        const d = await goalRes.json();
        setData(d);
        if (d?.goal?.signals) setDraftSignals(d.goal.signals);
      }

      if (sigRes.ok) {
        const sigData = await sigRes.json();
        const sigs = sigData.signals || [];
        setAvailableSignals(sigs);
        if (sigs.length > 0) setSelectedSignalKey(sigs[0].key);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  const addSignal = () => {
    if (!selectedSignalKey) return;
    if (draftSignals.find(s => s.key === selectedSignalKey)) return;
    setDraftSignals([...draftSignals, { key: selectedSignalKey, weight: 5 }]);
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      await fetchWithAuth(`/goals/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ signals: draftSignals, rules: data.goal.rules })
      });
      setIsEditing(false);
      await loadAll();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const deleteGoal = async () => {
    Alert.alert(
      "Delete Goal",
      "Are you sure you want to delete this goal?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
            try {
              await fetchWithAuth(`/goals/${id}`, { method: 'DELETE' });
              router.back();
            } catch (e) { console.error(e); }
          }
        }
      ]
    );
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: '#161618', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#E8414A" />
    </View>
  );

  if (!data || data.error) return (
    <View style={{ flex: 1, backgroundColor: '#161618', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#E8414A' }}>Goal not found.</Text>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, backgroundColor: '#1F2023', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2A2B2F' }}>
        <Text style={{ color: '#ECE7E3' }}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );

  const { goal, stats, explanation, pressure } = data;

  const getLabel = (key: string) => {
    const sig = availableSignals.find(s => s.key === key);
    return sig?.label || key;
  };

  const unaddedSignals = availableSignals.filter(s => !draftSignals.find(d => d.key === s.key));

  const sectionLabel = (text: string) => (
    <Text style={{ color: 'rgba(236,231,227,0.4)', fontWeight: '700', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>{text}</Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#161618' }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#2A2B2F', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft color="rgba(236,231,227,0.7)" size={17} />
        </TouchableOpacity>
        <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 16, flex: 1, marginLeft: 16 }} numberOfLines={1}>{goal.title}</Text>

        {!isEditing ? (
          <TouchableOpacity onPress={() => setIsEditing(true)} style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}>
            <Text style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 12 }}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => { setIsEditing(false); setDraftSignals(goal.signals || []); }} style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}>
            <Text style={{ color: 'rgba(236,231,227,0.5)', fontWeight: '700', fontSize: 12 }}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>

        {/* Stats */}
        <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Current Score</Text>
            <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 32 }}>{stats?.currentScore ?? 0}%</Text>
          </View>
          <StateBadge state={stats?.state || 'unknown'} />
          {isEditing && (
            <TouchableOpacity onPress={deleteGoal} style={{ marginLeft: 16, padding: 12, backgroundColor: 'rgba(180,33,41,0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(180,33,41,0.3)' }}>
              <Trash2 size={20} color="#B42129" />
            </TouchableOpacity>
          )}
        </View>

        {/* Pressure Info */}
        {pressure && pressure.status !== 'aligned' && (
          <View style={{ backgroundColor: 'rgba(180,33,41,0.08)', borderWidth: 1, borderColor: 'rgba(180,33,41,0.25)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <AlertTriangle size={16} color="#E8414A" />
              <Text style={{ color: '#E8414A', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>{pressure.status} Load</Text>
            </View>
            {pressure.reasons?.map((r: string, i: number) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
                <Text style={{ color: '#E8414A', marginRight: 8 }}>•</Text>
                <Text style={{ color: 'rgba(236,231,227,0.7)', fontSize: 13, lineHeight: 20, flex: 1 }}>{r}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Explanation Summary */}
        {!isEditing && explanation?.summary && (
          <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Zap size={14} color="#E8414A" />
              {sectionLabel('Jarvis Analysis')}
            </View>
            <Text style={{ color: 'rgba(236,231,227,0.7)', fontSize: 14, lineHeight: 22 }}>{explanation.summary}</Text>
          </View>
        )}

        {/* Signals Section */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 17, marginBottom: 16 }}>Tracked Signals</Text>

          {draftSignals.length === 0 && (
            <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 13, marginBottom: 16 }}>
              No signals tracked yet. {isEditing ? 'Add some below.' : 'Tap Edit to add signals.'}
            </Text>
          )}

          {draftSignals.map((s, idx) => (
            <View key={s.key} style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 14, padding: 16, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: !isEditing && explanation?.signals ? 12 : 0 }}>
                <View>
                  <Text style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 14, marginBottom: 2 }}>{getLabel(s.key)}</Text>
                  <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 11 }}>{s.key}</Text>
                </View>
                {isEditing ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Wt</Text>
                      <TextInput
                        style={{ backgroundColor: '#161618', borderWidth: 1, borderColor: '#2A2B2F', color: '#FFFDFC', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, textAlign: 'center', minWidth: 36 }}
                        keyboardType="numeric"
                        value={String(s.weight)}
                        onChangeText={(v) => {
                          const next = [...draftSignals];
                          next[idx].weight = Number(v) || 0;
                          setDraftSignals(next);
                        }}
                      />
                    </View>
                    <TouchableOpacity onPress={() => setDraftSignals(draftSignals.filter((_, i) => i !== idx))}>
                      <Text style={{ color: '#E8414A', fontSize: 12, fontWeight: '700' }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 12, fontWeight: '600' }}>Weight: {s.weight}</Text>
                )}
              </View>

              {/* Sparkline for historical signal hits */}
              {!isEditing && explanation?.signals && (() => {
                const vals = explanation.signals.find((x: any) => x.key === s.key)?.values;
                if (!vals?.length) return null;
                return (
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {vals.map((v: number, i: number) => (
                      <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: v ? '#E8414A' : '#161618', opacity: v ? 0.9 : 0.4 }} />
                    ))}
                  </View>
                );
              })()}
            </View>
          ))}

          {/* Signal Picker (edit mode only) */}
          {isEditing && (
            <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 14, padding: 16, marginTop: 8 }}>
              {sectionLabel('Add Signal')}
              {unaddedSignals.length === 0 ? (
                <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 12 }}>All available signals are already added.</Text>
              ) : (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    {unaddedSignals.map(s => {
                      const isSelected = selectedSignalKey === s.key;
                      return (
                        <TouchableOpacity
                          key={s.key}
                          onPress={() => setSelectedSignalKey(s.key)}
                          style={{
                            marginRight: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
                            borderColor: isSelected ? 'rgba(232,65,74,0.4)' : '#2A2B2F',
                            backgroundColor: isSelected ? 'rgba(232,65,74,0.08)' : '#161618'
                          }}
                        >
                          <Text style={{ color: isSelected ? '#E8414A' : 'rgba(236,231,227,0.5)', fontSize: 13, fontWeight: isSelected ? '700' : '500' }}>{s.label || s.key}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <TouchableOpacity
                    onPress={addSignal}
                    style={{ backgroundColor: '#161618', borderWidth: 1, borderColor: '#2A2B2F', padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                  >
                    <Plus size={16} color="#ECE7E3" />
                    <Text style={{ color: '#ECE7E3', fontWeight: '700' }}>Add Signal</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>

        {isEditing && (
          <TouchableOpacity onPress={saveChanges} disabled={saving} style={{ backgroundColor: '#E8414A', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginTop: 10, marginBottom: 20 }}>
            <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 16 }}>{saving ? 'Saving...' : 'Save Changes'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: any = {
    on_track: { bg: 'rgba(232,65,74,0.1)', text: '#E8414A', border: 'rgba(232,65,74,0.3)' }, // Using brand red instead of green
    slow: { bg: 'rgba(249,168,172,0.1)', text: '#F9A8AC', border: 'rgba(249,168,172,0.3)' },
    drifting: { bg: 'rgba(180,33,41,0.1)', text: '#B42129', border: 'rgba(180,33,41,0.3)' },
    stalled: { bg: 'rgba(236,231,227,0.05)', text: 'rgba(236,231,227,0.5)', border: 'rgba(236,231,227,0.15)' },
    recovering: { bg: 'rgba(255,253,252,0.08)', text: '#FFFDFC', border: 'rgba(255,253,252,0.2)' },
    unknown: { bg: 'rgba(236,231,227,0.05)', text: 'rgba(236,231,227,0.3)', border: 'rgba(236,231,227,0.1)' },
  };
  const style = map[state] || map.unknown;
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1, backgroundColor: style.bg, borderColor: style.border }}>
      <Text style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', color: style.text }}>{state.replace('_', ' ')}</Text>
    </View>
  );
}
