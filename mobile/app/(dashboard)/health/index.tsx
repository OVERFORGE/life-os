import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Modal, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import {
  Heart, Flame, Dumbbell, ChevronRight,
  TrendingUp, TrendingDown, Minus, Utensils, MessageCircle, Pencil, X, Check
} from 'lucide-react-native';
import { fetchWithAuth } from '../../../utils/api';

type HealthData = {
  biometrics: { height: number | null; heightUnit: string; weight: number | null; targetCalories: number; maintenanceCalories: number };
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
  const [editModal, setEditModal] = useState<{ visible: boolean; field: string; label: string; value: string }>({
    visible: false, field: '', label: '', value: ''
  });
  const [editSaving, setEditSaving] = useState(false);

  const load = async () => {
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
        const latestWithEstimate = [...weeks].reverse().find(w => w.maintenanceEstimate !== null);
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
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const openEdit = (field: string, label: string, current: any) => {
    setEditModal({ visible: true, field, label, value: String(current ?? '') });
  };

  const saveEdit = async () => {
    setEditSaving(true);
    try {
      const numVal = parseFloat(editModal.value);
      if (isNaN(numVal)) { Alert.alert('Invalid value'); return; }
      await fetchWithAuth('/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [editModal.field]: numVal }),
      });
      setEditModal(p => ({ ...p, visible: false }));
      load();
    } catch (e) {
      Alert.alert('Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'up') return <TrendingUp color="#ef4444" size={16} />;
    if (trend === 'down') return <TrendingDown color="#10b981" size={16} />;
    return <Minus color="#6b7280" size={16} />;
  };

  const calorieStatusColor = (s: string) =>
    s === 'deficit' ? '#10b981' : s === 'surplus' ? '#f59e0b' : '#6b7280';

  if (loading) {
    return (
      <View className="flex-1 bg-[#0f1115] items-center justify-center">
        <ActivityIndicator color="#10b981" size="large" />
        <Text className="text-gray-500 mt-3 text-sm">Loading Health Hub...</Text>
      </View>
    );
  }

  const currentWeight = data?.weight.currentWeight ?? data?.biometrics.weight ?? null;

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* Edit Modal */}
      <Modal visible={editModal.visible} transparent animationType="fade">
        <View className="flex-1 bg-black/60 items-center justify-center px-6">
          <View className="bg-[#161922] rounded-2xl border border-[#232632] p-6 w-full">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white font-bold text-base">{editModal.label}</Text>
              <TouchableOpacity onPress={() => setEditModal(p => ({ ...p, visible: false }))}>
                <X color="#6b7280" size={20} />
              </TouchableOpacity>
            </View>
            <TextInput
              className="bg-[#0f1115] text-white rounded-xl border border-[#232632] px-4 py-3 text-lg mb-4"
              value={editModal.value}
              onChangeText={v => setEditModal(p => ({ ...p, value: v }))}
              keyboardType="numeric"
              autoFocus
              placeholderTextColor="#4b5563"
            />
            <TouchableOpacity
              onPress={saveEdit}
              disabled={editSaving}
              className="bg-emerald-500 rounded-xl py-3 items-center"
            >
              {editSaving
                ? <ActivityIndicator color="white" size="small" />
                : <Text className="text-white font-bold">Save</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <BlurView
        intensity={40} tint="dark"
        className="flex-row items-center justify-between pt-16 pb-4 px-6 border-b border-[#1e2130] z-10"
        style={{ backgroundColor: 'rgba(15,17,21,0.85)' }}
      >
        <View className="flex-row items-center gap-3">
          <View className="w-9 h-9 rounded-xl bg-emerald-500/15 items-center justify-center border border-emerald-500/30">
            <Heart color="#10b981" size={18} />
          </View>
          <View>
            <Text className="text-white font-bold text-[17px]">Health Hub</Text>
            <Text className="text-gray-500 text-xs">Your body, tracked</Text>
          </View>
        </View>
      </BlurView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
        showsVerticalScrollIndicator={false}
      >

        {/* ─── Biometric Card ─── */}
        <View className="bg-[#161922] rounded-2xl border border-[#232632] p-5 mb-4">
          <Text className="text-gray-400 text-xs uppercase tracking-widest mb-4">Biometrics</Text>
          <View className="flex-row flex-wrap gap-3">
            <StatPill
              label="Height"
              value={data?.biometrics.height ? `${data.biometrics.height} ${data.biometrics.heightUnit}` : '—'}
              color="#6b7280"
              onEdit={() => openEdit('height', 'Update Height (cm)', data?.biometrics.height)}
            />
            <StatPill
              label="Weight"
              value={currentWeight ? `${currentWeight} kg` : '—'}
              color="#10b981"
              onEdit={() => openEdit('weight', 'Update Weight (kg)', currentWeight)}
            />
            <StatPill
              label="Target Cal"
              value={`${data?.biometrics.targetCalories ?? 2000} kcal`}
              color="#f59e0b"
              onEdit={() => openEdit('targetCalories', 'Target Calories', data?.biometrics.targetCalories)}
            />
            <StatPill
              label="Maintenance"
              value={`${Math.round(dynamicMaintenance ?? data?.biometrics.maintenanceCalories ?? 2200)} kcal`}
              color="#818cf8"
              onEdit={() => {
                Alert.alert("Auto-Calculated", "Maintenance calories are now dynamically updated based on your weekly weight trend and calorie logs. You don't need to manually edit this!");
              }}
            />
          </View>
          <Text className="text-gray-600 text-[10px] mt-3">Tap any card to edit ✏️</Text>
        </View>

        {/* ─── Today's Calories ─── */}
        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/nutrition/calories-chart')}
          activeOpacity={0.85}
          className="bg-[#161922] rounded-2xl border border-[#232632] p-5 mb-4"
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-gray-400 text-xs uppercase tracking-widest">Today's Calories</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Flame color="#f59e0b" size={16} />
              <ChevronRight color="#374151" size={14} />
            </View>
          </View>
          <Text className="text-white text-3xl font-bold mb-1">{Math.round(data?.calories.today ?? 0)}</Text>
          <View className="flex-row items-center gap-2 mt-1">
            <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: calorieStatusColor(data?.calories.status || 'on_track') + '25' }}>
              <Text style={{ color: calorieStatusColor(data?.calories.status || 'on_track') }} className="text-xs font-semibold capitalize">
                {data?.calories.status?.replace('_', ' ') ?? 'on track'}
              </Text>
            </View>
            <Text className="text-gray-500 text-xs">
              {(data?.calories.variance ?? 0) > 0 ? '+' : ''}{data?.calories.variance ?? 0} vs target ({data?.biometrics.targetCalories ?? 2000} kcal)
            </Text>
          </View>
        </TouchableOpacity>

        {/* ─── Weight Trend ─── */}
        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/health/weight-trend')}
          activeOpacity={0.85}
          className="bg-[#161922] rounded-2xl border border-[#232632] p-5 mb-4"
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-gray-400 text-xs uppercase tracking-widest">Weight Trend</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TrendIcon trend={data?.weight.trend || 'stable'} />
              <ChevronRight color="#374151" size={14} />
            </View>
          </View>
          <View className="flex-row gap-4 mb-4">
            <View>
              <Text className="text-gray-500 text-xs mb-1">Current</Text>
              <Text className="text-white text-xl font-bold">{currentWeight ?? '—'} kg</Text>
            </View>
            <View>
              <Text className="text-gray-500 text-xs mb-1">7-Day Avg</Text>
              <Text className="text-white text-xl font-bold">{data?.weight.last7Avg ?? '—'} kg</Text>
            </View>
          </View>
          {weightHistory.length > 0 ? (
            <View className="mt-2">
              {weightHistory.slice(0, 3).map((log: any, i: number) => (
                <View key={i} className="flex-row justify-between items-center py-2.5 border-b border-[#1e2130]">
                  <Text className="text-gray-400 text-sm">{log.date}</Text>
                  <Text className="text-emerald-400 font-semibold">{log.weight} kg</Text>
                </View>
              ))}
              <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 8 }}>Tap to see full trend & maintenance →</Text>
            </View>
          ) : (
            <Text className="text-gray-600 text-xs mt-1">No weight history yet. Tell Health AI "I weigh Xkg" to add an entry.</Text>
          )}
        </TouchableOpacity>

        {/* ─── Gym Stats ─── */}
        <View className="bg-[#161922] rounded-2xl border border-[#232632] p-5 mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-gray-400 text-xs uppercase tracking-widest">Gym Consistency</Text>
            <Dumbbell color="#818cf8" size={16} />
          </View>
          <View className="flex-row gap-3 mb-3 flex-wrap">
            <StatPill label="Last 7 Days" value={`${data?.gym.last7Days ?? 0}x`} color="#818cf8" />
            <StatPill label="Last 30 Days" value={`${data?.gym.last30Days ?? 0}x`} color="#818cf8" />
            <StatPill label="Score" value={`${data?.gym.consistencyScore ?? 0}%`} color="#10b981" />
          </View>
          <View className="h-2 rounded-full bg-[#232632] overflow-hidden mt-1">
            <View
              className="h-full rounded-full bg-purple-500"
              style={{ width: `${data?.gym.consistencyScore ?? 0}%` }}
            />
          </View>
          {(data?.gym.consistencyScore ?? 0) === 0 && (
            <Text className="text-gray-600 text-[10px] mt-2">Score is based on 16 sessions/month = 100%</Text>
          )}
        </View>

        {/* ─── Module Cards ─── */}
        <Text className="text-gray-400 text-xs uppercase tracking-widest mb-3">Modules</Text>
        <View className="gap-3 mb-4">
          <ModuleCard
            icon={<Dumbbell color="#818cf8" size={20} />}
            title="Gym Tracker"
            subtitle="Routines, splits & sessions"
            color="#818cf8"
            onPress={() => router.push('/gym')}
          />
          <ModuleCard
            icon={<Utensils color="#f59e0b" size={20} />}
            title="Nutrition Tracker"
            subtitle="Meals, macros & templates"
            color="#f59e0b"
            onPress={() => router.push('/nutrition')}
          />
        </View>

        {/* ─── Health AI Card ─── */}
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/brain', params: { mode: 'health' } })}
          className="bg-emerald-500/10 rounded-2xl border border-emerald-500/30 p-5"
        >
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-xl bg-emerald-500/20 items-center justify-center">
              <MessageCircle color="#10b981" size={20} />
            </View>
            <View className="flex-1">
              <Text className="text-emerald-400 font-bold text-base">Ask Health AI</Text>
              <Text className="text-gray-400 text-xs mt-0.5">Calorie questions, workout advice & more</Text>
            </View>
            <ChevronRight color="#10b981" size={18} />
          </View>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

function StatPill({ label, value, color, onEdit }: { label: string; value: string; color: string; onEdit?: () => void }) {
  return (
    <TouchableOpacity
      onPress={onEdit}
      className="bg-[#0f1115] rounded-xl px-3 py-2 border border-[#232632] flex-row items-center gap-1.5"
      activeOpacity={onEdit ? 0.7 : 1}
    >
      <View>
        <Text className="text-gray-500 text-[10px] uppercase tracking-wider mb-0.5">{label}</Text>
        <Text style={{ color }} className="font-bold text-sm">{value}</Text>
      </View>
      {onEdit && <Pencil color="#374151" size={11} style={{ marginTop: 10 }} />}
    </TouchableOpacity>
  );
}

function ModuleCard({ icon, title, subtitle, color, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} className="flex-row items-center bg-[#161922] rounded-2xl border border-[#232632] p-4 gap-4">
      <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: color + '20' }}>
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-white font-semibold text-sm">{title}</Text>
        <Text className="text-gray-500 text-xs mt-0.5">{subtitle}</Text>
      </View>
      <ChevronRight color="#374151" size={18} />
    </TouchableOpacity>
  );
}
