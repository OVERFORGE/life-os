import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Play, Timer, Save, ChevronRight, ChevronLeft, Zap, Info } from 'lucide-react-native';
import { fetchWithAuth } from '../../../utils/api';
import { useToast } from '../../../components/ui/Toast';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MUSCLE_IMAGES: any = {
  chest: require('../../../assets/images/muscles/chest.png'),
  back: require('../../../assets/images/muscles/back.png'),
  legs: require('../../../assets/images/muscles/legs.png'),
  arms: require('../../../assets/images/muscles/arms.png'),
  core: require('../../../assets/images/muscles/core.png'),
  shoulders: require('../../../assets/images/muscles/shoulders.png'),
};

function getMuscleImage(equipmentName: string) {
  const name = equipmentName.toLowerCase();
  if (name.includes('chest') || name.includes('bench') || name.includes('pec') || name.includes('push-up')) return MUSCLE_IMAGES.chest;
  if (name.includes('back') || name.includes('row') || name.includes('lat') || name.includes('pull-up') || name.includes('deadlift')) return MUSCLE_IMAGES.back;
  if (name.includes('leg') || name.includes('squat') || name.includes('calf') || name.includes('lunge') || name.includes('thrust')) return MUSCLE_IMAGES.legs;
  if (name.includes('curl') || name.includes('tricep') || name.includes('dip') || name.includes('skull')) return MUSCLE_IMAGES.arms;
  if (name.includes('abs') || name.includes('core') || name.includes('plank') || name.includes('twist') || name.includes('crunch')) return MUSCLE_IMAGES.core;
  if (name.includes('shoulder') || name.includes('press') || name.includes('lateral') || name.includes('front') || name.includes('face pull')) return MUSCLE_IMAGES.shoulders;
  return MUSCLE_IMAGES.core; // fallback
}

