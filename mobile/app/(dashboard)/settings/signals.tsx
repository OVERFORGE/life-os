import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { fetchWithAuth } from '../../../utils/api';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

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
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.card, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
          <ArrowLeft size={20} color={C.subtext} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '900', color: C.text, marginLeft: 16 }}>Custom Signals</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 24, marginBottom: 32 }}>
          <Text style={{ color: C.text, fontWeight: '900', fontSize: 18, marginBottom: 4 }}>Create Signal</Text>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 24 }}>Signals are dynamic daily inputs: stress sliders, water intake numbers, journaling fields, etc.</Text>
          
          <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Key (Internal ID)</Text>
          <TextInput
            style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 14, fontWeight: '600', marginBottom: 20 }}
            placeholder="e.g. water_intake"
            placeholderTextColor={C.muted}
            value={form.key}
            onChangeText={t => setForm({ ...form, key: t })}
          />

          <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Label (UI Display)</Text>
          <TextInput
            style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 14, fontWeight: '600', marginBottom: 20 }}
            placeholder="e.g. Water (L)"
            placeholderTextColor={C.muted}
            value={form.label}
            onChangeText={t => setForm({ ...form, label: t })}
          />

          <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {categories.map(c => (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setForm({ ...form, categoryKey: c.key })}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
                    backgroundColor: form.categoryKey === c.key ? C.primaryBg : C.bg,
                    borderColor: form.categoryKey === c.key ? 'rgba(232,65,74,0.3)' : C.border
                  }}
                >
                  <Text style={{ color: form.categoryKey === c.key ? C.primary : C.subtext, fontWeight: form.categoryKey === c.key ? '800' : '600', fontSize: 12 }}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Input Type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {['checkbox', 'number', 'slider', 'text', 'textarea'].map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setForm({ ...form, inputType: t })}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1,
                  backgroundColor: form.inputType === t ? C.text : C.bg,
                  borderColor: form.inputType === t ? C.text : C.border
                }}
              >
                <Text style={{ color: form.inputType === t ? C.bg : C.subtext, fontWeight: form.inputType === t ? '900' : '600', fontSize: 12 }}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Direction</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            <TouchableOpacity
              onPress={() => setForm({ ...form, direction: 'higher_better' })}
              style={{ flex: 1, padding: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, backgroundColor: form.direction === 'higher_better' ? 'rgba(16,185,129,0.1)' : C.bg, borderColor: form.direction === 'higher_better' ? 'rgba(16,185,129,0.3)' : C.border }}
            >
              <Text style={{ color: form.direction === 'higher_better' ? '#10b981' : C.subtext, fontSize: 12, fontWeight: form.direction === 'higher_better' ? '800' : '600' }}>Higher = Better</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setForm({ ...form, direction: 'lower_better' })}
              style={{ flex: 1, padding: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, backgroundColor: form.direction === 'lower_better' ? 'rgba(59,130,246,0.1)' : C.bg, borderColor: form.direction === 'lower_better' ? 'rgba(59,130,246,0.3)' : C.border }}
            >
              <Text style={{ color: form.direction === 'lower_better' ? '#3b82f6' : C.subtext, fontSize: 12, fontWeight: form.direction === 'lower_better' ? '800' : '600' }}>Lower = Better</Text>
            </TouchableOpacity>
          </View>

          {form.inputType === 'number' && (
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Unit</Text>
                <TextInput style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 14, fontWeight: '600' }} value={form.unit} onChangeText={t => setForm({ ...form, unit: t })} placeholderTextColor={C.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Target</Text>
                <TextInput keyboardType="numeric" style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 14, fontWeight: '600' }} value={form.target} onChangeText={t => setForm({ ...form, target: t })} placeholderTextColor={C.muted} />
              </View>
            </View>
          )}

          {form.inputType === 'slider' && (
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Min</Text>
                <TextInput keyboardType="numeric" style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 14, fontWeight: '600' }} value={form.min} onChangeText={t => setForm({ ...form, min: t })} placeholderTextColor={C.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Max</Text>
                <TextInput keyboardType="numeric" style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 14, fontWeight: '600' }} value={form.max} onChangeText={t => setForm({ ...form, max: t })} placeholderTextColor={C.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Step</Text>
                <TextInput keyboardType="numeric" style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 14, fontWeight: '600' }} value={form.step} onChangeText={t => setForm({ ...form, step: t })} placeholderTextColor={C.muted} />
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={addSignal}
            disabled={submitting}
            style={{ marginTop: 8, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: submitting ? C.border : C.text }}
          >
            <Text style={{ color: submitting ? C.muted : C.bg, fontWeight: '900', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>{submitting ? 'Creating...' : '+ Create Signal'}</Text>
          </TouchableOpacity>
        </View>

        <View>
          <Text style={{ color: C.text, fontWeight: '900', fontSize: 18, marginBottom: 16, marginLeft: 4 }}>Active Signals</Text>
          {signals.map(s => (
            <View key={s.key} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '800', fontSize: 15, marginBottom: 4 }}>{s.label}</Text>
                <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600' }}>{s.key} • <Text style={{ color: C.muted }}>{s.inputType}</Text> • <Text style={{ color: C.muted }}>{s.categoryKey}</Text></Text>
              </View>
              <TouchableOpacity onPress={() => removeSignal(s.key)} style={{ padding: 10, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginLeft: 16 }}>
                <Trash2 size={16} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
