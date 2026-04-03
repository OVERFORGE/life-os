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
      const res = await fetchWithAuth(url, {
        method,
        body: JSON.stringify({ name: name.trim(), selectedPreSeeded: Array.from(selected) })
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
