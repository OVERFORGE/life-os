import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { fetchWithAuth } from '../../../../utils/api';
import { ArrowLeft } from 'lucide-react-native';

export default function NewGoalScreen() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [type, setType] = useState('identity');
  const [signals, setSignals] = useState<{ key: string; weight: number }[]>([]);
  
  const [availableSignals, setAvailableSignals] = useState<any[]>([]);
  const [selectedSignalKey, setSelectedSignalKey] = useState('');
  
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchWithAuth('/signals')
      .then(r => r.json())
      .then(d => {
        if (d.signals) {
          setAvailableSignals(d.signals);
          if (d.signals.length > 0) setSelectedSignalKey(d.signals[0].key);
        }
      })
      .catch(e => console.error("Error loading signals:", e));
  }, []);

  const addSignal = () => {
    if (!selectedSignalKey) return;
    if (signals.find(s => s.key === selectedSignalKey)) return;
    
    setSignals([...signals, { key: selectedSignalKey, weight: 5 }]);
  };

  const removeSignal = (key: string) => {
    setSignals(signals.filter(s => s.key !== key));
  };

  const createGoal = async () => {
    if (!title) return;
    setCreating(true);
    try {
      const res = await fetchWithAuth('/goals/create', {
        method: 'POST',
        body: JSON.stringify({ title, type, signals })
      });
      const data = await res.json();
      if (data.id) {
        router.replace(`/(dashboard)/tools/goals/${data.id}`);
      } else {
        router.back();
      }
    } catch (e) {
      console.error(e);
      setCreating(false);
    }
  };

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* Header */}
      <BlurView intensity={20} tint="dark" className="pt-16 pb-4 px-4 border-b border-[#232632] flex-row justify-between items-center z-10">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg">New Goal</Text>
        <View className="w-10 h-10" />
      </BlurView>

      <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Title */}
        <View className="mb-6">
          <Text className="text-gray-400 text-xs mb-2">Goal Title</Text>
          <TextInput
            className="bg-[#161922] border border-[#232632] text-white p-4 rounded-xl"
            placeholder="e.g. Become a serious Solana developer"
            placeholderTextColor="#4b5563"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Type */}
        <View className="mb-8">
          <Text className="text-gray-400 text-xs mb-2">Goal Type</Text>
          <View className="flex-row flex-wrap gap-3">
            {['identity', 'performance', 'maintenance', 'recovery'].map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setType(t)}
                className={`px-4 py-2 rounded-lg border ${type === t ? 'border-white bg-[#232632]' : 'border-[#232632] bg-[#161922]'}`}
              >
                <Text className={`capitalize ${type === t ? 'text-white font-bold' : 'text-gray-400'}`}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Signals */}
        <View className="mb-8">
          <Text className="text-white font-semibold text-lg mb-4">Tracked Signals</Text>
          
          {/* Add Signal Form */}
          <View className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-4">
            <Text className="text-gray-400 text-xs mb-2">Select a signal to track</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              {availableSignals.map(s => (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => setSelectedSignalKey(s.key)}
                  className={`mr-2 px-3 py-1.5 rounded-lg border ${selectedSignalKey === s.key ? 'border-[#10b981] bg-[#10b981]/20' : 'border-[#232632]'}`}
                >
                  <Text className={selectedSignalKey === s.key ? 'text-[#10b981]' : 'text-gray-400'}>{s.key}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={addSignal} className="bg-[#232632] p-3 rounded-lg items-center">
              <Text className="text-white">+ Add Signal</Text>
            </TouchableOpacity>
          </View>

          {/* List of Added Signals */}
          {signals.map((s, idx) => (
            <View key={s.key} className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-3 flex-row justify-between items-center">
              <Text className="text-white font-medium">{s.key}</Text>
              <View className="flex-row items-center gap-4">
                <View className="flex-row items-center gap-2">
                  <Text className="text-gray-400 text-xs">Weight</Text>
                  <TextInput
                    className="bg-[#0f1115] border border-[#232632] text-white px-3 py-1 rounded w-16 text-center"
                    keyboardType="numeric"
                    value={String(s.weight)}
                    onChangeText={(v) => {
                      const next = [...signals];
                      next[idx].weight = Number(v);
                      setSignals(next);
                    }}
                  />
                </View>
                <TouchableOpacity onPress={() => removeSignal(s.key)}>
                  <Text className="text-red-400 text-xs">Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity 
          onPress={createGoal} 
          disabled={creating || !title} 
          className={`p-4 rounded-xl items-center mb-8 ${creating || !title ? 'bg-gray-600' : 'bg-white'}`}
        >
          <Text className="text-black font-bold text-base">{creating ? 'Creating...' : 'Create Goal'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
