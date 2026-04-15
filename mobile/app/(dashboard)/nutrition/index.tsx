import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  ActivityIndicator, TextInput, Dimensions, SafeAreaView
} from 'react-native';
import { Camera, Activity, ChevronRight, BookOpen, Layers, X, Plus, Minus, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '../../../components/ui/Toast';
import { fetchWithAuth } from '../../../utils/api';

const COLORS = {
  bg: '#0f1115',
  card: '#161922',
  border: '#232632',
  border2: '#374151',
  text: '#f3f4f6',
  subtext: '#9ca3af',
  muted: '#6b7280',
  emerald: '#10b981',
  emeraldBg: 'rgba(16,185,129,0.1)',
};

interface DayIntake { calories: number; protein: number; carbs: number; fats: number; }

// Scale macros by gram ratio
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

type SheetMode = null | 'picker' | 'library' | 'template';

export default function NutritionDashboard() {
  const router = useRouter();
  const toast = useToast();
  const [intake, setIntake] = useState<DayIntake>({ calories: 0, protein: 0, carbs: 0, fats: 0 });

  // Bottom sheet
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  // Library picker state
  const [library, setLibrary] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingPicker, setLoadingPicker] = useState(false);
  // Selected food for gram logging
  const [selectedFood, setSelectedFood] = useState<any | null>(null);
  const [logAmount, setLogAmount] = useState('100');
  const [isLogging, setIsLogging] = useState(false);

  const loadIntake = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetchWithAuth(`/nutrition/log?date=${today}`);
      if (res.ok) {
        const data = await res.json();
        const totals = data.log?.dailyTotals || { calories: 0, protein: 0, carbs: 0, fats: 0 };
        setIntake(totals);
      }
    } catch (e) { /* silent */ }
  };

  useFocusEffect(useCallback(() => { loadIntake(); }, []));

  const openSheet = async (mode: 'library' | 'template') => {
    setSheetMode(mode);
    setLoadingPicker(true);
    setSelectedFood(null);
    try {
      if (mode === 'library') {
        const res = await fetchWithAuth('/nutrition/library');
        if (res.ok) { const d = await res.json(); setLibrary(d.foods || []); }
      } else {
        const res = await fetchWithAuth('/nutrition/templates');
        if (res.ok) { const d = await res.json(); setTemplates(d.templates || []); }
      }
    } catch (e) { /* silent */ }
    setLoadingPicker(false);
  };

  // Append one food entry to today's NutritionLog (correct schema shape)
  const logFoodItem = async (food: any, amount: number, mealType: string = 'snack') => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const m = scaledMacros(food.macros, food.baseWeight, amount);
      // Read existing log and sanitize to schema-only fields
      const getRes = await fetchWithAuth(`/nutrition/log?date=${today}`);
      const existing = getRes.ok ? (await getRes.json()).log : null;
      const existingMeals: any[] = (existing?.meals || []).map((ml: any) => ({
        mealType: ml.mealType || 'snack',
        foodItemId: typeof ml.foodItemId === 'object' ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
        amount: ml.amount || 100,
        macros: ml.macros,
      }));
      const newMeal = {
        mealType,
        foodItemId: food._id,
        amount,
        macros: m,
      };
      const meals = [...existingMeals, newMeal];
      // Recompute totals
      const dailyTotals = meals.reduce((acc: any, ml: any) => ({
        calories: acc.calories + (ml.macros?.calories || 0),
        protein: acc.protein + (ml.macros?.protein || 0),
        carbs: acc.carbs + (ml.macros?.carbs || 0),
        fats: acc.fats + (ml.macros?.fats || 0),
      }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
      const res = await fetchWithAuth('/nutrition/log', {
        method: 'POST',
        body: JSON.stringify({ date: today, meals, dailyTotals }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to log food'); }
    } catch (e: any) { throw e; }
  };

  const confirmLogFood = async () => {
    if (!selectedFood) return;
    const amt = parseInt(logAmount) || 100;
    setIsLogging(true);
    try {
      await logFoodItem(selectedFood, amt, 'snack');
      toast.success('Food Logged!', `${selectedFood.name} (${amt}g) added to today.`);
      setSheetMode(null); setSelectedFood(null); loadIntake();
    } catch (e: any) {
      toast.error('Log Failed', e.message);
    } finally {
      setIsLogging(false);
    }
  };

  const logWholeTemplate = async (template: any) => {
    setIsLogging(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const getRes = await fetchWithAuth(`/nutrition/log?date=${today}`);
      const existing = getRes.ok ? (await getRes.json()).log : null;
      let meals: any[] = (existing?.meals || []).map((ml: any) => ({
        mealType: ml.mealType || 'snack',
        foodItemId: typeof ml.foodItemId === 'object' ? ml.foodItemId._id || ml.foodItemId : ml.foodItemId,
        amount: ml.amount || 100,
        macros: ml.macros,
      }));
      for (const m of template.meals || []) {
        const food = m.foodItemId; // populated object from backend
        if (!food?._id) continue;
        const scaled = scaledMacros(food.macros, food.baseWeight, m.customAmount);
        meals.push({ mealType: m.mealType || 'snack', foodItemId: food._id, amount: m.customAmount, macros: scaled });
      }
      const dailyTotals = meals.reduce((acc: any, ml: any) => ({
        calories: acc.calories + (ml.macros?.calories || 0),
        protein: acc.protein + (ml.macros?.protein || 0),
        carbs: acc.carbs + (ml.macros?.carbs || 0),
        fats: acc.fats + (ml.macros?.fats || 0),
      }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
      const res = await fetchWithAuth('/nutrition/log', { method: 'POST', body: JSON.stringify({ date: today, meals, dailyTotals }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
      toast.success('Template Logged!', `All ${template.meals?.length || 0} meals from "${template.name}" added to today.`,
        { label: 'Close', onPress: () => { setSheetMode(null); loadIntake(); } }
      );
      setSheetMode(null); loadIntake();
    } catch (e: any) {
      toast.error('Log Failed', e.message);
    } finally {
      setIsLogging(false);
    }
  };

  const closeSheet = () => { setSheetMode(null); setSelectedFood(null); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 38, fontWeight: '900', color: COLORS.text, letterSpacing: -1 }}>Nutrition</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.muted, marginTop: 4, letterSpacing: 3, textTransform: 'uppercase' }}>Metabolic Telemetry</Text>
        </View>

        {/* Today's Intake Widget — tappable to open daily log */}
        <TouchableOpacity
          onPress={() => router.push('/nutrition/daily-log')}
          activeOpacity={0.85}
          style={{ backgroundColor: COLORS.card, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, padding: 24, marginBottom: 32, overflow: 'hidden' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Activity color={COLORS.emerald} size={14} />
            <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.subtext, letterSpacing: 3, marginLeft: 8, textTransform: 'uppercase' }}>Today's Intake</Text>
            <View style={{ flex: 1 }} />
            <ChevronRight color={COLORS.border2} size={16} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 20 }}>
            <Text style={{ fontSize: 52, fontWeight: '900', color: COLORS.text, letterSpacing: -2 }}>{intake.calories}</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.emerald, marginLeft: 8 }}>KCAL</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 20, borderTopWidth: 1, borderTopColor: COLORS.border }}>
            {[
              { label: 'Protein', value: intake.protein },
              { label: 'Carbs', value: intake.carbs },
              { label: 'Fats', value: intake.fats },
            ].map(item => (
              <View key={item.label} style={{ alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.text }}>{item.value}g</Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{item.label}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {/* Section Label */}
        <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.muted, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14, marginLeft: 4 }}>Log Food</Text>

        {/* Log Options */}
        {/* AI Scan */}
        <TouchableOpacity
          onPress={() => router.push('/nutrition/scan')}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', padding: 18, borderRadius: 20, marginBottom: 10 }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#0f1115', justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
            <Camera color={COLORS.text} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f1115', marginBottom: 2 }}>AI Meal Scan</Text>
            <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '500' }}>Analyze food macros via camera</Text>
          </View>
          <ChevronRight color="#6b7280" size={18} />
        </TouchableOpacity>

        {/* From Library */}
        <TouchableOpacity
          onPress={() => openSheet('library')}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 18, borderRadius: 20, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
            <BookOpen color={COLORS.subtext} size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 2 }}>From Library</Text>
            <Text style={{ fontSize: 12, color: COLORS.muted, fontWeight: '500' }}>Pick a saved food & log it</Text>
          </View>
          <ChevronRight color={COLORS.border2} size={18} />
        </TouchableOpacity>

        {/* Use Template */}
        <TouchableOpacity
          onPress={() => openSheet('template')}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 18, borderRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: COLORS.border }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.emeraldBg, justifyContent: 'center', alignItems: 'center', marginRight: 16, borderWidth: 1, borderColor: COLORS.emerald + '40' }}>
            <Layers color={COLORS.emerald} size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 2 }}>Use Day Template</Text>
            <Text style={{ fontSize: 12, color: COLORS.muted, fontWeight: '500' }}>Log an entire day layout in one tap</Text>
          </View>
          <ChevronRight color={COLORS.border2} size={18} />
        </TouchableOpacity>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: COLORS.border, marginBottom: 24 }} />

        {/* Go to Library */}
        <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.muted, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14, marginLeft: 4 }}>Manage</Text>
        <TouchableOpacity
          onPress={() => router.push('/nutrition/library')}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
            <BookOpen color={COLORS.subtext} size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 2 }}>Food Library</Text>
            <Text style={{ fontSize: 12, color: COLORS.muted, fontWeight: '500' }}>Custom foods & day templates</Text>
          </View>
          <ChevronRight color={COLORS.border2} size={18} />
        </TouchableOpacity>

      </ScrollView>

      {/* ===================== BOTTOM SHEET MODAL ===================== */}
      <Modal visible={sheetMode === 'library' || sheetMode === 'template'} transparent animationType="slide" statusBarTranslucent>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 40, maxHeight: '82%', borderTopWidth: 1, borderTopColor: COLORS.border }}>

            {/* Sheet header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '800' }}>
                {sheetMode === 'library' ? 'Log from Library' : 'Use Day Template'}
              </Text>
              <TouchableOpacity onPress={closeSheet} style={{ padding: 6, backgroundColor: COLORS.border, borderRadius: 14 }}>
                <X color={COLORS.subtext} size={16} />
              </TouchableOpacity>
            </View>

            {/* ---- Library Mode ---- */}
            {sheetMode === 'library' && !selectedFood && (
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                {loadingPicker ? (
                  <ActivityIndicator color={COLORS.emerald} style={{ marginTop: 30 }} />
                ) : library.length === 0 ? (
                  <View style={{ alignItems: 'center', marginTop: 30 }}>
                    <BookOpen color={COLORS.border2} size={36} style={{ marginBottom: 10 }} />
                    <Text style={{ color: COLORS.muted, textAlign: 'center' }}>Your library is empty. Scan some meals first!</Text>
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
                      <ChevronRight color={COLORS.border2} size={16} />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}

            {/* ---- Library: Gram selector ---- */}
            {sheetMode === 'library' && selectedFood && (
              <View style={{ padding: 20 }}>
                <TouchableOpacity onPress={() => setSelectedFood(null)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ color: COLORS.emerald, fontSize: 13, fontWeight: '700' }}>← Back</Text>
                </TouchableOpacity>

                <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '800', marginBottom: 4 }}>{selectedFood.name}</Text>
                <Text style={{ color: COLORS.muted, fontSize: 13, marginBottom: 24 }}>Set the amount to log</Text>

                {/* Scaled preview */}
                {(() => {
                  const m = scaledMacros(selectedFood.macros, selectedFood.baseWeight, parseInt(logAmount) || 100);
                  return (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.bg, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border }}>
                      {[{ v: m.calories, l: 'KCAL' }, { v: m.protein, l: 'P' }, { v: m.carbs, l: 'C' }, { v: m.fats, l: 'F' }].map(({ v, l }) => (
                        <View key={l} style={{ alignItems: 'center' }}>
                          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '800' }}>{v}{l !== 'KCAL' ? 'g' : ''}</Text>
                          <Text style={{ color: COLORS.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>{l}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}

                <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Amount (grams)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <TouchableOpacity
                    onPress={() => setLogAmount(String(Math.max(10, parseInt(logAmount) - 10)))}
                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}
                  >
                    <Minus color={COLORS.subtext} size={18} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, backgroundColor: COLORS.bg, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', paddingVertical: 10 }}>
                    <TextInput
                      style={{ color: COLORS.text, fontSize: 22, fontWeight: '800', textAlign: 'center', padding: 0 }}
                      keyboardType="numeric"
                      value={logAmount}
                      onChangeText={setLogAmount}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => setLogAmount(String((parseInt(logAmount) || 0) + 10))}
                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}
                  >
                    <Plus color={COLORS.subtext} size={18} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={confirmLogFood}
                  disabled={isLogging}
                  style={{ paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: isLogging ? COLORS.border : '#f3f4f6' }}
                >
                  {isLogging ? <ActivityIndicator color="#0f1115" /> : <Text style={{ color: '#0f1115', fontWeight: '800', fontSize: 15 }}>Log to Today</Text>}
                </TouchableOpacity>
              </View>
            )}

            {/* ---- Template Mode ---- */}
            {sheetMode === 'template' && (
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                {loadingPicker ? (
                  <ActivityIndicator color={COLORS.emerald} style={{ marginTop: 30 }} />
                ) : templates.length === 0 ? (
                  <View style={{ alignItems: 'center', marginTop: 30 }}>
                    <Layers color={COLORS.border2} size={36} style={{ marginBottom: 10 }} />
                    <Text style={{ color: COLORS.muted, textAlign: 'center', marginBottom: 16 }}>No templates yet.</Text>
                    <TouchableOpacity
                      onPress={() => { closeSheet(); router.push('/nutrition/library'); }}
                      style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, backgroundColor: '#f3f4f6' }}
                    >
                      <Text style={{ color: '#0f1115', fontWeight: '700' }}>Go Create One</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  templates.map(t => (
                    <TouchableOpacity
                      key={t._id}
                      onPress={() => logWholeTemplate(t)}
                      disabled={isLogging}
                      style={{ backgroundColor: COLORS.bg, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15, marginBottom: 4 }}>{t.name}</Text>
                        <Text style={{ color: COLORS.muted, fontSize: 12 }}>{t.meals?.length || 0} meals</Text>
                      </View>
                      {isLogging
                        ? <ActivityIndicator color={COLORS.emerald} size="small" />
                        : <Check color={COLORS.emerald} size={18} />
                      }
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}

          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
