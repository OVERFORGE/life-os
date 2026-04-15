import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { ArrowLeft, Trash2, Coffee, Sun, Moon, Apple, Activity, Dna, Zap } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '../../../components/ui/Toast';
import { fetchWithAuth } from '../../../utils/api';

const COLORS = {
  bg: '#0f1115', card: '#161922', border: '#232632', border2: '#374151',
  text: '#f3f4f6', subtext: '#9ca3af', muted: '#6b7280',
  emerald: '#10b981', emeraldBg: 'rgba(16,185,129,0.1)',
};

const MEAL_ICONS: Record<string, any> = {
  breakfast: Coffee, lunch: Sun, dinner: Moon, snack: Apple,
};

function MacroChip({ label, value, unit = 'g', color = COLORS.subtext }: any) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '800' }}>{value}{unit !== '' ? unit : ''}</Text>
      <Text style={{ color, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function DailyLogScreen() {
  const router = useRouter();
  const toast = useToast();
  const [log, setLog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const loadLog = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/nutrition/log?date=${today}`);
      if (res.ok) {
        const data = await res.json();
        setLog(data.log || null);
      }
    } catch {
      toast.error('Load Failed', 'Could not load today\'s log.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadLog(); }, []));

  const deleteMeal = async (mealIndex: number) => {
    if (!log) return;
    const mealId = `${mealIndex}`;
    setDeletingId(mealId);
    try {
      const newMeals = (log.meals || []).filter((_: any, i: number) => i !== mealIndex);
      const dailyTotals = newMeals.reduce((acc: any, ml: any) => ({
        calories: acc.calories + (ml.macros?.calories || 0),
        protein: acc.protein + (ml.macros?.protein || 0),
        carbs: acc.carbs + (ml.macros?.carbs || 0),
        fats: acc.fats + (ml.macros?.fats || 0),
      }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

      // Sanitize meals for schema
      const sanitizedMeals = newMeals.map((ml: any) => ({
        mealType: ml.mealType || 'snack',
        foodItemId: typeof ml.foodItemId === 'object' ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
        amount: ml.amount || 100,
        macros: ml.macros,
      }));

      const res = await fetchWithAuth('/nutrition/log', {
        method: 'POST',
        body: JSON.stringify({ date: today, meals: sanitizedMeals, dailyTotals }),
      });
      if (res.ok) {
        toast.success('Entry Removed', 'Meal deleted from today\'s log.');
        loadLog();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error('Delete Failed', err.error || 'Could not delete entry.');
      }
    } catch {
      toast.error('Network Error', 'Check connection and try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const totals = log?.dailyTotals || { calories: 0, protein: 0, carbs: 0, fats: 0 };
  const meals: any[] = log?.meals || [];

  // Group meals by mealType
  const grouped: Record<string, { meal: any; index: number }[]> = {};
  meals.forEach((m, i) => {
    const key = m.mealType || 'snack';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ meal: m, index: i });
  });

  const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, marginRight: 16 }}>
          <ArrowLeft color={COLORS.subtext} size={18} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '800' }}>Today's Log</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 1 }}>{today}</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.emerald} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

          {/* Daily Totals Card */}
          <View style={{ backgroundColor: COLORS.card, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, padding: 24, marginBottom: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Activity color={COLORS.emerald} size={14} />
              <Text style={{ color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', marginLeft: 8 }}>Daily Totals</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 20 }}>
              <Text style={{ color: COLORS.text, fontSize: 56, fontWeight: '900', letterSpacing: -2 }}>{totals.calories}</Text>
              <Text style={{ color: COLORS.emerald, fontSize: 14, fontWeight: '800', marginLeft: 8 }}>KCAL</Text>
            </View>
            <View style={{ flexDirection: 'row', paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <MacroChip label="Protein" value={totals.protein} />
              <View style={{ width: 1, backgroundColor: COLORS.border }} />
              <MacroChip label="Carbs" value={totals.carbs} />
              <View style={{ width: 1, backgroundColor: COLORS.border }} />
              <MacroChip label="Fats" value={totals.fats} />
            </View>
          </View>

          {/* Meals */}
          {meals.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40, backgroundColor: COLORS.card, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border }}>
              <Zap color={COLORS.border2} size={36} style={{ marginBottom: 12 }} />
              <Text style={{ color: COLORS.subtext, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>Nothing logged yet</Text>
              <Text style={{ color: COLORS.muted, textAlign: 'center', fontSize: 13 }}>Go back and add food from the library or scan a meal.</Text>
            </View>
          ) : (
            mealOrder.filter(key => grouped[key]).map(key => {
              const Icon = MEAL_ICONS[key] || Apple;
              return (
                <View key={key} style={{ marginBottom: 24 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <Icon color={COLORS.emerald} size={14} />
                    <Text style={{ color: COLORS.emerald, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5, marginLeft: 8 }}>{key}</Text>
                  </View>
                  {grouped[key].map(({ meal: m, index: i }) => {
                    const foodName = typeof m.foodItemId === 'object' ? m.foodItemId?.name : m.name || 'Unknown Food';
                    return (
                      <View key={i} style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14, marginBottom: 4 }}>{foodName}</Text>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <Text style={{ color: COLORS.subtext, fontSize: 11 }}>{m.amount}g</Text>
                            {m.macros?.calories ? <Text style={{ color: COLORS.muted, fontSize: 11 }}>· {m.macros.calories} kcal</Text> : null}
                            {m.macros?.protein ? <Text style={{ color: COLORS.muted, fontSize: 11 }}>· {m.macros.protein}g P</Text> : null}
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => deleteMeal(i)}
                          disabled={deletingId === `${i}`}
                          style={{ padding: 8, backgroundColor: '#0f1115', borderRadius: 10, borderWidth: 1, borderColor: COLORS.border2, marginLeft: 10 }}
                        >
                          {deletingId === `${i}`
                            ? <ActivityIndicator size={14} color="#ef4444" />
                            : <Trash2 color="#ef4444" size={14} />
                          }
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
