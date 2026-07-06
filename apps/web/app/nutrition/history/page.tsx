"use client";

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, Activity 
} from 'lucide-react';

function getMonday(d: Date) {
  d = new Date(d);
  var day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1); 
  return new Date(d.setDate(diff));
}

function addDays(d: Date, days: number) {
  var copy = new Date(Number(d));
  copy.setDate(d.getDate() + days);
  return copy;
}

function getLocalDateString(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDayName(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export default function NutritionHistoryPage() {
  const router = useRouter();
  
  const [weekStart, setWeekStart] = useState<Date>(getMonday(new Date()));
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const startStr = getLocalDateString(weekStart);
      const endStr = getLocalDateString(weekEnd);
      
      const res = await fetch(`/api/nutrition/log?startDate=${startStr}&endDate=${endStr}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      } else {
        console.error('History Fetch Error');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const daysOfWeek = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(weekStart, i));
    }
    return days;
  }, [weekStart]);

  const goToPrevWeek = () => setWeekStart(prev => addDays(prev, -7));
  const goToNextWeek = () => setWeekStart(prev => addDays(prev, 7));

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
          <h1 className="text-3xl font-black text-gray-100 tracking-tight">History</h1>
          <p className="text-[10px] font-bold text-gray-400 tracking-[0.2em] uppercase mt-1">
            Weekly Nutrition Logs
          </p>
        </div>
      </div>

      {/* Week Selector */}
      <div className="flex items-center justify-between px-6 md:px-12 py-4 border-b border-[#2A2B2F] bg-[#161618] sticky top-0 z-10">
        <button 
          onClick={goToPrevWeek}
          className="w-10 h-10 rounded-xl bg-[#1F2023] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
        >
          <ChevronLeft className="text-gray-400" size={20} />
        </button>
        
        <div className="text-center">
          <div className="text-base font-black text-gray-100">
            {formatShortDate(weekStart)} - {formatShortDate(weekEnd)}
          </div>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
            Selected Week
          </div>
        </div>

        <button 
          onClick={goToNextWeek}
          className="w-10 h-10 rounded-xl bg-[#1F2023] border border-[#2A2B2F] flex items-center justify-center hover:bg-[#2A2B2F] transition-colors"
        >
          <ChevronRight className="text-gray-400" size={20} />
        </button>
      </div>

      {/* Daily Logs List */}
      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-32">
        {loading ? (
          <div className="flex justify-center mt-12">
            <div className="w-8 h-8 border-2 border-[#E8414A] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {daysOfWeek.map((dayDate) => {
              const dateStr = getLocalDateString(dayDate);
              const logEntry = logs.find(l => l.date === dateStr);
              const isToday = dateStr === getLocalDateString(new Date());

              return (
                <button
                  key={dateStr}
                  onClick={() => router.push(`/nutrition/daily-log?date=${dateStr}`)}
                  className={`w-full bg-[#1F2023] rounded-3xl p-6 md:p-8 border text-left transition-colors group hover:border-[#3A3C42] ${
                    isToday ? 'border-[#E8414A]/30' : 'border-[#2A2B2F]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <CalendarDays className={isToday ? "text-[#E8414A]" : "text-gray-500"} size={16} />
                      <span className={`text-sm font-black uppercase tracking-widest ml-3 ${isToday ? "text-[#E8414A]" : "text-gray-300"}`}>
                        {getDayName(dayDate)}, {formatShortDate(dayDate)} {isToday && '(Today)'}
                      </span>
                    </div>
                    <ChevronRight className="text-gray-600 group-hover:text-gray-400 transition-colors" size={18} />
                  </div>

                  {logEntry && logEntry.meals?.length > 0 ? (
                    <div>
                      <div className="flex items-baseline mb-6">
                        <span className="text-4xl font-black text-gray-100 tracking-tighter">
                          {Math.round(logEntry.dailyTotals?.calories || 0)}
                        </span>
                        <span className="text-xs font-bold text-[#E8414A] ml-2 tracking-widest">KCAL</span>
                      </div>
                      
                      <div className="flex justify-between items-center pt-6 border-t border-[#2A2B2F]">
                        <div className="text-center">
                          <div className="text-xl font-black text-gray-100">{Math.round(logEntry.dailyTotals?.protein || 0)}g</div>
                          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Protein</div>
                        </div>
                        <div className="w-px h-8 bg-[#2A2B2F]" />
                        <div className="text-center">
                          <div className="text-xl font-black text-gray-100">{Math.round(logEntry.dailyTotals?.carbs || 0)}g</div>
                          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Carbs</div>
                        </div>
                        <div className="w-px h-8 bg-[#2A2B2F]" />
                        <div className="text-center">
                          <div className="text-xl font-black text-gray-100">{Math.round(logEntry.dailyTotals?.fats || 0)}g</div>
                          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Fats</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center py-4">
                      <Activity className="text-gray-600" size={16} />
                      <span className="text-sm font-bold text-gray-500 ml-3">No data logged</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
