"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Play, ChevronRight, Trash2, ChevronDown, ChevronUp, Clock, Calendar, Flame } from "lucide-react";

function getWeekRange(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  return `${m} min`;
}

function groupSessionsByWeek(sessions: any[]) {
  const weeks: Record<string, { label: string; monday: Date; sunday: Date; sessions: any[] }> = {};
  sessions.forEach(s => {
    const date = new Date(s.date || s.createdAt);
    const { monday, sunday } = getWeekRange(date);
    const key = monday.toISOString();
    if (!weeks[key]) {
      weeks[key] = { label: `${monday.toLocaleDateString()} — ${sunday.toLocaleDateString()}`, monday, sunday, sessions: [] };
    }
    weeks[key].sessions.push(s);
  });
  return Object.values(weeks).sort((a, b) => b.monday.getTime() - a.monday.getTime());
}

function isCurrentWeek(monday: Date) {
  const now = new Date();
  const { monday: curMon } = getWeekRange(now);
  return monday.toDateString() === curMon.toDateString();
}

export default function GymHub() {
  const router = useRouter();
  const [gyms, setGyms] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRoutine, setExpandedRoutine] = useState<string | null>(null);

  const loadGymData = async () => {
    setLoading(true);
    try {
      const [invRes, routRes, sessRes] = await Promise.all([
        fetch("/api/gym/inventory"),
        fetch("/api/gym/routines"),
        fetch("/api/gym/session"),
      ]);
      if (invRes.ok) {
        const invData = await invRes.json();
        setGyms(invData.userGyms || []);
      }
      if (routRes.ok) setRoutines(await routRes.json());
      if (sessRes.ok) setSessions(await sessRes.json());
    } catch (e) {
      console.error("Failed to load gym data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGymData();
  }, []);

  const deleteRoutine = (id: string) => {
    if (confirm("Delete Routine? Are you sure?")) {
      fetch(`/api/gym/routines/${id}`, { method: 'DELETE' })
        .then(res => { if (res.ok) loadGymData(); })
        .catch(console.error);
    }
  };

  const deleteGym = (id: string) => {
    if (confirm("Delete Gym? Are you sure?")) {
      fetch(`/api/gym/inventory/${id}`, { method: 'DELETE' })
        .then(res => { if (res.ok) loadGymData(); })
        .catch(console.error);
    }
  };

  const deleteSession = (id: string) => {
    if (confirm("Delete logged session? Are you sure?")) {
      fetch(`/api/gym/session/${id}`, { method: 'DELETE' })
        .then(res => { if (res.ok) loadGymData(); })
        .catch(console.error);
    }
  };

  const weeklyGroups = groupSessionsByWeek(sessions);
  const currentWeekSessions = weeklyGroups.find(w => isCurrentWeek(w.monday))?.sessions || [];

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-7xl mx-auto w-full">
      
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-100">Gym Protocol</h1>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1.5">Strength Telemetry</p>
        </div>
        
        <button 
          onClick={() => router.push('/gym/progress')}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#E8414A]/10 border border-[#E8414A]/20 rounded-full text-xs font-bold tracking-widest text-[#E8414A] hover:bg-[#E8414A]/20 transition-colors uppercase shadow-sm"
        >
          <Flame size={14} /> Intell
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-8">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
            <p className="text-sm font-semibold text-gray-500 mt-4">Loading Telemetry...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left Column: Quick Start & This Week */}
            <div className="space-y-8">
              
              {/* Quick Start */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Play size={16} className="text-[#E8414A] fill-[#E8414A]" />
                  <h2 className="text-lg font-bold text-gray-100">Quick Start</h2>
                </div>

                {routines.length === 0 ? (
                  <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-8 text-center shadow-sm">
                    <p className="text-sm font-bold text-gray-500">Create a routine to start a session.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {routines.map(r => (
                      <div key={r._id} className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl overflow-hidden shadow-sm transition-all hover:border-gray-600/50">
                        <div 
                          onClick={() => setExpandedRoutine(expandedRoutine === r._id ? null : r._id)}
                          className="px-5 py-4 flex justify-between items-center cursor-pointer"
                        >
                          <h3 className="text-[15px] font-bold text-gray-100">{r.routineName}</h3>
                          {expandedRoutine === r._id ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
                        </div>
                        
                        {expandedRoutine === r._id && (
                          <div className="px-5 pb-5 pt-1 bg-[#1F2023]">
                            <div className="h-px bg-[#2A2B2F] w-full mb-4" />
                            <div className="space-y-2">
                              {r.splitDays.map((day: any, idx: number) => (
                                <div 
                                  key={idx}
                                  onClick={() => router.push(`/gym/live-session?routineId=${r._id}&dayName=${encodeURIComponent(day.dayName)}`)}
                                  className="bg-[#161618] border border-[#2A2B2F] hover:border-[#E8414A]/30 p-4 rounded-xl flex justify-between items-center cursor-pointer group transition-colors"
                                >
                                  <div>
                                    <h4 className="text-sm font-bold text-[#E8414A]">{day.dayName}</h4>
                                    <p className="text-[11px] font-bold text-gray-500 mt-1 uppercase tracking-widest">{day.exercises?.length || 0} exercises</p>
                                  </div>
                                  <div className="w-8 h-8 rounded-full bg-[#E8414A] flex items-center justify-center opacity-90 group-hover:opacity-100 shadow-sm">
                                    <Play size={12} className="text-white fill-white ml-0.5" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                <button
                  onClick={() => router.push('/gym/log-past')}
                  className="w-full mt-4 bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] rounded-2xl py-4 flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <Calendar size={16} className="text-gray-400" />
                  <span className="text-sm font-bold text-gray-200">Log Past Workout</span>
                </button>
              </div>

              {/* This Week */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Flame size={16} className="text-[#E8414A]" />
                  <h2 className="text-lg font-bold text-gray-100">This Week</h2>
                  <div className="bg-[#E8414A]/10 px-2.5 py-1 rounded-lg">
                    <span className="text-[10px] font-bold text-[#E8414A] uppercase tracking-widest">{currentWeekSessions.length} sessions</span>
                  </div>
                </div>

                {currentWeekSessions.length === 0 ? (
                  <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-8 text-center shadow-sm">
                    <p className="text-sm font-bold text-gray-500">No sessions logged this week yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currentWeekSessions.map(s => (
                      <div key={s._id} className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 shadow-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-[15px] font-bold text-gray-100">{s.splitDayName || 'Freestyle'}</h3>
                            <div className="flex items-center gap-4 mt-3">
                              <div className="flex items-center gap-1.5">
                                <Calendar size={12} className="text-gray-500" />
                                <span className="text-xs font-bold text-gray-400">
                                  {new Date(s.date || s.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Clock size={12} className="text-gray-500" />
                                <span className="text-xs font-bold text-gray-400">{formatDuration(s.durationSeconds)}</span>
                              </div>
                            </div>
                            <p className="text-[10px] font-bold text-gray-500 mt-3 uppercase tracking-widest">{s.exercises?.length || 0} EXERCISES</p>
                          </div>
                          <button onClick={() => deleteSession(s._id)} className="w-8 h-8 rounded-lg bg-[#161618] border border-[#2A2B2F] hover:bg-red-500/10 hover:text-red-500 flex items-center justify-center transition-colors text-red-500">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <button
                  onClick={() => router.push('/gym/history')}
                  className="w-full mt-4 bg-transparent border border-[#2A2B2F] hover:bg-[#2A2B2F] rounded-2xl py-4 flex items-center justify-center gap-2 transition-colors"
                >
                  <Clock size={14} className="text-gray-400" />
                  <span className="text-sm font-bold text-gray-300">View Full History</span>
                  <ChevronRight size={14} className="text-gray-500 ml-1" />
                </button>
              </div>

            </div>

            {/* Right Column: Routines & Gym Environments */}
            <div className="space-y-8">
              
              {/* Routines */}
              <div>
                <div className="flex items-end justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-100">Your Routines</h2>
                  <button onClick={() => router.push('/gym/create-routine')} className="text-xs font-bold text-[#E8414A] hover:text-[#D62C35] uppercase tracking-widest transition-colors">
                    + Add Routine
                  </button>
                </div>

                {routines.length === 0 ? (
                  <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-8 text-center shadow-sm">
                    <p className="text-sm font-bold text-gray-500">No workout routines created yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {routines.map(r => (
                      <div key={r._id} className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 flex items-center justify-between shadow-sm">
                        <div onClick={() => router.push(`/gym/create-routine?id=${r._id}`)} className="flex-1 cursor-pointer group">
                          <h3 className="text-[15px] font-bold text-gray-100 group-hover:text-white transition-colors">{r.routineName}</h3>
                          <p className="text-[11px] font-bold text-gray-500 mt-1 uppercase tracking-widest">{r.splitDays?.length || 0} Split Days</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button onClick={() => deleteRoutine(r._id)} className="w-8 h-8 rounded-lg bg-[#161618] border border-[#2A2B2F] hover:bg-red-500/10 hover:text-red-500 flex items-center justify-center transition-colors text-red-500">
                            <Trash2 size={14} />
                          </button>
                          <ChevronRight size={18} className="text-gray-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Gym Environments */}
              <div>
                <div className="flex items-end justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-100">Gym Environments</h2>
                  <button onClick={() => router.push('/gym/create-gym')} className="text-xs font-bold text-[#E8414A] hover:text-[#D62C35] uppercase tracking-widest transition-colors">
                    + Add Gym
                  </button>
                </div>

                {gyms.length === 0 ? (
                  <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-8 text-center shadow-sm">
                    <p className="text-sm font-bold text-gray-500">Define your gym inventory to get customized routines.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {gyms.map(g => (
                      <div key={g._id} className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 flex items-center justify-between shadow-sm">
                        <div onClick={() => router.push(`/gym/create-gym?id=${g._id}`)} className="flex-1 cursor-pointer group">
                          <h3 className="text-[15px] font-bold text-gray-100 group-hover:text-white transition-colors">{g.name}</h3>
                          <p className="text-[11px] font-bold text-gray-500 mt-1 uppercase tracking-widest">{g.selectedPreSeeded?.length || 0} Equipments Available</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button onClick={() => deleteGym(g._id)} className="w-8 h-8 rounded-lg bg-[#161618] border border-[#2A2B2F] hover:bg-red-500/10 hover:text-red-500 flex items-center justify-center transition-colors text-red-500">
                            <Trash2 size={14} />
                          </button>
                          <ChevronRight size={18} className="text-gray-500" />
                        </div>
                      </div>
                    ))}
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
