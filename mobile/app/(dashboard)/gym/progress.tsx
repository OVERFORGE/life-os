import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../../utils/api';
import { ArrowLeft, Target, TrendingUp, Flame, Shield, AlertTriangle, ChevronDown, ChevronUp, Dumbbell, Activity } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

export default function GymProgressDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  // For Accordions
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/gym/progress');
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Elite': return '#a855f7';
      case 'Progressing': return '#10b981';
      case 'Stable': return '#3b82f6';
      case 'Plateau': return '#f59e0b';
      case 'Regressing': return '#ef4444';
      default: return C.muted;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#a855f7';
    if (score >= 70) return '#10b981';
    if (score >= 40) return '#3b82f6';
    if (score >= 20) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.card, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
          <ArrowLeft size={18} color={C.subtext} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '900', color: C.text, marginLeft: 16 }}>Fitness Intelligence</Text>
      </View>

      <ScrollView 
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor={C.primary} />}
      >
        {!data && !loading ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 80 }}>
            <Text style={{ color: C.muted, fontWeight: '600' }}>Failed to load intelligence data.</Text>
          </View>
        ) : data ? (
          <>
            {/* Section A - Fitness Card */}
            <View style={{ marginBottom: 32 }}>
              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, marginLeft: 4 }}>Overall Profile</Text>
              
              <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 24 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <View>
                    <Text style={{ color: C.subtext, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Current Phase</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: getStatusColor(data.status), marginRight: 8 }} />
                      <Text style={{ color: C.text, fontWeight: '900', fontSize: 24 }}>{data.status}</Text>
                    </View>
                  </View>
                  <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: getStatusColor(data.status), backgroundColor: `${getStatusColor(data.status)}1A` }}>
                    <Text style={{ color: '#FFFDFC', fontWeight: '900', fontSize: 24 }}>{data.score}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, backgroundColor: C.bg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Flame size={14} color="#f59e0b" style={{ marginRight: 6 }} />
                      <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '700' }}>Consistency</Text>
                    </View>
                    <Text style={{ color: C.text, fontWeight: '900', fontSize: 20 }}>{data.consistencyScore}%</Text>
                  </View>
                  
                  <View style={{ flex: 1, backgroundColor: C.bg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Target size={14} color="#a855f7" style={{ marginRight: 6 }} />
                      <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '700' }}>Weekly Target</Text>
                    </View>
                    <Text style={{ color: C.text, fontWeight: '900', fontSize: 20 }}>{data.actualWeeklySessions} <Text style={{ color: C.muted, fontSize: 14 }}>/ {data.expectedWeeklySessions}</Text></Text>
                  </View>
                </View>
              </View>
            </View>

            {/* AI Insights */}
            <View style={{ marginBottom: 32 }}>
              <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, marginLeft: 4 }}>Intelligence Assessment</Text>
              
              {data.status === 'Progressing' || data.status === 'Elite' ? (
                <View style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'flex-start' }}>
                  <TrendingUp size={20} color="#10b981" style={{ marginTop: 2, marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#34d399', fontWeight: '900', marginBottom: 6, fontSize: 16 }}>Excellent Trajectory</Text>
                    <Text style={{ color: 'rgba(52,211,153,0.8)', fontSize: 14, lineHeight: 22, fontWeight: '600' }}>Your consistency is solid and you are maintaining progressive overload across multiple exercises. Keep up the intensity.</Text>
                  </View>
                </View>
              ) : data.status === 'Stable' ? (
                <View style={{ backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'flex-start' }}>
                  <Shield size={20} color="#3b82f6" style={{ marginTop: 2, marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#60a5fa', fontWeight: '900', marginBottom: 6, fontSize: 16 }}>Maintaining Baseline</Text>
                    <Text style={{ color: 'rgba(96,165,250,0.8)', fontSize: 14, lineHeight: 22, fontWeight: '600' }}>You are completing your sessions but strength progression has flattened. Consider increasing volume or load next week.</Text>
                  </View>
                </View>
              ) : (
                <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'flex-start' }}>
                  <AlertTriangle size={20} color="#ef4444" style={{ marginTop: 2, marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#f87171', fontWeight: '900', marginBottom: 6, fontSize: 16 }}>Fatigue or Regression Detected</Text>
                    <Text style={{ color: 'rgba(248,113,113,0.8)', fontSize: 14, lineHeight: 22, fontWeight: '600' }}>Your workout frequency has dropped, or your 1RM is regressing. Ensure you are eating enough and recovering properly.</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Routine Hierarchy Breakdown */}
            {data.activeRoutine && (
              <View style={{ marginBottom: 48 }}>
                <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, marginLeft: 4 }}>Routine Progression Drill-down</Text>
                
                {data.activeRoutine.splitDays.map((day: any, dIdx: number) => (
                  <Animated.View key={dIdx} entering={FadeInDown.delay(dIdx * 100)} style={{ marginBottom: 12 }}>
                    <TouchableOpacity 
                      onPress={() => setExpandedDay(expandedDay === day.dayName ? null : day.dayName)}
                      style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Dumbbell size={20} color={C.primary} />
                        <View style={{ marginLeft: 12 }}>
                          <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 2 }}>{day.dayName}</Text>
                          <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '700' }}>Day Score: <Text style={{ color: getScoreColor(day.score), fontWeight: '900' }}>{day.score}</Text></Text>
                        </View>
                      </View>
                      {expandedDay === day.dayName ? <ChevronUp color={C.subtext} size={20} /> : <ChevronDown color={C.subtext} size={20} />}
                    </TouchableOpacity>

                    {expandedDay === day.dayName && (
                      <View style={{ paddingLeft: 16, marginTop: 8 }}>
                        {day.exercises.map((ex: any, eIdx: number) => {
                          const exerciseId = `${day.dayName}-${ex.equipmentName}`;
                          const isExExpanded = expandedExercise === exerciseId;
                          
                          return (
                            <View key={eIdx} style={{ marginBottom: 8 }}>
                              <TouchableOpacity 
                                onPress={() => setExpandedExercise(isExExpanded ? null : exerciseId)}
                                style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Activity size={16} color="#a855f7" />
                                  <View style={{ marginLeft: 12 }}>
                                    <Text style={{ color: '#e5e7eb', fontWeight: '800', fontSize: 14, marginBottom: 2 }}>{ex.equipmentName}</Text>
                                    <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Ex. Score: <Text style={{ color: getScoreColor(ex.score), fontWeight: '900' }}>{ex.score}</Text></Text>
                                  </View>
                                </View>
                                {isExExpanded ? <ChevronUp color={C.muted} size={16} /> : <ChevronDown color={C.muted} size={16} />}
                              </TouchableOpacity>

                              {isExExpanded && ex.setScores && (
                                <View style={{ paddingLeft: 16, paddingRight: 4, marginTop: 8, marginBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                  {ex.setScores.map((setObj: any, sIdx: number) => (
                                    <TouchableOpacity 
                                      key={sIdx}
                                      onPress={() => router.push(`/(dashboard)/gym/exercise/${encodeURIComponent(ex.equipmentName)}/set/${setObj.setIndex}/progress`)}
                                      style={{ width: '48%', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12 }}
                                    >
                                      <Text style={{ color: C.muted, fontWeight: '900', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Set {setObj.setIndex}</Text>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Text style={{ color: getScoreColor(setObj.score), fontWeight: '900', fontSize: 20 }}>{setObj.score}</Text>
                                        <TrendingUp size={16} color={getScoreColor(setObj.score)} />
                                      </View>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </Animated.View>
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
