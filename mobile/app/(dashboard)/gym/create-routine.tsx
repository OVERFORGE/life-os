import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Modal, FlatList, Image, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Trash2, Plus, X, Search, Check, ChevronDown, ChevronUp, Image as ImageIcon, MessageSquare, ArrowUp, ArrowDown } from 'lucide-react-native';
import { fetchWithAuth } from '../../../utils/api';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

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
      restSeconds: 90,
      exerciseNote: '',
      exerciseImageUrl: ''
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

  const moveExercise = (dayIdx: number, exIdx: number, direction: 'up' | 'down') => {
    const updated = [...splitDays];
    const exercises = updated[dayIdx].exercises;
    if (direction === 'up' && exIdx > 0) {
      const temp = exercises[exIdx];
      exercises[exIdx] = exercises[exIdx - 1];
      exercises[exIdx - 1] = temp;
    } else if (direction === 'down' && exIdx < exercises.length - 1) {
      const temp = exercises[exIdx];
      exercises[exIdx] = exercises[exIdx + 1];
      exercises[exIdx + 1] = temp;
    }
    setSplitDays(updated);
  };

  const updateExercise = (dayIdx: number, exIdx: number, field: string, value: any) => {
    const updated = [...splitDays];
    updated[dayIdx].exercises[exIdx][field] = value;
    setSplitDays(updated);
  };

  const pickImage = async (dayIdx: number, exIdx: number) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setLoading(true);
      try {
        const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const res = await fetchWithAuth('/upload', {
          method: 'POST',
          body: JSON.stringify({ file: base64Img, folder: 'gym-routine-notes' })
        });
        if (res.ok) {
          const data = await res.json();
          updateExercise(dayIdx, exIdx, 'exerciseImageUrl', data.url);
        } else {
          Alert.alert("Upload Failed", "Could not upload image to server.");
        }
      } catch (e) {
        Alert.alert("Upload Error", "Network error during upload.");
      } finally {
        setLoading(false);
      }
    }
  };

  const currentGym = gyms.find(g => g._id === selectedGym);
  const currentGymEquipment = [
    ...(currentGym?.selectedPreSeeded || []),
    ...(currentGym?.customEquipment?.map((c: any) => c.name) || [])
  ];
  
  const filteredEquipment = currentGymEquipment.filter((e: string) => 
    e.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border }}>
          <ArrowLeft size={16} color={C.subtext} />
          <Text style={{ color: C.subtext, marginLeft: 6, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={{ backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
          {saving ? <ActivityIndicator size="small" color="#FFFDFC" /> : <Text style={{ color: '#FFFDFC', fontWeight: '900', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: C.text, marginBottom: 24 }}>{id ? 'Edit' : 'Create'} Routine</Text>

        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Routine Name</Text>
          <TextInput
            placeholder="e.g. Push Pull Legs"
            placeholderTextColor={C.muted}
            value={routineName}
            onChangeText={setRoutineName}
            style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontWeight: '700', fontSize: 16 }}
          />
        </View>

        <View style={{ marginBottom: 32 }}>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Select Gym Environment</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {gyms.map(g => (
              <TouchableOpacity
                key={g._id}
                onPress={() => setSelectedGym(g._id)}
                style={{
                  borderWidth: 1,
                  borderRadius: 16,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  backgroundColor: selectedGym === g._id ? C.primaryBg : C.card,
                  borderColor: selectedGym === g._id ? 'rgba(232,65,74,0.3)' : C.border,
                }}
              >
                <Text style={{ color: selectedGym === g._id ? C.primary : C.subtext, fontWeight: '800', fontSize: 14 }}>{g.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, marginLeft: 4 }}>Workout Split Map</Text>
        
        {splitDays.map((day, idx) => (
          <View key={idx} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <TextInput
                placeholder="Day Name (e.g. Chest)"
                placeholderTextColor={C.muted}
                value={day.dayName}
                onChangeText={(n) => updateDayName(idx, n)}
                style={{ flex: 1, color: C.text, fontSize: 20, fontWeight: '900', padding: 0 }}
              />
              <TouchableOpacity onPress={() => removeDay(idx)} style={{ padding: 8, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border }}>
                <Trash2 size={18} color={C.primary} />
              </TouchableOpacity>
            </View>
            
            {day.exercises.map((ex, eIdx) => (
              <Animated.View 
                key={eIdx} 
                entering={FadeInDown.delay(eIdx * 50)}
                style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, padding: 20, borderRadius: 20, marginBottom: 16 }}
              >
                {/* Exercise Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Text style={{ color: C.primary, fontWeight: '900', fontSize: 16, marginRight: 8 }}>{eIdx + 1}.</Text>
                    <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, flex: 1 }} numberOfLines={1}>{ex.equipmentName}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity onPress={() => moveExercise(idx, eIdx, 'up')} style={{ padding: 6, backgroundColor: C.card, borderRadius: 8, opacity: eIdx === 0 ? 0.3 : 1 }} disabled={eIdx === 0}>
                      <ArrowUp size={16} color={C.subtext} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveExercise(idx, eIdx, 'down')} style={{ padding: 6, backgroundColor: C.card, borderRadius: 8, opacity: eIdx === day.exercises.length - 1 ? 0.3 : 1 }} disabled={eIdx === day.exercises.length - 1}>
                      <ArrowDown size={16} color={C.subtext} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeExercise(idx, eIdx)} style={{ padding: 6, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, marginLeft: 4 }}>
                      <X size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Params */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.muted, fontSize: 9, textTransform: 'uppercase', fontWeight: '900', marginBottom: 6, marginLeft: 4, letterSpacing: 1 }}>Sets</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={String(ex.targetSets)}
                      onChangeText={(v) => updateExercise(idx, eIdx, 'targetSets', Number(v))}
                      style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: C.text, fontWeight: '900', fontSize: 16, textAlign: 'center' }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.muted, fontSize: 9, textTransform: 'uppercase', fontWeight: '900', marginBottom: 6, marginLeft: 4, letterSpacing: 1 }}>Reps</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={String(ex.targetReps)}
                      onChangeText={(v) => updateExercise(idx, eIdx, 'targetReps', Number(v))}
                      style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: C.text, fontWeight: '900', fontSize: 16, textAlign: 'center' }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.muted, fontSize: 9, textTransform: 'uppercase', fontWeight: '900', marginBottom: 6, marginLeft: 4, letterSpacing: 1 }}>Rest (s)</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={String(ex.restSeconds)}
                      onChangeText={(v) => updateExercise(idx, eIdx, 'restSeconds', Number(v))}
                      style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: C.text, fontWeight: '900', fontSize: 16, textAlign: 'center' }}
                    />
                  </View>
                </View>

                {/* Exercise Level Notes */}
                <View style={{ backgroundColor: C.card, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Form Notes & Media</Text>
                  
                  <TextInput
                    placeholder="Focus on the negative, squeeze at the top..."
                    placeholderTextColor={C.muted}
                    value={ex.exerciseNote || ''}
                    onChangeText={(val) => updateExercise(idx, eIdx, 'exerciseNote', val)}
                    multiline
                    style={{ color: C.text, fontSize: 14, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12, minHeight: 60, textAlignVertical: 'top' }}
                  />
                  
                  {ex.exerciseImageUrl ? (
                    <View style={{ position: 'relative', width: '100%', height: 160, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
                      <Image source={{ uri: ex.exerciseImageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      <TouchableOpacity 
                        onPress={() => updateExercise(idx, eIdx, 'exerciseImageUrl', '')}
                        style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 16 }}
                      >
                        <X size={14} color="#FFFDFC" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity 
                      onPress={() => pickImage(idx, eIdx)}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}
                    >
                      <ImageIcon size={16} color={C.primary} />
                      <Text style={{ color: C.primary, fontSize: 12, fontWeight: '900', marginLeft: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Attach Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>
            ))}

            <TouchableOpacity 
              onPress={() => openExerciseModal(idx)} 
              style={{ marginTop: 8, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: C.muted, borderRadius: 20, backgroundColor: C.bg }}
            >
              <Plus size={18} color={C.subtext} />
              <Text style={{ color: C.subtext, marginLeft: 8, fontWeight: '900', textTransform: 'uppercase', fontSize: 13, letterSpacing: 1.5 }}>Add Exercise</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity onPress={addDay} style={{ marginBottom: 40, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 20, borderRadius: 24, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
          <Plus size={20} color={C.primary} />
          <Text style={{ color: C.primary, marginLeft: 8, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, fontSize: 14 }}>Add Split Day</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Exercise Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <Animated.View 
            entering={SlideInDown}
            style={{ backgroundColor: C.card, height: '85%', borderTopLeftRadius: 32, borderTopRightRadius: 32, borderTopWidth: 1, borderTopColor: C.border, padding: 24 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: C.text }}>Select Exercise</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={{ backgroundColor: C.bg, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
                <X size={18} color={C.subtext} />
              </TouchableOpacity>
            </View>

            <View style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 24, height: 56 }}>
              <Search size={20} color={C.muted} />
              <TextInput
                placeholder="Search equipment..."
                placeholderTextColor={C.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ flex: 1, height: '100%', color: C.text, marginLeft: 12, fontSize: 15, fontWeight: '700' }}
                autoFocus
              />
            </View>

            {filteredEquipment.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.muted, fontWeight: '600', fontSize: 14 }}>No matching equipment found in this gym.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredEquipment}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => addExercise(item)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border }}
                  >
                    <Text style={{ color: C.text, fontSize: 15, fontWeight: '900' }}>{item}</Text>
                    <View style={{ backgroundColor: C.primaryBg, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)' }}>
                      <Plus size={16} color={C.primary} />
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
    </SafeAreaView>
  );
}
