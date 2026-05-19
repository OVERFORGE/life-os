import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, SafeAreaView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, Dumbbell, Flame } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../../utils/api';
import React from 'react';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

export default function EditSessionWorkout() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Form State
  const [selectedSplit, setSelectedSplit] = useState<string>('Freestyle');
  const [durationMinutes, setDurationMinutes] = useState<string>('45');
  const [routines, setRoutines] = useState<any[]>([]);

  // Advanced Logs
  type SetLog = { repsDone: number; weightUsed: number; restSecondsTaken: number; assisted: boolean; assistedAtRep: number; };
  type ExerciseLog = { _id?: string, equipmentName: string; sets: SetLog[] };
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);

  useEffect(() => {
    loadSession();
  }, [id]);

  const loadSession = async () => {
    try {
      const [resSession, resRoutines] = await Promise.all([
        fetchWithAuth(`/gym/session/${id}`),
        fetchWithAuth(`/gym/routines`)
      ]);

      if (resRoutines.ok) {
        setRoutines(await resRoutines.json());
      }

      if (resSession.ok) {
        const data = await resSession.json();
        setSelectedSplit(data.splitDayName || 'Freestyle');
        setDurationMinutes(String(Math.round(data.durationSeconds / 60)));
        if (data.exercises) {
          setExercises(data.exercises);
        }
      } else {
        Alert.alert("Error", "Could not load session details.");
        router.back();
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Network error.");
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async () => {
    const durationNum = parseInt(durationMinutes, 10);
    if (!durationNum || durationNum <= 0) {
      Alert.alert("Invalid Duration", "Please enter a valid workout duration in minutes.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithAuth(`/gym/session/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          splitDayName: selectedSplit,
          durationSeconds: durationNum * 60,
          exercises: exercises.map(ex => ({
            equipmentName: ex.equipmentName || 'Unnamed Exercise',
            sets: ex.sets
          }))
        })
      });

      if (res.ok) {
        router.back();
      } else {
        const d = await res.json();
        Alert.alert("Error", d.error || "Failed to edit session.");
      }
    } catch (e) {
      Alert.alert("Error", "Network error while saving changes.");
    } finally {
      setLoading(false);
    }
  };

  const getPredefinedExercises = () => {
    if (selectedSplit === 'Freestyle') return [];
    for (const r of routines) {
      const split = r.splitDays?.find((sd: any) => sd.dayName === selectedSplit);
      if (split && split.exercises) {
        return split.exercises;
      }
    }
    return [];
  };
  const predefined = getPredefinedExercises();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.card, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
          <ArrowLeft size={20} color={C.subtext} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '900', color: C.text, flex: 1, textAlign: 'center' }}>Edit Workout</Text>
        <View style={{ width: 40 }} />
      </View>

      {fetching ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          
          <View style={{ backgroundColor: C.primaryBg, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)', padding: 16, borderRadius: 16, marginBottom: 24 }}>
             <Text style={{ color: C.primary, fontWeight: '900', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Editing Past Session</Text>
             <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>Changes will instantly recalculate your volume metrics.</Text>
          </View>

          {/* Split Name Editor */}
          <View style={{ marginBottom: 32 }}>
            <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Workout Focus</Text>
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16 }}>
              <TextInput
                value={selectedSplit}
                onChangeText={setSelectedSplit}
                style={{ color: C.text, fontWeight: '900', fontSize: 16, paddingVertical: 16 }}
                placeholder="e.g. Chest & Triceps"
                placeholderTextColor={C.muted}
              />
            </View>
          </View>

          {/* Duration Input */}
          <View style={{ marginBottom: 32 }}>
            <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 }}>Total Duration</Text>
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
              <Flame size={18} color={C.subtext} />
              <TextInput
                value={durationMinutes}
                onChangeText={setDurationMinutes}
                keyboardType="number-pad"
                style={{ flex: 1, color: C.text, fontSize: 24, fontWeight: '900', paddingVertical: 16, marginLeft: 12 }}
                placeholder="e.g. 45"
                placeholderTextColor={C.muted}
              />
              <Text style={{ color: C.subtext, fontWeight: '700', fontSize: 14 }}>minutes</Text>
            </View>
          </View>

          {/* Advanced Exercises */}
          <View style={{ marginBottom: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Dumbbell size={18} color={C.text} />
                <Text style={{ color: C.text, fontSize: 18, fontWeight: '900', marginLeft: 8 }}>Logged Exercises</Text>
              </View>
              <TouchableOpacity 
                onPress={() => setExercises([...exercises, { equipmentName: '', sets: [{ repsDone: 0, weightUsed: 0, restSecondsTaken: 60, assisted: false, assistedAtRep: 0 }] }])}
                style={{ backgroundColor: C.bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: C.border }}
              >
                <Text style={{ color: C.text, fontWeight: '900', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>+ Custom</Text>
              </TouchableOpacity>
            </View>

            {predefined.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 16 }}>
                {predefined.map((pEx: any, i: number) => (
                  <TouchableOpacity
                    key={`pre-${i}`}
                    onPress={() => {
                      const defaultSets = Array.from({ length: pEx.targetSets || 1 }).map(() => ({
                        repsDone: pEx.targetReps || 0,
                        weightUsed: 0,
                        restSecondsTaken: pEx.restSeconds || 60,
                        assisted: false,
                        assistedAtRep: 0
                      }));
                      setExercises([...exercises, { equipmentName: pEx.equipmentName, sets: defaultSets }]);
                    }}
                    style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 }}
                  >
                    <Text style={{ color: C.text, fontSize: 12, fontWeight: '900' }}>+ {pEx.equipmentName}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {exercises.map((ex, eIdx) => (
              <View key={eIdx} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 16 }}>
                <TextInput
                  value={ex.equipmentName}
                  onChangeText={(v) => {
                    const n = [...exercises];
                    n[eIdx].equipmentName = v;
                    setExercises(n);
                  }}
                  style={{ color: C.text, fontWeight: '900', fontSize: 18, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 8 }}
                  placeholder="Exercise Name (e.g. Bench Press)"
                  placeholderTextColor={C.muted}
                />
                
                {ex.sets.map((set, sIdx) => (
                  <View key={sIdx} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: C.subtext, fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, width: 48 }}>Set {sIdx + 1}</Text>
                        <TouchableOpacity 
                          onPress={() => {
                            const n = [...exercises];
                            n[eIdx].sets[sIdx].assisted = !n[eIdx].sets[sIdx].assisted;
                            setExercises(n);
                          }}
                          style={{ paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8, borderRadius: 8, borderWidth: 1, backgroundColor: set.assisted ? C.primaryBg : C.bg, borderColor: set.assisted ? C.primary : C.border }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '900', textTransform: 'uppercase', color: set.assisted ? C.primary : C.muted }}>Assist</Text>
                        </TouchableOpacity>
                      </View>
                      
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, width: 64, flexDirection: 'row', alignItems: 'center' }}>
                          <TextInput 
                            keyboardType="decimal-pad"
                            value={String(set.weightUsed || '')}
                            onChangeText={(v) => {
                              const n = [...exercises];
                              n[eIdx].sets[sIdx].weightUsed = Number(v) || 0;
                              setExercises(n);
                            }}
                            style={{ color: C.text, fontWeight: '900', fontSize: 14, width: '100%', textAlign: 'center', paddingVertical: 8 }}
                            placeholder="kg"
                            placeholderTextColor={C.muted}
                          />
                        </View>
                        <Text style={{ color: C.subtext, fontWeight: '900', fontSize: 12 }}>×</Text>
                        <View style={{ backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, width: 64, flexDirection: 'row', alignItems: 'center' }}>
                          <TextInput 
                            keyboardType="decimal-pad"
                            value={String(set.repsDone || '')}
                            onChangeText={(v) => {
                              const n = [...exercises];
                              n[eIdx].sets[sIdx].repsDone = Number(v) || 0;
                              setExercises(n);
                            }}
                            style={{ color: C.text, fontWeight: '900', fontSize: 14, width: '100%', textAlign: 'center', paddingVertical: 8 }}
                            placeholder="reps"
                            placeholderTextColor={C.muted}
                          />
                        </View>
                      </View>
                    </View>

                    {set.assisted && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
                        <Text style={{ color: C.primary, fontSize: 10, textTransform: 'uppercase', fontWeight: '900', marginRight: 8 }}>Assisted at rep:</Text>
                        <View style={{ backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)', width: 64, flexDirection: 'row', alignItems: 'center' }}>
                          <TextInput 
                            keyboardType="decimal-pad"
                            value={String(set.assistedAtRep || '')}
                            onChangeText={(v) => {
                              const n = [...exercises];
                              n[eIdx].sets[sIdx].assistedAtRep = Number(v) || 0;
                              setExercises(n);
                            }}
                            style={{ color: C.primary, fontWeight: '900', fontSize: 12, flex: 1, textAlign: 'center', paddingVertical: 4 }}
                            placeholder="0"
                            placeholderTextColor="rgba(232,65,74,0.4)"
                          />
                        </View>
                      </View>
                    )}
                  </View>
                ))}

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.border }}>
                  <TouchableOpacity onPress={() => {
                    const n = [...exercises];
                    n.splice(eIdx, 1);
                    setExercises(n);
                  }}>
                    <Text style={{ color: C.primary, fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Remove</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => {
                    const n = [...exercises];
                    n[eIdx].sets.push({ repsDone: 0, weightUsed: 0, restSecondsTaken: 60, assisted: false, assistedAtRep: 0 });
                    setExercises(n);
                  }}>
                    <Text style={{ color: C.text, fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>+ Add Set</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {exercises.length === 0 && (
              <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center', paddingVertical: 16, fontWeight: '600' }}>No exercises logged yet. Add some to backfill data.</Text>
            )}
          </View>

          {/* Save Button */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={loading}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 20, backgroundColor: loading ? C.card : C.text, borderWidth: 1, borderColor: loading ? C.border : C.text, marginBottom: 40 }}
          >
            {loading ? (
              <ActivityIndicator color={C.primary} />
            ) : (
              <>
                <Check size={20} color={C.bg} />
                <Text style={{ color: C.bg, fontWeight: '900', fontSize: 16, marginLeft: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Update Workout</Text>
              </>
            )}
          </TouchableOpacity>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}
