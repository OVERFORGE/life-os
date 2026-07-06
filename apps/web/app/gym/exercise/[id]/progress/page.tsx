"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Target, TrendingUp, TrendingDown, Minus, BarChart2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

function gradeStyle(grade: string) {
  switch (grade) {
    case "S": return { color: "text-gray-100", bg: "bg-gray-100/10", border: "border-gray-100/20" };
    case "A": return { color: "text-gray-300", bg: "bg-gray-300/10", border: "border-gray-300/20" };
    case "B": return { color: "text-gray-400", bg: "bg-gray-400/10", border: "border-gray-400/20" };
    case "C": return { color: "text-gray-500", bg: "bg-gray-800", border: "border-[#2A2B2F]" };
    case "D": return { color: "text-[#E8414A]", bg: "bg-[#E8414A]/10", border: "border-[#E8414A]/20" };
    case "F": return { color: "text-[#E8414A]", bg: "bg-[#E8414A]/10", border: "border-[#E8414A]/40" };
    default: return { color: "text-gray-500", bg: "bg-[#1F2023]", border: "border-[#2A2B2F]" };
  }
}

function scoreColorClass(score: number) {
  if (score >= 70) return "text-gray-100";
  if (score >= 40) return "text-gray-300";
  return "text-[#E8414A]";
}

function scoreBorderColorClass(score: number) {
  if (score >= 70) return "border-gray-100/40";
  if (score >= 40) return "border-gray-300/40";
  return "border-[#E8414A]/40";
}

function scoreBgColorClass(score: number) {
  if (score >= 70) return "bg-gray-100/10";
  if (score >= 40) return "bg-gray-300/10";
  return "bg-[#E8414A]/10";
}

export default function ExerciseProgressPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.id as string;
  const equipmentName = rawId ? decodeURIComponent(rawId) : "";
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/gym/exercise-progress?equipmentName=${encodeURIComponent(equipmentName)}`);
        if (res.ok) setData(await res.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    if (equipmentName) loadData();
  }, [equipmentName]);

  const buildChartData = () => {
    if (!data?.history?.length) return [];
    const chrono = [...data.history].reverse().slice(-10);
    return chrono.map((h: any) => ({
      name: new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weight: h.weight || 0,
    })).filter((d: any) => d.weight > 0);
  };

  const chartData = buildChartData();

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
        <div className="flex-1 text-center">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-gray-100">{equipmentName}</h1>
        </div>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin mb-4" />
            <span className="text-gray-400 font-bold text-xs uppercase tracking-widest">Loading Intelligence...</span>
          </div>
        ) : !data ? (
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-12 flex flex-col items-center justify-center text-center mt-8 shadow-sm">
            <BarChart2 size={48} className="text-gray-600 mb-4" />
            <h2 className="text-gray-100 font-bold text-xl mb-2">No data yet</h2>
            <p className="text-gray-500 font-semibold text-sm">Log this exercise at least once to unlock AI analysis.</p>
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* Score Card */}
            <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 flex items-center justify-between shadow-sm">
              <div>
                <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-3">Intelligence Score</div>
                <div className="flex items-baseline">
                  <span className={`${scoreColorClass(data.score)} font-black text-5xl md:text-6xl`}>{data.score}</span>
                  <span className="text-gray-500 text-xl font-bold ml-2">/100</span>
                </div>
              </div>
              <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center ${scoreBgColorClass(data.score)} ${scoreBorderColorClass(data.score)}`}>
                <span className={`${scoreColorClass(data.score)} font-black text-3xl`}>
                  {data.score >= 70 ? "↑" : data.score >= 40 ? "→" : "↓"}
                </span>
              </div>
            </div>

            {/* Weight Chart */}
            {chartData.length > 0 && (
              <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 shadow-sm">
                <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-6">Weight Trend (kg)</div>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="name" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#1F2023", borderColor: "#2A2B2F", borderRadius: "12px", color: "#F3F4F6", fontWeight: "bold" }}
                        itemStyle={{ color: "#E8414A" }}
                      />
                      <Line type="monotone" dataKey="weight" stroke="#E8414A" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: "#1F2023", stroke: "#E8414A" }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* AI Insights */}
            {data.insights?.length > 0 && (
              <div>
                <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-4 ml-2">AI Analysis</div>
                <div className="space-y-3">
                  {data.insights.map((insight: string, idx: number) => (
                    <div key={idx} className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 flex items-start gap-4 shadow-sm">
                      <Target size={18} className="text-[#E8414A] shrink-0 mt-0.5" />
                      <p className="text-gray-300 font-semibold text-sm leading-relaxed">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* History Breakdown */}
            <div>
              <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-4 ml-2">Set History</div>
              
              <div className="space-y-4">
                {data.history?.map((set: any, idx: number) => {
                  const grade = set.progression?.overloadGrade || "N/A";
                  const gs = gradeStyle(grade);
                  const dateLabel = new Date(set.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  const delta = set.progression?.progressionDelta ?? 0;

                  return (
                    <div key={idx} className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 shadow-sm hover:border-gray-700 transition-colors">
                      <div className="flex items-center justify-between mb-6 pb-6 border-b border-[#2A2B2F]">
                        <div className="flex items-center gap-3">
                          <span className="text-gray-100 font-bold text-sm md:text-base">{dateLabel}</span>
                          <span className="text-gray-500 font-bold text-xs md:text-sm">Set {set.setIndex}</span>
                        </div>
                        <div className={`px-3 py-1.5 rounded-lg border ${gs.bg} ${gs.border}`}>
                          <span className={`${gs.color} font-bold text-[10px] uppercase tracking-widest`}>Grade {grade}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-gray-500 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-2">Performance</div>
                          <div className="text-gray-100 font-bold text-sm md:text-base">{set.weight}kg × {set.reps}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-2">Target</div>
                          <div className="text-gray-100 font-bold text-sm md:text-base">{set.targetReps} reps</div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-2">Change</div>
                          <div className="flex items-center gap-1">
                            {delta > 0
                              ? <TrendingUp size={14} className="text-gray-100" />
                              : delta < 0
                              ? <TrendingDown size={14} className="text-[#E8414A]" />
                              : <Minus size={14} className="text-gray-500" />}
                            <span className={`font-bold text-sm md:text-base ${delta > 0 ? 'text-gray-100' : delta < 0 ? 'text-[#E8414A]' : 'text-gray-500'}`}>
                              {delta > 0 ? '+' : ''}{typeof delta === 'number' ? delta.toFixed(1) : delta}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {(!data.history || data.history.length === 0) && (
                  <div className="border border-dashed border-[#2A2B2F] rounded-2xl p-10 flex justify-center">
                    <span className="text-gray-500 font-semibold text-sm">No set history available yet.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
