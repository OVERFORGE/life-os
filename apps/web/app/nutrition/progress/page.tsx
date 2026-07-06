"use client";

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, ChevronLeft, ChevronRight, Flame 
} from 'lucide-react';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getLocalDateString(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekBounds(weekOffset: number): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

function formatWeekLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function CaloriesChartPage() {
  const router = useRouter();
  
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [targetCalories, setTargetCalories] = useState(2000);

  const { start: weekStart, end: weekEnd } = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const startStr = getLocalDateString(weekStart);
      const endStr = getLocalDateString(weekEnd);
      const [logsRes, ctxRes] = await Promise.allSettled([
        fetch(`/api/nutrition/log?startDate=${startStr}&endDate=${endStr}&_t=${Date.now()}`),
        fetch('/api/health/context'), // Using standard /api prefix for web, or skip if not available
      ]);
      
      if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
        const d = await logsRes.value.json();
        setLogs(d.logs || []);
      }
      
      if (ctxRes.status === 'fulfilled' && ctxRes.value.ok) {
        const d = await ctxRes.value.json();
        setTargetCalories(d.data?.biometrics?.targetCalories || 2000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr = getLocalDateString(d);
    const log = logs.find(l => l.date === dateStr);
    const calories = log?.dailyTotals?.calories || log?.meals?.reduce((sum: number, m: any) => sum + (m.macros?.calories || 0), 0) || 0;
    return {
      date: d,
      dateStr,
      dayName: DAY_NAMES[i],
      calories,
      hasData: !!log,
    };
  });

  const maxCal = Math.max(...days.map(d => d.calories || 0), (targetCalories || 2000) * 1.3, 500);
  const safeMax = isNaN(maxCal) || maxCal <= 0 ? 2600 : maxCal;
  const BAR_H = 200;

  const barColor = (cals: number) => {
    if (cals === 0) return '#2A2B2F';
    if (cals <= targetCalories * 0.95) return 'rgba(236,231,227,0.5)';
    if (cals <= targetCalories * 1.1) return '#E8414A';
    return '#B42129';
  };

  const todayStr = getLocalDateString(new Date());
  const totalCals = days.reduce((s, d) => s + d.calories, 0);
  const daysLogged = days.filter(d => d.hasData).length;
  const avgCals = daysLogged > 0 ? Math.round(totalCals / daysLogged) : 0;

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-7xl mx-auto w-full relative">
      
      {/* Header */}
      <div className="flex items-center gap-4 px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
        >
          <ArrowLeft className="text-gray-400" size={18} />
        </button>
        <div>
          <h1 className="text-3xl font-black text-gray-100 tracking-tight">Calorie History</h1>
          <p className="text-[10px] font-bold text-gray-400 tracking-[0.2em] uppercase mt-1">
            Weekly View
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-32">
        
        {/* Week Navigator */}
        <div className="flex items-center justify-between bg-[#1F2023] rounded-3xl border border-[#2A2B2F] px-6 py-4 mb-8">
          <button 
            onClick={() => setWeekOffset(o => o - 1)}
            className="w-10 h-10 rounded-xl bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
          >
            <ChevronLeft className="text-gray-400" size={20} />
          </button>
          
          <div className="text-center">
            <div className="text-base font-black text-gray-100">
              {formatWeekLabel(weekStart, weekEnd)}
            </div>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
              {weekOffset === 0 ? 'Current Week' : weekOffset === -1 ? 'Last Week' : `${Math.abs(weekOffset)} weeks ago`}
            </div>
          </div>

          <button 
            onClick={() => setWeekOffset(o => Math.min(0, o + 1))}
            disabled={weekOffset === 0}
            className="w-10 h-10 rounded-xl bg-[#161618] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="text-gray-400" size={20} />
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-[#1F2023] rounded-3xl border border-[#2A2B2F] p-6 text-center">
            <div className="text-3xl font-black text-gray-100">{avgCals || '—'}</div>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2">Avg / Day</div>
          </div>
          <div className="bg-[#1F2023] rounded-3xl border border-[#2A2B2F] p-6 text-center">
            <div className="text-3xl font-black text-gray-100">{targetCalories}</div>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2">Target</div>
          </div>
          <div className="bg-[#1F2023] rounded-3xl border border-[#2A2B2F] p-6 text-center">
            <div className="text-3xl font-black text-gray-100">{daysLogged}/7</div>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2">Days Logged</div>
          </div>
        </div>

        {/* Bar Chart */}
        {loading ? (
          <div className="flex justify-center items-center h-[300px] bg-[#1F2023] rounded-3xl border border-[#2A2B2F]">
            <div className="w-8 h-8 border-2 border-[#E8414A] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-[#1F2023] rounded-3xl border border-[#2A2B2F] p-6 md:p-8">
            <div className="flex items-center mb-10">
              <Flame className="text-[#E8414A]" size={16} />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-3">
                Daily Calories
              </span>
            </div>

            <div className="relative" style={{ height: BAR_H + 40 }}>
              {/* Target dashed line */}
              <div 
                className="absolute left-0 right-0 border-b border-dashed border-[#E8414A]/50 z-0" 
                style={{ top: BAR_H - ((targetCalories || 2000) / safeMax) * BAR_H }} 
              />
              <div 
                className="absolute right-0 text-[#E8414A] text-xs font-bold" 
                style={{ top: BAR_H - ((targetCalories || 2000) / safeMax) * BAR_H - 18 }}
              >
                {targetCalories} target
              </div>

              {/* Bars */}
              <div className="absolute inset-0 bottom-[40px] flex items-end gap-3 md:gap-6 z-10">
                {days.map((day, i) => {
                  const barH = day.calories > 0 ? Math.max(10, (day.calories / safeMax) * BAR_H) : 4;
                  const isToday = day.dateStr === todayStr;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end" style={{ height: BAR_H }}>
                      {day.calories > 0 && (
                        <div className="text-[10px] font-bold text-gray-300 mb-2">
                          {Math.round(day.calories)}
                        </div>
                      )}
                      <div 
                        className={`w-full rounded-t-xl transition-all duration-500 ${isToday ? 'opacity-100 border-x border-t border-gray-100/20' : 'opacity-80'}`}
                        style={{ height: barH, backgroundColor: barColor(day.calories) }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* X axis day names */}
              <div className="absolute bottom-0 left-0 right-0 flex gap-3 md:gap-6">
                {days.map((day, i) => {
                  const isToday = day.dateStr === todayStr;
                  return (
                    <div key={i} className="flex-1 text-center">
                      <div className={`text-[10px] font-bold ${isToday ? 'text-[#E8414A]' : 'text-gray-500'}`}>{day.dayName}</div>
                      <div className="text-[10px] text-gray-600">{day.date.getDate()}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-6 mt-12">
              {[
                { color: 'rgba(236,231,227,0.5)', label: 'Under target' }, 
                { color: '#E8414A', label: 'On target' }, 
                { color: '#B42129', label: 'Over target' }
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
                  <span className="text-xs font-semibold text-gray-500">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
