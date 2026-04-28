import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { fetchWithAuth } from '../../../../utils/api';
import { ArrowLeft, Trash2, Plus } from 'lucide-react-native';

export default function GoalDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [draftSignals, setDraftSignals] = useState<{ key: string; weight: number }[]>([]);
  const [saving, setSaving] = useState(false);

  // Signal picker state
  const [availableSignals, setAvailableSignals] = useState<any[]>([]);
  const [selectedSignalKey, setSelectedSignalKey] = useState('');

  useEffect(() => {
    loadAll();
  }, [id]);

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
    } catch (e) {
      console.error(e);
    }
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
        body: JSON.stringify({
          signals: draftSignals,
          rules: data.goal.rules
        })
      });
      setIsEditing(false);
      await loadAll();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const deleteGoal = async () => {
    Alert.alert(
      "Delete Goal",
      "Are you sure you want to delete this goal?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await fetchWithAuth(`/goals/${id}`, { method: 'DELETE' });
              router.back();
            } catch (e) {
              console.error(e);
            }
          }
        }
      ]
    );
  };

  if (loading) return (
    <View className="flex-1 bg-[#0f1115] justify-center items-center">
      <ActivityIndicator size="large" color="#f59e0b" />
    </View>
  );

  if (!data || data.error) return (
    <View className="flex-1 bg-[#0f1115] justify-center items-center">
      <Text className="text-red-400">Goal not found.</Text>
      <TouchableOpacity onPress={() => router.back()} className="mt-4 bg-[#232632] px-4 py-2 rounded">
        <Text className="text-white">Go Back</Text>
      </TouchableOpacity>
    </View>
  );

  const { goal, stats, explanation, pressure } = data;

  // Helper: get signal label from availableSignals
  const getLabel = (key: string) => {
    const sig = availableSignals.find(s => s.key === key);
    return sig?.label || key;
  };

  // Signals not yet added to the goal
  const unaddedSignals = availableSignals.filter(s => !draftSignals.find(d => d.key === s.key));

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* Header */}
      <BlurView intensity={20} tint="dark" className="pt-16 pb-4 px-4 border-b border-[#232632] flex-row justify-between items-center z-10">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg flex-1 ml-2" numberOfLines={1}>{goal.title}</Text>

        {!isEditing ? (
          <TouchableOpacity onPress={() => setIsEditing(true)} className="bg-[#161922] border border-[#232632] px-3 py-1.5 rounded-lg">
            <Text className="text-white font-medium">Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => { setIsEditing(false); setDraftSignals(goal.signals || []); }} className="bg-[#161922] border border-[#232632] px-3 py-1.5 rounded-lg">
            <Text className="text-gray-400 font-medium">Cancel</Text>
          </TouchableOpacity>
        )}
      </BlurView>

      <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Stats */}
        <View className="bg-[#161922] border border-[#232632] rounded-2xl p-5 mb-6 flex-row justify-between items-center">
          <View>
            <Text className="text-gray-400 text-xs mb-1">Current Score</Text>
            <Text className="text-white font-bold text-2xl">{stats?.currentScore ?? 0}%</Text>
          </View>
          <StateBadge state={stats?.state || 'unknown'} />
          {isEditing && (
            <TouchableOpacity onPress={deleteGoal} className="ml-4 p-2 bg-red-500/10 rounded-lg border border-red-500/30">
              <Trash2 size={20} color="#f87171" />
            </TouchableOpacity>
          )}
        </View>

        {/* Pressure Info */}
        {pressure && pressure.status !== 'aligned' && (
          <View className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
            <Text className="text-red-400 font-medium mb-1 capitalize">⚠ {pressure.status} Load</Text>
            {pressure.reasons?.map((r: string, i: number) => (
              <Text key={i} className="text-gray-300 text-sm mb-1">• {r}</Text>
            ))}
          </View>
        )}

        {/* Signals Section */}
        <View className="mb-6">
          <Text className="text-white font-semibold text-lg mb-4">Tracked Signals</Text>

          {draftSignals.length === 0 && (
            <Text className="text-gray-500 text-sm mb-4">No signals tracked yet. {isEditing ? 'Add some below.' : 'Tap Edit to add signals.'}</Text>
          )}

          {draftSignals.map((s, idx) => (
            <View key={s.key} className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-3">
              <View className="flex-row justify-between items-center mb-2">
                <View>
                  <Text className="text-white font-medium">{getLabel(s.key)}</Text>
                  <Text className="text-gray-500 text-xs">{s.key}</Text>
                </View>
                {isEditing ? (
                  <View className="flex-row items-center gap-3">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-gray-400 text-xs">Wt</Text>
                      <TextInput
                        className="bg-[#0f1115] border border-[#232632] text-white px-2 py-1 rounded w-14 text-center"
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
                      <Text className="text-red-400 text-xs">Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text className="text-gray-400 text-sm">Weight: {s.weight}</Text>
                )}
              </View>

              {!isEditing && explanation?.signals && (() => {
                const vals = explanation.signals.find((x: any) => x.key === s.key)?.values;
                if (!vals?.length) return null;
                return (
                  <View className="flex-row gap-1 mt-1">
                    {vals.map((v: number, i: number) => (
                      <View key={i} className={`flex-1 h-2 rounded-sm ${v ? 'bg-emerald-500/60' : 'bg-[#0f1115] border border-[#232632]'}`} />
                    ))}
                  </View>
                );
              })()}
            </View>
          ))}

          {/* Signal Picker (edit mode only) */}
          {isEditing && (
            <View className="bg-[#161922] border border-[#232632] rounded-xl p-4 mt-2">
              <Text className="text-gray-400 text-xs mb-3">Add a signal to track</Text>
              {unaddedSignals.length === 0 ? (
                <Text className="text-gray-500 text-xs">All available signals are already added.</Text>
              ) : (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                    {unaddedSignals.map(s => (
                      <TouchableOpacity
                        key={s.key}
                        onPress={() => setSelectedSignalKey(s.key)}
                        className={`mr-2 px-3 py-2 rounded-lg border ${selectedSignalKey === s.key ? 'border-[#10b981] bg-[#10b981]/20' : 'border-[#232632]'}`}
                      >
                        <Text className={`text-sm ${selectedSignalKey === s.key ? 'text-[#10b981]' : 'text-gray-400'}`}>{s.label || s.key}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    onPress={addSignal}
                    className="bg-[#232632] p-3 rounded-lg flex-row items-center justify-center gap-2"
                  >
                    <Plus size={16} color="#fff" />
                    <Text className="text-white font-medium">Add Signal</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>

        {isEditing && (
          <TouchableOpacity onPress={saveChanges} disabled={saving} className="bg-white p-4 rounded-xl items-center mt-2 mb-6">
            <Text className="text-black font-bold text-base">{saving ? 'Saving...' : 'Save Changes'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: any = {
    on_track: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
    slow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    drifting: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
    stalled: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
    recovering: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
    unknown: { bg: 'bg-gray-500/10', text: 'text-gray-500', border: 'border-gray-500/20' },
  };
  const style = map[state] || map.unknown;
  return (
    <View className={`px-2.5 py-1 rounded-full border ${style.bg} ${style.border}`}>
      <Text className={`text-[10px] font-semibold uppercase ${style.text}`}>{state.replace('_', ' ')}</Text>
    </View>
  );
}
