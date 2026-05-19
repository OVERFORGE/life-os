import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Modal, Animated, Dimensions, SafeAreaView, Alert
} from 'react-native';
import { X, Check, Plus, Minus, Layers, Coffee, Sun, Moon, Apple } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '../../../components/ui/Toast';
import { fetchWithAuth } from '../../../utils/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', icon: Coffee },
  { key: 'lunch', label: 'Lunch', icon: Sun },
  { key: 'dinner', label: 'Dinner', icon: Moon },
  { key: 'snack', label: 'Snack', icon: Apple },
];

const NAME_PRESETS = ['Bulk Day', 'Cut Day', 'Rest Day', 'Cheat Day', 'Training Day', 'Fasting Day'];

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)',
};
// alias for quick find/replace below
const COLORS = {
  bg: C.bg, card: C.card, border: C.border, border2: C.border,
  text: C.text, subtext: C.subtext, muted: C.muted,
  emerald: C.primary, emeraldBg: C.primaryBg,
};

// Scale macros based on gram ratio
function scaledMacros(macros: any, baseWeight: number, amount: number) {
  if (!macros || !baseWeight) return macros;
  const ratio = amount / baseWeight;
  return {
    calories: Math.round((macros.calories || 0) * ratio),
    protein: Math.round((macros.protein || 0) * ratio * 10) / 10,
    carbs: Math.round((macros.carbs || 0) * ratio * 10) / 10,
    fats: Math.round((macros.fats || 0) * ratio * 10) / 10,
  };
}

interface TemplateItem {
  foodItem: any;
  mealType: string;
  amount: number;
}

