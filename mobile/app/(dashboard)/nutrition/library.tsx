import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, TextInput, SafeAreaView } from 'react-native';
import { ArrowLeft, Plus, Dna, Layers, Leaf, Camera, Edit2, Trash2, X, Check, Coffee, Sun, Moon, Apple, Clock } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '../../../components/ui/Toast';
import { fetchWithAuth } from '../../../utils/api';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

const MEAL_ICONS: Record<string, any> = {
  breakfast: Coffee, lunch: Sun, dinner: Moon, snack: Apple,
};

function templateCalories(t: any): number {
  if (!t.meals?.length) return 0;
  return t.meals.reduce((sum: number, m: any) => {
    const food = m.foodItemId;
    if (!food?.macros?.calories || !food?.baseWeight) return sum;
    return sum + Math.round((food.macros.calories / food.baseWeight) * (m.customAmount || 100));
  }, 0);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function FoodLibraryScreen() {
  const router = useRouter();
  const toast = useToast();
  const [foods, setFoods] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'foods' | 'templates' | 'history'>('foods');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Edit template modal state
  const [editTemplate, setEditTemplate] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editMeals, setEditMeals] = useState<any[]>([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const [foodsRes, templatesRes, historyRes] = await Promise.all([
        fetchWithAuth('/nutrition/library'),
        fetchWithAuth('/nutrition/templates'),
        fetchWithAuth('/nutrition/log?history=true'),
      ]);
      if (foodsRes.ok) { const d = await foodsRes.json(); setFoods(d.foods || []); }
      if (templatesRes.ok) { const d = await templatesRes.json(); setTemplates(d.templates || []); }
      if (historyRes.ok) { const d = await historyRes.json(); setHistoryLogs(d.logs || []); }
    } catch {
      toast.error('Load Failed', 'Could not load library data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadLibrary(); }, [loadLibrary]));

  const openEditTemplate = (t: any) => {
    setEditTemplate(t);
    setEditName(t.name);
    setEditMeals([...(t.meals || [])]);
  };

  const closeEditTemplate = () => {
    setEditTemplate(null);
    setEditName('');
    setEditMeals([]);
  };

  const removeEditMeal = (idx: number) => {
    setEditMeals(prev => prev.filter((_, i) => i !== idx));
  };

  const saveEditTemplate = async () => {
    if (!editTemplate) return;
    if (!editName.trim()) { toast.warning('Name Required', 'Template name cannot be empty.'); return; }
    setIsSavingTemplate(true);
    try {
      // Sanitize meals: only send foodItemId (as ID string), mealType, customAmount
      const sanitizedMeals = editMeals.map((m: any) => ({
        mealType: m.mealType || 'snack',
        foodItemId: typeof m.foodItemId === 'object' ? m.foodItemId._id || m.foodItemId : m.foodItemId,
        customAmount: m.customAmount || 100,
      }));
      const res = await fetchWithAuth(`/nutrition/templates/${editTemplate._id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editName.trim(), meals: sanitizedMeals }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update template');
      toast.success('Template Updated!', `"${editName.trim()}" saved successfully.`);
      closeEditTemplate();
      loadLibrary();
    } catch (e: any) {
      toast.error('Save Failed', e.message);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const deleteFood = async (id: string, name: string) => {
    setDeletingId(id);
    try {
      const res = await fetchWithAuth(`/nutrition/library/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFoods(prev => prev.filter(f => f._id !== id));
        toast.success('Food Deleted', `"${name}" removed from your library.`);
      } else {
        toast.error('Delete Failed', data.error || 'Could not delete food item.');
      }
    } catch {
      toast.error('Network Error', 'Check your connection and try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const deleteTemplate = async (id: string, name: string) => {
    setDeletingId(id);
    try {
      const res = await fetchWithAuth(`/nutrition/templates/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t._id !== id));
        toast.success('Template Deleted', `"${name}" has been removed.`);
      } else {
        toast.error('Delete Failed', data.error || 'Could not delete template.');
      }
    } catch {
      toast.error('Network Error', 'Check your connection and try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.card, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
          <ArrowLeft size={20} color={C.subtext} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '900', color: C.text, flex: 1, textAlign: 'center' }}>Food Library</Text>
        <TouchableOpacity onPress={() => router.push('/nutrition/scan')} style={{ backgroundColor: C.primaryBg, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)' }}>
          <Plus color={C.primary} size={20} />
        </TouchableOpacity>
      </View>

      {/* Tab Toggle */}
      <View style={{ flexDirection: 'row', backgroundColor: C.card, marginHorizontal: 20, marginVertical: 20, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: C.border }}>
        {(
          [
            ['foods', 'Custom Foods', Dna],
            ['templates', 'Day Templates', Layers],
            ['history', 'History', Clock]
          ] as const
        ).map(([key, label, Icon]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setActiveTab(key)}
            style={{ flex: 1, flexDirection: 'row', paddingVertical: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: activeTab === key ? C.border : 'transparent' }}
          >
            <Icon color={activeTab === key ? C.primary : C.muted} size={15} />
            <Text style={{ fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: activeTab === key ? C.text : C.muted, marginLeft: 6 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={{ color: C.muted, marginTop: 16, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>Loading Data...</Text>
          </View>
        ) : activeTab === 'foods' ? (
          foods.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 48, backgroundColor: C.card, padding: 32, borderRadius: 24, borderWidth: 1, borderColor: C.border }}>
              <Leaf color={C.border} size={48} style={{ marginBottom: 16 }} />
              <Text style={{ color: C.text, fontSize: 18, fontWeight: '900', marginBottom: 8 }}>No verified foods yet.</Text>
              <Text style={{ color: C.muted, textAlign: 'center', fontSize: 14, fontWeight: '600', lineHeight: 20 }}>Scan items with the AI camera to build your personalized library.</Text>
              <TouchableOpacity onPress={() => router.push('/nutrition/scan')} style={{ marginTop: 24, backgroundColor: C.text, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 20, flexDirection: 'row', alignItems: 'center' }}>
                <Camera color={C.bg} size={16} style={{ marginRight: 8 }} />
                <Text style={{ color: C.bg, fontWeight: '900', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>Scan a Meal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            foods.map(f => (
              <View key={f._id} style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 24, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
                {f.imageUrl && (
                <View style={{ width: 110, minHeight: 110, backgroundColor: C.bg }}>
                  <Image source={{ uri: f.imageUrl }} style={{ width: 110, height: 110 }} resizeMode="cover" />
                </View>
              )}
                <View style={{ flex: 1, padding: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '900', flex: 1, marginRight: 8 }}>{f.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/nutrition/scan', params: { editFood: JSON.stringify(f) } })}
                        style={{ padding: 8, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border }}
                      >
                        <Edit2 color={C.subtext} size={14} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => deleteFood(f._id, f.name)}
                        disabled={deletingId === f._id}
                        style={{ padding: 8, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border }}
                      >
                        {deletingId === f._id
                          ? <ActivityIndicator size={14} color={C.primary} />
                          : <Trash2 color={C.primary} size={14} />
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
                    {[
                      { v: `${f.macros?.calories} kcal`, hi: true },
                      { v: `${f.macros?.protein}g P` },
                      { v: `${f.macros?.carbs}g C` },
                      { v: `${f.macros?.fats}g F` },
                    ].map(({ v, hi }) => (
                      <View key={v} style={{ backgroundColor: hi ? C.primaryBg : C.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: hi ? 'rgba(232,65,74,0.3)' : C.border, marginRight: 6, marginBottom: 6 }}>
                        <Text style={{ color: hi ? C.primary : C.subtext, fontSize: 11, fontWeight: '900' }}>{v}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 }}>Base: {f.baseWeight}g</Text>
                </View>
              </View>
            ))
          )
        ) : activeTab === 'templates' ? (
          templates.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 48, backgroundColor: C.card, padding: 32, borderRadius: 24, borderWidth: 1, borderColor: C.border }}>
              <Layers color={C.border} size={48} style={{ marginBottom: 16 }} />
              <Text style={{ color: C.text, fontSize: 18, fontWeight: '900', marginBottom: 8 }}>No day templates yet.</Text>
              <Text style={{ color: C.muted, textAlign: 'center', fontSize: 14, fontWeight: '600', lineHeight: 20 }}>Combine library foods into one-tap daily layouts.</Text>
              <TouchableOpacity onPress={() => router.push('/nutrition/create-template')} style={{ marginTop: 24, backgroundColor: C.text, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 20 }}>
                <Text style={{ color: C.bg, fontWeight: '900', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>Create Template</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {templates.map(t => {
                const kcal = templateCalories(t);
                const created = t.createdAt ? timeAgo(t.createdAt) : '';
                return (
                  <View key={t._id} style={{ backgroundColor: C.card, borderRadius: 24, marginBottom: 16, borderWidth: 1, borderColor: C.border, padding: 20 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ color: C.text, fontSize: 18, fontWeight: '900', marginBottom: 4 }}>{t.name}</Text>
                        {created ? <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Created {created}</Text> : null}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => openEditTemplate(t)}
                          style={{ padding: 8, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border }}
                        >
                          <Edit2 color={C.subtext} size={14} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => deleteTemplate(t._id, t.name)}
                          disabled={deletingId === t._id}
                          style={{ padding: 8, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border }}
                        >
                          {deletingId === t._id
                            ? <ActivityIndicator size={14} color={C.primary} />
                            : <Trash2 color={C.primary} size={14} />
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ backgroundColor: C.primaryBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)' }}>
                        <Text style={{ color: C.primary, fontSize: 12, fontWeight: '900' }}>{kcal} kcal</Text>
                      </View>
                      <View style={{ backgroundColor: C.bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: C.border }}>
                        <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '900' }}>{t.meals?.length || 0} meals</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity
                onPress={() => router.push('/nutrition/create-template')}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', marginTop: 8 }}
              >
                <Plus color={C.muted} size={18} style={{ marginRight: 8 }} />
                <Text style={{ color: C.muted, fontWeight: '900', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>Create Another Template</Text>
              </TouchableOpacity>
            </>
          )
        ) : (
          historyLogs.length === 0 ? (
             <View style={{ alignItems: 'center', marginTop: 48, backgroundColor: C.card, padding: 32, borderRadius: 24, borderWidth: 1, borderColor: C.border }}>
               <Clock color={C.border} size={48} style={{ marginBottom: 16 }} />
               <Text style={{ color: C.text, fontSize: 18, fontWeight: '900', marginBottom: 8 }}>No history yet.</Text>
               <Text style={{ color: C.muted, textAlign: 'center', fontSize: 14, fontWeight: '600', lineHeight: 20 }}>Log your meals daily to build a history of your nutrition.</Text>
             </View>
          ) : (
            historyLogs.map(h => (
              <View key={h._id || h.date} style={{ backgroundColor: C.card, borderRadius: 24, marginBottom: 16, borderWidth: 1, borderColor: C.border, padding: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 18, fontWeight: '900', marginBottom: 4 }}>{h.date}</Text>
                    <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>{h.meals?.length || 0} meals logged</Text>
                  </View>
                  <View style={{ backgroundColor: C.primaryBg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)' }}>
                    <Text style={{ color: C.primary, fontSize: 14, fontWeight: '900' }}>{Math.round(h.dailyTotals?.calories || 0)} kcal</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                   <Text style={{ color: C.subtext, fontSize: 13, fontWeight: '900', marginRight: 16 }}>P: {Math.round(h.dailyTotals?.protein || 0)}g</Text>
                   <Text style={{ color: C.subtext, fontSize: 13, fontWeight: '900', marginRight: 16 }}>C: {Math.round(h.dailyTotals?.carbs || 0)}g</Text>
                   <Text style={{ color: C.subtext, fontSize: 13, fontWeight: '900' }}>F: {Math.round(h.dailyTotals?.fats || 0)}g</Text>
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>

      {/* ===== EDIT TEMPLATE MODAL ===== */}
      <Modal visible={!!editTemplate} transparent animationType="slide" statusBarTranslucent>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderTopWidth: 1, borderTopColor: C.border, maxHeight: '85%' }}>
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ color: C.text, fontSize: 20, fontWeight: '900' }}>Edit Template</Text>
              <TouchableOpacity onPress={closeEditTemplate} style={{ padding: 8, backgroundColor: C.bg, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
                <X color={C.subtext} size={18} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {/* Name Field */}
              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>Template Name</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                style={{
                  backgroundColor: C.bg, color: C.text, fontSize: 18, fontWeight: '900',
                  padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.border,
                  marginBottom: 24,
                }}
                placeholderTextColor={C.muted}
                placeholder="Template name..."
              />

              {/* Meals List */}
              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
                Meals ({editMeals.length})
              </Text>
              {editMeals.length === 0 ? (
                <View style={{ backgroundColor: C.bg, borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 16 }}>
                  <Text style={{ color: C.muted, fontSize: 14, fontWeight: '600' }}>All meals removed. Save to create an empty template.</Text>
                </View>
              ) : (
                editMeals.map((m: any, idx: number) => {
                  const food = typeof m.foodItemId === 'object' ? m.foodItemId : null;
                  const foodName = food?.name || 'Unknown Food';
                  const mealType = m.mealType || 'snack';
                  const Icon = MEAL_ICONS[mealType] || Apple;
                  return (
                    <View key={idx} style={{ backgroundColor: C.bg, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.primaryBg, justifyContent: 'center', alignItems: 'center', marginRight: 16, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)' }}>
                        <Icon color={C.primary} size={18} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 2 }}>{foodName}</Text>
                        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>{mealType} · {m.customAmount}g</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => removeEditMeal(idx)}
                        style={{ padding: 8, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border }}
                      >
                        <Trash2 color={C.primary} size={16} />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}

              {/* Save Button */}
              <TouchableOpacity
                onPress={saveEditTemplate}
                disabled={isSavingTemplate}
                style={{
                  marginTop: 24, paddingVertical: 16, borderRadius: 20, alignItems: 'center',
                  backgroundColor: isSavingTemplate ? C.card : C.text,
                  borderWidth: 1, borderColor: isSavingTemplate ? C.border : C.text,
                  flexDirection: 'row', justifyContent: 'center',
                }}
              >
                {isSavingTemplate
                  ? <ActivityIndicator color={C.primary} />
                  : <>
                      <Check color={C.bg} size={20} style={{ marginRight: 8 }} />
                      <Text style={{ color: C.bg, fontWeight: '900', fontSize: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Save Changes</Text>
                    </>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
