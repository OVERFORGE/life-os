"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  ChevronRight,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
  Calendar,
  Flame,
  ArrowLeft,
  Plus,
  Dumbbell,
} from "lucide-react";

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
  sessions.forEach((s) => {
    const date = new Date(s.date || s.createdAt);
    const { monday, sunday } = getWeekRange(date);
    const key = monday.toISOString();
    if (!weeks[key]) {
      weeks[key] = {
        label: `${monday.toLocaleDateString()} — ${sunday.toLocaleDateString()}`,
        monday,
        sunday,
        sessions: [],
      };
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
      fetch(`/api/gym/routines/${id}`, { method: "DELETE" })
        .then((res) => {
          if (res.ok) loadGymData();
        })
        .catch(console.error);
    }
  };

  const deleteGym = (id: string) => {
    if (confirm("Delete Gym? Are you sure?")) {
      fetch(`/api/gym/inventory/${id}`, { method: "DELETE" })
        .then((res) => {
          if (res.ok) loadGymData();
        })
        .catch(console.error);
    }
  };

  const deleteSession = (id: string) => {
    if (confirm("Delete logged session? Are you sure?")) {
      fetch(`/api/gym/session/${id}`, { method: "DELETE" })
        .then((res) => {
          if (res.ok) loadGymData();
        })
        .catch(console.error);
    }
  };

  const weeklyGroups = groupSessionsByWeek(sessions);
  const currentWeekSessions = weeklyGroups.find((w) => isCurrentWeek(w.monday))?.sessions || [];

  return (
    <div className="h-full flex flex-col bg-[#111113] text-[#F7F5F0] max-w-7xl mx-auto w-full font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-8 pb-6 border-b border-[#23242A]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/vitals")}
            className="w-9 h-9 rounded-full bg-[#17171A] border border-[#23242A] flex items-center justify-center text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#23242A] transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#D98B2B]" />
              <h1 className="text-2xl font-bold tracking-tight text-[#F7F5F0]">Gym Protocol</h1>
            </div>
            <p className="text-[10px] font-mono font-bold text-[#85827A] uppercase tracking-widest mt-1">
              Workouts &amp; Strength Progress
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push("/gym/progress")}
          className="flex items-center gap-2 px-4 py-2 bg-[#D98B2B]/10 border border-[#D98B2B]/30 rounded-full text-xs font-bold tracking-wider text-[#D98B2B] hover:bg-[#D98B2B]/20 transition-all uppercase shadow-sm"
        >
          <Flame size={14} /> Intelligence
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 custom-h-scrollbar pb-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-[#D98B2B] border-t-transparent animate-spin" />
            <p className="text-xs font-semibold text-[#85827A] mt-4 font-mono">Loading workouts...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column: Quick Start & This Week */}
            <div className="space-y-8">
              {/* Quick Start */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Play size={15} className="text-[#D98B2B] fill-[#D98B2B]" />
                  <h2 className="text-base font-bold text-[#F7F5F0]">Quick Start Routine</h2>
                </div>

                {routines.length === 0 ? (
                  <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-8 text-center shadow-sm">
                    <p className="text-xs text-[#85827A]">Create a routine to start a guided session.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {routines.map((r) => (
                      <div
                        key={r._id}
                        className="bg-[#17171A] border border-[#23242A] rounded-2xl overflow-hidden shadow-sm transition-all hover:border-[#32343D]"
                      >
                        <div
                          onClick={() => setExpandedRoutine(expandedRoutine === r._id ? null : r._id)}
                          className="px-5 py-4 flex justify-between items-center cursor-pointer"
                        >
                          <h3 className="text-sm font-bold text-[#F7F5F0]">{r.routineName}</h3>
                          {expandedRoutine === r._id ? (
                            <ChevronUp size={18} className="text-[#85827A]" />
                          ) : (
                            <ChevronDown size={18} className="text-[#85827A]" />
                          )}
                        </div>

                        {expandedRoutine === r._id && (
                          <div className="px-5 pb-5 pt-1 bg-[#17171A]">
                            <div className="h-px bg-[#23242A] w-full mb-4" />
                            <div className="space-y-2">
                              {r.splitDays?.map((day: any, idx: number) => (
                                <div
                                  key={idx}
                                  onClick={() =>
                                    router.push(
                                      `/gym/live-session?routineId=${r._id}&dayName=${encodeURIComponent(
                                        day.dayName
                                      )}`
                                    )
                                  }
                                  className="bg-[#111113] border border-[#23242A] hover:border-[#D98B2B]/40 p-3.5 rounded-xl flex justify-between items-center cursor-pointer group transition-all"
                                >
                                  <div>
                                    <h4 className="text-xs font-bold text-[#D98B2B]">{day.dayName}</h4>
                                    <p className="text-[10px] font-mono text-[#85827A] mt-0.5 uppercase tracking-wider">
                                      {day.exercises?.length || 0} exercises
                                    </p>
                                  </div>
                                  <div className="w-7 h-7 rounded-full bg-[#D98B2B] flex items-center justify-center opacity-90 group-hover:opacity-100 shadow-sm text-[#111113]">
                                    <Play size={11} className="fill-current ml-0.5" />
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
                  onClick={() => router.push("/gym/log-past")}
                  className="w-full mt-4 bg-[#17171A] border border-[#23242A] hover:bg-[#23242A] rounded-2xl py-3.5 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Calendar size={14} className="text-[#85827A]" />
                  <span className="text-xs font-semibold text-[#D8D5CD]">Log Past Workout</span>
                </button>
              </div>

              {/* This Week */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Flame size={15} className="text-[#D98B2B]" />
                  <h2 className="text-base font-bold text-[#F7F5F0]">This Week</h2>
                  <div className="bg-[#D98B2B]/10 px-2.5 py-0.5 rounded-md">
                    <span className="text-[10px] font-mono font-bold text-[#D98B2B] uppercase tracking-wider">
                      {currentWeekSessions.length} sessions
                    </span>
                  </div>
                </div>

                {currentWeekSessions.length === 0 ? (
                  <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-8 text-center shadow-sm">
                    <p className="text-xs text-[#85827A]">No sessions logged this week yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currentWeekSessions.map((s) => (
                      <div key={s._id} className="bg-[#17171A] border border-[#23242A] rounded-2xl p-4 shadow-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-sm font-bold text-[#F7F5F0]">{s.splitDayName || "Freestyle"}</h3>
                            <div className="flex items-center gap-3 mt-2">
                              <div className="flex items-center gap-1.5 text-xs text-[#85827A] font-mono">
                                <Calendar size={12} />
                                <span>
                                  {new Date(s.date || s.createdAt).toLocaleDateString("en-US", {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-[#85827A] font-mono">
                                <Clock size={12} />
                                <span>{formatDuration(s.durationSeconds)}</span>
                              </div>
                            </div>
                            <p className="text-[10px] font-mono font-bold text-[#85827A] mt-2 uppercase tracking-wider">
                              {s.exercises?.length || 0} EXERCISES
                            </p>
                          </div>
                          <button
                            onClick={() => deleteSession(s._id)}
                            className="w-8 h-8 rounded-lg bg-[#111113] border border-[#23242A] hover:bg-red-500/10 hover:text-red-400 flex items-center justify-center transition-colors text-[#85827A] cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => router.push("/gym/history")}
                  className="w-full mt-4 bg-transparent border border-[#23242A] hover:bg-[#17171A] rounded-2xl py-3.5 flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs font-semibold text-[#85827A] hover:text-[#F7F5F0]"
                >
                  <Clock size={14} />
                  <span>View Full History</span>
                  <ChevronRight size={14} className="ml-1" />
                </button>
              </div>
            </div>

            {/* Right Column: Routines & Gym Environments */}
            <div className="space-y-8">
              {/* Routines */}
              <div>
                <div className="flex items-end justify-between mb-4">
                  <h2 className="text-base font-bold text-[#F7F5F0]">Configured Routines</h2>
                  <button
                    onClick={() => router.push("/gym/create-routine")}
                    className="text-xs font-bold text-[#D98B2B] hover:text-[#ffb86c] uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Routine
                  </button>
                </div>

                {routines.length === 0 ? (
                  <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-8 text-center shadow-sm">
                    <p className="text-xs text-[#85827A]">No workout routines created yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {routines.map((r) => (
                      <div
                        key={r._id}
                        className="bg-[#17171A] border border-[#23242A] rounded-2xl p-4 flex items-center justify-between shadow-sm"
                      >
                        <div
                          onClick={() => router.push(`/gym/create-routine?id=${r._id}`)}
                          className="flex-1 cursor-pointer group"
                        >
                          <h3 className="text-sm font-bold text-[#F7F5F0] group-hover:text-[#D98B2B] transition-colors">
                            {r.routineName}
                          </h3>
                          <p className="text-[10px] font-mono text-[#85827A] mt-0.5 uppercase tracking-wider">
                            {r.splitDays?.length || 0} Split Days
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => deleteRoutine(r._id)}
                            className="w-8 h-8 rounded-lg bg-[#111113] border border-[#23242A] hover:bg-red-500/10 hover:text-red-400 flex items-center justify-center transition-colors text-[#85827A] cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                          <ChevronRight size={16} className="text-[#85827A]" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Gym Environments */}
              <div>
                <div className="flex items-end justify-between mb-4">
                  <h2 className="text-base font-bold text-[#F7F5F0]">Gym Environments</h2>
                  <button
                    onClick={() => router.push("/gym/create-gym")}
                    className="text-xs font-bold text-[#D98B2B] hover:text-[#ffb86c] uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Gym
                  </button>
                </div>

                {gyms.length === 0 ? (
                  <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-8 text-center shadow-sm">
                    <p className="text-xs text-[#85827A]">Define your gym inventory to get customized routines.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {gyms.map((g) => (
                      <div
                        key={g._id}
                        className="bg-[#17171A] border border-[#23242A] rounded-2xl p-4 flex items-center justify-between shadow-sm"
                      >
                        <div
                          onClick={() => router.push(`/gym/create-gym?id=${g._id}`)}
                          className="flex-1 cursor-pointer group"
                        >
                          <h3 className="text-sm font-bold text-[#F7F5F0] group-hover:text-[#D98B2B] transition-colors">
                            {g.name}
                          </h3>
                          <p className="text-[10px] font-mono text-[#85827A] mt-0.5 uppercase tracking-wider">
                            {g.selectedPreSeeded?.length || 0} Equipments Available
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => deleteGym(g._id)}
                            className="w-8 h-8 rounded-lg bg-[#111113] border border-[#23242A] hover:bg-red-500/10 hover:text-red-400 flex items-center justify-center transition-colors text-[#85827A] cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                          <ChevronRight size={16} className="text-[#85827A]" />
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
