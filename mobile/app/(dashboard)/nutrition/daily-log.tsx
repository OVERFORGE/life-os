import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { ArrowLeft, Trash2, Coffee, Sun, Moon, Apple, Activity, Dna, Zap } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '../../../components/ui/Toast';
import { fetchWithAuth } from '../../../utils/api';
import { Modal, TextInput } from 'react-native';
import { BookOpen, Layers, X, Plus, Minus, Check } from 'lucide-react-native';

const COLORS = {
  bg: '#0f1115', card: '#161922', border: '#232632', border2: '#374151',
  text: '#f3f4f6', subtext: '#9ca3af', muted: '#6b7280',
  emerald: '#10b981', emeraldBg: 'rgba(16,185,129,0.1)',
};

const MEAL_ICONS: Record<string, any> = {
  breakfast: Coffee, lunch: Sun, dinner: Moon, snack: Apple,
};

type SheetMode = null | 'library' | 'template';

function scaledMacros(macros: any, baseWeight: number, amount: number) {
  if (!macros || !baseWeight) return { calories: 0, protein: 0, carbs: 0, fats: 0 };
  const r = amount / baseWeight;
  return {
    calories: Math.round((macros.calories || 0) * r),
    protein: Math.round((macros.protein || 0) * r * 10) / 10,
    carbs: Math.round((macros.carbs || 0) * r * 10) / 10,
    fats: Math.round((macros.fats || 0) * r * 10) / 10,
  };
}

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
  const { date } = useLocalSearchParams<{ date?: string }>();
  const toast = useToast();
  const [log, setLog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [library, setLibrary] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [selectedFood, setSelectedFood] = useState<any | null>(null);
  const [logAmount, setLogAmount] = useState('100');
  const [isLogging, setIsLogging] = useState(false);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const targetDate = date || today;
  const isToday = targetDate === today;

  const loadLog = async () => {
    setLoading(true);
    try {
      const [logRes, libRes, tplRes] = await Promise.allSettled([
        fetchWithAuth(`/nutrition/log?date=${targetDate}&_t=${Date.now()}`),
        fetchWithAuth('/nutrition/library'),
        fetchWithAuth('/nutrition/templates'),
      ]);

      if (logRes.status === 'fulfilled' && logRes.value.ok) {
        const data = await logRes.value.json();
        setLog(data.log || null);
      }
      if (libRes.status === 'fulfilled' && libRes.value.ok) {
        const data = await libRes.value.json();
        setLibrary(data.foods || []);
      }
      if (tplRes.status === 'fulfilled' && tplRes.value.ok) {
        const data = await tplRes.value.json();
        setTemplates(data.templates || []);
      }
    } catch {
      toast.error('Load Failed', `Could not load log for ${targetDate}.`);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadLog(); }, [targetDate]));

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
        body: JSON.stringify({ date: targetDate, meals: sanitizedMeals, dailyTotals }),
      });
      if (res.ok) {
        toast.success('Entry Removed', 'Meal deleted from the log.');
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

  const logFoodItem = async (food: any, amount: number, mealType = 'snack') => {
    const m = scaledMacros(food.macros, food.baseWeight, amount);
    const existingMeals: any[] = (log?.meals || []).map((ml: any) => ({
      mealType: ml.mealType || 'snack',
      foodItemId: typeof ml.foodItemId === 'object' ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
      amount: ml.amount || 100,
      macros: ml.macros,
    }));
    const newMeals = [...existingMeals, { mealType, foodItemId: food._id, amount, macros: m }];
    const dailyTotals = newMeals.reduce((acc: any, ml: any) => ({
      calories: acc.calories + (ml.macros?.calories || 0),
      protein: acc.protein + (ml.macros?.protein || 0),
      carbs: acc.carbs + (ml.macros?.carbs || 0),
      fats: acc.fats + (ml.macros?.fats || 0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

    const res = await fetchWithAuth('/nutrition/log', {
      method: 'POST', body: JSON.stringify({ date: targetDate, meals: newMeals, dailyTotals }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to log food'); }
  };

  const confirmLogFood = async () => {
    if (!selectedFood) return;
    const amt = parseInt(logAmount) || 100;
    setIsLogging(true);
    try {
      await logFoodItem(selectedFood, amt);
      toast.success('Food Logged!', `${selectedFood.name} (${amt}g) added to ${targetDate}.`);
      setSheetMode(null); setSelectedFood(null);
      await loadLog();
    } catch (e: any) { toast.error('Log Failed', e.message); }
    finally { setIsLogging(false); }
  };

  const logWholeTemplate = async (template: any) => {
    setIsLogging(true);
    try {
      let newMeals: any[] = (log?.meals || []).map((ml: any) => ({
        mealType: ml.mealType || 'snack',
        foodItemId: typeof ml.foodItemId === 'object' ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
        amount: ml.amount || 100,
        macros: ml.macros,
      }));

      for (const m of template.meals || []) {
        const food = typeof m.foodItemId === 'object' ? m.foodItemId : null;
        const id = food?._id || m.foodItemId;
        if (!id) continue;
        const resolved = food && food.macros ? food : library.find(f => String(f._id) === String(id));
        if (!resolved?.macros) continue;
        const scaled = scaledMacros(resolved.macros, resolved.baseWeight, m.customAmount || resolved.baseWeight);
        newMeals.push({ mealType: m.mealType || 'snack', foodItemId: id, amount: m.customAmount || resolved.baseWeight, macros: scaled });
      }

      const dailyTotals = newMeals.reduce((acc: any, ml: any) => ({
        calories: acc.calories + (ml.macros?.calories || 0),
        protein: acc.protein + (ml.macros?.protein || 0),
        carbs: acc.carbs + (ml.macros?.carbs || 0),
        fats: acc.fats + (ml.macros?.fats || 0),
      }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

      const res = await fetchWithAuth('/nutrition/log', {
        method: 'POST', body: JSON.stringify({ date: targetDate, meals: newMeals, dailyTotals }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }

      toast.success('Template Applied!', `${template.meals?.length || 0} meals from "${template.name}" added.`);
      setSheetMode(null);
      await loadLog();
    } catch (e: any) { toast.error('Log Failed', e.message); }
    finally { setIsLogging(false); }
  };

  const closeSheet = () => { setSheetMode(null); setSelectedFood(null); };

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
          <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '800' }}>{isToday ? "Today's Log" : "Daily Log"}</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 1 }}>{targetDate}</Text>
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
              <MacroChip label="Protein" value={Math.round(totals.protein || 0)} />
              <View style={{ width: 1, backgroundColor: COLORS.border }} />
              <MacroChip label="Carbs" value={Math.round(totals.carbs || 0)} />
              <View style={{ width: 1, backgroundColor: COLORS.border }} />
              <MacroChip label="Fats" value={Math.round(totals.fats || 0)} />
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

      {/* Quick Actions */}
      <View style={{ position: 'absolute', bottom: 30, left: 24, right: 24, flexDirection: 'row', gap: 12 }}>
        <TouchableOpacity onPress={() => setSheetMode('library')} activeOpacity={0.8} style={{ flex: 1, backgroundColor: '#f3f4f6', borderRadius: 20, paddingVertical: 18, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 }}>
          <Text style={{ color: '#0f1115', fontWeight: '800', fontSize: 14 }}>Log Food</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSheetMode('template')} activeOpacity={0.8} style={{ flex: 1, backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 18, alignItems: 'center' }}>
          <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 14 }}>Use Template</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet Modal */}
      <Modal visible={sheetMode !== null} animationType="slide" transparent>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, height: '75%', borderTopWidth: 1, borderColor: COLORS.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '800' }}>
                {sheetMode === 'library' ? (selectedFood ? 'Set Amount' : 'From Library') : 'Apply Day Template'}
              </Text>
              <TouchableOpacity onPress={closeSheet} style={{ padding: 8, backgroundColor: COLORS.bg, borderRadius: 20 }}>
                <X color={COLORS.subtext} size={16} />
              </TouchableOpacity>
            </View>

            {sheetMode === 'library' && !selectedFood && (
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                {library.length === 0 ? (
                  <View style={{ alignItems: 'center', marginTop: 30 }}>
                    <BookOpen color={COLORS.border2} size={36} />
                    <Text style={{ color: COLORS.muted, textAlign: 'center', marginTop: 10 }}>Your library is empty. Go to home dashboard to scan meals.</Text>
                  </View>
                ) : (
                  library.map(food => (
                    <TouchableOpacity
                      key={food._id}
                      onPress={() => { setSelectedFood(food); setLogAmount(String(food.baseWeight || 100)); }}
                      style={{ backgroundColor: COLORS.bg, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14, marginBottom: 2 }}>{food.name}</Text>
                        <Text style={{ color: COLORS.muted, fontSize: 12 }}>{food.macros?.calories} kcal · {food.macros?.protein}g P · base {food.baseWeight}g</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}

            {sheetMode === 'library' && selectedFood && (
              <View style={{ padding: 20 }}>
                <TouchableOpacity onPress={() => setSelectedFood(null)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ color: COLORS.emerald, fontSize: 13, fontWeight: '700' }}>← Back</Text>
                </TouchableOpacity>
                <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '800', marginBottom: 4 }}>{selectedFood.name}</Text>
                <Text style={{ color: COLORS.muted, fontSize: 13, marginBottom: 24 }}>Set the amount to log</Text>
                {(() => {
                  const m = scaledMacros(selectedFood.macros, selectedFood.baseWeight, parseInt(logAmount) || 100);
                  return (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.bg, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border }}>
                      {[{ v: m.calories, l: 'KCAL' }, { v: m.protein, l: 'P' }, { v: m.carbs, l: 'C' }, { v: m.fats, l: 'F' }].map(({ v, l }) => (
                        <View key={l} style={{ alignItems: 'center' }}>
                          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '800' }}>{Math.round(v || 0)}{l !== 'KCAL' ? 'g' : ''}</Text>
                          <Text style={{ color: COLORS.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>{l}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}
                <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Amount (grams)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <TouchableOpacity onPress={() => setLogAmount(String(Math.max(10, parseInt(logAmount) - 10)))} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
                    <Minus color={COLORS.subtext} size={18} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, backgroundColor: COLORS.bg, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', paddingVertical: 10 }}>
                    <TextInput style={{ color: COLORS.text, fontSize: 22, fontWeight: '800', textAlign: 'center', padding: 0 }} keyboardType="numeric" value={logAmount} onChangeText={setLogAmount} />
                  </View>
                  <TouchableOpacity onPress={() => setLogAmount(String((parseInt(logAmount) || 0) + 10))} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
                    <Plus color={COLORS.subtext} size={18} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={confirmLogFood} disabled={isLogging} style={{ paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: isLogging ? COLORS.border : '#f3f4f6' }}>
                  {isLogging ? <ActivityIndicator color="#0f1115" /> : <Text style={{ color: '#0f1115', fontWeight: '800', fontSize: 15 }}>Log to {targetDate}</Text>}
                </TouchableOpacity>
              </View>
            )}

            {sheetMode === 'template' && (
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                {templates.length === 0 ? (
                  <View style={{ alignItems: 'center', marginTop: 30 }}>
                    <Layers color={COLORS.border2} size={36} />
                    <Text style={{ color: COLORS.muted, textAlign: 'center', marginTop: 10, marginBottom: 16 }}>No templates yet.</Text>
                  </View>
                ) : (
                  templates.map(t => {
                    const tplCals = (t.meals || []).reduce((sum: number, m: any) => {
                      const food = typeof m.foodItemId === 'object' ? m.foodItemId : library.find(f => String(f._id) === String(m.foodItemId));
                      if (!food?.macros) return sum;
                      const r = (m.customAmount || food.baseWeight) / food.baseWeight;
                      return sum + Math.round(food.macros.calories * r);
                    }, 0);
                    return (
                      <TouchableOpacity key={t._id} onPress={() => logWholeTemplate(t)} disabled={isLogging} style={{ backgroundColor: COLORS.bg, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15, marginBottom: 4 }}>{t.name}</Text>
                          <Text style={{ color: COLORS.muted, fontSize: 12 }}>{t.meals?.length || 0} meals{tplCals > 0 ? ` · ${tplCals} kcal` : ''}</Text>
                        </View>
                        {isLogging ? <ActivityIndicator color={COLORS.emerald} size="small" /> : <Check color={COLORS.emerald} size={18} />}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
