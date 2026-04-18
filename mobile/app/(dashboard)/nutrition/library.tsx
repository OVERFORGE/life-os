import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, TextInput } from 'react-native';
import { BlurView } from 'expo-blur';
import { ArrowLeft, Plus, Dna, Layers, Leaf, Camera, Edit2, Trash2, X, Check, Coffee, Sun, Moon, Apple, Clock } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '../../../components/ui/Toast';
import { fetchWithAuth } from '../../../utils/api';

const COLORS = {
  bg: '#0f1115', card: '#161922', border: '#232632', border2: '#374151',
  text: '#f3f4f6', subtext: '#9ca3af', muted: '#6b7280',
  emerald: '#10b981', emeraldBg: 'rgba(16,185,129,0.1)',
  red: '#ef4444',
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
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Header */}
      <BlurView
        intensity={40}
        tint="dark"
        style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: 64, paddingBottom: 16, paddingHorizontal: 24,
          borderBottomWidth: 1, borderBottomColor: COLORS.border,
          zIndex: 10, width: '100%', backgroundColor: 'rgba(15, 17, 21, 0.8)',
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card }}>
          <ArrowLeft color={COLORS.text} size={20} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.text, letterSpacing: 0.3 }}>Food Library</Text>
        <TouchableOpacity onPress={() => router.push('/nutrition/scan')} style={{ padding: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.emerald + '50', backgroundColor: COLORS.emeraldBg }}>
          <Plus color={COLORS.emerald} size={20} />
        </TouchableOpacity>
      </BlurView>

      {/* Tab Toggle */}
      <View style={{ flexDirection: 'row', backgroundColor: COLORS.card, marginHorizontal: 24, marginVertical: 20, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: COLORS.border }}>
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
            style={{ flex: 1, flexDirection: 'row', paddingVertical: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: activeTab === key ? COLORS.border : 'transparent' }}
          >
            <Icon color={activeTab === key ? COLORS.emerald : COLORS.muted} size={15} />
            <Text style={{ fontWeight: '600', fontSize: 13, color: activeTab === key ? COLORS.text : COLORS.muted, marginLeft: 6 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <ActivityIndicator color={COLORS.emerald} size="large" />
            <Text style={{ color: COLORS.muted, marginTop: 12, fontSize: 13 }}>Loading...</Text>
          </View>
        ) : activeTab === 'foods' ? (
          foods.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 48, backgroundColor: COLORS.card, padding: 32, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border }}>
              <Leaf color={COLORS.border2} size={48} style={{ marginBottom: 16 }} />
              <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>No verified foods yet.</Text>
              <Text style={{ color: COLORS.muted, textAlign: 'center', fontSize: 14, lineHeight: 20 }}>Scan items with the AI camera to build your personalized library.</Text>
              <TouchableOpacity onPress={() => router.push('/nutrition/scan')} style={{ marginTop: 24, backgroundColor: COLORS.text, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 9999, flexDirection: 'row', alignItems: 'center' }}>
                <Camera color={COLORS.bg} size={16} style={{ marginRight: 8 }} />
                <Text style={{ color: COLORS.bg, fontWeight: '700', fontSize: 14 }}>Scan a Meal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            foods.map(f => (
              <View key={f._id} style={{ flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 20, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border }}>
                {f.imageUrl && <Image source={{ uri: f.imageUrl }} style={{ width: 100, backgroundColor: COLORS.border }} resizeMode="cover" />}
                <View style={{ flex: 1, padding: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 }}>{f.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/nutrition/scan', params: { editFood: JSON.stringify(f) } })}
                        style={{ padding: 6, backgroundColor: COLORS.border, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border2 }}
                      >
                        <Edit2 color={COLORS.subtext} size={13} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => deleteFood(f._id, f.name)}
                        disabled={deletingId === f._id}
                        style={{ padding: 6, backgroundColor: COLORS.bg, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border2 }}
                      >
                        {deletingId === f._id
                          ? <ActivityIndicator size={13} color={COLORS.red} />
                          : <Trash2 color={COLORS.red} size={13} />
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
                    {[
                      { v: `${f.macros?.calories} kcal`, hi: true },
                      { v: `${f.macros?.protein}g P` },
                      { v: `${f.macros?.carbs}g C` },
                      { v: `${f.macros?.fats}g F` },
                    ].map(({ v, hi }) => (
                      <View key={v} style={{ backgroundColor: hi ? COLORS.border : COLORS.card, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border2, marginRight: 6, marginBottom: 4 }}>
                        <Text style={{ color: hi ? COLORS.text : COLORS.subtext, fontSize: 10, fontWeight: '700' }}>{v}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={{ color: COLORS.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Base: {f.baseWeight}g</Text>
                </View>
              </View>
            ))
          )
        ) : (
          templates.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 48, backgroundColor: COLORS.card, padding: 32, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border }}>
              <Layers color={COLORS.border2} size={48} style={{ marginBottom: 16 }} />
              <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>No day templates yet.</Text>
              <Text style={{ color: COLORS.muted, textAlign: 'center', fontSize: 14, lineHeight: 20 }}>Combine library foods into one-tap daily layouts.</Text>
              <TouchableOpacity onPress={() => router.push('/nutrition/create-template')} style={{ marginTop: 24, backgroundColor: COLORS.text, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 9999 }}>
                <Text style={{ color: COLORS.bg, fontWeight: '700', fontSize: 14 }}>Create Template</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {templates.map(t => {
                const kcal = templateCalories(t);
                const created = t.createdAt ? timeAgo(t.createdAt) : '';
                return (
                  <View key={t._id} style={{ backgroundColor: COLORS.card, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, padding: 18 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 2 }}>{t.name}</Text>
                        {created ? <Text style={{ color: COLORS.muted, fontSize: 10, fontWeight: '500' }}>Created {created}</Text> : null}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => openEditTemplate(t)}
                          style={{ padding: 7, backgroundColor: COLORS.border, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border2 }}
                        >
                          <Edit2 color={COLORS.subtext} size={13} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => deleteTemplate(t._id, t.name)}
                          disabled={deletingId === t._id}
                          style={{ padding: 7, backgroundColor: COLORS.bg, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border2 }}
                        >
                          {deletingId === t._id
                            ? <ActivityIndicator size={13} color={COLORS.red} />
                            : <Trash2 color={COLORS.red} size={13} />
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ backgroundColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border2 }}>
                        <Text style={{ color: COLORS.emerald, fontSize: 11, fontWeight: '700' }}>{kcal} kcal</Text>
                      </View>
                      <View style={{ backgroundColor: COLORS.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border2 }}>
                        <Text style={{ color: COLORS.subtext, fontSize: 11, fontWeight: '600' }}>{t.meals?.length || 0} meals</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity
                onPress={() => router.push('/nutrition/create-template')}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border2, borderStyle: 'dashed', marginTop: 4 }}
              >
                <Plus color={COLORS.muted} size={16} style={{ marginRight: 8 }} />
                <Text style={{ color: COLORS.muted, fontWeight: '700', fontSize: 14 }}>Create Another Template</Text>
              </TouchableOpacity>
            </>
          )
        ) : (
          historyLogs.length === 0 ? (
             <View style={{ alignItems: 'center', marginTop: 48, backgroundColor: COLORS.card, padding: 32, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border }}>
               <Clock color={COLORS.border2} size={48} style={{ marginBottom: 16 }} />
               <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>No history yet.</Text>
               <Text style={{ color: COLORS.muted, textAlign: 'center', fontSize: 14, lineHeight: 20 }}>Log your meals daily to build a history of your nutrition.</Text>
             </View>
          ) : (
            historyLogs.map(h => (
              <View key={h._id || h.date} style={{ backgroundColor: COLORS.card, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, padding: 18 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 2 }}>{h.date}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '500' }}>{h.meals?.length || 0} meals logged</Text>
                  </View>
                  <View style={{ backgroundColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border2 }}>
                    <Text style={{ color: COLORS.emerald, fontSize: 13, fontWeight: '700' }}>{Math.round(h.dailyTotals?.calories || 0)} kcal</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                   <Text style={{ color: COLORS.subtext, fontSize: 12, marginRight: 12 }}>P: {Math.round(h.dailyTotals?.protein || 0)}g</Text>
                   <Text style={{ color: COLORS.subtext, fontSize: 12, marginRight: 12 }}>C: {Math.round(h.dailyTotals?.carbs || 0)}g</Text>
                   <Text style={{ color: COLORS.subtext, fontSize: 12 }}>F: {Math.round(h.dailyTotals?.fats || 0)}g</Text>
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>

      {/* ===== EDIT TEMPLATE MODAL ===== */}
      <Modal visible={!!editTemplate} transparent animationType="slide" statusBarTranslucent>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderTopColor: COLORS.border, maxHeight: '85%' }}>
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '800' }}>Edit Template</Text>
              <TouchableOpacity onPress={closeEditTemplate} style={{ padding: 6, backgroundColor: COLORS.border, borderRadius: 12 }}>
                <X color={COLORS.subtext} size={16} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {/* Name Field */}
              <Text style={{ color: COLORS.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>Template Name</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                style={{
                  backgroundColor: COLORS.bg, color: COLORS.text, fontSize: 16, fontWeight: '700',
                  padding: 16, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border2,
                  marginBottom: 24,
                }}
                placeholderTextColor={COLORS.muted}
                placeholder="Template name..."
              />

              {/* Meals List */}
              <Text style={{ color: COLORS.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>
                Meals ({editMeals.length})
              </Text>
              {editMeals.length === 0 ? (
                <View style={{ backgroundColor: COLORS.bg, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }}>
                  <Text style={{ color: COLORS.muted, fontSize: 13 }}>All meals removed. Save to create an empty template.</Text>
                </View>
              ) : (
                editMeals.map((m: any, idx: number) => {
                  const food = typeof m.foodItemId === 'object' ? m.foodItemId : null;
                  const foodName = food?.name || 'Unknown Food';
                  const mealType = m.mealType || 'snack';
                  const Icon = MEAL_ICONS[mealType] || Apple;
                  return (
                    <View key={idx} style={{ backgroundColor: COLORS.bg, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.emeraldBg, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: COLORS.emerald + '30' }}>
                        <Icon color={COLORS.emerald} size={14} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>{foodName}</Text>
                        <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>{mealType} · {m.customAmount}g</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => removeEditMeal(idx)}
                        style={{ padding: 7, backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border2 }}
                      >
                        <Trash2 color={COLORS.red} size={13} />
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
                  marginTop: 20, paddingVertical: 16, borderRadius: 16, alignItems: 'center',
                  backgroundColor: isSavingTemplate ? COLORS.border : COLORS.text,
                  flexDirection: 'row', justifyContent: 'center',
                }}
              >
                {isSavingTemplate
                  ? <ActivityIndicator color={COLORS.bg} />
                  : <>
                      <Check color={COLORS.bg} size={16} style={{ marginRight: 8 }} />
                      <Text style={{ color: COLORS.bg, fontWeight: '800', fontSize: 15 }}>Save Changes</Text>
                    </>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
