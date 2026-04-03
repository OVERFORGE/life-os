import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Modal, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Trash2, Plus, X, Search, Check } from 'lucide-react-native';
import { fetchWithAuth } from '../../../utils/api';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';

export default function CreateRoutineScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [gyms, setGyms] = useState<any[]>([]);
  const [selectedGym, setSelectedGym] = useState<string | null>(null);
  const [routineName, setRoutineName] = useState('');
  
  const [splitDays, setSplitDays] = useState([{ dayName: '', exercises: [] as any[] }]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [currentDayIdx, setCurrentDayIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [invRes, routRes] = await Promise.all([
          fetchWithAuth('/gym/inventory'),
          id ? fetchWithAuth('/gym/routines') : Promise.resolve(null)
        ]);

        const invData = await invRes.json();
        setGyms(invData.userGyms || []);
        
        if (id && routRes) {
          const routines = await routRes.json();
          const routine = routines.find((r: any) => r._id === id);
          if (routine) {
            setRoutineName(routine.routineName);
            setSelectedGym(routine.gymId);
            setSplitDays(routine.splitDays || [{ dayName: '', exercises: [] }]);
          }
        } else if (invData.userGyms?.length > 0) {
          setSelectedGym(invData.userGyms[0]._id);
        }
      } catch (e) {} finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleSave = async () => {
    if (!routineName || !selectedGym) return Alert.alert("Required", "Please select a gym and name your routine.");
    
    // basic validation
    const validDays = splitDays.filter(d => d.dayName.trim().length > 0);
    if(validDays.length === 0) return Alert.alert("Required", "Add at least one named split day.");

    setSaving(true);
    try {
      const url = id ? `/gym/routines/${id}` : '/gym/routines';
      const method = id ? 'PATCH' : 'POST';
      const res = await fetchWithAuth(url, {
        method,
        body: JSON.stringify({
          gymId: selectedGym,
          routineName,
          splitDays: validDays
        })
      });
      if (res.ok) {
        router.replace('/(dashboard)/gym');
      } else {
        const err = await res.json();
        Alert.alert("Error", err.error || "Failed to save routine");
      }
    } catch (e) {
      Alert.alert("Error", "Network request failed");
    } finally {
      setSaving(false);
    }
  };

  const addDay = () => setSplitDays([...splitDays, { dayName: '', exercises: [] }]);
  
  const removeDay = (idx: number) => {
    const updated = [...splitDays];
    updated.splice(idx, 1);
    setSplitDays(updated);
  };

  const updateDayName = (idx: number, name: string) => {
    const updated = [...splitDays];
    updated[idx].dayName = name;
    setSplitDays(updated);
  };

  const openExerciseModal = (idx: number) => {
    setCurrentDayIdx(idx);
    setModalVisible(true);
  };

  const addExercise = (equipmentName: string) => {
    if (currentDayIdx === null) return;
    const updated = [...splitDays];
    updated[currentDayIdx].exercises.push({
      equipmentName,
      targetSets: 3,
      targetReps: 10,
      restSeconds: 90
    });
    setSplitDays(updated);
    setModalVisible(false);
    setSearchQuery('');
  };

  const removeExercise = (dayIdx: number, exIdx: number) => {
    const updated = [...splitDays];
    updated[dayIdx].exercises.splice(exIdx, 1);
    setSplitDays(updated);
  };

  const updateExercise = (dayIdx: number, exIdx: number, field: string, value: any) => {
    const updated = [...splitDays];
    updated[dayIdx].exercises[exIdx][field] = value;
    setSplitDays(updated);
  };

  const currentGymEquipment = gyms.find(g => g._id === selectedGym)?.selectedPreSeeded || [];
  const filteredEquipment = currentGymEquipment.filter((e: string) => 
    e.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View className="flex-1 bg-[#0f1115] pt-2">
      <View className="flex-row items-center justify-between px-6 mb-6">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
          <ArrowLeft size={20} color="#9ca3af" />
          <Text className="text-gray-400 ml-2 font-medium">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} disabled={saving} className="bg-amber-500 px-4 py-1.5 rounded-full">
          {saving ? <ActivityIndicator size="small" color="#000" /> : <Text className="text-black font-bold text-sm">Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView className="px-6 flex-1 mb-20" showsVerticalScrollIndicator={false}>
        <Text className="text-2xl font-bold text-gray-100 mb-6">{id ? 'Edit' : 'Create'} Routine</Text>

        <View className="mb-4">
          <Text className="text-gray-400 text-xs uppercase tracking-wider mb-2 ml-1">Routine Name</Text>
          <TextInput
            placeholder="e.g. Push Pull Legs"
            placeholderTextColor="#4b5563"
            value={routineName}
            onChangeText={setRoutineName}
            className="bg-[#161922] border border-[#232632] rounded-xl px-4 h-14 text-white font-medium text-base mb-4"
          />
        </View>

        <View className="mb-6">
          <Text className="text-gray-400 text-xs uppercase tracking-wider mb-2 ml-1">Select Gym Environment</Text>
          <View className="flex-row flex-wrap">
            {gyms.map(g => (
              <TouchableOpacity
                key={g._id}
                onPress={() => setSelectedGym(g._id)}
                className={`border rounded-lg px-4 py-2 mr-2 mb-2 ${
                  selectedGym === g._id ? 'bg-amber-500/20 border-amber-500/50' : 'bg-[#161922] border-[#232632]'
                }`}
              >
                <Text className={selectedGym === g._id ? 'text-amber-400 font-semibold' : 'text-gray-400'}>{g.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text className="text-gray-400 text-xs uppercase tracking-wider mb-3 ml-1">Workout Split Map</Text>
        
        {splitDays.map((day, idx) => (
          <View key={idx} className="bg-[#1b1f2a] border border-[#232632] rounded-xl p-4 mb-4">
            <View className="flex-row justify-between items-center mb-3">
              <TextInput
                placeholder="Day Name (e.g. Chest)"
                placeholderTextColor="#4b5563"
                value={day.dayName}
                onChangeText={(n) => updateDayName(idx, n)}
                className="flex-1 text-white text-lg font-bold p-0"
              />
              <TouchableOpacity onPress={() => removeDay(idx)} className="p-2">
                <Trash2 size={16} color="#ef4444" />
              </TouchableOpacity>
            </View>
            
            {day.exercises.map((ex, eIdx) => (
              <Animated.View 
                key={eIdx} 
                entering={FadeInDown.delay(eIdx * 50)}
                className="bg-[#0f1115] border border-[#232632] p-4 rounded-xl mb-3"
              >
                <View className="flex-row justify-between items-start mb-3">
                  <View className="flex-row items-center flex-1">
                    <Text className="text-amber-500 font-bold mr-2">{eIdx + 1}.</Text>
                    <Text className="text-gray-100 font-bold text-base flex-1" numberOfLines={1}>{ex.equipmentName}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeExercise(idx, eIdx)} className="ml-2">
                    <X size={16} color="#4b5563" />
                  </TouchableOpacity>
                </View>

                <View className="flex-row space-x-3">
                  <View className="flex-1">
                    <Text className="text-gray-500 text-[10px] uppercase font-bold mb-1 ml-1">Sets</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={String(ex.targetSets)}
                      onChangeText={(v) => updateExercise(idx, eIdx, 'targetSets', Number(v))}
                      className="bg-[#161922] border border-[#232632] rounded-lg px-3 py-2 text-white font-bold"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-500 text-[10px] uppercase font-bold mb-1 ml-1">Reps</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={String(ex.targetReps)}
                      onChangeText={(v) => updateExercise(idx, eIdx, 'targetReps', Number(v))}
                      className="bg-[#161922] border border-[#232632] rounded-lg px-3 py-2 text-white font-bold"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-500 text-[10px] uppercase font-bold mb-1 ml-1">Rest (s)</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={String(ex.restSeconds)}
                      onChangeText={(v) => updateExercise(idx, eIdx, 'restSeconds', Number(v))}
                      className="bg-[#161922] border border-[#232632] rounded-lg px-3 py-2 text-white font-bold"
                    />
                  </View>
                </View>
              </Animated.View>
            ))}

            <TouchableOpacity 
              onPress={() => openExerciseModal(idx)} 
              className="mt-2 py-3 flex-row items-center justify-center border border-dashed border-[#4b5563] rounded-xl bg-white/5"
            >
              <Plus size={18} color="#9ca3af" />
              <Text className="text-gray-400 ml-2 font-bold uppercase tracking-wider text-xs">Add Exercise</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity onPress={addDay} className="mb-32 bg-[#161922] border border-[#232632] p-5 rounded-2xl items-center flex-row justify-center shadow-lg">
          <Plus size={20} color="#fcd34d" />
          <Text className="text-amber-500 ml-2 font-bold tracking-widest uppercase">Add Split Day</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Exercise Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <Animated.View 
            entering={SlideInDown}
            className="bg-[#0f1115] h-[80%] rounded-t-[40px] border-t border-[#232632] p-6 shadow-2xl"
          >
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-bold text-gray-100">Select Exercise</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="bg-[#161922] p-2 rounded-full">
                <X size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <View className="bg-[#161922] border border-[#232632] rounded-2xl flex-row items-center px-4 mb-6">
              <Search size={20} color="#4b5563" />
              <TextInput
                placeholder="Search equipment..."
                placeholderTextColor="#4b5563"
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="flex-1 h-12 text-white ml-3 font-medium"
                autoFocus
              />
            </View>

            {filteredEquipment.length === 0 ? (
              <View className="flex-1 items-center justify-center">
                <Text className="text-gray-500 font-medium">No matching equipment found in this gym.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredEquipment}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => addExercise(item)}
                    className="flex-row items-center justify-between py-4 border-b border-[#232632]"
                  >
                    <Text className="text-gray-200 text-base font-medium">{item}</Text>
                    <View className="bg-amber-500/10 p-1 rounded-md">
                      <Plus size={16} color="#fbbf24" />
                    </View>
                  </TouchableOpacity>
                )}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
              />
            )}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
