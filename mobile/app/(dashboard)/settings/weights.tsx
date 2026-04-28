import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { Settings as SettingsIcon, Save, RefreshCw, ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../../utils/api';
import { BlurView } from 'expo-blur';

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
      <View className="flex-1 bg-[#0f1115] items-center justify-center">
        <ActivityIndicator color="#fcd34d" />
      </View>
    );
  }

  const effective = data?.effective || {};
  const phaseThresholds = effective?.phases?.thresholds || {};
  const phaseWeights = effective?.phases?.weights || {};
  const goalWeights = effective?.goals?.pressureWeights || {};

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* Header */}
      <BlurView intensity={20} tint="dark" className="pt-16 pb-4 px-4 border-b border-[#232632] flex-row items-center z-10">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center mr-2">
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg">Algorithm Weights</Text>
      </BlurView>

      <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 150 }}>
        
        {/* V2 - SYSTEM LEARNED OPTIMIZATION */}
        {derived && typeof derived === 'object' && Object.keys(derived).length > 0 && (
          <View className="bg-[#161922] border border-[#232632] rounded-xl p-5 mb-6">
            <Text className="text-gray-100 font-bold text-base mb-1">System-Learned Optimization (V2)</Text>
            <Text className="text-gray-400 text-xs mb-4">These values are automatically calibrated by LifeOS from your behavior.</Text>
            {Object.entries(derived).map(([key, metric]: any) => (
              <View key={key} className="flex-row justify-between items-center py-3 border-b border-[#232632] last:border-0">
                <View className="flex-1">
                  <Text className="text-gray-300 capitalize text-sm font-semibold">{key}</Text>
                  <Text className="text-gray-500 text-[10px] uppercase tracking-wider">{metric.reason || 'Learned adjustment'}</Text>
                </View>
                <Text className="text-amber-500 font-mono font-bold">{typeof metric.value === 'number' ? metric.value.toFixed(2) : '—'}</Text>
              </View>
            ))}
          </View>
        )}

        {/* PHASE THRESHOLDS */}
        <View className="bg-[#161922] border border-[#232632] rounded-xl p-5 mb-6">
          <Text className="text-gray-100 font-bold text-base mb-1">Phase Detection Thresholds</Text>
          <Text className="text-gray-400 text-xs mb-4">Rules that trigger phase transitions</Text>
          {Object.entries(phaseThresholds).map(([phase, values]: any) => (
            <View key={phase} className="mb-4">
              <Text className="text-gray-300 font-bold capitalize mb-2 bg-[#1b1f2a] px-3 py-1 rounded self-start overflow-hidden">{phase}</Text>
              {Object.entries(values || {}).map(([key, val]: any) => (
                <View key={key} className="flex-row justify-between items-center mb-3">
                  <Text className="text-gray-400 text-sm capitalize">{key}</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    value={String(getVal(['phases', 'thresholds', phase, key], val))}
                    onChangeText={(v) => {
                      const num = parseFloat(v);
                      if (!isNaN(num)) setVal(['phases', 'thresholds', phase, key], num);
                    }}
                    className="bg-[#0f1115] border border-[#232632] rounded-md px-3 py-1 text-gray-200 font-mono text-center w-20"
                  />
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* PHASE SIGNAL WEIGHTS */}
        <View className="bg-[#161922] border border-[#232632] rounded-xl p-5 mb-6">
          <Text className="text-gray-100 font-bold text-base mb-1">Phase Signal Weights</Text>
          <Text className="text-gray-400 text-xs mb-4">How strongly each signal affects phase scoring.</Text>
          {Object.entries(phaseWeights).map(([key, val]: any) => (
            <View key={key} className="flex-row justify-between items-center mb-3">
              <Text className="text-gray-400 text-sm capitalize">{key}</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={String(getVal(['phases', 'weights', key], val))}
                onChangeText={(v) => {
                  const num = parseFloat(v);
                  if (!isNaN(num)) setVal(['phases', 'weights', key], num);
                }}
                className="bg-[#0f1115] border border-[#232632] rounded-md px-3 py-1 text-gray-200 font-mono text-center w-20"
              />
            </View>
          ))}
        </View>

        {/* GOAL PRESSURE WEIGHTS */}
        <View className="bg-[#161922] border border-[#232632] rounded-xl p-5 mb-6">
          <Text className="text-gray-100 font-bold text-base mb-1">Goal Load Pressure Weights</Text>
          <Text className="text-gray-400 text-xs mb-4">How goal cadence, ambition, and conflicts contribute to pressure.</Text>
          {Object.entries(goalWeights).map(([key, val]: any) => (
            <View key={key} className="flex-row justify-between items-center mb-3">
              <Text className="text-gray-400 text-sm capitalize">{key}</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={String(getVal(['goals', 'pressureWeights', key], val))}
                onChangeText={(v) => {
                  const num = parseFloat(v);
                  if (!isNaN(num)) setVal(['goals', 'pressureWeights', key], num);
                }}
                className="bg-[#0f1115] border border-[#232632] rounded-md px-3 py-1 text-gray-200 font-mono text-center w-20"
              />
            </View>
          ))}
        </View>

        {/* Actions */}
        <View className="flex-row space-x-4 mb-6 pt-4 border-t border-[#232632]">
          <TouchableOpacity
            onPress={resetDefaults}
            disabled={saving}
            className="flex-1 bg-[#161922] border border-[#232632] rounded-xl items-center justify-center p-4 flex-row"
          >
            <RefreshCw size={16} color="#9ca3af" />
            <Text className="text-gray-400 font-bold ml-2 text-sm uppercase">Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={saveOverrides}
            disabled={saving}
            className="flex-[2] bg-amber-500 rounded-xl items-center justify-center p-4 flex-row"
          >
            {saving ? <ActivityIndicator color="#0f1115" className="mr-2" /> : <Save size={16} color="#0f1115" />}
            <Text className="text-black font-bold ml-2 text-sm uppercase">Save Changes</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}
