import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Image, Dimensions, SafeAreaView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Play, Timer, Save, ChevronRight, ChevronLeft, Zap, Image as ImageIcon, Camera, X, TrendingUp, AlertCircle } from 'lucide-react-native';
import { fetchWithAuth } from '../../../utils/api';
import { useToast } from '../../../components/ui/Toast';
import Animated, { FadeIn, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

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
  const params = useLocalSearchParams<{ routineId?: string; dayName?: string }>();
  const router = useRouter();
  const toast = useToast();
  const [routines, setRoutines] = useState<any[]>([]);
  const [selectedRoutine, setSelectedRoutine] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  // Stepper State
  const [currentExIdx, setCurrentExIdx] = useState(0);

  // Payload for logged sets
  const [logs, setLogs] = useState<any>({}); 
  const [saving, setSaving] = useState(false);
  
  // Exercise level notes/images (live session, saved to server on finish)
  const [exerciseNotes, setExerciseNotes] = useState<Record<number, { note: string; imageUrl: string }>>({});

  // Per-set temporary notes persisted in AsyncStorage between sessions
  const [setNotes, setSetNotes] = useState<Record<string, string>>({}); // key: "exIdx-setIdx"
  const [expandedSetNote, setExpandedSetNote] = useState<string | null>(null); // which set card has note input open

  // History State
  const [history, setHistory] = useState<Record<string, any>>({});

  // Raw text states for weight inputs keyed by "exIdx-setIdx"
  const [weightTexts, setWeightTexts] = useState<Record<string, string>>({});

  const PERSIST_KEY = '@live_session_draft';
  // set notes key depends on routine — built once we know the routine
  const getNotesKey = (routineId: string, dayName: string) => `@set_notes_${routineId}_${dayName}`;

  const checkPersistedSession = async (routinesData: any[]) => {
    try {
      const draftStr = await AsyncStorage.getItem(PERSIST_KEY);
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        Alert.alert(
          "Unfinished Session",
          `Resume your active session for ${draft.selectedDay?.dayName || 'Workout'}?`,
          [
            { 
              text: "Discard", 
              style: "destructive", 
              onPress: () => {
                AsyncStorage.removeItem(PERSIST_KEY);
                handleInitialParams(routinesData);
              } 
            },
            { 
              text: "Resume", 
              onPress: async () => {
                setSelectedRoutine(draft.selectedRoutine);
                setSelectedDay(draft.selectedDay);
                setLogs(draft.logs);
                setExerciseNotes(draft.exerciseNotes || {});
                setCurrentExIdx(draft.currentExIdx);
                setSeconds(draft.seconds);
                setStartTime(Date.now() - (draft.seconds * 1000));
                setActive(true);
                fetchHistoryForDay(draft.selectedDay);
                // Restore per-set notes
                if (draft.selectedRoutine?._id && draft.selectedDay?.dayName) {
                  const notesKey = getNotesKey(draft.selectedRoutine._id, draft.selectedDay.dayName);
                  try {
                    const savedNotes = await AsyncStorage.getItem(notesKey);
                    if (savedNotes) setSetNotes(JSON.parse(savedNotes));
                  } catch {}
                }
              } 
            }
          ]
        );
      } else {
        handleInitialParams(routinesData);
      }
    } catch (e) {
      handleInitialParams(routinesData);
    }
  };

  const handleInitialParams = (routinesData: any[]) => {
    if (params.routineId && params.dayName) {
      const r = routinesData.find((x: any) => x._id === params.routineId);
      if (r) {
        setSelectedRoutine(r);
        const d = r.splitDays?.find((x: any) => x.dayName === params.dayName);
        if (d) {
          setSelectedDay(d);
          startWorkout(d);
        }
      }
    }
  };

  useEffect(() => {
    fetchWithAuth('/gym/routines')
      .then(res => res.json())
      .then(async data => {
        setRoutines(data);
        checkPersistedSession(data);
        // Also load set notes if we land with params
        if (params.routineId && params.dayName) {
          try {
            const notesKey = getNotesKey(params.routineId, params.dayName as string);
            const savedNotes = await AsyncStorage.getItem(notesKey);
            if (savedNotes) setSetNotes(JSON.parse(savedNotes));
          } catch {}
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let int: any;
    if (active && startTime) {
      int = setInterval(() => {
        const s = Math.floor((Date.now() - startTime) / 1000);
        setSeconds(s);
        // Persist state every 10 seconds silently
        if (s % 10 === 0) {
          saveDraftLocally(s, logs, exerciseNotes, currentExIdx);
        }
      }, 1000);
    }
    return () => clearInterval(int);
  }, [active, startTime, logs, exerciseNotes, currentExIdx]);

  const saveDraftLocally = async (s: number, currentLogs: any, currentNotes: any, exIdx: number) => {
    if (!selectedRoutine || !selectedDay) return;
    try {
      await AsyncStorage.setItem(PERSIST_KEY, JSON.stringify({
        selectedRoutine,
        selectedDay,
        logs: currentLogs,
        exerciseNotes: currentNotes,
        seconds: s,
        currentExIdx: exIdx
      }));
    } catch (e) { console.log('Draft save error', e); }
  };

  const getWeightText = (exIdx: number, setIdx: number) => {
    const key = `${exIdx}-${setIdx}`;
    if (weightTexts[key] !== undefined) return weightTexts[key];
    const val = logs[exIdx]?.[setIdx]?.weightUsed;
    return val ? String(val) : '';
  };

  const handleWeightChange = (exIdx: number, setIdx: number, raw: string) => {
    const key = `${exIdx}-${setIdx}`;
    const cleaned = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setWeightTexts(prev => ({ ...prev, [key]: cleaned }));
    const num = cleaned === '' || cleaned === '.' ? 0 : parseFloat(cleaned) || 0;
    handleSaveSet(exIdx, setIdx, 'weightUsed', num);
  };

  const fetchHistoryForDay = async (day: any) => {
    if (!day || !day.exercises) return;
    const equipmentNames = day.exercises.map((e: any) => e.equipmentName);
    try {
      const res = await fetchWithAuth('/gym/exercise-history', {
        method: 'POST',
        body: JSON.stringify({ equipmentNames })
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || {});
      }
    } catch (e) { console.log('Failed to load history', e); }
  };

  const startWorkout = (day: any = selectedDay) => {
    if (!day) return;
    setStartTime(Date.now());
    setActive(true);
    fetchHistoryForDay(day);
  };

  const toggleWorkout = () => {
    if (!active) startWorkout();
    else setActive(false);
  };

  const handleSaveSet = (exIdx: number, setIdx: number, field: string, value: any) => {
    const nextLogs = { ...logs };
    if (!nextLogs[exIdx]) nextLogs[exIdx] = [];
    if (!nextLogs[exIdx][setIdx]) nextLogs[exIdx][setIdx] = { repsDone: 0, weightUsed: 0, restSecondsTaken: 0, assisted: false, assistedAtRep: 0 };
    nextLogs[exIdx][setIdx][field] = value;
    setLogs(nextLogs);
    saveDraftLocally(seconds, nextLogs, exerciseNotes, currentExIdx);
  };

  const handleSaveExNote = (exIdx: number, field: 'note' | 'imageUrl', value: string) => {
    const nextNotes = { ...exerciseNotes };
    if (!nextNotes[exIdx]) nextNotes[exIdx] = { note: '', imageUrl: '' };
    nextNotes[exIdx][field] = value;
    setExerciseNotes(nextNotes);
    saveDraftLocally(seconds, logs, nextNotes, currentExIdx);
  };

  // Per-set note helpers
  const handleSaveSetNote = async (exIdx: number, setIdx: number, value: string) => {
    const key = `${exIdx}-${setIdx}`;
    const next = { ...setNotes, [key]: value };
    setSetNotes(next);
    if (selectedRoutine?._id && selectedDay?.dayName) {
      try {
        await AsyncStorage.setItem(getNotesKey(selectedRoutine._id, selectedDay.dayName), JSON.stringify(next));
      } catch {}
    }
  };

  const getSetNote = (exIdx: number, setIdx: number) => setNotes[`${exIdx}-${setIdx}`] || '';

  const pickLiveImage = async (exIdx: number) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      toast.info("Uploading image...");
      try {
        const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const res = await fetchWithAuth('/upload', {
          method: 'POST',
          body: JSON.stringify({ file: base64Img, folder: 'gym-live-session' })
        });
        if (res.ok) {
          const data = await res.json();
          handleSaveExNote(exIdx, 'imageUrl', data.url);
          toast.success("Image attached!");
        } else {
          toast.error("Upload Failed");
        }
      } catch (e) {
        toast.error("Network error");
      }
    }
  };

  const finishWorkout = async () => {
    if (!selectedRoutine || !selectedDay) return;
    setActive(false);
    setSaving(true);
    
    try {
      const exercises = selectedDay.exercises.map((ex: any, i: number) => {
        const eNote = exerciseNotes[i] || { note: '', imageUrl: '' };
        return {
          equipmentName: ex.equipmentName,
          sets: logs[i] ? logs[i].filter(Boolean) : [],
          exerciseNote: eNote.note,
          exerciseImageUrl: eNote.imageUrl
        };
      });

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
        await AsyncStorage.removeItem(PERSIST_KEY);
        toast.success('Workout Saved! 💪', 'Fantastic session — keep it up!');
        setTimeout(() => router.replace('/(dashboard)/gym'), 1200);
      } else {
        toast.error('Save Failed', 'Failed to sync workout to server.');
        setActive(true); // resume on fail
      }
    } catch (e) {
      toast.error('Network Error', 'Could not reach the server.');
      setActive(true); // resume on fail
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
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
        <TouchableOpacity 
          onPress={() => {
            if (active) {
              Alert.alert('Pause Workout?', 'You can resume later, your progress is auto-saved locally.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Exit', style: 'destructive', onPress: () => router.back() }
              ]);
            } else {
              router.back();
            }
          }} 
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border }}
        >
          <ArrowLeft size={16} color={C.subtext} />
          <Text style={{ color: C.subtext, marginLeft: 6, fontWeight: '700', fontSize: 13 }}>{active ? 'Exit' : 'Cancel'}</Text>
        </TouchableOpacity>
        
        {active && (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border }}>
            <Timer size={14} color={C.primary} />
            <Text style={{ color: C.primary, marginLeft: 8, fontFamily: 'monospace', fontWeight: '900', fontSize: 14 }}>{formatTime(seconds)}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {!active && !selectedRoutine && (
          <View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: C.text, marginBottom: 24 }}>Start Session</Text>
            {loading ? <ActivityIndicator color={C.primary} /> : routines.map(r => (
              <TouchableOpacity
                key={r._id}
                onPress={() => setSelectedRoutine(r)}
                style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 16 }}
              >
                <Text style={{ color: C.text, fontWeight: '900', fontSize: 18, marginBottom: 6 }}>{r.routineName}</Text>
                <Text style={{ color: C.subtext, fontSize: 13, fontWeight: '700' }}>{r.splitDays?.length || 0} Split Days</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!active && selectedRoutine && !selectedDay && (
          <View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: C.text, marginBottom: 8 }}>{selectedRoutine.routineName}</Text>
            <Text style={{ color: C.muted, fontSize: 14, fontWeight: '600', marginBottom: 24 }}>Select your split day:</Text>
            
            {selectedRoutine.splitDays.map((d: any, idx: number) => (
              <TouchableOpacity
                key={idx}
                onPress={() => setSelectedDay(d)}
                style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 16 }}
              >
                <Text style={{ color: C.primary, fontWeight: '900', fontSize: 18, marginBottom: 6 }}>{d.dayName}</Text>
                <Text style={{ color: C.subtext, fontSize: 13, fontWeight: '700' }}>{d.exercises?.length || 0} Exercises</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {selectedDay && (
          <View>
            {!active ? (
               <TouchableOpacity 
                 onPress={toggleWorkout}
                 style={{ backgroundColor: C.primary, padding: 20, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}
               >
                 <Play size={20} color="#FFFDFC" fill="#FFFDFC" />
                 <Text style={{ color: '#FFFDFC', fontWeight: '900', fontSize: 18, marginLeft: 12, textTransform: 'uppercase', letterSpacing: 2 }}>Begin {selectedDay.dayName}</Text>
               </TouchableOpacity>
            ) : (
              <View style={{ flex: 1 }}>
                {/* Stepper Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <View style={{ flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, marginRight: 16, overflow: 'hidden' }}>
                    <Animated.View 
                      style={{ height: '100%', backgroundColor: C.primary, width: `${((currentExIdx + 1) / selectedDay.exercises.length) * 100}%` }}
                    />
                  </View>
                  <Text style={{ color: C.subtext, fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2 }}>
                    {currentExIdx + 1} / {selectedDay.exercises.length}
                  </Text>
                </View>

                {/* Active Exercise Card */}
                {selectedDay.exercises.map((ex: any, exIdx: number) => {
                  if (exIdx !== currentExIdx) return null;

                  const pastExRecord = history[ex.equipmentName];
                  const exNoteState = exerciseNotes[exIdx] || { note: '', imageUrl: '' };

                  return (
                    <Animated.View 
                      key={exIdx}
                      entering={SlideInRight}
                      exiting={SlideOutLeft}
                      style={{ flex: 1 }}
                    >
                      <View style={{ marginBottom: 24 }}>
                        {/* Muscle Graphic */}
                        <View style={{ height: 200, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 24, overflow: 'hidden', position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 1, borderColor: C.border }}>
                          <Image 
                            source={getMuscleImage(ex.equipmentName)}
                            style={{ width: '100%', height: '100%', opacity: 0.6 }}
                            resizeMode="contain"
                          />
                          <View style={{ position: 'absolute', bottom: 16, left: 24, right: 24 }}>
                            <Text style={{ color: '#FFFDFC', fontWeight: '900', fontSize: 26, textTransform: 'uppercase', letterSpacing: -1, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 0, height: 2}, textShadowRadius: 4 }} numberOfLines={2}>{ex.equipmentName}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                              <Zap size={14} color={C.primary} fill={C.primary} />
                              <Text style={{ color: C.primary, fontSize: 11, fontWeight: '900', marginLeft: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{selectedDay.dayName}</Text>
                            </View>
                          </View>
                        </View>

                        <View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, paddingHorizontal: 4 }}>
                            <View>
                              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Target</Text>
                              <Text style={{ color: C.text, fontWeight: '900', fontSize: 16 }}>{ex.targetSets} Sets × {ex.targetReps} Reps</Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                              <TouchableOpacity 
                                onPress={() => router.push(`/(dashboard)/gym/exercise/${encodeURIComponent(ex.equipmentName)}/progress`)}
                                style={{ backgroundColor: C.primaryBg, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}
                              >
                                <Text style={{ color: C.primary, fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>View Progress</Text>
                              </TouchableOpacity>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Ideal Rest</Text>
                              <Text style={{ color: C.primary, fontWeight: '900', fontSize: 16 }}>{ex.restSeconds}s</Text>
                            </View>
                          </View>

                          {/* Sets Logger */}
                          <View style={{ marginBottom: 24 }}>
                            {Array.from({ length: ex.targetSets }).map((_, setIdx) => {
                              const setData = logs[exIdx]?.[setIdx] || { repsDone: 0, weightUsed: 0, restSecondsTaken: 0, assisted: false, assistedAtRep: 0 };
                              const prevData = pastExRecord?.sets?.[setIdx];
                              
                              return (
                                <View key={setIdx} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 16 }}>
                                  
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <Text style={{ color: C.subtext, fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Set {setIdx + 1}</Text>
                                    
                                    <TouchableOpacity 
                                      onPress={() => handleSaveSet(exIdx, setIdx, 'assisted', !setData.assisted)}
                                      style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, backgroundColor: setData.assisted ? C.primaryBg : C.bg, borderColor: setData.assisted ? C.primary : C.border }}
                                    >
                                      <Text style={{ fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: setData.assisted ? C.primary : C.muted }}>Assist</Text>
                                    </TouchableOpacity>
                                  </View>

                                  {/* Progressive Overload Banner */}
                                  {prevData && (
                                    <View style={{ marginBottom: 16, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, padding: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                          <Text style={{ color: C.muted, fontWeight: '900', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5 }}>Last Session</Text>
                                          {prevData.assisted && (
                                            <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8 }}>
                                              <Text style={{ color: '#ef4444', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }}>Assisted</Text>
                                            </View>
                                          )}
                                        </View>
                                        <Text style={{ color: C.text, fontSize: 15, fontWeight: '900' }}>{prevData.weightUsed || 0}kg × {prevData.repsDone || 0} reps</Text>
                                      </View>
                                      <View style={{ backgroundColor: C.primaryBg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)', flexDirection: 'row', alignItems: 'center' }}>
                                        <TrendingUp size={14} color={C.primary} />
                                        <Text style={{ color: C.primary, fontSize: 10, fontWeight: '900', marginLeft: 6, textTransform: 'uppercase' }}>
                                          {(prevData.repsDone || 0) >= ex.targetReps ? 'Increase Wgt' : `Push ${ex.targetReps} reps`}
                                        </Text>
                                      </View>
                                    </View>
                                  )}

                                  <View style={{ flexDirection: 'row', marginBottom: 16, gap: 12 }}>
                                    <View style={{ flex: 1, backgroundColor: C.bg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border }}>
                                      <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Weight (kg)</Text>
                                      <TextInput
                                        keyboardType="decimal-pad"
                                        placeholder="0"
                                        placeholderTextColor={C.muted}
                                        value={getWeightText(exIdx, setIdx)}
                                        onChangeText={(v) => handleWeightChange(exIdx, setIdx, v)}
                                        style={{ color: C.text, fontWeight: '900', fontSize: 28, height: 40 }}
                                      />
                                    </View>
                                    <View style={{ flex: 1, backgroundColor: C.bg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border }}>
                                      <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Reps</Text>
                                      <TextInput
                                        keyboardType="decimal-pad"
                                        placeholder="0"
                                        placeholderTextColor={C.muted}
                                        value={setData.repsDone ? String(setData.repsDone) : ''}
                                        onChangeText={(v) => {
                                          const cleaned = v.replace(/[^0-9.]/g, '');
                                          handleSaveSet(exIdx, setIdx, 'repsDone', cleaned === '' ? 0 : parseFloat(cleaned) || 0);
                                        }}
                                        style={{ color: C.text, fontWeight: '900', fontSize: 28, height: 40 }}
                                      />
                                    </View>
                                  </View>

                                  {setData.assisted && (
                                    <Animated.View entering={FadeIn} style={{ marginBottom: 16, backgroundColor: C.primaryBg, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <Text style={{ color: C.primary, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>Assisted at rep #</Text>
                                      <TextInput
                                        keyboardType="numeric"
                                        placeholder="0"
                                        placeholderTextColor="rgba(232,65,74,0.4)"
                                        value={setData.assistedAtRep ? String(setData.assistedAtRep) : ''}
                                        onChangeText={(v) => handleSaveSet(exIdx, setIdx, 'assistedAtRep', Number(v))}
                                        style={{ color: C.primary, fontWeight: '900', fontSize: 18, backgroundColor: C.bg, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 4, minWidth: 60, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)' }}
                                      />
                                    </Animated.View>
                                  )}

                                  {/* Break List */}
                                  <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, marginLeft: 4 }}>Log Actual Rest</Text>
                                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                    {['45s', '1.5m', '2m', '3m', '3m+'].map((label) => {
                                      const valMap: any = { '45s': 45, '1.5m': 90, '2m': 120, '3m': 180, '3m+': 300 };
                                      const isSel = setData.restSecondsTaken === valMap[label];
                                      return (
                                        <TouchableOpacity 
                                          key={label}
                                          onPress={() => handleSaveSet(exIdx, setIdx, 'restSecondsTaken', valMap[label])}
                                          style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, backgroundColor: isSel ? C.text : C.bg, borderColor: isSel ? C.text : C.border }}
                                        >
                                          <Text style={{ fontSize: 11, fontWeight: '900', color: isSel ? C.bg : C.subtext }}>{label}</Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                  {/* Per-set note */}
                                  {(() => {
                                    const noteKey = `${exIdx}-${setIdx}`;
                                    const existingNote = getSetNote(exIdx, setIdx);
                                    const isExpanded = expandedSetNote === noteKey;
                                    return (
                                      <View style={{ marginTop: 8 }}>
                                        {existingNote && !isExpanded && (
                                          <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 }}>
                                            <Text style={{ color: C.muted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Last Note</Text>
                                            <Text style={{ color: C.subtext, fontSize: 13, fontWeight: '600' }}>{existingNote}</Text>
                                          </View>
                                        )}
                                        {isExpanded ? (
                                          <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.primary + '40' }}>
                                            <TextInput
                                              autoFocus
                                              placeholder="Note for this set..."
                                              placeholderTextColor={C.muted}
                                              value={existingNote}
                                              onChangeText={v => handleSaveSetNote(exIdx, setIdx, v)}
                                              multiline
                                              style={{ color: C.text, fontSize: 13, fontWeight: '600', minHeight: 36 }}
                                            />
                                            <TouchableOpacity onPress={() => setExpandedSetNote(null)} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
                                              <Text style={{ color: C.primary, fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Done</Text>
                                            </TouchableOpacity>
                                          </View>
                                        ) : (
                                          <TouchableOpacity
                                            onPress={() => setExpandedSetNote(noteKey)}
                                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}
                                          >
                                            <Text style={{ color: C.primary, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>
                                              {existingNote ? '✎ Edit Note' : '+ Add Note'}
                                            </Text>
                                          </TouchableOpacity>
                                        )}
                                      </View>
                                    );
                                  })()}
                                </View>
                              );
                            })}
                          </View>

                          {/* ── Routine Tip (read-only, from routine creator) ── */}
                          {(ex.exerciseNote || ex.exerciseImageUrl) && (
                            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 16, marginBottom: 16, marginTop: -8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                                <AlertCircle size={13} color={C.muted} />
                                <Text style={{ color: C.muted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginLeft: 6 }}>Routine Tip</Text>
                              </View>
                              {ex.exerciseNote ? (
                                <Text style={{ color: C.subtext, fontSize: 14, fontWeight: '600', lineHeight: 20 }}>{ex.exerciseNote}</Text>
                              ) : null}
                              {ex.exerciseImageUrl ? (
                                <Image source={{ uri: ex.exerciseImageUrl }} style={{ width: '100%', height: 140, borderRadius: 12, marginTop: 10 }} resizeMode="cover" />
                              ) : null}
                            </View>
                          )}

                          {/* Exercise Level Notes & Images */}
                          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 24 }}>
                            <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Exercise Media & Notes</Text>
                            
                            {/* Past Routine / History Notes Display */}
                            {(ex.exerciseNote || ex.exerciseImageUrl || pastExRecord?.exerciseNote || pastExRecord?.exerciseImageUrl) && (
                              <View style={{ marginBottom: 20, backgroundColor: C.bg, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                  <AlertCircle size={14} color={C.muted} />
                                  <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginLeft: 6 }}>Previous Notes</Text>
                                </View>
                                {ex.exerciseNote ? <Text style={{ color: C.subtext, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>{ex.exerciseNote}</Text> : null}
                                {pastExRecord?.exerciseNote && !ex.exerciseNote ? <Text style={{ color: C.subtext, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>{pastExRecord.exerciseNote}</Text> : null}
                                
                                {ex.exerciseImageUrl ? (
                                  <Image source={{ uri: ex.exerciseImageUrl }} style={{ width: '100%', height: 160, borderRadius: 12, marginTop: 8 }} resizeMode="cover" />
                                ) : pastExRecord?.exerciseImageUrl ? (
                                  <Image source={{ uri: pastExRecord.exerciseImageUrl }} style={{ width: '100%', height: 160, borderRadius: 12, marginTop: 8 }} resizeMode="cover" />
                                ) : null}
                              </View>
                            )}

                            {/* Live Input */}
                            <View style={{ backgroundColor: C.bg, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 }}>Live Session Notes</Text>
                                {!exNoteState.imageUrl && (
                                  <TouchableOpacity onPress={() => pickLiveImage(exIdx)} style={{ padding: 4, backgroundColor: C.card, borderRadius: 8 }}>
                                    <Camera size={16} color={C.primary} />
                                  </TouchableOpacity>
                                )}
                              </View>
                              <TextInput
                                placeholder="Add a note for this exercise..."
                                placeholderTextColor={C.muted}
                                value={exNoteState.note}
                                onChangeText={(val) => handleSaveExNote(exIdx, 'note', val)}
                                multiline
                                style={{ color: C.text, fontSize: 14, fontWeight: '600', minHeight: 40 }}
                              />
                              {exNoteState.imageUrl && (
                                <View style={{ marginTop: 16, position: 'relative', width: '100%', height: 160, borderRadius: 12, overflow: 'hidden' }}>
                                  <Image source={{ uri: exNoteState.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                  <TouchableOpacity 
                                    onPress={() => handleSaveExNote(exIdx, 'imageUrl', '')}
                                    style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.8)', padding: 8, borderRadius: 16 }}
                                  >
                                    <X size={14} color="#FFFDFC" />
                                  </TouchableOpacity>
                                </View>
                              )}
                            </View>
                          </View>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Navigation Buttons (Sticky Bottom) */}
      {!loading && active && selectedDay && selectedDay.exercises && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 32, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity 
            onPress={() => setCurrentExIdx(prev => Math.max(0, prev - 1))}
            disabled={currentExIdx === 0}
            style={{ flex: 1, height: 64, backgroundColor: C.card, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, opacity: currentExIdx === 0 ? 0.4 : 1 }}
          >
            <ChevronLeft size={24} color={C.subtext} />
          </TouchableOpacity>

          {currentExIdx < selectedDay.exercises.length - 1 ? (
            <TouchableOpacity 
              onPress={() => setCurrentExIdx(prev => prev + 1)}
              style={{ flex: 3, height: 64, backgroundColor: C.primary, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: '#FFFDFC', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, fontSize: 14 }}>Next Exercise</Text>
                <ChevronRight size={20} color="#FFFDFC" style={{ marginLeft: 8 }} />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              onPress={finishWorkout}
              disabled={saving}
              style={{ flex: 3, height: 64, backgroundColor: C.text, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
            >
              {saving ? <ActivityIndicator color={C.bg} /> : (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: C.bg, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, fontSize: 14 }}>Finish Session</Text>
                  <Save size={18} color={C.bg} style={{ marginLeft: 8 }} />
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
