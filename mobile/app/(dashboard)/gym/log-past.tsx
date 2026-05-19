import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Calendar, Dumbbell, Flame } from 'lucide-react-native';
import { useState, useCallback } from 'react';
import { fetchWithAuth } from '../../../utils/api';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

export default function LogPastWorkout() {
  const router = useRouter();
  const [routines, setRoutines] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingRoutines, setFetchingRoutines] = useState(true);

  // Form State
  const [selectedSplit, setSelectedSplit] = useState<string>('Freestyle');
  const [durationMinutes, setDurationMinutes] = useState<string>('45');
  const [selectedDateOffet, setSelectedDateOffset] = useState<number>(1); // 1 = yesterday

  // Advanced Logs
  type SetLog = { repsDone: number; weightUsed: number; restSecondsTaken: number; assisted: boolean; assistedAtRep: number; };
  type ExerciseLog = { equipmentName: string; sets: SetLog[] };
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadRoutines();
    }, [])
  );

  const loadRoutines = async () => {
    try {
      const res = await fetchWithAuth('/gym/routines');
      if (res.ok) {
        setRoutines(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFetchingRoutines(false);
    }
  };

  const extractSplits = () => {
    const splits = ['Freestyle']; // Default fallback
    routines.forEach(r => {
      r.splitDays?.forEach((sd: any) => {
        if (!splits.includes(sd.dayName)) {
          splits.push(sd.dayName);
        }
      });
    });
    return splits;
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

  const handleSave = async () => {
    const durationNum = parseInt(durationMinutes, 10);
    if (!durationNum || durationNum <= 0) {
      Alert.alert("Invalid Duration", "Please enter a valid workout duration in minutes.");
      return;
    }

    // Calculate Date
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - selectedDateOffet);

    setLoading(true);
    try {
      const res = await fetchWithAuth('/gym/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          splitDayName: selectedSplit,
          durationSeconds: durationNum * 60,
          date: targetDate.toISOString(),
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
        Alert.alert("Error", d.error || "Failed to log past session.");
      }
    } catch (e) {
      Alert.alert("Error", "Network error while saving past session.");
    } finally {
      setLoading(false);
    }
  };

  // Generate an array of the last 7 days including today
  const recentDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    let label = d.toLocaleDateString('en-US', { weekday: 'short' });
    if (i === 0) label = "Today";
    if (i === 1) label = "Yesterday";
    
    return {
      offset: i,
      label,
      dateString: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
  });

  const availableSplits = extractSplits();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border }}>
          <ArrowLeft size={16} color={C.subtext} />
          <Text style={{ color: C.subtext, marginLeft: 6, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '900', color: C.text, marginLeft: 16 }}>Log Past Workout</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        
        {/* Date Selector */}
        <View style={{ marginBottom: 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Calendar size={16} color={C.primary} />
            <Text style={{ fontSize: 15, fontWeight: '900', color: C.text, marginLeft: 8 }}>When did you work out?</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {recentDays.map((ds) => {
              const isSelected = selectedDateOffet === ds.offset;
              return (
                <TouchableOpacity
                  key={ds.offset}
                  onPress={() => setSelectedDateOffset(ds.offset)}
                  style={{
                    marginRight: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 20,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: isSelected ? 'rgba(232,65,74,0.3)' : C.border,
                    backgroundColor: isSelected ? C.primaryBg : C.card,
                    alignItems: 'center'
                  }}
                >
                  <Text style={{ fontWeight: '800', fontSize: 14, marginBottom: 4, color: isSelected ? C.primary : C.text }}>
                    {ds.label}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? C.primary : C.subtext }}>
                    {ds.dateString}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        {/* Split Selector */}
        <View style={{ marginBottom: 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Dumbbell size={16} color={C.primary} />
            <Text style={{ fontSize: 15, fontWeight: '900', color: C.text, marginLeft: 8 }}>Workout Split</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {availableSplits.map((split) => {
              const isSelected = selectedSplit === split;
              return (
                <TouchableOpacity
                  key={split}
                  onPress={() => setSelectedSplit(split)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isSelected ? 'rgba(232,65,74,0.3)' : C.border,
                    backgroundColor: isSelected ? C.primaryBg : C.card,
                  }}
                >
                  <Text style={{ fontWeight: '800', fontSize: 13, color: isSelected ? C.primary : C.subtext }}>
                    {split}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Duration Input */}
        <View style={{ marginBottom: 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Flame size={16} color={C.primary} />
            <Text style={{ fontSize: 15, fontWeight: '900', color: C.text, marginLeft: 8 }}>Total Duration</Text>
          </View>
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
            <TextInput
              value={durationMinutes}
              onChangeText={setDurationMinutes}
              keyboardType="number-pad"
              style={{ flex: 1, color: C.text, fontSize: 24, fontWeight: '900', paddingVertical: 16 }}
              placeholder="e.g. 45"
              placeholderTextColor={C.muted}
            />
            <Text style={{ color: C.subtext, fontWeight: '700', fontSize: 15, marginLeft: 8 }}>minutes</Text>
          </View>
        </View>

        {/* Advanced Exercises */}
        <View style={{ marginBottom: 32, paddingTop: 24, borderTopWidth: 1, borderTopColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Dumbbell size={16} color={C.subtext} />
              <Text style={{ fontSize: 15, fontWeight: '900', color: C.text, marginLeft: 8 }}>Logged Exercises</Text>
            </View>
            <TouchableOpacity 
              onPress={() => setExercises([...exercises, { equipmentName: '', sets: [{ repsDone: 0, weightUsed: 0, restSecondsTaken: 60, assisted: false, assistedAtRep: 0 }] }])}
              style={{ backgroundColor: C.primaryBg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)' }}
            >
              <Text style={{ color: C.primary, fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>+ Custom</Text>
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
                  style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' }}
                >
                  <Text style={{ color: C.primary, fontSize: 12, fontWeight: '800' }}>+ {pEx.equipmentName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {exercises.map((ex, eIdx) => (
            <View key={eIdx} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginBottom: 16 }}>
              <TextInput
                value={ex.equipmentName}
                onChangeText={(v) => {
                  const n = [...exercises];
                  n[eIdx].equipmentName = v;
                  setExercises(n);
                }}
                style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 8 }}
                placeholder="Exercise Name (e.g. Bench Press)"
                placeholderTextColor={C.muted}
              />
              
              {ex.sets.map((set, sIdx) => (
                <View key={sIdx} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ color: C.muted, fontWeight: '900', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, width: 48 }}>Set {sIdx + 1}</Text>
                      <TouchableOpacity 
                        onPress={() => {
                          const n = [...exercises];
                          n[eIdx].sets[sIdx].assisted = !n[eIdx].sets[sIdx].assisted;
                          setExercises(n);
                        }}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8, borderRadius: 8, borderWidth: 1, backgroundColor: set.assisted ? C.primaryBg : C.bg, borderColor: set.assisted ? C.primary : C.border }}
                      >
                        <Text style={{ fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: set.assisted ? C.primary : C.muted }}>Assist</Text>
                      </TouchableOpacity>
                    </View>
                    
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                      <View style={{ backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: C.border, width: 64, flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput 
                          keyboardType="decimal-pad"
                          value={String(set.weightUsed || '')}
                          onChangeText={(v) => {
                            const n = [...exercises];
                            n[eIdx].sets[sIdx].weightUsed = Number(v) || 0;
                            setExercises(n);
                          }}
                          style={{ color: C.text, fontWeight: '800', fontSize: 14, width: '100%', textAlign: 'center' }}
                          placeholder="kg"
                          placeholderTextColor={C.muted}
                        />
                      </View>
                      <Text style={{ color: C.subtext, fontWeight: '800', fontSize: 12 }}>x</Text>
                      <View style={{ backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: C.border, width: 64, flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput 
                          keyboardType="decimal-pad"
                          value={String(set.repsDone || '')}
                          onChangeText={(v) => {
                            const n = [...exercises];
                            n[eIdx].sets[sIdx].repsDone = Number(v) || 0;
                            setExercises(n);
                          }}
                          style={{ color: C.text, fontWeight: '800', fontSize: 14, width: '100%', textAlign: 'center' }}
                          placeholder="reps"
                          placeholderTextColor={C.muted}
                        />
                      </View>
                    </View>
                  </View>

                  {set.assisted && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, paddingHorizontal: 4 }}>
                      <Text style={{ color: C.primary, fontSize: 10, textTransform: 'uppercase', fontWeight: '800', marginRight: 8 }}>Assisted at rep:</Text>
                      <View style={{ backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)', width: 64, alignItems: 'center', flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 4 }}>
                        <TextInput 
                          keyboardType="decimal-pad"
                          value={String(set.assistedAtRep || '')}
                          onChangeText={(v) => {
                            const n = [...exercises];
                            n[eIdx].sets[sIdx].assistedAtRep = Number(v) || 0;
                            setExercises(n);
                          }}
                          style={{ color: C.primary, fontWeight: '800', fontSize: 12, flex: 1, textAlign: 'center' }}
                          placeholder="0"
                          placeholderTextColor="rgba(232,65,74,0.4)"
                        />
                      </View>
                    </View>
                  )}
                </View>
              ))}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border }}>
                <TouchableOpacity onPress={() => {
                  const n = [...exercises];
                  n.splice(eIdx, 1);
                  setExercises(n);
                }}>
                  <Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Remove</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => {
                  const n = [...exercises];
                  n[eIdx].sets.push({ repsDone: 0, weightUsed: 0, restSecondsTaken: 60, assisted: false, assistedAtRep: 0 });
                  setExercises(n);
                }}>
                  <Text style={{ color: C.primary, fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>+ Add Set</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {exercises.length === 0 && (
            <Text style={{ color: C.subtext, fontSize: 14, textAlign: 'center', paddingVertical: 16 }}>Optionally log specific exercises to backfill data.</Text>
          )}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={loading || fetchingRoutines}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 24, marginTop: 16, backgroundColor: loading ? C.primaryBg : C.primary, borderWidth: loading ? 1 : 0, borderColor: loading ? 'rgba(232,65,74,0.2)' : 'transparent' }}
        >
          {loading ? (
            <ActivityIndicator color={C.primary} />
          ) : (
            <>
              <Check size={20} color="#FFFDFC" />
              <Text style={{ color: '#FFFDFC', fontWeight: '900', fontSize: 16, marginLeft: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Save Workout</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
