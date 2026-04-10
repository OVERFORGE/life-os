import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Calendar, Dumbbell, Flame } from 'lucide-react-native';
import { useState, useCallback } from 'react';
import { fetchWithAuth } from '../../../utils/api';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';

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
    <View className="flex-1 bg-[#0f1115]">
      {/* Header */}
      <View className="flex-row items-center px-5 pt-12 pb-4 border-b border-[#232632] bg-[#0f1115]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 mr-2 bg-[#1b1f2a] rounded-full">
          <ArrowLeft size={20} color="#9ca3af" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-100 flex-1">Log Past Workout</Text>
      </View>

      <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* Date Selector */}
        <View className="mb-8">
          <View className="flex-row items-center mb-3">
            <Calendar size={18} color="#fcd34d" />
            <Text className="text-lg font-bold text-gray-100 ml-2">When did you work out?</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
            {recentDays.map((ds) => {
              const isSelected = selectedDateOffet === ds.offset;
              return (
                <TouchableOpacity
                  key={ds.offset}
                  onPress={() => setSelectedDateOffset(ds.offset)}
                  className={`mr-3 py-3 px-5 rounded-xl border ${isSelected ? 'border-amber-500 bg-amber-500/10' : 'border-[#232632] bg-[#161922]'} items-center`}
                >
                  <Text className={`font-semibold text-sm mb-1 ${isSelected ? 'text-amber-500' : 'text-gray-200'}`}>
                    {ds.label}
                  </Text>
                  <Text className={`text-xs ${isSelected ? 'text-amber-500/80' : 'text-gray-500'}`}>
                    {ds.dateString}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        {/* Split Selector */}
        <View className="mb-8">
          <View className="flex-row items-center mb-3">
            <Dumbbell size={18} color="#fcd34d" />
            <Text className="text-lg font-bold text-gray-100 ml-2">Workout Split</Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {availableSplits.map((split) => {
              const isSelected = selectedSplit === split;
              return (
                <TouchableOpacity
                  key={split}
                  onPress={() => setSelectedSplit(split)}
                  className={`py-2 px-4 rounded-full border ${isSelected ? 'border-amber-500 bg-amber-500' : 'border-[#232632] bg-[#161922]'}`}
                >
                  <Text className={`font-medium text-sm ${isSelected ? 'text-black' : 'text-gray-300'}`}>
                    {split}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Duration Input */}
        <View className="mb-8">
          <View className="flex-row items-center mb-3">
            <Flame size={18} color="#fcd34d" />
            <Text className="text-lg font-bold text-gray-100 ml-2">Total Duration</Text>
          </View>
          <View className="bg-[#161922] border border-[#232632] rounded-xl flex-row items-center px-4 py-1">
            <TextInput
              value={durationMinutes}
              onChangeText={setDurationMinutes}
              keyboardType="number-pad"
              className="flex-1 text-gray-100 text-2xl font-bold py-3"
              placeholder="e.g. 45"
              placeholderTextColor="#4b5563"
            />
            <Text className="text-gray-500 font-medium text-base ml-2">minutes</Text>
          </View>
        </View>

        {/* Advanced Exercises */}
        <View className="mb-8 border-t border-[#232632] pt-6">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <Dumbbell size={18} color="#9ca3af" />
              <Text className="text-lg font-bold text-gray-100 ml-2">Logged Exercises</Text>
            </View>
            <TouchableOpacity 
              onPress={() => setExercises([...exercises, { equipmentName: '', sets: [{ repsDone: 0, weightUsed: 0, restSecondsTaken: 60, assisted: false, assistedAtRep: 0 }] }])}
              className="bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-500/50"
            >
              <Text className="text-amber-400 font-bold text-xs uppercase">+ Custom</Text>
            </TouchableOpacity>
          </View>

          {predefined.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mb-6 border-b border-[#232632] pb-4">
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
                  className="bg-[#1b1f2a] border border-[#232632] rounded-full px-4 py-2 flex-row items-center"
                >
                  <Text className="text-amber-500 text-xs font-bold">+ {pEx.equipmentName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {exercises.map((ex, eIdx) => (
            <View key={eIdx} className="bg-[#1b1f2a] border border-[#232632] rounded-xl p-4 mb-4">
              <TextInput
                value={ex.equipmentName}
                onChangeText={(v) => {
                  const n = [...exercises];
                  n[eIdx].equipmentName = v;
                  setExercises(n);
                }}
                className="text-gray-100 font-bold text-lg mb-3 border-b border-[#232632] pb-2"
                placeholder="Exercise Name (e.g. Bench Press)"
                placeholderTextColor="#6b7280"
              />
              
              {ex.sets.map((set, sIdx) => (
                <View key={sIdx} className="mb-3">
                  <View className="flex-row items-center justify-between mb-1">
                    <View className="flex-row items-center">
                      <Text className="text-gray-500 font-bold text-xs uppercase w-12">Set {sIdx + 1}</Text>
                      <TouchableOpacity 
                        onPress={() => {
                          const n = [...exercises];
                          n[eIdx].sets[sIdx].assisted = !n[eIdx].sets[sIdx].assisted;
                          setExercises(n);
                        }}
                        className={`px-2 py-1 ml-2 rounded border ${set.assisted ? 'bg-amber-500/20 border-amber-500' : 'border-gray-800'}`}
                      >
                        <Text className={`text-[9px] font-bold uppercase ${set.assisted ? 'text-amber-400' : 'text-gray-600'}`}>Assist</Text>
                      </TouchableOpacity>
                    </View>
                    
                    <View className="flex-row space-x-2 items-center justify-end">
                      <View className="bg-[#161922] rounded-lg px-2 py-1.5 border border-[#232632] w-16 flex-row items-center">
                        <TextInput 
                          keyboardType="decimal-pad"
                          value={String(set.weightUsed || '')}
                          onChangeText={(v) => {
                            const n = [...exercises];
                            n[eIdx].sets[sIdx].weightUsed = Number(v) || 0;
                            setExercises(n);
                          }}
                          className="text-gray-200 font-bold text-sm w-full text-center"
                          placeholder="kg"
                          placeholderTextColor="#4b5563"
                        />
                      </View>
                      <Text className="text-gray-600 font-bold text-xs">x</Text>
                      <View className="bg-[#161922] rounded-lg px-2 py-1.5 border border-[#232632] w-16 flex-row items-center">
                        <TextInput 
                          keyboardType="decimal-pad"
                          value={String(set.repsDone || '')}
                          onChangeText={(v) => {
                            const n = [...exercises];
                            n[eIdx].sets[sIdx].repsDone = Number(v) || 0;
                            setExercises(n);
                          }}
                          className="text-gray-200 font-bold text-sm w-full text-center"
                          placeholder="reps"
                          placeholderTextColor="#4b5563"
                        />
                      </View>
                    </View>
                  </View>

                  {set.assisted && (
                    <View className="flex-row items-center justify-end mt-1 px-1">
                      <Text className="text-amber-500/80 text-[10px] uppercase font-bold mr-2">Assisted at rep:</Text>
                      <View className="bg-[#161922] rounded border border-amber-500/30 w-16 items-center flex-row px-2 py-1">
                        <TextInput 
                          keyboardType="decimal-pad"
                          value={String(set.assistedAtRep || '')}
                          onChangeText={(v) => {
                            const n = [...exercises];
                            n[eIdx].sets[sIdx].assistedAtRep = Number(v) || 0;
                            setExercises(n);
                          }}
                          className="text-amber-400 font-bold text-xs flex-1 text-center"
                          placeholder="0"
                          placeholderTextColor="#78350f"
                        />
                      </View>
                    </View>
                  )}
                </View>
              ))}

              <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-[#232632]">
                <TouchableOpacity onPress={() => {
                  const n = [...exercises];
                  n.splice(eIdx, 1);
                  setExercises(n);
                }}>
                  <Text className="text-red-400 font-bold text-xs uppercase">Remove</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => {
                  const n = [...exercises];
                  n[eIdx].sets.push({ repsDone: 0, weightUsed: 0, restSecondsTaken: 60, assisted: false, assistedAtRep: 0 });
                  setExercises(n);
                }}>
                  <Text className="text-amber-500 font-bold text-xs uppercase">+ Add Set</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {exercises.length === 0 && (
            <Text className="text-gray-500 text-sm text-center py-4">Optionally log specific exercises to backfill data.</Text>
          )}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={loading || fetchingRoutines}
          className={`flex-row items-center justify-center p-4 rounded-xl mt-4 ${loading ? 'bg-amber-500/50' : 'bg-amber-500'}`}
        >
          {loading ? (
            <ActivityIndicator color="#0f1115" />
          ) : (
            <>
              <Check size={20} color="#0f1115" />
              <Text className="text-black font-bold text-lg ml-2">Save Workout</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}
