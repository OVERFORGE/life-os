import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { ArrowLeft, Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchWithAuth } from '../../../utils/api';

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
    <View className="flex-1 bg-[#0f1115] pt-2">
      <View className="flex-row items-center justify-between px-6 mb-6">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
          <ArrowLeft size={20} color="#9ca3af" />
          <Text className="text-gray-400 ml-2 font-medium">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleCreate} disabled={saving} className="bg-amber-500 px-4 py-1.5 rounded-full">
          {saving ? <ActivityIndicator size="small" color="#000" /> : <Text className="text-black font-bold text-sm">Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView className="px-6 flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <Text className="text-2xl font-bold text-gray-100 mb-6">{id ? 'Edit' : 'Create'} Gym Profile</Text>

        <View className="mb-6">
          <Text className="text-gray-400 text-xs uppercase tracking-wider mb-2 ml-1">Gym Name</Text>
          <TextInput
            placeholder="e.g. Planet Fitness, Garage Gym"
            placeholderTextColor="#4b5563"
            value={name}
            onChangeText={setName}
            className="bg-[#161922] border border-[#232632] rounded-xl px-4 h-14 text-white font-medium text-base"
          />
        </View>

        {/* CUSTOM EQUIPMENT ADDER */}
        <View className="mb-8 border-t border-[#232632] pt-6">
          <Text className="text-gray-400 text-xs uppercase tracking-wider mb-2 ml-1">Add Custom Equipment</Text>
          <View className="bg-[#161922] border border-[#232632] rounded-xl p-4">
            <TextInput
              placeholder="e.g. Special GHD Machine"
              placeholderTextColor="#4b5563"
              value={newCustomName}
              onChangeText={setNewCustomName}
              className="bg-[#0f1115] border border-[#232632] rounded-lg px-4 h-12 text-white font-medium text-sm mb-3"
            />
            <View className="flex-row items-center mb-4">
              <Text className="text-gray-400 text-xs mr-3">Muscle Group:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {['Chest', 'Back', 'Legs', 'Arms', 'Shoulders', 'Core', 'Cardio'].map(cat => (
                  <TouchableOpacity 
                    key={cat}
                    onPress={() => setNewCustomCategory(cat)}
                    className={`mr-2 px-3 py-1 rounded-full border ${newCustomCategory === cat ? 'bg-amber-500 border-amber-500' : 'bg-transparent border-[#232632]'}`}
                  >
                    <Text className={`text-xs font-bold ${newCustomCategory === cat ? 'text-black' : 'text-gray-500'}`}>{cat}</Text>
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
              className="bg-gray-800 rounded-lg h-10 items-center justify-center border border-[#232632]"
            >
              <Text className="text-amber-500 text-xs font-bold uppercase">+ Add Equipment</Text>
            </TouchableOpacity>
          </View>
          
          {customEquipment.length > 0 && (
            <View className="mt-4 flex-row flex-wrap">
              {customEquipment.map((eq, i) => (
                <View key={i} className="bg-amber-500/20 border border-amber-500/30 rounded-xl px-3 py-2 mr-2 mb-2 flex-row items-center">
                  <Text className="text-amber-400 text-xs font-bold">{eq.name} <Text className="text-gray-500 font-normal">({eq.category})</Text></Text>
                  <TouchableOpacity onPress={() => setCustomEquipment(customEquipment.filter((_, idx) => idx !== i))} className="ml-2 bg-black/20 p-1 rounded-full">
                    <Text className="text-red-400 font-black text-[10px]">X</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <Text className="text-gray-400 text-xs uppercase tracking-wider mb-3 ml-1">Available Equipment ({selected.size} selected)</Text>
        
        {loading ? (
          <ActivityIndicator color="#fcd34d" />
        ) : (
          Object.entries(categories).map(([cat, items]) => {
            const isExpanded = expandedCat.has(cat);
            const count = getCategoryCount(cat);
            return (
              <View key={cat} className="mb-3">
                {/* Category Header */}
                <TouchableOpacity
                  onPress={() => toggleCategory(cat)}
                  className="bg-[#161922] border border-[#232632] rounded-xl p-4 flex-row items-center justify-between"
                >
                  <View className="flex-row items-center">
                    <Text className="text-gray-100 font-bold text-base">{cat}</Text>
                    {count > 0 && (
                      <View className="bg-amber-500/20 px-2 py-0.5 rounded-full ml-3">
                        <Text className="text-amber-400 text-xs font-bold">{count}</Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-row items-center">
                    <TouchableOpacity
                      onPress={() => selectAllInCategory(cat)}
                      className="mr-3 px-2 py-1 rounded-md bg-white/5"
                    >
                      <Text className="text-gray-500 text-[10px] font-bold uppercase">
                        {items.every(i => selected.has(i)) ? 'None' : 'All'}
                      </Text>
                    </TouchableOpacity>
                    {isExpanded ? (
                      <ChevronUp size={18} color="#4b5563" />
                    ) : (
                      <ChevronDown size={18} color="#4b5563" />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Equipment Items */}
                {isExpanded && (
                  <View className="flex-row flex-wrap mt-2 pl-2">
                    {items.map((item, idx) => {
                      const isSel = selected.has(item);
                      return (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => toggleSelect(item)}
                          className={`w-[48%] border rounded-xl p-3 mb-2 mr-[2%] flex-row items-center justify-between ${
                            isSel ? 'bg-amber-500/20 border-amber-500/50' : 'bg-[#1b1f2a] border-[#232632]'
                          }`}
                        >
                          <Text className={`text-sm flex-1 ${isSel ? 'text-amber-400 font-semibold' : 'text-gray-400'}`}>
                            {item}
                          </Text>
                          {isSel && <Check size={14} color="#fbbf24" />}
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
    </View>
  );
}
