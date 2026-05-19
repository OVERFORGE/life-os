import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Modal, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import {
  Heart, Flame, Dumbbell, ChevronRight,
  TrendingUp, TrendingDown, Minus, Utensils, MessageCircle, Pencil, X, ArrowLeft
} from 'lucide-react-native';
import { fetchWithAuth } from '../../../utils/api';

type HealthData = {
  biometrics: { height: number | null; heightUnit: string; weight: number | null; targetCalories: number; maintenanceCalories: number; dietMode: string; dietModeCalorieOffset: number };
  calories: { today: number; status: string; variance: number };
  gym: { last7Days: number; last30Days: number; consistencyScore: number; latestWorkout: any };
  weight: { currentWeight: number | null; last7Avg: number | null; trend: string };
  recentMeals: any[];
};

export default function HealthScreen() {
  const router = useRouter();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weightHistory, setWeightHistory] = useState<any[]>([]);
  const [dynamicMaintenance, setDynamicMaintenance] = useState<number | null>(null);

  // Edit modal state
  const [editModal, setEditModal] = useState<{ visible: boolean; field: string; label: string; value: string; date?: string }>({
    visible: false, field: '', label: '', value: ''
  });
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ctxRes, weightRes] = await Promise.all([
        fetchWithAuth('/health/context'),
        fetchWithAuth('/health/weight-trend'),
      ]);
      if (ctxRes.ok) setData((await ctxRes.json()).data);
      if (weightRes.ok) {
        const d = await weightRes.json();
        setWeightHistory(d.weightLogs || []);
        const weeks = d.weeklyData || [];
        const latestWithEstimate = [...weeks].reverse().find((w: any) => w.maintenanceEstimate !== null);
        if (latestWithEstimate) {
          setDynamicMaintenance(latestWithEstimate.maintenanceEstimate);
        }
      }
    } catch (e) {
      console.error('Health load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const openEdit = (field: string, label: string, current: any, date?: string) => {
    setEditModal({ visible: true, field, label, value: String(current ?? ''), date });
  };

  const saveEdit = async () => {
    setEditSaving(true);
    try {
      const numVal = parseFloat(editModal.value);
      if (isNaN(numVal)) { Alert.alert('Invalid value'); return; }
      
      if (editModal.date) {
        await fetchWithAuth('/health/weight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: editModal.date, weight: numVal }),
        });
      } else {
        await fetchWithAuth('/user', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [editModal.field]: numVal }),
        });
      }
      setEditModal(p => ({ ...p, visible: false }));
      load();
    } catch (e) {
      Alert.alert('Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  const deleteLog = async () => {
    if (!editModal.date) return;
    setEditSaving(true);
    try {
      await fetchWithAuth(`/health/weight?date=${editModal.date}`, { method: 'DELETE' });
      setEditModal(p => ({ ...p, visible: false }));
      load();
    } catch (e) {
      Alert.alert('Failed to delete');
    } finally {
      setEditSaving(false);
    }
  };

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'up') return <TrendingUp color="#E8414A" size={14} />;
    if (trend === 'down') return <TrendingDown color="rgba(236,231,227,0.5)" size={14} />;
    return <Minus color="rgba(236,231,227,0.3)" size={14} />;
  };

  const calorieStatusColor = (s: string) => {
    if (s === 'deficit') return '#ECE7E3';
    if (s === 'surplus') return '#E8414A';
    return '#B42129';
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#161618', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E8414A" size="large" />
      </View>
    );
  }

  const currentWeight = data?.weight.currentWeight ?? data?.biometrics.weight ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: '#161618' }}>
      {/* Edit Modal */}
      <Modal visible={editModal.visible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 24, width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 16 }}>{editModal.label}</Text>
              <TouchableOpacity onPress={() => setEditModal(p => ({ ...p, visible: false }))}>
                <X color="rgba(236,231,227,0.5)" size={20} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={{ backgroundColor: '#161618', color: '#FFFDFC', borderRadius: 12, borderWidth: 1, borderColor: '#2A2B2F', paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 20 }}
              value={editModal.value}
              onChangeText={v => setEditModal(p => ({ ...p, value: v }))}
              keyboardType="numeric"
              autoFocus
              placeholderTextColor="rgba(236,231,227,0.3)"
            />
            <TouchableOpacity
              onPress={saveEdit}
              disabled={editSaving}
              style={{ backgroundColor: '#E8414A', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
            >
              {editSaving
                ? <ActivityIndicator color="#FFFDFC" size="small" />
                : <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 15 }}>Save</Text>
              }
            </TouchableOpacity>
            
            {editModal.date && (
              <TouchableOpacity
                onPress={deleteLog}
                disabled={editSaving}
                style={{ marginTop: 12, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#B42129', fontWeight: '800', fontSize: 14 }}>Delete Log</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#2A2B2F', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <TouchableOpacity onPress={() => router.push('/(dashboard)/tools')} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft color="rgba(236,231,227,0.7)" size={17} />
          </TouchableOpacity>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Heart color="#E8414A" size={16} />
              <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 16 }}>Health Hub</Text>
            </View>
            <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 }}>System Tracked</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E8414A" />}
        showsVerticalScrollIndicator={false}
      >

        {/* ─── Biometric Card ─── */}
        <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 20, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Biometrics & Diet</Text>
            <TouchableOpacity onPress={() => router.push('/(dashboard)/personalization')}>
              <Text style={{ color: '#E8414A', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>Settings</Text>
            </TouchableOpacity>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <TouchableOpacity onPress={() => openEdit('weight', 'Update Weight (kg)', currentWeight)} style={{ flex: 1, backgroundColor: '#161618', borderRadius: 14, borderWidth: 1, borderColor: '#2A2B2F', padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Weight</Text>
                <Pencil color="rgba(236,231,227,0.2)" size={12} />
              </View>
              <Text style={{ color: '#FFFDFC', fontSize: 22, fontWeight: '900' }}>{currentWeight ? `${currentWeight}` : '—'} <Text style={{ fontSize: 12, color: 'rgba(236,231,227,0.5)', fontWeight: '600' }}>kg</Text></Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => openEdit('targetCalories', 'Target Calories', data?.biometrics.targetCalories)} style={{ flex: 1, backgroundColor: '#161618', borderRadius: 14, borderWidth: 1, borderColor: '#2A2B2F', padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Target</Text>
                <Pencil color="rgba(236,231,227,0.2)" size={12} />
              </View>
              <Text style={{ color: '#FFFDFC', fontSize: 22, fontWeight: '900' }}>{data?.biometrics.targetCalories ?? 2000} <Text style={{ fontSize: 12, color: 'rgba(236,231,227,0.5)', fontWeight: '600' }}>kcal</Text></Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <StatPill
              label="Height"
              value={data?.biometrics.height ? `${data.biometrics.height} ${data.biometrics.heightUnit}` : '—'}
              onEdit={() => openEdit('height', 'Update Height (cm)', data?.biometrics.height)}
            />
            <StatPill
              label="Maintenance"
              value={`${Math.round(dynamicMaintenance ?? data?.biometrics.maintenanceCalories ?? 2200)} kcal`}
              onEdit={() => Alert.alert("Auto-Calculated", "Maintenance calories are dynamically updated.")}
            />
            <StatPill
              label="Mode"
              value={data?.biometrics.dietMode ? data.biometrics.dietMode.replace('_', ' ') : 'Recomp'}
            />
          </View>
        </View>

        {/* ─── Today's Calories ─── */}
        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/nutrition/calories-chart')}
          activeOpacity={0.85}
          style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 20, marginBottom: 16 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Today's Calories</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Flame color="#E8414A" size={16} />
              <ChevronRight color="rgba(236,231,227,0.4)" size={14} />
            </View>
          </View>
          <Text style={{ color: '#FFFDFC', fontSize: 32, fontWeight: '800', marginBottom: 4 }}>{Math.round(data?.calories.today ?? 0)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ backgroundColor: 'rgba(255,253,252,0.06)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(255,253,252,0.1)' }}>
              <Text style={{ color: calorieStatusColor(data?.calories.status || 'on_track'), fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                {data?.calories.status?.replace('_', ' ') ?? 'on track'}
              </Text>
            </View>
            <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 12, fontWeight: '500' }}>
              {(data?.calories.variance ?? 0) > 0 ? '+' : ''}{data?.calories.variance ?? 0} vs target
            </Text>
          </View>
        </TouchableOpacity>

        {/* ─── Weight Trend ─── */}
        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/health/weight-trend')}
          activeOpacity={0.85}
          style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 20, marginBottom: 16 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Weight Trend</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TrendIcon trend={data?.weight.trend || 'stable'} />
              <ChevronRight color="rgba(236,231,227,0.4)" size={14} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
            <View>
              <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>Current</Text>
              <Text style={{ color: '#FFFDFC', fontSize: 20, fontWeight: '800' }}>{currentWeight ?? '—'} <Text style={{ fontSize: 12, fontWeight: '500', color: 'rgba(236,231,227,0.5)' }}>kg</Text></Text>
            </View>
            <View>
              <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>7-Day Avg</Text>
              <Text style={{ color: '#FFFDFC', fontSize: 20, fontWeight: '800' }}>{data?.weight.last7Avg ?? '—'} <Text style={{ fontSize: 12, fontWeight: '500', color: 'rgba(236,231,227,0.5)' }}>kg</Text></Text>
            </View>
          </View>
          {weightHistory.length > 0 ? (
            <View style={{ paddingTop: 16, borderTopWidth: 1, borderTopColor: '#2A2B2F' }}>
              {weightHistory.slice(0, 3).map((log: any, i: number) => (
                <TouchableOpacity key={i} onPress={() => openEdit('weight', 'Edit Log', log.weight, log.date)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }}>
                  <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 13, fontWeight: '600' }}>{log.date}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={{ color: '#ECE7E3', fontWeight: '800', fontSize: 14 }}>{log.weight} kg</Text>
                    <Pencil color="rgba(236,231,227,0.2)" size={12} />
                  </View>
                </TouchableOpacity>
              ))}
              <Text style={{ color: 'rgba(236,231,227,0.3)', fontSize: 10, fontWeight: '700', marginTop: 12, letterSpacing: 1, textTransform: 'uppercase' }}>View Full Trend &rarr;</Text>
            </View>
          ) : (
            <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 12, lineHeight: 18 }}>No weight history yet. Tell Health AI "I weigh Xkg" to add an entry.</Text>
          )}
        </TouchableOpacity>

        {/* ─── Gym Stats ─── */}
        <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 20, marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Gym Consistency</Text>
            <Dumbbell color="#E8414A" size={14} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <StatPill label="Last 7 Days" value={`${data?.gym.last7Days ?? 0}x`} />
            <StatPill label="Last 30 Days" value={`${data?.gym.last30Days ?? 0}x`} />
            <StatPill label="Score" value={`${data?.gym.consistencyScore ?? 0}%`} colorOverride="#E8414A" />
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: '#161618', overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${data?.gym.consistencyScore ?? 0}%`, backgroundColor: '#E8414A', borderRadius: 3 }} />
          </View>
          {(data?.gym.consistencyScore ?? 0) === 0 && (
            <Text style={{ color: 'rgba(236,231,227,0.3)', fontSize: 10, marginTop: 10 }}>Score is based on 16 sessions/month = 100%</Text>
          )}
        </View>

        {/* ─── Module Cards ─── */}
        <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>Deep Dive Modules</Text>
        <View style={{ gap: 12, marginBottom: 16 }}>
          <ModuleCard
            icon={<Dumbbell color="#E8414A" size={18} />}
            title="Gym Tracker"
            subtitle="Routines, splits & sessions"
            onPress={() => router.push('/(dashboard)/gym')}
          />
          <ModuleCard
            icon={<Utensils color="#E8414A" size={18} />}
            title="Nutrition Tracker"
            subtitle="Meals, macros & templates"
            onPress={() => router.push('/(dashboard)/nutrition')}
          />
        </View>

        {/* ─── Health AI Card ─── */}
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/(dashboard)/brain', params: { mode: 'health' } })}
          style={{ backgroundColor: 'rgba(232,65,74,0.06)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)', padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(232,65,74,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle color="#E8414A" size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#E8414A', fontWeight: '800', fontSize: 15, marginBottom: 2 }}>Ask Health AI</Text>
            <Text style={{ color: 'rgba(236,231,227,0.6)', fontSize: 12 }}>Calorie questions, workout advice & more</Text>
          </View>
          <ChevronRight color="#E8414A" size={16} />
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

function StatPill({ label, value, onEdit, colorOverride }: { label: string; value: string; onEdit?: () => void; colorOverride?: string }) {
  return (
    <TouchableOpacity
      onPress={onEdit}
      style={{ backgroundColor: '#161618', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#2A2B2F', flexDirection: 'row', alignItems: 'center', gap: 8 }}
      activeOpacity={onEdit ? 0.7 : 1}
    >
      <View>
        <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</Text>
        <Text style={{ color: colorOverride || '#FFFDFC', fontWeight: '800', fontSize: 14 }}>{value}</Text>
      </View>
      {onEdit && <Pencil color="rgba(236,231,227,0.2)" size={10} style={{ marginLeft: 4, marginTop: 12 }} />}
    </TouchableOpacity>
  );
}

function ModuleCard({ icon, title, subtitle, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', padding: 16, gap: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(236,231,227,0.04)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(236,231,227,0.1)' }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 15, marginBottom: 2 }}>{title}</Text>
        <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 12 }}>{subtitle}</Text>
      </View>
      <ChevronRight color="rgba(236,231,227,0.2)" size={16} />
    </TouchableOpacity>
  );
}
