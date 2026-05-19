import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../../utils/api';
import { ArrowLeft, Save } from 'lucide-react-native';

const getTodayDateString = () => new Date().toISOString().slice(0, 10);

export default function DailyLogScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  
  const [form, setForm] = useState({
    planning: { plannedTasks: 0, completedTasks: 0, reasonNotCompleted: '' },
    reflection: { win: '', mistake: '', learned: '', bothering: '' },
    signals: {} as Record<string, any>
  });

  const [schemaSignals, setSchemaSignals] = useState<any[]>([]);
  const todayDate = getTodayDateString();

  useEffect(() => {
    async function load() {
      try {
        const [logRes, sigRes] = await Promise.all([
          fetchWithAuth('/daily-log/today'),
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
        console.error("Error loading daily log:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
        body: JSON.stringify({ date: todayDate, key, value })
      });
    } catch (e) {
      console.error("Error auto-saving signal:", e);
    }
  };

  const saveForm = async () => {
    setSaving(true);
    setStatus('');
    try {
      const res = await fetchWithAuth('/daily-log/today', {
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
    <View style={{ flex: 1, backgroundColor: '#161618', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#E8414A" />
    </View>
  );

  const categories = ['physical', 'habits', 'work'];

  const sectionLabel = (text: string) => (
    <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 17, marginBottom: 12 }}>{text}</Text>
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
        <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 16 }}>Daily Check-in</Text>
        <TouchableOpacity
          onPress={saveForm}
          disabled={saving}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(232,65,74,0.1)', borderWidth: 1, borderColor: 'rgba(232,65,74,0.25)', alignItems: 'center', justifyContent: 'center' }}
        >
          {saving ? <ActivityIndicator size="small" color="#E8414A" /> : <Save color="#E8414A" size={17} />}
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {status ? <Text style={{ textAlign: 'center', color: '#E8414A', marginBottom: 16, fontWeight: '600' }}>{status}</Text> : null}

        {/* ─── Core Check-in ─── */}
        <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          {sectionLabel('Core Signals')}
          <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 12, marginBottom: 16 }}>System signals for today</Text>

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
            <View key={category} style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 17, textTransform: 'capitalize', marginBottom: 16 }}>{category}</Text>
              {sigs.map(s => {
                if (s.dependsOn && Number(form.signals[s.dependsOn]) !== Number(s.showIf ?? 1)) return null;

                return (
                  <View key={s.key} style={{ marginBottom: 16 }}>
                    {s.inputType === 'checkbox' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ color: 'rgba(236,231,227,0.7)', fontSize: 14 }}>{s.label}</Text>
                        <Switch
                          value={form.signals[s.key] === 1}
                          onValueChange={(v) => updateSignal(s.key, v ? 1 : 0)}
                          trackColor={{ true: '#E8414A', false: '#2A2B2F' }}
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
        <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          {sectionLabel('Planning & Execution')}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 11, marginBottom: 6 }}>Tasks Planned</Text>
              <TextInput
                style={{ backgroundColor: '#161618', borderWidth: 1, borderColor: '#2A2B2F', color: '#FFFDFC', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, fontSize: 14 }}
                keyboardType="numeric"
                value={String(form.planning.plannedTasks)}
                onChangeText={(v) => updateForm('planning', 'plannedTasks', Number(v))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 11, marginBottom: 6 }}>Tasks Completed</Text>
              <TextInput
                style={{ backgroundColor: '#161618', borderWidth: 1, borderColor: '#2A2B2F', color: '#FFFDFC', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, fontSize: 14 }}
                keyboardType="numeric"
                value={String(form.planning.completedTasks)}
                onChangeText={(v) => updateForm('planning', 'completedTasks', Number(v))}
              />
            </View>
          </View>
          <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 11, marginBottom: 6 }}>Reason for incomplete tasks</Text>
          <TextInput
            style={{ backgroundColor: '#161618', borderWidth: 1, borderColor: '#2A2B2F', color: '#FFFDFC', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, fontSize: 14, minHeight: 60, textAlignVertical: 'top' }}
            multiline
            value={form.planning.reasonNotCompleted}
            onChangeText={(v) => updateForm('planning', 'reasonNotCompleted', v)}
            placeholder="Why didn't you finish?"
            placeholderTextColor="rgba(236,231,227,0.3)"
          />
        </View>

        {/* ─── Reflection ─── */}
        <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 24 }}>
          {sectionLabel('Daily Reflection')}
          {['win', 'mistake', 'learned', 'bothering'].map(field => (
            <View key={field} style={{ marginBottom: 16 }}>
              <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 11, marginBottom: 6, textTransform: 'capitalize' }}>{field}</Text>
              <TextInput
                style={{ backgroundColor: '#161618', borderWidth: 1, borderColor: '#2A2B2F', color: '#FFFDFC', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' }}
                multiline
                value={(form.reflection as any)[field]}
                onChangeText={(v) => updateForm('reflection', field, v)}
                placeholder={`What was your ${field}?`}
                placeholderTextColor="rgba(236,231,227,0.3)"
              />
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={saveForm}
          disabled={saving}
          style={{ backgroundColor: '#E8414A', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 20 }}
        >
          <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 16 }}>{saving ? 'Saving...' : 'Save Check-in'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

function SignalInput({ label, value, onChange, type }: any) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 11, marginBottom: 6 }}>{label}</Text>
      <TextInput
        style={{ backgroundColor: '#161618', borderWidth: 1, borderColor: '#2A2B2F', color: '#FFFDFC', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, fontSize: 14 }}
        keyboardType={type === 'number' || type === 'slider' ? 'numeric' : 'default'}
        value={String(value)}
        onChangeText={onChange}
      />
    </View>
  );
}
