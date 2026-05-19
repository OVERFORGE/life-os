import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, SafeAreaView } from 'react-native';
import { Settings as SettingsIcon, Save, RefreshCw, ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../../utils/api';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

export default function WeightsScreen() {
  const router = useRouter();
  
  const [data, setData] = useState<any>(null);
  const [derived, setDerived] = useState<any>(null);
  const [overrides, setOverrides] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [resData, resDerived] = await Promise.all([
        fetchWithAuth('/settings'),
        fetchWithAuth('/settings/derived')
      ]);

      if (resData.ok) {
        const d = await resData.json();
        setData(d);
        setOverrides(d.overrides || {});
      }
      
      if (resDerived.ok) {
        const d = await resDerived.json();
        setDerived(d.derived || null);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load algorithm settings');
    } finally {
      setLoading(false);
    }
  };

  const saveOverrides = async () => {
    setSaving(true);
    try {
      const res = await fetchWithAuth('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrides),
      });
      if (res.ok) {
        Alert.alert('Success', 'Settings Overrides Saved.');
        loadSettings();
      } else {
        Alert.alert('Error', 'Failed to save overrides');
      }
    } catch (e) {
      Alert.alert('Error', 'Network request failed');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    Alert.alert('Reset System Overrides?', 'This will clear your manual tuning and revert to LifeOS defaults.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => {
          setSaving(true);
          try {
            await fetchWithAuth('/settings', { method: 'DELETE' });
            loadSettings();
          } finally {
            setSaving(false);
          }
      }}
    ]);
  };

  const getVal = (path: string[], fallback: number) => {
    let ref = overrides;
    for (const p of path) ref = ref?.[p];
    return ref ?? fallback;
  };

  const setVal = (path: string[], value: number) => {
    setOverrides((prev: any) => {
      const copy = JSON.parse(JSON.stringify(prev));
      let ref = copy;
      for (let i = 0; i < path.length - 1; i++) {
        ref[path[i]] ||= {};
        ref = ref[path[i]];
      }
      ref[path[path.length - 1]] = value;
      return copy;
    });
  };

  if (loading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  const effective = data?.effective || {};
  const phaseThresholds = effective?.phases?.thresholds || {};
  const phaseWeights = effective?.phases?.weights || {};
  const goalWeights = effective?.goals?.pressureWeights || {};

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.card, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
          <ArrowLeft size={20} color={C.subtext} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '900', color: C.text, marginLeft: 16 }}>Algorithm Weights</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        
        {/* V2 - SYSTEM LEARNED OPTIMIZATION */}
        {derived && typeof derived === 'object' && Object.keys(derived).length > 0 && (
          <View style={{ backgroundColor: C.primaryBg, borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)', borderRadius: 24, padding: 24, marginBottom: 24 }}>
            <Text style={{ color: C.primary, fontWeight: '900', fontSize: 16, marginBottom: 4 }}>System-Learned Optimization (V2)</Text>
            <Text style={{ color: 'rgba(232,65,74,0.7)', fontSize: 12, fontWeight: '600', marginBottom: 20 }}>These values are automatically calibrated by LifeOS from your behavior.</Text>
            {Object.entries(derived).map(([key, metric]: any, index, arr) => (
              <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: index === arr.length - 1 ? 0 : 1, borderBottomColor: 'rgba(232,65,74,0.1)' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, textTransform: 'capitalize', fontSize: 14, fontWeight: '700', marginBottom: 2 }}>{key}</Text>
                  <Text style={{ color: 'rgba(232,65,74,0.6)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '800' }}>{metric.reason || 'Learned adjustment'}</Text>
                </View>
                <Text style={{ color: C.text, fontWeight: '900', fontSize: 16 }}>{typeof metric.value === 'number' ? metric.value.toFixed(2) : '—'}</Text>
              </View>
            ))}
          </View>
        )}

        {/* PHASE THRESHOLDS */}
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 24, marginBottom: 24 }}>
          <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 4 }}>Phase Detection Thresholds</Text>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 24 }}>Rules that trigger phase transitions</Text>
          {Object.entries(phaseThresholds).map(([phase, values]: any) => (
            <View key={phase} style={{ marginBottom: 20 }}>
              <View style={{ backgroundColor: C.border, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12 }}>
                <Text style={{ color: C.subtext, fontWeight: '900', textTransform: 'capitalize', fontSize: 12 }}>{phase}</Text>
              </View>
              {Object.entries(values || {}).map(([key, val]: any) => (
                <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ color: C.subtext, fontSize: 14, textTransform: 'capitalize', fontWeight: '600' }}>{key}</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    value={String(getVal(['phases', 'thresholds', phase, key], val))}
                    onChangeText={(v) => {
                      const num = parseFloat(v);
                      if (!isNaN(num)) setVal(['phases', 'thresholds', phase, key], num);
                    }}
                    style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: C.text, fontWeight: '700', textAlign: 'center', width: 80 }}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* PHASE SIGNAL WEIGHTS */}
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 24, marginBottom: 24 }}>
          <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 4 }}>Phase Signal Weights</Text>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 24 }}>How strongly each signal affects phase scoring.</Text>
          {Object.entries(phaseWeights).map(([key, val]: any) => (
            <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: C.subtext, fontSize: 14, textTransform: 'capitalize', fontWeight: '600' }}>{key}</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={String(getVal(['phases', 'weights', key], val))}
                onChangeText={(v) => {
                  const num = parseFloat(v);
                  if (!isNaN(num)) setVal(['phases', 'weights', key], num);
                }}
                style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: C.text, fontWeight: '700', textAlign: 'center', width: 80 }}
              />
            </View>
          ))}
        </View>

        {/* GOAL PRESSURE WEIGHTS */}
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 24, marginBottom: 32 }}>
          <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 4 }}>Goal Load Pressure Weights</Text>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 24 }}>How goal cadence, ambition, and conflicts contribute to pressure.</Text>
          {Object.entries(goalWeights).map(([key, val]: any) => (
            <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: C.subtext, fontSize: 14, textTransform: 'capitalize', fontWeight: '600' }}>{key}</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={String(getVal(['goals', 'pressureWeights', key], val))}
                onChangeText={(v) => {
                  const num = parseFloat(v);
                  if (!isNaN(num)) setVal(['goals', 'pressureWeights', key], num);
                }}
                style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: C.text, fontWeight: '700', textAlign: 'center', width: 80 }}
              />
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
          <TouchableOpacity
            onPress={resetDefaults}
            disabled={saving}
            style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, flexDirection: 'row' }}
          >
            <RefreshCw size={16} color={C.subtext} />
            <Text style={{ color: C.subtext, fontWeight: '900', marginLeft: 8, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={saveOverrides}
            disabled={saving}
            style={{ flex: 2, backgroundColor: C.text, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, flexDirection: 'row' }}
          >
            {saving ? <ActivityIndicator color={C.bg} style={{ marginRight: 8 }} /> : <Save size={16} color={C.bg} style={{ marginRight: 8 }} />}
            <Text style={{ color: C.bg, fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Save Changes</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
