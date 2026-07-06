"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Target, TrendingUp, Flame, Shield, AlertTriangle, ChevronDown, ChevronUp, Dumbbell, Activity } from "lucide-react";

export default function GymProgressDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  // For Accordions
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gym/progress");
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

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case "Elite": return "text-purple-500 border-purple-500 bg-purple-500/10";
      case "Progressing": return "text-emerald-500 border-emerald-500 bg-emerald-500/10";
      case "Stable": return "text-blue-500 border-blue-500 bg-blue-500/10";
      case "Plateau": return "text-amber-500 border-amber-500 bg-amber-500/10";
      case "Regressing": return "text-red-500 border-red-500 bg-red-500/10";
      default: return "text-gray-500 border-gray-500 bg-gray-500/10";
    }
  };

  const getStatusColorHex = (status: string) => {
    switch (status) {
      case "Elite": return "#a855f7";
      case "Progressing": return "#10b981";
      case "Stable": return "#3b82f6";
      case "Plateau": return "#f59e0b";
      case "Regressing": return "#ef4444";
      default: return "#6b7280";
    }
  };

  const getScoreColorHex = (score: number) => {
    if (score >= 90) return "#a855f7";
    if (score >= 70) return "#10b981";
    if (score >= 40) return "#3b82f6";
    if (score >= 20) return "#f59e0b";
    return "#ef4444";
  };
  
  const getScoreColorClass = (score: number) => {
    if (score >= 90) return "text-purple-500";
    if (score >= 70) return "text-emerald-500";
    if (score >= 40) return "text-blue-500";
    if (score >= 20) return "text-amber-500";
    return "text-red-500";
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] transition-colors shadow-sm"
        >
          <ArrowLeft size={18} className="text-gray-300" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-100">Fitness Intelligence</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-8">
        {!data && !loading ? (
          <div className="flex justify-center py-20">
            <span className="text-gray-500 font-semibold">Failed to load intelligence data.</span>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
          </div>
        ) : data ? (
          <div className="space-y-12">
            
            {/* Section A - Fitness Card */}
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 ml-2">Overall Profile</div>
              
              <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-gray-400 text-sm font-bold mb-2">Current Phase</h3>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStatusColorHex(data.status) }} />
                      <span className="text-gray-100 font-black text-2xl md:text-3xl">{data.status}</span>
                    </div>
                  </div>
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full border-4 flex items-center justify-center ${getStatusColorClass(data.status)}`}>
                    <span className="text-white font-black text-xl md:text-2xl">{data.score}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#161618] rounded-2xl p-5 border border-[#2A2B2F]">
                    <div className="flex items-center gap-2 mb-2">
                      <Flame size={16} className="text-amber-500" />
                      <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Consistency</span>
                    </div>
                    <div className="text-gray-100 font-black text-2xl">{data.consistencyScore}%</div>
                  </div>
                  
                  <div className="bg-[#161618] rounded-2xl p-5 border border-[#2A2B2F]">
                    <div className="flex items-center gap-2 mb-2">
                      <Target size={16} className="text-purple-500" />
                      <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Weekly Target</span>
                    </div>
                    <div className="text-gray-100 font-black text-2xl">
                      {data.actualWeeklySessions} <span className="text-gray-500 text-lg">/ {data.expectedWeeklySessions}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Insights */}
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 ml-2">Intelligence Assessment</div>
              
              {data.status === 'Progressing' || data.status === 'Elite' ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 flex items-start gap-4 shadow-sm">
                  <TrendingUp size={24} className="text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-emerald-400 font-bold text-lg mb-2">Excellent Trajectory</h3>
                    <p className="text-emerald-400/80 font-semibold text-sm leading-relaxed">Your consistency is solid and you are maintaining progressive overload across multiple exercises. Keep up the intensity.</p>
                  </div>
                </div>
              ) : data.status === 'Stable' ? (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 flex items-start gap-4 shadow-sm">
                  <Shield size={24} className="text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-blue-400 font-bold text-lg mb-2">Maintaining Baseline</h3>
                    <p className="text-blue-400/80 font-semibold text-sm leading-relaxed">You are completing your sessions but strength progression has flattened. Consider increasing volume or load next week.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex items-start gap-4 shadow-sm">
                  <AlertTriangle size={24} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-red-400 font-bold text-lg mb-2">Fatigue or Regression Detected</h3>
                    <p className="text-red-400/80 font-semibold text-sm leading-relaxed">Your workout frequency has dropped, or your 1RM is regressing. Ensure you are eating enough and recovering properly.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Routine Hierarchy Breakdown */}
            {data.activeRoutine && (
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 ml-2">Routine Progression Drill-down</div>
                
                <div className="space-y-4">
                  {data.activeRoutine.splitDays.map((day: any, dIdx: number) => (
                    <div key={dIdx} className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${dIdx * 100}ms`, animationFillMode: 'both' }}>
                      <button 
                        onClick={() => setExpandedDay(expandedDay === day.dayName ? null : day.dayName)}
                        className={`w-full bg-[#1F2023] border ${expandedDay === day.dayName ? 'border-[#E8414A]/30' : 'border-[#2A2B2F] hover:border-gray-500'} rounded-2xl p-5 flex items-center justify-between transition-colors shadow-sm`}
                      >
                        <div className="flex items-center gap-4 text-left">
                          <Dumbbell size={24} className="text-[#E8414A]" />
                          <div>
                            <h3 className="text-gray-100 font-bold text-lg mb-1">{day.dayName}</h3>
                            <div className="text-gray-400 text-xs font-bold uppercase tracking-widest">
                              Day Score: <span className={`${getScoreColorClass(day.score)} font-black text-sm ml-1`}>{day.score}</span>
                            </div>
                          </div>
                        </div>
                        {expandedDay === day.dayName ? <ChevronUp className="text-gray-500" /> : <ChevronDown className="text-gray-500" />}
                      </button>

                      {expandedDay === day.dayName && (
                        <div className="pl-4 md:pl-8 pt-4 space-y-3 relative before:absolute before:left-6 md:before:left-10 before:top-4 before:bottom-4 before:w-px before:bg-[#2A2B2F]">
                          {day.exercises.map((ex: any, eIdx: number) => {
                            const exerciseId = `${day.dayName}-${ex.equipmentName}`;
                            const isExExpanded = expandedExercise === exerciseId;
                            
                            return (
                              <div key={eIdx} className="relative z-10 ml-4">
                                <button 
                                  onClick={() => setExpandedExercise(isExExpanded ? null : exerciseId)}
                                  className={`w-full bg-[#161618] border ${isExExpanded ? 'border-purple-500/30' : 'border-[#2A2B2F] hover:border-gray-500'} rounded-xl p-4 flex items-center justify-between transition-colors shadow-sm`}
                                >
                                  <div className="flex items-center gap-3 text-left">
                                    <Activity size={18} className="text-purple-500" />
                                    <div>
                                      <h4 className="text-gray-200 font-bold text-sm mb-1">{ex.equipmentName}</h4>
                                      <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">
                                        Ex. Score: <span className={`${getScoreColorClass(ex.score)} font-black text-xs ml-1`}>{ex.score}</span>
                                      </div>
                                    </div>
                                  </div>
                                  {isExExpanded ? <ChevronUp className="text-gray-500" size={18} /> : <ChevronDown className="text-gray-500" size={18} />}
                                </button>

                                {isExExpanded && ex.setScores && (
                                  <div className="grid grid-cols-2 gap-3 mt-3 ml-2">
                                    {ex.setScores.map((setObj: any, sIdx: number) => (
                                      <button 
                                        key={sIdx}
                                        onClick={() => router.push(`/gym/exercise/${encodeURIComponent(ex.equipmentName)}/set/${setObj.setIndex}/progress`)}
                                        className="bg-[#1F2023] border border-[#2A2B2F] hover:border-[#E8414A]/30 rounded-xl p-4 flex flex-col justify-between transition-colors text-left group shadow-sm"
                                      >
                                        <div className="text-gray-500 font-bold text-[10px] uppercase tracking-widest mb-3">Set {setObj.setIndex}</div>
                                        <div className="flex items-center justify-between">
                                          <span className={`${getScoreColorClass(setObj.score)} font-black text-xl`}>{setObj.score}</span>
                                          <TrendingUp size={18} className={`${getScoreColorClass(setObj.score)} group-hover:scale-110 transition-transform`} />
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