export default function CreateTemplateScreen() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [library, setLibrary] = useState<any[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [selectedItems, setSelectedItems] = useState<TemplateItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Food picker sub-modal state
  const [pickerFood, setPickerFood] = useState<any | null>(null);
  const [pickerMealType, setPickerMealType] = useState('breakfast');
  const [pickerAmount, setPickerAmount] = useState('100');
  const [pickerQty, setPickerQty] = useState('1');

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoadingLibrary(true);
        try {
          const res = await fetchWithAuth('/nutrition/library');
          if (res.ok) {
            const data = await res.json();
            setLibrary(data.foods || []);
          }
        } catch (e) {
          console.error('Library load error:', e);
        } finally {
          setLoadingLibrary(false);
        }
      };
      load();
    }, [])
  );

  const openPicker = (food: any) => {
    setPickerFood(food);
    setPickerMealType('breakfast');
    setPickerAmount(String(food.baseWeight || 100));
    setPickerQty('1');
  };

  const confirmAddFood = () => {
    if (!pickerFood) return;
    const gramsPerUnit = parseInt(pickerAmount) || 100;
    const qty = Math.max(1, parseInt(pickerQty) || 1);
    const totalAmount = gramsPerUnit * qty;
    const filtered = selectedItems.filter(
      i => !(i.foodItem._id === pickerFood._id && i.mealType === pickerMealType)
    );
    setSelectedItems([...filtered, { foodItem: pickerFood, mealType: pickerMealType, amount: totalAmount }]);
    setPickerFood(null);
  };

  const removeItem = (idx: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== idx));
  };

  const saveTemplate = async () => {
    if (!name.trim()) { Alert.alert('Name required', 'Please name your template.'); return; }
    if (selectedItems.length === 0) { Alert.alert('Empty template', 'Add at least one food item.'); return; }
    setIsSaving(true);
    try {
      const meals = selectedItems.map(si => ({
        foodItemId: si.foodItem._id,
        mealType: si.mealType,
        customAmount: si.amount,
      }));
      const res = await fetchWithAuth('/nutrition/templates', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), meals }),
      });
      if (!res.ok) throw new Error('Failed to save template');
      toast.success('Template Saved!', `"${name}" is ready to use.`, { label: 'Back', onPress: () => router.back() });
      setTimeout(() => router.back(), 1800);
    } catch (e: any) {
      toast.error('Save Failed', e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // --- Totals for review ---
  const totals = selectedItems.reduce((acc, si) => {
    const m = scaledMacros(si.foodItem.macros, si.foodItem.baseWeight, si.amount);
    return {
      calories: acc.calories + (m?.calories || 0),
      protein: acc.protein + (m?.protein || 0),
      carbs: acc.carbs + (m?.carbs || 0),
      fats: acc.fats + (m?.fats || 0),
    };
  }, { calories: 0, protein: 0, carbs: 0, fats: 0 });

  const mealGroups = MEAL_TYPES.map(mt => ({
    ...mt,
    items: selectedItems.filter(si => si.mealType === mt.key),
  })).filter(g => g.items.length > 0);

  // ---- RENDER ----
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border }}>
          <X color={C.subtext} size={18} />
        </TouchableOpacity>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '900' }}>New Day Template</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Step Indicator */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 8 }}>
        {[1, 2, 3].map(s => (
          <React.Fragment key={s}>
            <View style={{
              width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
              backgroundColor: step >= s ? C.primary : C.card,
              borderWidth: 1, borderColor: step >= s ? C.primary : C.border,
            }}>
              {step > s
                ? <Check color={C.text} size={14} />
                : <Text style={{ color: step === s ? C.text : C.muted, fontWeight: '900', fontSize: 13 }}>{s}</Text>
              }
            </View>
            {s < 3 && (
              <View style={{ width: 40, height: 1, backgroundColor: step > s ? C.primary : C.border }} />
            )}
          </React.Fragment>
        ))}
      </View>

      {/* ===== STEP 1: Name ===== */}
      {step === 1 && (
        <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
          <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '800', marginBottom: 6 }}>Name Your Template</Text>
          <Text style={{ color: COLORS.muted, fontSize: 14, marginBottom: 32 }}>Give this day plan a memorable name.</Text>

          <TextInput
            style={{
              backgroundColor: COLORS.card, color: COLORS.text, fontSize: 18, fontWeight: '700',
              padding: 18, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
              marginBottom: 20, textAlign: 'center'
            }}
            placeholder="e.g. Bulk Day"
            placeholderTextColor={COLORS.muted}
            value={name}
            onChangeText={setName}
          />

          <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>Quick Presets</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {NAME_PRESETS.map(p => (
              <TouchableOpacity
                key={p}
                onPress={() => setName(p)}
                style={{
                  paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
                  backgroundColor: name === p ? COLORS.emeraldBg : COLORS.card,
                  borderWidth: 1, borderColor: name === p ? COLORS.emerald : COLORS.border2,
                }}
              >
                <Text style={{ color: name === p ? COLORS.emerald : COLORS.subtext, fontWeight: '600', fontSize: 13 }}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ===== STEP 2: Add Foods ===== */}
      {step === 2 && (
        <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
          <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '800', marginBottom: 6 }}>Add Foods</Text>
          <Text style={{ color: COLORS.muted, fontSize: 14, marginBottom: 4 }}>Tap a food to add it with a meal type and amount.</Text>

          {/* Selected tray */}
          {selectedItems.length > 0 && (
            <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)' }}>
              <Text style={{ color: C.primary, fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected</Text>
              {selectedItems.map((si, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '600', fontSize: 13 }}>{si.foodItem.name}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 11 }}>{si.mealType} · {si.amount}g total</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeItem(idx)} style={{ padding: 4 }}>
                    <X color={COLORS.muted} size={14} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {loadingLibrary ? (
            <ActivityIndicator color={COLORS.emerald} style={{ marginTop: 40 }} />
          ) : library.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Layers color={COLORS.border2} size={40} style={{ marginBottom: 12 }} />
              <Text style={{ color: COLORS.subtext, textAlign: 'center', fontSize: 14 }}>Your food library is empty. Scan some meals first!</Text>
            </View>
          ) : (
            library.map(food => {
              const alreadyAdded = selectedItems.some(si => si.foodItem._id === food._id);
              return (
                <TouchableOpacity
                  key={food._id}
                  onPress={() => openPicker(food)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
                    borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1,
                    borderColor: alreadyAdded ? COLORS.emerald + '50' : COLORS.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15, marginBottom: 2 }}>{food.name}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 12 }}>
                      {food.macros?.calories} kcal · {food.macros?.protein}g P · {food.baseWeight}g base
                    </Text>
                  </View>
                  <View style={{
                    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: alreadyAdded ? COLORS.emeraldBg : COLORS.border,
                    borderWidth: 1, borderColor: alreadyAdded ? COLORS.emerald : COLORS.border2,
                  }}>
                    <Plus color={alreadyAdded ? COLORS.emerald : COLORS.subtext} size={16} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ===== STEP 3: Review ===== */}
      {step === 3 && (
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '800', marginBottom: 6 }}>Review Template</Text>
          <Text style={{ color: COLORS.muted, fontSize: 14, marginBottom: 24 }}>"{name}"</Text>

          {/* Totals bar */}
          <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>Daily Totals</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '800' }}>{totals.calories}</Text>
                <Text style={{ color: C.primary, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }}>kcal</Text>
              </View>
              {[['protein', 'P'], ['carbs', 'C'], ['fats', 'F']].map(([k, label]) => (
                <View key={k} style={{ alignItems: 'center' }}>
                  <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '800' }}>{(totals as any)[k]}g</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Meals grouped */}
          {mealGroups.map(group => (
            <View key={group.key} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <group.icon color={C.primary} size={14} style={{ marginRight: 8 }} />
                <Text style={{ color: C.primary, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>{group.label}</Text>
              </View>
              {group.items.map((si, idx) => {
                const m = scaledMacros(si.foodItem.macros, si.foodItem.baseWeight, si.amount);
                return (
                  <View key={idx} style={{ backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14, flex: 1 }}>{si.foodItem.name}</Text>
                      <Text style={{ color: COLORS.muted, fontSize: 12 }}>{si.amount}g</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {[
                        { v: m?.calories, l: 'kcal' },
                        { v: m?.protein, l: 'P' },
                        { v: m?.carbs, l: 'C' },
                        { v: m?.fats, l: 'F' },
                      ].map(({ v, l }) => (
                        <View key={l} style={{ backgroundColor: C.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: C.border }}>
                          <Text style={{ color: COLORS.subtext, fontSize: 11, fontWeight: '600' }}>{v}{l !== 'kcal' ? 'g' : ''} {l}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Bottom Navigation */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 36, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', gap: 12 }}>
        {step > 1 && (
          <TouchableOpacity
            onPress={() => setStep(step - 1)}
            style={{ flex: 1, paddingVertical: 16, borderRadius: 20, alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border }}
          >
            <Text style={{ color: C.subtext, fontWeight: '900', fontSize: 15 }}>Back</Text>
          </TouchableOpacity>
        )}
        {step < 3 ? (
          <TouchableOpacity
            onPress={() => {
              if (step === 1 && !name.trim()) { toast.warning('Name Required', 'Please enter a template name.'); return; }
              if (step === 2 && selectedItems.length === 0) { toast.warning('No Foods', 'Add at least one food item.'); return; }
              setStep(step + 1);
            }}
            style={{ flex: 1, paddingVertical: 16, borderRadius: 20, alignItems: 'center', backgroundColor: C.text }}
          >
            <Text style={{ color: C.bg, fontWeight: '900', fontSize: 15, textTransform: 'uppercase', letterSpacing: 1 }}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={saveTemplate}
            disabled={isSaving}
            style={{ flex: 1, paddingVertical: 16, borderRadius: 20, alignItems: 'center', backgroundColor: isSaving ? C.card : C.text, borderWidth: isSaving ? 1 : 0, borderColor: C.border }}
          >
            {isSaving ? <ActivityIndicator color={C.primary} /> : <Text style={{ color: C.bg, fontWeight: '900', fontSize: 15, textTransform: 'uppercase', letterSpacing: 1 }}>Save Template</Text>}
          </TouchableOpacity>
        )}
      </View>

      {/* Food Picker Sub-Modal */}
      <Modal visible={!!pickerFood} transparent animationType="slide" statusBarTranslucent>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 48, borderTopWidth: 1, borderTopColor: C.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '800' }}>{pickerFood?.name}</Text>
              <TouchableOpacity onPress={() => setPickerFood(null)}>
                <X color={COLORS.muted} size={20} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Meal Type</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
              {MEAL_TYPES.map(mt => (
                <TouchableOpacity
                  key={mt.key}
                  onPress={() => setPickerMealType(mt.key)}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                    backgroundColor: pickerMealType === mt.key ? C.primaryBg : C.bg,
                    borderWidth: 1, borderColor: pickerMealType === mt.key ? C.primary : C.border,
                  }}
                >
                  <mt.icon color={pickerMealType === mt.key ? C.primary : C.muted} size={14} />
                  <Text style={{ color: pickerMealType === mt.key ? C.primary : C.muted, fontSize: 10, fontWeight: '900', marginTop: 4 }}>{mt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Grams per unit</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <TouchableOpacity
                onPress={() => setPickerAmount(String(Math.max(10, parseInt(pickerAmount) - 10)))}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}
              >
                <Minus color={C.subtext} size={18} />
              </TouchableOpacity>
              <View style={{ flex: 1, backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 12, alignItems: 'center' }}>
                <TextInput
                  style={{ color: C.text, fontSize: 22, fontWeight: '900', textAlign: 'center', padding: 0 }}
                  keyboardType="numeric"
                  value={pickerAmount}
                  onChangeText={setPickerAmount}
                />
              </View>
              <TouchableOpacity
                onPress={() => setPickerAmount(String(parseInt(pickerAmount) + 10))}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}
              >
                <Plus color={C.subtext} size={18} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Quantity (× units)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <TouchableOpacity
                onPress={() => setPickerQty(String(Math.max(1, parseInt(pickerQty) - 1)))}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}
              >
                <Minus color={C.subtext} size={18} />
              </TouchableOpacity>
              <View style={{ flex: 1, backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 12, alignItems: 'center' }}>
                <TextInput
                  style={{ color: C.text, fontSize: 22, fontWeight: '900', textAlign: 'center', padding: 0 }}
                  keyboardType="numeric"
                  value={pickerQty}
                  onChangeText={setPickerQty}
                />
              </View>
              <TouchableOpacity
                onPress={() => setPickerQty(String((parseInt(pickerQty) || 1) + 1))}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}
              >
                <Plus color={C.subtext} size={18} />
              </TouchableOpacity>
            </View>
            {/* Total preview */}
            <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: C.border, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Text style={{ color: C.muted, fontSize: 13 }}>Total: </Text>
              <Text style={{ color: C.text, fontWeight: '900', fontSize: 13 }}>{(parseInt(pickerAmount) || 0) * (parseInt(pickerQty) || 1)}g</Text>
            </View>

            <TouchableOpacity
              onPress={confirmAddFood}
              style={{ paddingVertical: 16, borderRadius: 20, alignItems: 'center', backgroundColor: C.text }}
            >
              <Text style={{ color: C.bg, fontWeight: '900', fontSize: 15, textTransform: 'uppercase', letterSpacing: 1 }}>Add to Template</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
