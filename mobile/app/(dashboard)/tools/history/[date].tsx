import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { fetchWithAuth } from '../../../../utils/api';
import { ArrowLeft, Save } from 'lucide-react-native';

export default function HistoryDayScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  
  const [form, setForm] = useState({
    planning: { plannedTasks: 0, completedTasks: 0, reasonNotCompleted: '' },
    reflection: { win: '', mistake: '', learned: '', bothering: '' },
    signals: {} as Record<string, any>
  });

  const [schemaSignals, setSchemaSignals] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [logRes, sigRes] = await Promise.all([
          fetchWithAuth(`/daily-log/by-date?date=${date}`),
          fetchWithAuth('/signals')
        ]);
        
        if (logRes.ok) {
          const data = await logRes.json();
          setForm(prev => ({ ...prev, ...data, signals: data.signals || {} }));
        }
        
        if (sigRes.ok) {
          const sigData = await sigRes.json();
          setSchemaSignals(sigData.signals || []);
        }
      } catch (e) {
        console.error("Error loading historical log:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [date]);

  const updateForm = (section: 'planning' | 'reflection', field: string, value: any) => {
    setForm(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value }
    }));
  };

  const updateSignal = async (key: string, value: any) => {
    setForm(prev => ({
      ...prev,
      signals: { ...prev.signals, [key]: value }
    }));

    try {
      await fetchWithAuth('/signals/log', {
        method: 'POST',
        body: JSON.stringify({ date, key, value })
      });
    } catch (e) {
      console.error("Error auto-saving historical signal:", e);
    }
  };

  const saveForm = async () => {
    setSaving(true);
    setStatus('');
    try {
      const res = await fetchWithAuth(`/daily-log/by-date?date=${date}`, {
        method: 'POST',
        body: JSON.stringify(form)
      });
      if (res.ok) setStatus('Saved ✅');
      else setStatus('Error saving ❌');
    } catch (e) {
      setStatus('Error saving ❌');
    }
    setSaving(false);
  };

  if (loading) return (
    <View className="flex-1 bg-[#0f1115] justify-center items-center">
      <ActivityIndicator size="large" color="#10b981" />
    </View>
  );

  const categories = ['physical', 'habits', 'work'];

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* Header */}
      <BlurView intensity={20} tint="dark" className="pt-16 pb-4 px-4 border-b border-[#232632] flex-row justify-between items-center z-10">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg">{date}</Text>
        <TouchableOpacity onPress={saveForm} disabled={saving} className="w-10 h-10 items-center justify-center">
          {saving ? <ActivityIndicator size="small" color="#10b981" /> : <Save color="#10b981" size={24} />}
        </TouchableOpacity>
      </BlurView>

      <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>
        {status ? <Text className="text-center text-[#10b981] mb-4 font-semibold">{status}</Text> : null}

        {/* ─── Core Check-in ─── */}
        <View className="bg-[#161922] border border-[#232632] rounded-2xl p-5 mb-6">
          <Text className="text-white font-semibold text-lg mb-1">Core Signals</Text>
          <Text className="text-gray-500 text-xs mb-4">System signals for this date</Text>

          <SignalInput label="Mood (1-10)" value={form.signals.mood ?? 5} onChange={(v: string) => updateSignal('mood', Number(v))} type="number" />
          <SignalInput label="Energy (1-10)" value={form.signals.energy ?? 5} onChange={(v: string) => updateSignal('energy', Number(v))} type="number" />
          <SignalInput label="Stress (1-10)" value={form.signals.stress ?? 5} onChange={(v: string) => updateSignal('stress', Number(v))} type="number" />
          <SignalInput label="Deep Work Hours" value={form.signals.deepWorkHours ?? 0} onChange={(v: string) => updateSignal('deepWorkHours', Number(v))} type="number" />
          <SignalInput label="Sleep Duration (hrs)" value={form.signals.sleepHours ?? 0} onChange={(v: string) => updateSignal('sleepHours', Number(v))} type="number" />
        </View>

        {/* ─── Dynamic Categories ─── */}
        {categories.map(category => {
          const sigs = schemaSignals.filter(s => s.categoryKey === category && !s.isCore);
          if (sigs.length === 0) return null;

          return (
            <View key={category} className="bg-[#161922] border border-[#232632] rounded-2xl p-5 mb-6">
              <Text className="text-white font-semibold text-lg capitalize mb-4">{category}</Text>
              {sigs.map(s => {
                if (s.dependsOn && Number(form.signals[s.dependsOn]) !== Number(s.showIf ?? 1)) return null;

                return (
                  <View key={s.key} className="mb-4">
                    {s.inputType === 'checkbox' ? (
                      <View className="flex-row items-center justify-between">
                        <Text className="text-gray-300">{s.label}</Text>
                        <Switch
                          value={form.signals[s.key] === 1}
                          onValueChange={(v) => updateSignal(s.key, v ? 1 : 0)}
                          trackColor={{ true: '#10b981', false: '#374151' }}
                        />
                      </View>
                    ) : (
                      <SignalInput 
                        label={s.label} 
                        value={form.signals[s.key] ?? ''} 
                        onChange={(v: string) => updateSignal(s.key, s.inputType === 'number' ? Number(v) : v)} 
                        type={s.inputType} 
                      />
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* ─── Planning ─── */}
        <View className="bg-[#161922] border border-[#232632] rounded-2xl p-5 mb-6">
          <Text className="text-white font-semibold text-lg mb-4">Planning & Execution</Text>
          <View className="flex-row gap-4 mb-4">
            <View className="flex-1">
              <Text className="text-gray-400 text-xs mb-1">Tasks Planned</Text>
              <TextInput
                className="bg-[#0f1115] border border-[#232632] text-white p-3 rounded-lg"
                keyboardType="numeric"
                value={String(form.planning.plannedTasks ?? 0)}
                onChangeText={(v) => updateForm('planning', 'plannedTasks', Number(v))}
              />
            </View>
            <View className="flex-1">
              <Text className="text-gray-400 text-xs mb-1">Tasks Completed</Text>
              <TextInput
                className="bg-[#0f1115] border border-[#232632] text-white p-3 rounded-lg"
                keyboardType="numeric"
                value={String(form.planning.completedTasks ?? 0)}
                onChangeText={(v) => updateForm('planning', 'completedTasks', Number(v))}
              />
            </View>
          </View>
          <Text className="text-gray-400 text-xs mb-1">Reason for incomplete tasks</Text>
          <TextInput
            className="bg-[#0f1115] border border-[#232632] text-white p-3 rounded-lg min-h-[60px]"
            multiline
            value={form.planning.reasonNotCompleted ?? ''}
            onChangeText={(v) => updateForm('planning', 'reasonNotCompleted', v)}
            placeholder="Why didn't you finish?"
            placeholderTextColor="#4b5563"
          />
        </View>

        {/* ─── Reflection ─── */}
        <View className="bg-[#161922] border border-[#232632] rounded-2xl p-5 mb-6">
          <Text className="text-white font-semibold text-lg mb-4">Daily Reflection</Text>
          {['win', 'mistake', 'learned', 'bothering'].map(field => (
            <View key={field} className="mb-4">
              <Text className="text-gray-400 text-xs mb-1 capitalize">{field}</Text>
              <TextInput
                className="bg-[#0f1115] border border-[#232632] text-white p-3 rounded-lg min-h-[80px]"
                multiline
                value={(form.reflection as any)?.[field] ?? ''}
                onChangeText={(v) => updateForm('reflection', field, v)}
                placeholder={`What was your ${field}?`}
                placeholderTextColor="#4b5563"
              />
            </View>
          ))}
        </View>

        <TouchableOpacity onPress={saveForm} disabled={saving} className="bg-white p-4 rounded-xl items-center mb-8">
          <Text className="text-black font-bold text-base">{saving ? 'Saving...' : 'Save Update'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

function SignalInput({ label, value, onChange, type }: any) {
  return (
    <View className="mb-4">
      <Text className="text-gray-400 text-xs mb-1">{label}</Text>
      <TextInput
        className="bg-[#0f1115] border border-[#232632] text-white p-3 rounded-lg"
        keyboardType={type === 'number' || type === 'slider' ? 'numeric' : 'default'}
        value={String(value)}
        onChangeText={onChange}
      />
    </View>
  );
}
