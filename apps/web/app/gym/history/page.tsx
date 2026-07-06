"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Trash2, Clock, PenLine } from "lucide-react";

function getWeekRange(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
      weeks[key] = {
        label: `${formatDate(monday)} — ${formatDate(sunday)}`,
        monday,
        sunday,
        sessions: [],
      };
    }
    weeks[key].sessions.push(s);
  });

  return Object.values(weeks).sort((a, b) => b.monday.getTime() - a.monday.getTime());
}

export default function HistoryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gym/session");
      if (res.ok) {
        setSessions(await res.json());
      }
    } catch (e) {
      console.error("Failed to load sessions:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const deleteSession = (id: string) => {
    if (confirm("Are you sure you want to delete this logged session?")) {
      fetch(`/api/gym/session/${id}`, { method: "DELETE" })
        .then(res => {
          if (res.ok) loadSessions();
          else alert("Failed to delete session");
        })
        .catch(() => alert("Network failed"));
    }
  };

  const weeklyGroups = groupSessionsByWeek(sessions);

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
          <h1 className="text-2xl font-bold tracking-tight text-gray-100">Workout History</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-8">
        <div className="space-y-10">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
            </div>
          ) : weeklyGroups.length === 0 ? (
            <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-12 flex flex-col items-center text-center mt-6 shadow-sm">
              <Calendar size={48} className="text-gray-600 mb-6" />
              <h2 className="text-2xl font-bold text-gray-100 mb-2">No Workouts Found</h2>
              <p className="text-sm font-semibold text-gray-500 max-w-sm">
                You haven't logged any past sessions. They will show up here once you do.
              </p>
            </div>
          ) : (
            <div className="space-y-12">
              {weeklyGroups.map((week) => (
                <div key={week.monday.toISOString()}>
                  <div className="flex items-center justify-between mb-4 border-b border-[#2A2B2F] pb-3">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{week.label}</span>
                    <span className="text-xs font-bold text-gray-500">{week.sessions.length} sessions</span>
                  </div>

                  <div className="space-y-4">
                    {week.sessions.map((s) => (
                      <div key={s._id} className="bg-[#1F2023] border border-[#2A2B2F] hover:border-[#E8414A]/30 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors group shadow-sm">
                        
                        <div>
                          <h3 className="text-lg font-bold text-gray-100 mb-2">{s.splitDayName || "Freestyle Session"}</h3>
                          
                          <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
                            <div className="flex items-center gap-1.5 text-gray-500">
                              <Calendar size={14} />
                              <span>{new Date(s.date || s.createdAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                            </div>
                            
                            <div className="flex items-center gap-1.5 text-gray-500">
                              <Clock size={14} />
                              <span>{formatDuration(s.durationSeconds)}</span>
                            </div>

                            {s.exercises && s.exercises.length > 0 && (
                              <div className="text-[#E8414A] bg-[#E8414A]/10 px-2 py-1 rounded-md">
                                {s.exercises.length} exercises
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 self-end md:self-auto opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => router.push(`/gym/edit-session?id=${s._id}`)}
                            className="p-2.5 bg-[#161618] hover:bg-[#2A2B2F] rounded-xl border border-[#2A2B2F] transition-colors text-gray-400"
                            title="Edit Session"
                          >
                            <PenLine size={16} />
                          </button>
                          <button 
                            onClick={() => deleteSession(s._id)} 
                            className="p-2.5 bg-red-500/10 hover:bg-red-500/20 rounded-xl border border-red-500/20 transition-colors text-red-500"
                            title="Delete Session"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
