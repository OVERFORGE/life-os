import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { fetchWithAuth } from '../../../../utils/api';
import { ArrowLeft, Trash2 } from 'lucide-react-native';

export default function GoalDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [draftSignals, setDraftSignals] = useState<{ key: string; weight: number }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchWithAuth(`/goals/${id}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        if (d?.goal?.signals) setDraftSignals(d.goal.signals);
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [id]);

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
      // Reload data
      const res = await fetchWithAuth(`/goals/${id}`);
      const d = await res.json();
      setData(d);
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

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* Header */}
      <BlurView intensity={20} tint="dark" className="pt-16 pb-4 px-4 border-b border-[#232632] flex-row justify-between items-center z-10">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        
        {!isEditing ? (
          <TouchableOpacity onPress={() => setIsEditing(true)} className="bg-[#161922] border border-[#232632] px-3 py-1.5 rounded-lg">
            <Text className="text-white font-medium">Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(false)} className="bg-[#161922] border border-[#232632] px-3 py-1.5 rounded-lg">
            <Text className="text-gray-400 font-medium">Cancel</Text>
          </TouchableOpacity>
        )}
      </BlurView>

      <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* Title & Stats */}
        <View className="mb-8 flex-row justify-between items-start">
          <View className="flex-1">
            <Text className="text-2xl font-bold text-white mb-2">{goal.title}</Text>
            <View className="flex-row items-center gap-3">
              <StateBadge state={stats?.state || 'unknown'} />
              <Text className="text-gray-400 text-sm">Score: {stats?.currentScore ?? 0}%</Text>
            </View>
          </View>
          {isEditing && (
            <TouchableOpacity onPress={deleteGoal} className="ml-4 p-2 bg-red-500/10 rounded-lg border border-red-500/30">
              <Trash2 size={20} color="#f87171" />
            </TouchableOpacity>
          )}
        </View>

        {/* Pressure Info */}
        {pressure && (
          <View className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-6">
            <Text className="text-white font-medium mb-1">Goal Load Pressure</Text>
            <Text className="text-xs text-gray-400 capitalize mb-3">{pressure.status}</Text>
            {pressure.reasons?.map((r: string, i: number) => (
              <Text key={i} className="text-gray-300 text-sm mb-1">• {r}</Text>
            ))}
          </View>
        )}

        {/* Signals */}
        <View className="mb-6">
          <Text className="text-white font-semibold text-lg mb-4">Tracked Signals</Text>
          
          {draftSignals.map((s, idx) => (
            <View key={s.key} className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-3">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-white font-medium">{s.key}</Text>
                {isEditing ? (
                  <View className="flex-row items-center gap-3">
                    <TextInput
                      className="bg-[#0f1115] border border-[#232632] text-white px-2 py-1 rounded w-16 text-center"
                      keyboardType="numeric"
                      value={String(s.weight)}
                      onChangeText={(v) => {
                        const next = [...draftSignals];
                        next[idx].weight = Number(v);
                        setDraftSignals(next);
                      }}
                    />
                    <TouchableOpacity onPress={() => setDraftSignals(draftSignals.filter((_, i) => i !== idx))}>
                      <Text className="text-red-400 text-xs">Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text className="text-gray-400 text-sm">Weight: {s.weight}</Text>
                )}
              </View>

              {!isEditing && explanation?.signals && (
                <View className="flex-row gap-1">
                  {explanation.signals.find((x: any) => x.key === s.key)?.values?.map((v: number, i: number) => (
                    <View key={i} className={`flex-1 h-2 rounded-sm ${v ? 'bg-[#374151]' : 'bg-[#0f1115] border border-[#232632]'}`} />
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        {isEditing && (
          <TouchableOpacity onPress={saveChanges} disabled={saving} className="bg-white p-4 rounded-xl items-center mt-4">
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
