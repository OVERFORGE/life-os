import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { ArrowLeft, Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchWithAuth } from '../../../utils/api';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

export default function CreateGymScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [name, setName] = useState('');
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedCat, setExpandedCat] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Custom Equipment
  const [customEquipment, setCustomEquipment] = useState<{name: string, category: string}[]>([]);
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomCategory, setNewCustomCategory] = useState('Chest');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth('/gym/inventory');
        const data = await res.json();
        setCategories(data.categories || {});
        
        if (id) {
          const userGym = data.userGyms?.find((g: any) => g._id === id);
          if (userGym) {
            setName(userGym.name);
            setSelected(new Set(userGym.selectedPreSeeded || []));
            if (userGym.customEquipment) {
              setCustomEquipment(userGym.customEquipment);
            }
          }
        }
      } catch (e) {} finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const toggleSelect = (item: string) => {
    const next = new Set(selected);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    setSelected(next);
  };

  const toggleCategory = (cat: string) => {
    const next = new Set(expandedCat);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setExpandedCat(next);
  };

  const selectAllInCategory = (cat: string) => {
    const items = categories[cat] || [];
    const next = new Set(selected);
    const allSelected = items.every(i => next.has(i));
    if (allSelected) {
      items.forEach(i => next.delete(i));
    } else {
      items.forEach(i => next.add(i));
    }
    setSelected(next);
  };

  const handleCreate = async () => {
    if (!name.trim()) return Alert.alert("Required", "Gym name is required");
    setSaving(true);
    try {
      const url = id ? `/gym/inventory/${id}` : '/gym/inventory';
      const method = id ? 'PATCH' : 'POST';
      const payload = { 
        name: name.trim(), 
        selectedPreSeeded: Array.from(selected),
        customEquipment 
      };
      const res = await fetchWithAuth(url, {
        method,
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        router.replace('/(dashboard)/gym');
      } else {
        const err = await res.json();
        Alert.alert("Error", err.error || "Failed to save gym");
      }
    } catch (e) {
      Alert.alert("Error", "Network request failed");
    } finally {
      setSaving(false);
    }
  };

  const getCategoryCount = (cat: string) => {
    return (categories[cat] || []).filter(i => selected.has(i)).length;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border }}>
          <ArrowLeft size={16} color={C.subtext} />
          <Text style={{ color: C.subtext, marginLeft: 6, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleCreate} disabled={saving} style={{ backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
          {saving ? <ActivityIndicator size="small" color="#FFFDFC" /> : <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: C.text, marginBottom: 24 }}>{id ? 'Edit' : 'Create'} Gym Profile</Text>

        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>Gym Name</Text>
          <TextInput
            placeholder="e.g. Planet Fitness, Garage Gym"
            placeholderTextColor={C.muted}
            value={name}
            onChangeText={setName}
            style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontWeight: '700', fontSize: 16 }}
          />
        </View>

        {/* CUSTOM EQUIPMENT ADDER */}
        <View style={{ marginBottom: 32, paddingTop: 24, borderTopWidth: 1, borderTopColor: C.border }}>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginLeft: 4 }}>Add Custom Equipment</Text>
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 20 }}>
            <TextInput
              placeholder="e.g. Special GHD Machine"
              placeholderTextColor={C.muted}
              value={newCustomName}
              onChangeText={setNewCustomName}
              style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, height: 48, color: C.text, fontWeight: '600', fontSize: 14, marginBottom: 16 }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600', marginRight: 12 }}>Muscle Group:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {['Chest', 'Back', 'Legs', 'Arms', 'Shoulders', 'Core', 'Cardio'].map(cat => (
                  <TouchableOpacity 
                    key={cat}
                    onPress={() => setNewCustomCategory(cat)}
                    style={{
                      marginRight: 8,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 20,
                      borderWidth: 1,
                      backgroundColor: newCustomCategory === cat ? C.primaryBg : 'transparent',
                      borderColor: newCustomCategory === cat ? 'rgba(232,65,74,0.3)' : C.border
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '800', color: newCustomCategory === cat ? C.primary : C.subtext }}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <TouchableOpacity 
              onPress={() => {
                if(newCustomName.trim()) {
                  setCustomEquipment([...customEquipment, { name: newCustomName.trim(), category: newCustomCategory }]);
                  setNewCustomName('');
                }
              }}
              style={{ backgroundColor: C.bg, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}
            >
              <Text style={{ color: C.primary, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>+ Add Equipment</Text>
            </TouchableOpacity>
          </View>
          
          {customEquipment.length > 0 && (
            <View style={{ marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {customEquipment.map((eq, i) => (
                <View key={i} style={{ backgroundColor: C.primaryBg, borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: C.primary, fontSize: 12, fontWeight: '800' }}>{eq.name} <Text style={{ color: C.subtext, fontWeight: '600' }}>({eq.category})</Text></Text>
                  <TouchableOpacity onPress={() => setCustomEquipment(customEquipment.filter((_, idx) => idx !== i))} style={{ marginLeft: 8, padding: 4 }}>
                    <Text style={{ color: '#ef4444', fontWeight: '900', fontSize: 10 }}>X</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <Text style={{ color: C.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginLeft: 4 }}>Available Equipment ({selected.size} selected)</Text>
        
        {loading ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 24 }} />
        ) : (
          Object.entries(categories).map(([cat, items]) => {
            const isExpanded = expandedCat.has(cat);
            const count = getCategoryCount(cat);
            return (
              <View key={cat} style={{ marginBottom: 12 }}>
                {/* Category Header */}
                <TouchableOpacity
                  onPress={() => toggleCategory(cat)}
                  style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: C.text, fontWeight: '900', fontSize: 16 }}>{cat}</Text>
                    {count > 0 && (
                      <View style={{ backgroundColor: C.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 12 }}>
                        <Text style={{ color: C.primary, fontSize: 11, fontWeight: '900' }}>{count}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity
                      onPress={() => selectAllInCategory(cat)}
                      style={{ marginRight: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.bg }}
                    >
                      <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {items.every(i => selected.has(i)) ? 'None' : 'All'}
                      </Text>
                    </TouchableOpacity>
                    {isExpanded ? (
                      <ChevronUp size={18} color={C.subtext} />
                    ) : (
                      <ChevronDown size={18} color={C.subtext} />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Equipment Items */}
                {isExpanded && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, paddingHorizontal: 4, gap: 8 }}>
                    {items.map((item, idx) => {
                      const isSel = selected.has(item);
                      return (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => toggleSelect(item)}
                          style={{
                            width: '48%',
                            borderWidth: 1,
                            borderRadius: 12,
                            padding: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: isSel ? C.primaryBg : C.card,
                            borderColor: isSel ? 'rgba(232,65,74,0.3)' : C.border
                          }}
                        >
                          <Text style={{ fontSize: 13, flex: 1, color: isSel ? C.primary : C.subtext, fontWeight: isSel ? '800' : '600' }} numberOfLines={1}>
                            {item}
                          </Text>
                          {isSel && <Check size={14} color={C.primary} style={{ marginLeft: 8 }} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