export default function LiveSessionScreen() {
  const router = useRouter();
  const toast = useToast();
  const [routines, setRoutines] = useState<any[]>([]);
  const [selectedRoutine, setSelectedRoutine] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [seconds, setSeconds] = useState(0);

  // Stepper State
  const [currentExIdx, setCurrentExIdx] = useState(0);

  // Payload for logged sets
  const [logs, setLogs] = useState<any>({}); 
  const [saving, setSaving] = useState(false);

  // Raw text states for weight inputs keyed by "exIdx-setIdx"
  const [weightTexts, setWeightTexts] = useState<Record<string, string>>({});

  const getWeightText = (exIdx: number, setIdx: number) => {
    const key = `${exIdx}-${setIdx}`;
    if (weightTexts[key] !== undefined) return weightTexts[key];
    const val = logs[exIdx]?.[setIdx]?.weightUsed;
    return val ? String(val) : '';
  };

  const handleWeightChange = (exIdx: number, setIdx: number, raw: string) => {
    const key = `${exIdx}-${setIdx}`;
    // Allow digits and at most one decimal point
    const cleaned = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setWeightTexts(prev => ({ ...prev, [key]: cleaned }));
    const num = cleaned === '' || cleaned === '.' ? 0 : parseFloat(cleaned) || 0;
    handleSaveSet(exIdx, setIdx, 'weightUsed', num);
  };

  useEffect(() => {
    fetchWithAuth('/gym/routines')
      .then(res => res.json())
      .then(data => setRoutines(data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let int: any;
    if (active) {
      int = setInterval(() => setSeconds(s => s + 1), 1000);
    }
    return () => clearInterval(int);
  }, [active]);

  const toggleWorkout = () => setActive(!active);

  const handleSaveSet = (exIdx: number, setIdx: number, field: string, value: any) => {
    const nextLogs = { ...logs };
    if (!nextLogs[exIdx]) nextLogs[exIdx] = [];
    if (!nextLogs[exIdx][setIdx]) nextLogs[exIdx][setIdx] = { repsDone: 0, weightUsed: 0, restSecondsTaken: 0, assisted: false, assistedAtRep: 0 };
    nextLogs[exIdx][setIdx][field] = value;
    setLogs(nextLogs);
  };

  const finishWorkout = async () => {
    if (!selectedRoutine || !selectedDay) return;
    setActive(false);
    setSaving(true);
    
    try {
      // Map the UI state back to the Mongoose Model
      const exercises = selectedDay.exercises.map((ex: any, i: number) => ({
        equipmentName: ex.equipmentName,
        sets: logs[i] ? logs[i].filter(Boolean) : []
      }));

      const res = await fetchWithAuth('/gym/session', {
        method: 'POST',
        body: JSON.stringify({
          routineId: selectedRoutine._id,
          splitDayName: selectedDay.dayName,
          durationSeconds: seconds,
          exercises
        })
      });

      if (res.ok) {
        toast.success('Workout Saved! 💪', 'Fantastic session — keep it up!');
        setTimeout(() => router.replace('/(dashboard)/gym'), 1200);
      } else {
        toast.error('Save Failed', 'Failed to sync workout to server.');
      }
    } catch (e) {
      toast.error('Network Error', 'Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}:${rs < 10 ? '0' : ''}${rs}`;
  };

  return (
    <View className="flex-1 bg-[#0f1115]">
      <View className="flex-row items-center justify-between px-6 mb-6">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
          <ArrowLeft size={20} color="#9ca3af" />
          <Text className="text-gray-400 ml-2 font-medium">Cancel</Text>
        </TouchableOpacity>
        
        {active && (
          <View className="flex-row items-center bg-[#161922] px-3 py-1.5 rounded-full border border-amber-500/30">
            <Timer size={16} color="#fcd34d" />
            <Text className="text-amber-400 ml-2 font-mono font-bold tracking-widest">{formatTime(seconds)}</Text>
          </View>
        )}
      </View>

      <ScrollView className="px-6 flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {!active && !selectedRoutine && (
          <View>
            <Text className="text-2xl font-bold text-gray-100 mb-6">Start Session</Text>
            {loading ? <ActivityIndicator color="#fcd34d" /> : routines.map(r => (
              <TouchableOpacity
                key={r._id}
                onPress={() => setSelectedRoutine(r)}
                className="bg-[#1b1f2a] border border-[#232632] rounded-xl p-4 mb-3"
              >
                <Text className="text-gray-100 font-semibold text-lg">{r.routineName}</Text>
                <Text className="text-gray-500 text-sm mt-1">{r.splitDays?.length || 0} Split Days</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!active && selectedRoutine && !selectedDay && (
          <View>
            <Text className="text-2xl font-bold text-gray-100 mb-2">{selectedRoutine.routineName}</Text>
            <Text className="text-gray-400 mb-6">Select your split day:</Text>
            
            {selectedRoutine.splitDays.map((d: any, idx: number) => (
              <TouchableOpacity
                key={idx}
                onPress={() => setSelectedDay(d)}
                className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-3"
              >
                <Text className="text-amber-500 font-bold text-lg">{d.dayName}</Text>
                <Text className="text-gray-500 text-sm mt-1">{d.exercises?.length || 0} Exercises</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {selectedDay && (
          <View>
            {!active ? (
               <TouchableOpacity 
                 onPress={toggleWorkout}
                 className="bg-amber-500 p-5 rounded-2xl flex-row items-center justify-center mb-6 shadow-xl shadow-amber-500/20"
               >
                 <Play size={20} color="#000" fill="#000" />
                 <Text className="text-black font-bold text-lg ml-2 uppercase tracking-widest">Begin {selectedDay.dayName}</Text>
               </TouchableOpacity>
            ) : (
              <View className="flex-1">
                {/* Stepper Header */}
                <View className="flex-row justify-between items-center mb-6">
                  <View className="flex-1 h-1.5 bg-gray-800 rounded-full mr-4 flex-row overflow-hidden">
                    <Animated.View 
                      className="h-full bg-amber-500"
                      style={{ width: `${((currentExIdx + 1) / selectedDay.exercises.length) * 100}%` }}
                    />
                  </View>
                  <Text className="text-gray-400 font-bold text-xs uppercase tracking-widest">
                    {currentExIdx + 1} / {selectedDay.exercises.length}
                  </Text>
                </View>

                {/* Active Exercise Card */}
                {selectedDay.exercises.map((ex: any, exIdx: number) => {
                  if (exIdx !== currentExIdx) return null;

                  return (
                    <Animated.View 
                      key={exIdx}
                      entering={SlideInRight}
                      exiting={SlideOutLeft}
                      className="flex-1"
                    >
                      <View className="mb-6">
                        {/* Muscle Graphic */}
                        <View className="h-48 bg-black/40 relative items-center justify-center">
                          <Image 
                            source={getMuscleImage(ex.equipmentName)}
                            className="w-full h-full opacity-60"
                            resizeMode="contain"
                          />
                          <View className="absolute bottom-4 left-6">
                            <Text className="text-white font-black text-2xl uppercase tracking-tighter">{ex.equipmentName}</Text>
                            <View className="flex-row items-center mt-1">
                              <Zap size={12} color="#fbbf24" fill="#fbbf24" />
                              <Text className="text-amber-400 text-xs font-bold ml-1 uppercase">{selectedDay.dayName}</Text>
                            </View>
                          </View>
                        </View>

                        <View className="mt-4">
                          <View className="flex-row justify-between mb-6">
                            <View>
                              <Text className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">Target</Text>
                              <Text className="text-white font-bold text-lg">{ex.targetSets} Sets × {ex.targetReps} Reps</Text>
                            </View>
                            <View className="items-end">
                              <Text className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">Ideal Rest</Text>
                              <Text className="text-amber-500 font-bold text-lg">{ex.restSeconds}s</Text>
                            </View>
                          </View>

                          {/* Sets Logger */}
                          <View>
                            {Array.from({ length: ex.targetSets }).map((_, setIdx) => {
                              const setData = logs[exIdx]?.[setIdx] || { repsDone: 0, weightUsed: 0, restSecondsTaken: 0, assisted: false, assistedAtRep: 0 };
                              
                              return (
                                <View key={setIdx} className="bg-black/20 border border-[#232632] rounded-2xl p-4 mb-4">
                                  <View className="flex-row items-center justify-between mb-4">
                                    <Text className="text-gray-400 font-black text-xs uppercase">Set {setIdx + 1}</Text>
                                    
                                    <TouchableOpacity 
                                      onPress={() => handleSaveSet(exIdx, setIdx, 'assisted', !setData.assisted)}
                                      className={`px-3 py-1 rounded-full border ${setData.assisted ? 'bg-amber-500/20 border-amber-500' : 'border-gray-800'}`}
                                    >
                                      <Text className={`text-[10px] font-bold uppercase ${setData.assisted ? 'text-amber-400' : 'text-gray-600'}`}>Assist</Text>
                                    </TouchableOpacity>
                                  </View>

                                  <View className="flex-row space-x-3 mb-4">
                                    <View className="flex-1 bg-[#1b1f2a] rounded-xl p-3 border border-[#232632]">
                                      <Text className="text-gray-500 text-[9px] font-black uppercase mb-1">Weight (kg)</Text>
                                      <TextInput
                                        keyboardType="decimal-pad"
                                        placeholder="0"
                                        placeholderTextColor="#4b5563"
                                        value={getWeightText(exIdx, setIdx)}
                                        onChangeText={(v) => handleWeightChange(exIdx, setIdx, v)}
                                        className="text-white font-bold text-lg"
                                      />
                                    </View>
                                    <View className="flex-1 bg-[#1b1f2a] rounded-xl p-3 border border-[#232632]">
                                      <Text className="text-gray-500 text-[9px] font-black uppercase mb-1">Reps</Text>
                                      <TextInput
                                        keyboardType="decimal-pad"
                                        placeholder="0"
                                        placeholderTextColor="#4b5563"
                                        value={setData.repsDone ? String(setData.repsDone) : ''}
                                        onChangeText={(v) => {
                                          const cleaned = v.replace(/[^0-9.]/g, '');
                                          handleSaveSet(exIdx, setIdx, 'repsDone', cleaned === '' ? 0 : parseFloat(cleaned) || 0);
                                        }}
                                        className="text-white font-bold text-lg"
                                      />
                                    </View>
                                  </View>

                                  {setData.assisted && (
                                    <Animated.View entering={FadeIn} className="mb-4 bg-amber-500/5 p-3 rounded-xl border border-amber-500/20">
                                      <Text className="text-amber-500/80 text-[10px] font-bold uppercase mb-2">Assisted after rep #</Text>
                                      <TextInput
                                        keyboardType="numeric"
                                        placeholder="Reps hit before help..."
                                        placeholderTextColor="#78350f"
                                        value={setData.assistedAtRep ? String(setData.assistedAtRep) : ''}
                                        onChangeText={(v) => handleSaveSet(exIdx, setIdx, 'assistedAtRep', Number(v))}
                                        className="text-amber-400 font-bold text-sm"
                                      />
                                    </Animated.View>
                                  )}

                                  {/* Break List */}
                                  <Text className="text-gray-600 text-[9px] font-black uppercase mb-2 ml-1">Log Actual Rest</Text>
                                  <View className="flex-row flex-wrap">
                                    {['45s', '1.5m', '2m', '3m', '3m+'].map((label) => {
                                      const valMap: any = { '45s': 45, '1.5m': 90, '2m': 120, '3m': 180, '3m+': 300 };
                                      const isSel = setData.restSecondsTaken === valMap[label];
                                      return (
                                        <TouchableOpacity 
                                          key={label}
                                          onPress={() => handleSaveSet(exIdx, setIdx, 'restSecondsTaken', valMap[label])}
                                          className={`px-3 py-1.5 rounded-lg mr-2 mb-2 border ${isSel ? 'bg-amber-500 border-amber-500' : 'bg-gray-800/40 border-gray-800'}`}
                                        >
                                          <Text className={`text-[10px] font-bold ${isSel ? 'text-black' : 'text-gray-400'}`}>{label}</Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })}

                {/* Navigation Buttons */}
                <View className="flex-row space-x-4 mb-6">
                  <TouchableOpacity 
                    onPress={() => setCurrentExIdx(prev => Math.max(0, prev - 1))}
                    disabled={currentExIdx === 0}
                    className={`flex-1 h-14 bg-[#161922] rounded-2xl items-center justify-center border border-[#232632] ${currentExIdx === 0 ? 'opacity-30' : ''}`}
                  >
                    <ChevronLeft size={20} color="#9ca3af" />
                  </TouchableOpacity>

                  {currentExIdx < selectedDay.exercises.length - 1 ? (
                    <TouchableOpacity 
                      onPress={() => setCurrentExIdx(prev => prev + 1)}
                      className="flex-[3] h-14 bg-amber-500 rounded-2xl items-center justify-center border border-amber-600 shadow-lg shadow-amber-500/20"
                    >
                      <View className="flex-row items-center">
                        <Text className="text-black font-black uppercase tracking-widest text-sm">Next Exercise</Text>
                        <ChevronRight size={18} color="#000" className="ml-2" />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity 
                      onPress={finishWorkout}
                      disabled={saving}
                      className="flex-[3] h-14 bg-green-500 rounded-2xl items-center justify-center border border-green-600 shadow-lg shadow-green-500/20"
                    >
                      {saving ? <ActivityIndicator color="#000" /> : (
                        <View className="flex-row items-center">
                          <Text className="text-black font-black uppercase tracking-widest text-sm">Finish Session</Text>
                          <Save size={18} color="#000" className="ml-2" />
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
