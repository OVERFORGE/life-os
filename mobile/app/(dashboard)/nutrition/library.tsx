import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { ArrowLeft, Plus, Dna, Layers, Leaf, Camera, Edit2, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '../../../components/ui/Toast';
import { fetchWithAuth } from '../../../utils/api';

// Compute total calories for a template from populated meals
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'foods' | 'templates'>('foods');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const [foodsRes, templatesRes] = await Promise.all([
        fetchWithAuth('/nutrition/library'),
        fetchWithAuth('/nutrition/templates'),
      ]);
      if (foodsRes.ok) { const d = await foodsRes.json(); setFoods(d.foods || []); }
      if (templatesRes.ok) { const d = await templatesRes.json(); setTemplates(d.templates || []); }
    } catch (e) {
      toast.error('Load Failed', 'Could not load library data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadLibrary(); }, [loadLibrary]));

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
    <View style={{ flex: 1, backgroundColor: '#0f1115' }}>
      {/* Header */}
      <BlurView
        intensity={40}
        tint="dark"
        style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: 64, paddingBottom: 16, paddingHorizontal: 24,
          borderBottomWidth: 1, borderBottomColor: '#232632',
          zIndex: 10, width: '100%', backgroundColor: 'rgba(15, 17, 21, 0.8)'
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, borderRadius: 20, borderWidth: 1, borderColor: '#232632', backgroundColor: '#161922' }}>
          <ArrowLeft color="#e5e7eb" size={20} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#f3f4f6', letterSpacing: 0.3 }}>Food Library</Text>
        <TouchableOpacity onPress={() => router.push('/nutrition/scan')} style={{ padding: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.1)' }}>
          <Plus color="#10b981" size={20} />
        </TouchableOpacity>
      </BlurView>

      {/* Tab Toggle */}
      <View style={{ flexDirection: 'row', backgroundColor: '#161922', marginHorizontal: 24, marginVertical: 20, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: '#232632' }}>
        {([['foods', 'Custom Foods', Dna], ['templates', 'Day Templates', Layers]] as const).map(([key, label, Icon]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setActiveTab(key)}
            style={{ flex: 1, flexDirection: 'row', paddingVertical: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: activeTab === key ? '#232632' : 'transparent' }}
          >
            <Icon color={activeTab === key ? '#10b981' : '#6b7280'} size={15} />
            <Text style={{ fontWeight: '600', fontSize: 13, color: activeTab === key ? '#f3f4f6' : '#6b7280', marginLeft: 6 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <ActivityIndicator color="#10b981" size="large" />
            <Text style={{ color: '#6b7280', marginTop: 12, fontSize: 13 }}>Loading...</Text>
          </View>
        ) : activeTab === 'foods' ? (
          foods.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 48, backgroundColor: '#161922', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: '#232632' }}>
              <Leaf color="#374151" size={48} style={{ marginBottom: 16 }} />
              <Text style={{ color: '#e5e7eb', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>No verified foods yet.</Text>
              <Text style={{ color: '#6b7280', textAlign: 'center', fontSize: 14, lineHeight: 20 }}>Scan items with the AI camera to build your personalized library.</Text>
              <TouchableOpacity onPress={() => router.push('/nutrition/scan')} style={{ marginTop: 24, backgroundColor: '#f3f4f6', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 9999, flexDirection: 'row', alignItems: 'center' }}>
                <Camera color="#000" size={16} style={{ marginRight: 8 }} />
                <Text style={{ color: '#0f1115', fontWeight: '700', fontSize: 14 }}>Scan a Meal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            foods.map(f => (
              <View key={f._id} style={{ flexDirection: 'row', backgroundColor: '#161922', borderRadius: 20, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#232632' }}>
                {f.imageUrl && <Image source={{ uri: f.imageUrl }} style={{ width: 100, backgroundColor: '#232632' }} resizeMode="cover" />}
                <View style={{ flex: 1, padding: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <Text style={{ color: '#f3f4f6', fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 }}>{f.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/nutrition/scan', params: { editFood: JSON.stringify(f) } })}
                        style={{ padding: 6, backgroundColor: '#232632', borderRadius: 8, borderWidth: 1, borderColor: '#374151' }}
                      >
                        <Edit2 color="#9ca3af" size={13} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => deleteFood(f._id, f.name)}
                        disabled={deletingId === f._id}
                        style={{ padding: 6, backgroundColor: '#0f1115', borderRadius: 8, borderWidth: 1, borderColor: '#374151' }}
                      >
                        {deletingId === f._id
                          ? <ActivityIndicator size={13} color="#ef4444" />
                          : <Trash2 color="#ef4444" size={13} />
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
                      <View key={v} style={{ backgroundColor: hi ? '#232632' : '#161922', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#374151', marginRight: 6, marginBottom: 4 }}>
                        <Text style={{ color: hi ? '#f3f4f6' : '#9ca3af', fontSize: 10, fontWeight: '700' }}>{v}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={{ color: '#4b5563', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Base: {f.baseWeight}g</Text>
                </View>
              </View>
            ))
          )
        ) : (
          templates.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 48, backgroundColor: '#161922', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: '#232632' }}>
              <Layers color="#374151" size={48} style={{ marginBottom: 16 }} />
              <Text style={{ color: '#e5e7eb', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>No day templates yet.</Text>
              <Text style={{ color: '#6b7280', textAlign: 'center', fontSize: 14, lineHeight: 20 }}>Combine library foods into one-tap daily layouts.</Text>
              <TouchableOpacity onPress={() => router.push('/nutrition/create-template')} style={{ marginTop: 24, backgroundColor: '#f3f4f6', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 9999 }}>
                <Text style={{ color: '#0f1115', fontWeight: '700', fontSize: 14 }}>Create Template</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {templates.map(t => {
                const kcal = templateCalories(t);
                const created = t.createdAt ? timeAgo(t.createdAt) : '';
                return (
                  <View key={t._id} style={{ backgroundColor: '#161922', borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: '#232632', padding: 18 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={{ color: '#f3f4f6', fontSize: 15, fontWeight: '700', marginBottom: 2 }}>{t.name}</Text>
                        {created ? <Text style={{ color: '#4b5563', fontSize: 10, fontWeight: '500' }}>Created {created}</Text> : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => deleteTemplate(t._id, t.name)}
                        disabled={deletingId === t._id}
                        style={{ padding: 7, backgroundColor: '#0f1115', borderRadius: 8, borderWidth: 1, borderColor: '#374151' }}
                      >
                        {deletingId === t._id
                          ? <ActivityIndicator size={13} color="#ef4444" />
                          : <Trash2 color="#ef4444" size={13} />
                        }
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ backgroundColor: '#232632', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#374151' }}>
                        <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '700' }}>{kcal} kcal</Text>
                      </View>
                      <View style={{ backgroundColor: '#0f1115', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#374151' }}>
                        <Text style={{ color: '#9ca3af', fontSize: 11, fontWeight: '600' }}>{t.meals?.length || 0} meals</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity
                onPress={() => router.push('/nutrition/create-template')}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#161922', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#374151', borderStyle: 'dashed', marginTop: 4 }}
              >
                <Plus color="#6b7280" size={16} style={{ marginRight: 8 }} />
                <Text style={{ color: '#6b7280', fontWeight: '700', fontSize: 14 }}>Create Another Template</Text>
              </TouchableOpacity>
            </>
          )
        )}
      </ScrollView>
    </View>
  );
}
