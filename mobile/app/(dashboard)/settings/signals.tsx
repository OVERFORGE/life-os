import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { fetchWithAuth } from '../../../utils/api';

export default function SignalsScreen() {
  const router = useRouter();

  const [categories, setCategories] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [form, setForm] = useState({
    key: '',
    label: '',
    categoryKey: '',
    inputType: 'number',
    direction: 'higher_better',
    unit: '',
    target: '',
    min: '',
    max: '',
    step: '',
    dependsOn: '',
    showIf: ''
  });

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [catRes, sigRes] = await Promise.all([
        fetchWithAuth('/categories'),
        fetchWithAuth('/signals')
      ]);

      if (catRes.ok) {
        const d = await catRes.json();
        setCategories(d.categories || []);
        if (d.categories?.length > 0) setForm(f => ({ ...f, categoryKey: d.categories[0].key }));
      }
      if (sigRes.ok) {
        const d = await sigRes.json();
        setSignals(d.signals || []);
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to load signals data");
    }
    setLoading(false);
  }

  const addSignal = async () => {
    if (!form.key || !form.label || !form.categoryKey) {
      Alert.alert("Error", "Key, Label, and Category are required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetchWithAuth('/signals', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          target: form.target ? Number(form.target) : null,
          min: form.min ? Number(form.min) : null,
          max: form.max ? Number(form.max) : null,
          step: form.step ? Number(form.step) : null,
          dependsOn: form.dependsOn || null,
          showIf: form.showIf ? Number(form.showIf) : null,
        })
      });

      if (res.ok) {
        Alert.alert("Success", "Signal added successfully");
        setForm({
          key: '', label: '', categoryKey: categories[0]?.key || '',
          inputType: 'number', direction: 'higher_better',
          unit: '', target: '', min: '', max: '', step: '', dependsOn: '', showIf: ''
        });
        loadAll();
      } else {
        const d = await res.json();
        Alert.alert("Error", JSON.stringify(d.error));
      }
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  const removeSignal = (key: string) => {
    Alert.alert("Delete Signal", `Remove ${key}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          await fetchWithAuth(`/signals?key=${key}`, { method: 'DELETE' });
          loadAll();
      }}
    ]);
  };

  if (loading && signals.length === 0) {
    return (
      <View className="flex-1 bg-[#0f1115] items-center justify-center">
        <ActivityIndicator color="#fcd34d" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* Header */}
      <BlurView intensity={20} tint="dark" className="pt-16 pb-4 px-4 border-b border-[#232632] flex-row items-center z-10">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center mr-2">
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg">Custom Signals</Text>
      </BlurView>

      <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 150 }}>
        
        <View className="bg-[#161922] border border-[#232632] rounded-xl p-5 mb-8">
          <Text className="text-white font-bold text-lg mb-2">Create Signal</Text>
          <Text className="text-gray-400 text-xs mb-6">Signals are dynamic daily inputs: stress sliders, water intake numbers, journaling fields, etc.</Text>
          
          <Text className="text-gray-400 text-xs mb-1">Key (Internal ID)</Text>
          <TextInput
            className="bg-[#0f1115] border border-[#232632] rounded-lg p-3 text-white mb-4"
            placeholder="e.g. water_intake"
            placeholderTextColor="#4b5563"
            value={form.key}
            onChangeText={t => setForm({ ...form, key: t })}
          />

          <Text className="text-gray-400 text-xs mb-1">Label (UI Display)</Text>
          <TextInput
            className="bg-[#0f1115] border border-[#232632] rounded-lg p-3 text-white mb-4"
            placeholder="e.g. Water (L)"
            placeholderTextColor="#4b5563"
            value={form.label}
            onChangeText={t => setForm({ ...form, label: t })}
          />

          <Text className="text-gray-400 text-xs mb-1">Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 flex-row">
            {categories.map(c => (
              <TouchableOpacity
                key={c.key}
                onPress={() => setForm({ ...form, categoryKey: c.key })}
                className={`mr-2 px-3 py-2 rounded-lg border ${form.categoryKey === c.key ? 'border-[#10b981] bg-[#10b981]/20' : 'border-[#232632]'}`}
              >
                <Text className={form.categoryKey === c.key ? 'text-[#10b981]' : 'text-gray-400'}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text className="text-gray-400 text-xs mb-1">Input Type</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {['checkbox', 'number', 'slider', 'text', 'textarea'].map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setForm({ ...form, inputType: t })}
                className={`px-3 py-1.5 rounded-lg border ${form.inputType === t ? 'border-white bg-[#2a2f3a]' : 'border-[#232632]'}`}
              >
                <Text className={form.inputType === t ? 'text-white' : 'text-gray-400'}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-gray-400 text-xs mb-1">Direction</Text>
          <View className="flex-row gap-2 mb-4">
            <TouchableOpacity
              onPress={() => setForm({ ...form, direction: 'higher_better' })}
              className={`flex-1 p-2 rounded-lg items-center border ${form.direction === 'higher_better' ? 'border-[#10b981] bg-[#10b981]/20' : 'border-[#232632]'}`}
            >
              <Text className={form.direction === 'higher_better' ? 'text-[#10b981] text-xs font-bold' : 'text-gray-400 text-xs'}>Higher = Better</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setForm({ ...form, direction: 'lower_better' })}
              className={`flex-1 p-2 rounded-lg items-center border ${form.direction === 'lower_better' ? 'border-[#10b981] bg-[#10b981]/20' : 'border-[#232632]'}`}
            >
              <Text className={form.direction === 'lower_better' ? 'text-[#10b981] text-xs font-bold' : 'text-gray-400 text-xs'}>Lower = Better</Text>
            </TouchableOpacity>
          </View>

          {form.inputType === 'number' && (
            <View className="flex-row gap-2 mb-4">
              <View className="flex-1">
                <Text className="text-gray-400 text-xs mb-1">Unit</Text>
                <TextInput className="bg-[#0f1115] border border-[#232632] rounded-lg p-3 text-white" value={form.unit} onChangeText={t => setForm({ ...form, unit: t })} />
              </View>
              <View className="flex-1">
                <Text className="text-gray-400 text-xs mb-1">Target</Text>
                <TextInput keyboardType="numeric" className="bg-[#0f1115] border border-[#232632] rounded-lg p-3 text-white" value={form.target} onChangeText={t => setForm({ ...form, target: t })} />
              </View>
            </View>
          )}

          {form.inputType === 'slider' && (
            <View className="flex-row gap-2 mb-4">
              <View className="flex-1">
                <Text className="text-gray-400 text-xs mb-1">Min</Text>
                <TextInput keyboardType="numeric" className="bg-[#0f1115] border border-[#232632] rounded-lg p-3 text-white" value={form.min} onChangeText={t => setForm({ ...form, min: t })} />
              </View>
              <View className="flex-1">
                <Text className="text-gray-400 text-xs mb-1">Max</Text>
                <TextInput keyboardType="numeric" className="bg-[#0f1115] border border-[#232632] rounded-lg p-3 text-white" value={form.max} onChangeText={t => setForm({ ...form, max: t })} />
              </View>
              <View className="flex-1">
                <Text className="text-gray-400 text-xs mb-1">Step</Text>
                <TextInput keyboardType="numeric" className="bg-[#0f1115] border border-[#232632] rounded-lg p-3 text-white" value={form.step} onChangeText={t => setForm({ ...form, step: t })} />
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={addSignal}
            disabled={submitting}
            className={`mt-4 p-4 rounded-xl items-center ${submitting ? 'bg-gray-600' : 'bg-white'}`}
          >
            <Text className="text-black font-bold">{submitting ? 'Creating...' : '+ Create Signal'}</Text>
          </TouchableOpacity>
        </View>

        <View>
          <Text className="text-white font-bold text-lg mb-4">Active Signals</Text>
          {signals.map(s => (
            <View key={s.key} className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-3 flex-row justify-between items-center">
              <View>
                <Text className="text-white font-medium mb-1">{s.label}</Text>
                <Text className="text-gray-500 text-xs">{s.key} • {s.inputType} • {s.categoryKey}</Text>
              </View>
              <TouchableOpacity onPress={() => removeSignal(s.key)} className="p-2">
                <Trash2 size={20} color="#f87171" />
              </TouchableOpacity>
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}
