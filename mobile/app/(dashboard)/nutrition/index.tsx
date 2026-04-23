import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  ActivityIndicator, TextInput, SafeAreaView, RefreshControl,
} from 'react-native';
import { Camera, Activity, ChevronRight, BookOpen, Layers, X, Plus, Minus, Check, ArrowLeft, CalendarDays } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '../../../components/ui/Toast';
import { fetchWithAuth } from '../../../utils/api';

const C = {
  bg: '#0f1115', card: '#161922', border: '#232632', border2: '#374151',
  text: '#f3f4f6', subtext: '#9ca3af', muted: '#6b7280',
  emerald: '#10b981', emeraldBg: 'rgba(16,185,129,0.1)',
};

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface DayIntake { calories: number; protein: number; carbs: number; fats: number; }
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

export default function NutritionDashboard() {
  const router = useRouter();
  const toast = useToast();

  const [intake, setIntake] = useState<DayIntake>({ calories: 0, protein: 0, carbs: 0, fats: 0 });
  const [library, setLibrary] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [selectedFood, setSelectedFood] = useState<any | null>(null);
  const [logAmount, setLogAmount] = useState('100');
  const [isLogging, setIsLogging] = useState(false);

  // ── Fetch all three resources in parallel ────────────────────────────────
  const fetchAll = useCallback(async () => {
    const today = getLocalDateString();
    const [logRes, libRes, tplRes] = await Promise.allSettled([
      fetchWithAuth(`/nutrition/log?date=${today}`),
      fetchWithAuth('/nutrition/library'),
      fetchWithAuth('/nutrition/templates'),
    ]);

    if (logRes.status === 'fulfilled' && logRes.value.ok) {
      const d = await logRes.value.json();
      const t = d.log?.dailyTotals || { calories: 0, protein: 0, carbs: 0, fats: 0 };
      setIntake(t);
    }
    if (libRes.status === 'fulfilled' && libRes.value.ok) {
      const d = await libRes.value.json();
      setLibrary(d.foods || []);
    }
    if (tplRes.status === 'fulfilled' && tplRes.value.ok) {
      const d = await tplRes.value.json();
      setTemplates(d.templates || []);
    }
  }, []);

  // Pre-fetch on first mount
  useEffect(() => {
    fetchAll().finally(() => setInitialLoading(false));
  }, [fetchAll]);

  // Re-fetch every time the screen comes into focus
  useFocusEffect(useCallback(() => {
    fetchAll();
  }, [fetchAll]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // ── Log food item ────────────────────────────────────────────────────────
  const logFoodItem = async (food: any, amount: number, mealType = 'snack') => {
    const today = getLocalDateString();
    const m = scaledMacros(food.macros, food.baseWeight, amount);
    const getRes = await fetchWithAuth(`/nutrition/log?date=${today}`);
    const existing = getRes.ok ? (await getRes.json()).log : null;
    const existingMeals: any[] = (existing?.meals || []).map((ml: any) => ({
      mealType: ml.mealType || 'snack',
      foodItemId: typeof ml.foodItemId === 'object' ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
      amount: ml.amount || 100,
      macros: ml.macros,
    }));
    const meals = [...existingMeals, { mealType, foodItemId: food._id, amount, macros: m }];
    const dailyTotals = meals.reduce((acc: any, ml: any) => ({
      calories: acc.calories + (ml.macros?.calories || 0),
      protein: acc.protein + (ml.macros?.protein || 0),
      carbs: acc.carbs + (ml.macros?.carbs || 0),
      fats: acc.fats + (ml.macros?.fats || 0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
    const res = await fetchWithAuth('/nutrition/log', {
      method: 'POST', body: JSON.stringify({ date: today, meals, dailyTotals }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to log food'); }
  };

  const confirmLogFood = async () => {
    if (!selectedFood) return;
    const amt = parseInt(logAmount) || 100;
    setIsLogging(true);
    try {
      await logFoodItem(selectedFood, amt);
      toast.success('Food Logged!', `${selectedFood.name} (${amt}g) added to today.`);
      setSheetMode(null); setSelectedFood(null);
      await fetchAll();
    } catch (e: any) { toast.error('Log Failed', e.message); }
    finally { setIsLogging(false); }
  };

  // ── Apply template ────────────────────────────────────────────────────────
  const logWholeTemplate = async (template: any) => {
    setIsLogging(true);
    try {
      const today = getLocalDateString();
      const getRes = await fetchWithAuth(`/nutrition/log?date=${today}`);
      const existing = getRes.ok ? (await getRes.json()).log : null;
      let meals: any[] = (existing?.meals || []).map((ml: any) => ({
        mealType: ml.mealType || 'snack',
        foodItemId: typeof ml.foodItemId === 'object' ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
        amount: ml.amount || 100,
        macros: ml.macros,
      }));

      for (const m of template.meals || []) {
        // foodItemId may be a populated object OR a plain ID string
        const food = typeof m.foodItemId === 'object' ? m.foodItemId : null;
        const id   = food?._id || m.foodItemId;
        if (!id) continue;

        // If not populated, look it up in the pre-fetched library
        const resolved = food && food.macros
          ? food
          : library.find(f => String(f._id) === String(id));
        if (!resolved?.macros) continue;

        const scaled = scaledMacros(resolved.macros, resolved.baseWeight, m.customAmount || resolved.baseWeight);
        meals.push({ mealType: m.mealType || 'snack', foodItemId: id, amount: m.customAmount || resolved.baseWeight, macros: scaled });
      }

      const dailyTotals = meals.reduce((acc: any, ml: any) => ({
        calories: acc.calories + (ml.macros?.calories || 0),
        protein: acc.protein + (ml.macros?.protein || 0),
        carbs: acc.carbs + (ml.macros?.carbs || 0),
        fats: acc.fats + (ml.macros?.fats || 0),
      }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

      const res = await fetchWithAuth('/nutrition/log', {
        method: 'POST', body: JSON.stringify({ date: today, meals, dailyTotals }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }

      toast.success('Template Applied!', `${template.meals?.length || 0} meals from "${template.name}" added.`);
      setSheetMode(null);
      await fetchAll();
    } catch (e: any) { toast.error('Log Failed', e.message); }
    finally { setIsLogging(false); }
  };

  const closeSheet = () => { setSheetMode(null); setSelectedFood(null); };

  // ── UI ────────────────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={C.emerald} size="large" />
        <Text style={{ color: C.muted, marginTop: 12, fontSize: 13 }}>Loading nutrition data…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingTop: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.emerald}
            colors={[C.emerald]}
          />
        }
      >
        {/* Header with back button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 28, marginTop: 8 }}>
          <TouchableOpacity
            onPress={() => router.push('/(dashboard)/health')}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}
            activeOpacity={0.7}
          >
            <ArrowLeft color={C.subtext} size={18} />
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: 32, fontWeight: '900', color: C.text, letterSpacing: -1 }}>Nutrition</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: C.muted, marginTop: 2, letterSpacing: 3, textTransform: 'uppercase' }}>Metabolic Telemetry</Text>
          </View>
        </View>

        {/* Today's Intake Widget */}
        <TouchableOpacity
          onPress={() => router.push('/nutrition/daily-log')}
          activeOpacity={0.85}
          style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 24, marginBottom: 32, overflow: 'hidden' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Activity color={C.emerald} size={14} />
            <Text style={{ fontSize: 10, fontWeight: '800', color: C.subtext, letterSpacing: 3, marginLeft: 8, textTransform: 'uppercase' }}>Today's Intake</Text>
            <View style={{ flex: 1 }} />
            <ChevronRight color={C.border2} size={16} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 20 }}>
            <Text style={{ fontSize: 52, fontWeight: '900', color: C.text, letterSpacing: -2 }}>{Math.round(intake.calories || 0)}</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: C.emerald, marginLeft: 8 }}>KCAL</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 20, borderTopWidth: 1, borderTopColor: C.border }}>
            {[
              { label: 'Protein', value: Math.round(intake.protein || 0) },
              { label: 'Carbs', value: Math.round(intake.carbs || 0) },
              { label: 'Fats', value: Math.round(intake.fats || 0) },
            ].map(item => (
              <View key={item.label} style={{ alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: C.text }}>{item.value}g</Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{item.label}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {/* Log Food Section */}
        <Text style={{ fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14, marginLeft: 4 }}>Log Food</Text>

        <TouchableOpacity
          onPress={() => router.push('/nutrition/scan')}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', padding: 18, borderRadius: 20, marginBottom: 10 }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#0f1115', justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
            <Camera color={C.text} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f1115', marginBottom: 2 }}>AI Meal Scan</Text>
            <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '500' }}>Analyze food macros via camera</Text>
          </View>
          <ChevronRight color="#6b7280" size={18} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setSheetMode('library')}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, padding: 18, borderRadius: 20, marginBottom: 10, borderWidth: 1, borderColor: C.border }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: C.border, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
            <BookOpen color={C.subtext} size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 2 }}>From Library</Text>
            <Text style={{ fontSize: 12, color: C.muted, fontWeight: '500' }}>
              {library.length > 0 ? `${library.length} foods saved` : 'Pick a saved food & log it'}
            </Text>
          </View>
          <ChevronRight color={C.border2} size={18} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setSheetMode('template')}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, padding: 18, borderRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: C.border }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: C.emeraldBg, justifyContent: 'center', alignItems: 'center', marginRight: 16, borderWidth: 1, borderColor: C.emerald + '40' }}>
            <Layers color={C.emerald} size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 2 }}>Use Day Template</Text>
            <Text style={{ fontSize: 12, color: C.muted, fontWeight: '500' }}>
              {templates.length > 0 ? `${templates.length} template${templates.length > 1 ? 's' : ''} available` : 'Log an entire day in one tap'}
            </Text>
          </View>
          <ChevronRight color={C.border2} size={18} />
        </TouchableOpacity>

        <View style={{ height: 1, backgroundColor: C.border, marginBottom: 24 }} />

        <Text style={{ fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14, marginLeft: 4 }}>Manage</Text>
        <TouchableOpacity
          onPress={() => router.push('/nutrition/library')}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: C.border, marginBottom: 10 }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: C.border, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
            <BookOpen color={C.subtext} size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 2 }}>Food Library</Text>
            <Text style={{ fontSize: 12, color: C.muted, fontWeight: '500' }}>Custom foods & day templates</Text>
          </View>
          <ChevronRight color={C.border2} size={18} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/nutrition/history')}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: C.border }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: C.border, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
            <CalendarDays color={C.subtext} size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 2 }}>History</Text>
            <Text style={{ fontSize: 12, color: C.muted, fontWeight: '500' }}>View past logs and weekly data</Text>
          </View>
          <ChevronRight color={C.border2} size={18} />
        </TouchableOpacity>
      </ScrollView>

      {/* ═══════════════ BOTTOM SHEET ═══════════════ */}
      <Modal visible={sheetMode !== null} transparent animationType="slide" statusBarTranslucent>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 40, maxHeight: '82%', borderTopWidth: 1, borderTopColor: C.border }}>

            {/* Sheet Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>
                {sheetMode === 'library' ? 'Log from Library' : 'Use Day Template'}
              </Text>
              <TouchableOpacity onPress={closeSheet} style={{ padding: 6, backgroundColor: C.border, borderRadius: 14 }}>
                <X color={C.subtext} size={16} />
              </TouchableOpacity>
            </View>

            {/* Library: food list */}
            {sheetMode === 'library' && !selectedFood && (
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                {library.length === 0 ? (
                  <View style={{ alignItems: 'center', marginTop: 30 }}>
                    <BookOpen color={C.border2} size={36} />
                    <Text style={{ color: C.muted, textAlign: 'center', marginTop: 10 }}>Your library is empty. Scan some meals first!</Text>
                  </View>
                ) : (
                  library.map(food => (
                    <TouchableOpacity
                      key={food._id}
                      onPress={() => { setSelectedFood(food); setLogAmount(String(food.baseWeight || 100)); }}
                      style={{ backgroundColor: C.bg, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center' }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.text, fontWeight: '700', fontSize: 14, marginBottom: 2 }}>{food.name}</Text>
                        <Text style={{ color: C.muted, fontSize: 12 }}>{food.macros?.calories} kcal · {food.macros?.protein}g P · base {food.baseWeight}g</Text>
                      </View>
                      <ChevronRight color={C.border2} size={16} />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}

            {/* Library: gram selector */}
            {sheetMode === 'library' && selectedFood && (
              <View style={{ padding: 20 }}>
                <TouchableOpacity onPress={() => setSelectedFood(null)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ color: C.emerald, fontSize: 13, fontWeight: '700' }}>← Back</Text>
                </TouchableOpacity>
                <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 4 }}>{selectedFood.name}</Text>
                <Text style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>Set the amount to log</Text>
                {(() => {
                  const m = scaledMacros(selectedFood.macros, selectedFood.baseWeight, parseInt(logAmount) || 100);
                  return (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.bg, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: C.border }}>
                      {[{ v: m.calories, l: 'KCAL' }, { v: m.protein, l: 'P' }, { v: m.carbs, l: 'C' }, { v: m.fats, l: 'F' }].map(({ v, l }) => (
                        <View key={l} style={{ alignItems: 'center' }}>
                          <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>{v}{l !== 'KCAL' ? 'g' : ''}</Text>
                          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>{l}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}
                <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Amount (grams)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <TouchableOpacity
                    onPress={() => setLogAmount(String(Math.max(10, parseInt(logAmount) - 10)))}
                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}
                  >
                    <Minus color={C.subtext} size={18} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center', paddingVertical: 10 }}>
                    <TextInput
                      style={{ color: C.text, fontSize: 22, fontWeight: '800', textAlign: 'center', padding: 0 }}
                      keyboardType="numeric"
                      value={logAmount}
                      onChangeText={setLogAmount}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => setLogAmount(String((parseInt(logAmount) || 0) + 10))}
                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}
                  >
                    <Plus color={C.subtext} size={18} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={confirmLogFood}
                  disabled={isLogging}
                  style={{ paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: isLogging ? C.border : '#f3f4f6' }}
                >
                  {isLogging ? <ActivityIndicator color="#0f1115" /> : <Text style={{ color: '#0f1115', fontWeight: '800', fontSize: 15 }}>Log to Today</Text>}
                </TouchableOpacity>
              </View>
            )}

            {/* Template list */}
            {sheetMode === 'template' && (
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                {templates.length === 0 ? (
                  <View style={{ alignItems: 'center', marginTop: 30 }}>
                    <Layers color={C.border2} size={36} />
                    <Text style={{ color: C.muted, textAlign: 'center', marginTop: 10, marginBottom: 16 }}>No templates yet.</Text>
                    <TouchableOpacity
                      onPress={() => { closeSheet(); router.push('/nutrition/library'); }}
                      style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, backgroundColor: '#f3f4f6' }}
                    >
                      <Text style={{ color: '#0f1115', fontWeight: '700' }}>Go Create One</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  templates.map(t => {
                    // Compute total kcal for preview
                    const tplCals = (t.meals || []).reduce((sum: number, m: any) => {
                      const food = typeof m.foodItemId === 'object' ? m.foodItemId : library.find(f => String(f._id) === String(m.foodItemId));
                      if (!food?.macros) return sum;
                      const r = (m.customAmount || food.baseWeight) / food.baseWeight;
                      return sum + Math.round(food.macros.calories * r);
                    }, 0);
                    return (
                      <TouchableOpacity
                        key={t._id}
                        onPress={() => logWholeTemplate(t)}
                        disabled={isLogging}
                        style={{ backgroundColor: C.bg, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center' }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: C.text, fontWeight: '700', fontSize: 15, marginBottom: 4 }}>{t.name}</Text>
                          <Text style={{ color: C.muted, fontSize: 12 }}>
                            {t.meals?.length || 0} meals{tplCals > 0 ? ` · ${tplCals} kcal` : ''}
                          </Text>
                        </View>
                        {isLogging
                          ? <ActivityIndicator color={C.emerald} size="small" />
                          : <Check color={C.emerald} size={18} />
                        }
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
