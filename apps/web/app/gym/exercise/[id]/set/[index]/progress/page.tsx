"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, BarChart2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

function gradeStyle(grade: string) {
  switch (grade) {
    case "S": return { label: "S", color: "text-gray-100", border: "border-gray-100/30", bg: "bg-gray-100/10" };
    case "A": return { label: "A", color: "text-gray-100", border: "border-gray-100/30", bg: "bg-gray-100/10" };
    case "B": return { label: "B", color: "text-gray-300", border: "border-gray-300/30", bg: "bg-gray-300/10" };
    case "C": return { label: "C", color: "text-gray-500", border: "border-gray-500/30", bg: "bg-gray-500/10" };
    case "D": return { label: "D", color: "text-[#E8414A]", border: "border-[#E8414A]/30", bg: "bg-[#E8414A]/10" };
    case "F": return { label: "F", color: "text-[#E8414A]", border: "border-[#E8414A]/30", bg: "bg-[#E8414A]/10" };
    default: return { label: grade, color: "text-gray-600", border: "border-[#2A2B2F]", bg: "bg-[#161618]" };
  }
}

export default function SpecificSetProgressPage() {
  const router = useRouter();
  const params = useParams();
  
  const rawId = params?.id as string;
  const rawIndex = params?.index as string;
  
  const equipmentName = rawId ? decodeURIComponent(rawId) : "";
  const setIndex = parseInt(rawIndex || "1", 10);

  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/gym/exercise-progress/set?equipmentName=${encodeURIComponent(equipmentName)}&setIndex=${setIndex}`);
        if (res.ok) setHistory(await res.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    if (equipmentName) loadData();
  }, [equipmentName, setIndex]);

  const chartItems = history.slice(-10);
  const chartData = chartItems.map(h => ({
    name: new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    weight: h.weight || 0
  })).filter((d: any) => d.weight > 0);

  const hasData = chartData.length > 0;

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
          <div className="text-[#E8414A] font-bold text-[10px] uppercase tracking-widest mt-1">Set {setIndex}</div>
        </div>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin mb-4" />
          </div>
        ) : !hasData ? (
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-12 flex flex-col items-center justify-center text-center mt-8 shadow-sm">
            <BarChart2 size={48} className="text-gray-600 mb-4" />
            <h2 className="text-gray-100 font-bold text-xl mb-2">No data yet</h2>
            <p className="text-gray-500 font-semibold text-sm">Complete this set at least once to see your progress chart.</p>
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* Weight Chart */}
            <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 shadow-sm">
              <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-6">Weight Over Time (kg)</div>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="name" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#1F2023", borderColor: "#2A2B2F", borderRadius: "12px", color: "#F3F4F6", fontWeight: "bold" }}
                      itemStyle={{ color: "#E8414A" }}
                    />
                    <Line type="monotone" dataKey="weight" stroke="#E8414A" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: "#1F2023", stroke: "#E8414A" }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* History Breakdown */}
            <div>
              <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-4 ml-2">Performance History</div>
              
              <div className="space-y-4">
                {[...history].reverse().map((set: any, idx: number) => {
                  const grade = set.progression?.overloadGrade || "N/A";
                  const { label, color, border, bg } = gradeStyle(grade);
                  const dateLabel = new Date(set.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  const delta = set.progression?.progressionDelta ?? 0;

                  return (
                    <div key={idx} className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 shadow-sm hover:border-gray-700 transition-colors">
                      <div className="flex items-center justify-between mb-6 pb-6 border-b border-[#2A2B2F]">
                        <span className="text-gray-100 font-bold text-sm md:text-base">{dateLabel}</span>
                        <div className={`px-3 py-1.5 rounded-lg border ${border} ${bg}`}>
                          <span className={`${color} font-bold text-[10px] uppercase tracking-widest`}>Grade {label}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-gray-500 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-2">Weight</div>
                          <div className="text-gray-100 font-bold text-sm md:text-base">{set.weight}kg</div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-2">Reps</div>
                          <div className="text-gray-100 font-bold text-sm md:text-base">
                            {set.reps} <span className="text-gray-500">/ {set.targetReps}</span>
                          </div>
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
                              {delta > 0 ? '+' : ''}{typeof delta === 'number' ? delta.toFixed(1) : delta}kg
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
