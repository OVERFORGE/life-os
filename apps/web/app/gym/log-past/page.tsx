"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Calendar, Dumbbell, Flame } from "lucide-react";

export default function LogPastWorkoutPage() {
  const router = useRouter();
  const [routines, setRoutines] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingRoutines, setFetchingRoutines] = useState(true);

  // Form State
  const [selectedSplit, setSelectedSplit] = useState<string>("Freestyle");
  const [durationMinutes, setDurationMinutes] = useState<string>("45");
  const [selectedDateOffet, setSelectedDateOffset] = useState<number>(1); // 1 = yesterday

  // Advanced Logs
  type SetLog = { repsDone: number; weightUsed: number; restSecondsTaken: number; assisted: boolean; assistedAtRep: number; };
  type ExerciseLog = { equipmentName: string; sets: SetLog[] };
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);

  useEffect(() => {
    const loadRoutines = async () => {
      try {
        const res = await fetch("/api/gym/routines");
        if (res.ok) {
          setRoutines(await res.json());
        }
      } catch (e) {
        console.error(e);
      } finally {
        setFetchingRoutines(false);
      }
    };
    loadRoutines();
  }, []);

  const extractSplits = () => {
    const splits = ["Freestyle"]; // Default fallback
    routines.forEach(r => {
      r.splitDays?.forEach((sd: any) => {
        if (!splits.includes(sd.dayName)) {
          splits.push(sd.dayName);
        }
      });
    });
    return splits;
  };

  const getPredefinedExercises = () => {
    if (selectedSplit === "Freestyle") return [];
    for (const r of routines) {
      const split = r.splitDays?.find((sd: any) => sd.dayName === selectedSplit);
      if (split && split.exercises) {
        return split.exercises;
      }
    }
    return [];
  };
  const predefined = getPredefinedExercises();

  const handleSave = async () => {
    const durationNum = parseInt(durationMinutes, 10);
    if (!durationNum || durationNum <= 0) {
      alert("Please enter a valid workout duration in minutes.");
      return;
    }

    // Calculate Date
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - selectedDateOffet);

    setLoading(true);
    try {
      const res = await fetch("/api/gym/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          splitDayName: selectedSplit,
          durationSeconds: durationNum * 60,
          date: targetDate.toISOString(),
          exercises: exercises.map(ex => ({
            equipmentName: ex.equipmentName || "Unnamed Exercise",
            sets: ex.sets
          }))
        })
      });

      if (res.ok) {
        router.push("/gym");
      } else {
        const d = await res.json();
        alert(d.error || "Failed to log past session.");
      }
    } catch (e) {
      alert("Network error while saving past session.");
    } finally {
      setLoading(false);
    }
  };

  // Generate an array of the last 7 days including today
  const recentDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    let label = d.toLocaleDateString("en-US", { weekday: "short" });
    if (i === 0) label = "Today";
    if (i === 1) label = "Yesterday";
    
    return {
      offset: i,
      label,
      dateString: d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    };
  });

  const availableSplits = extractSplits();

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] transition-colors shadow-sm"
          >
            <ArrowLeft size={18} className="text-gray-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-100">Log Past Workout</h1>
          </div>
        </div>
        
        <button 
          onClick={handleSave}
          disabled={loading || fetchingRoutines}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#E8414A] hover:bg-[#D62C35] rounded-full text-xs font-bold tracking-widest text-white transition-colors uppercase shadow-sm disabled:opacity-50"
        >
          {loading ? (
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <>
              <Check size={16} />
              <span>Save</span>
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-8">
        <div className="space-y-10">
          
          {/* Date Selector */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} className="text-[#E8414A]" />
              <h2 className="text-lg font-bold text-gray-100">When did you work out?</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {recentDays.map((ds) => {
                const isSelected = selectedDateOffet === ds.offset;
                return (
                  <button
                    key={ds.offset}
                    onClick={() => setSelectedDateOffset(ds.offset)}
                    className={`shrink-0 px-6 py-4 rounded-2xl border transition-colors ${
                      isSelected 
                        ? 'bg-[#E8414A]/10 border-[#E8414A]/30 text-[#E8414A]' 
                        : 'bg-[#1F2023] border-[#2A2B2F] text-gray-400 hover:bg-[#2A2B2F]'
                    }`}
                  >
                    <div className={`text-sm font-bold mb-1 ${isSelected ? 'text-[#E8414A]' : 'text-gray-200'}`}>
                      {ds.label}
                    </div>
                    <div className={`text-xs font-semibold ${isSelected ? 'text-[#E8414A]/80' : 'text-gray-500'}`}>
                      {ds.dateString}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Split Selector */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Dumbbell size={18} className="text-[#E8414A]" />
              <h2 className="text-lg font-bold text-gray-100">Workout Split</h2>
            </div>
            {fetchingRoutines ? (
              <div className="w-6 h-6 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
            ) : (
              <div className="flex flex-wrap gap-3">
                {availableSplits.map((split) => {
                  const isSelected = selectedSplit === split;
                  return (
                    <button
                      key={split}
                      onClick={() => setSelectedSplit(split)}
                      className={`px-5 py-3 rounded-xl text-sm font-bold border transition-colors ${
                        isSelected 
                          ? 'bg-[#E8414A]/10 border-[#E8414A]/30 text-[#E8414A]' 
                          : 'bg-[#1F2023] border-[#2A2B2F] text-gray-400 hover:bg-[#2A2B2F]'
                      }`}
                    >
                      {split}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Duration Input */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Flame size={18} className="text-[#E8414A]" />
              <h2 className="text-lg font-bold text-gray-100">Total Duration</h2>
            </div>
            <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl flex items-center px-6 max-w-sm">
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="e.g. 45"
                className="w-full bg-transparent border-none text-2xl font-black text-gray-100 py-5 focus:outline-none placeholder:text-gray-600"
              />
              <span className="text-sm font-bold text-gray-500">minutes</span>
            </div>
          </div>

          <div className="h-px bg-[#2A2B2F] w-full" />

          {/* Advanced Exercises */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Dumbbell size={18} className="text-gray-400" />
                <h2 className="text-lg font-bold text-gray-100">Logged Exercises</h2>
              </div>
              <button 
                onClick={() => setExercises([...exercises, { equipmentName: "", sets: [{ repsDone: 0, weightUsed: 0, restSecondsTaken: 60, assisted: false, assistedAtRep: 0 }] }])}
                className="px-4 py-2 rounded-xl bg-[#E8414A]/10 border border-[#E8414A]/20 text-[#E8414A] text-xs font-bold uppercase tracking-widest hover:bg-[#E8414A]/20 transition-colors"
              >
                + Custom
              </button>
            </div>

            {predefined.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-8 pb-6 border-b border-[#2A2B2F]">
                {predefined.map((pEx: any, i: number) => (
                  <button
                    key={`pre-${i}`}
                    onClick={() => {
                      const defaultSets = Array.from({ length: pEx.targetSets || 1 }).map(() => ({
                        repsDone: pEx.targetReps || 0,
                        weightUsed: 0,
                        restSecondsTaken: pEx.restSeconds || 60,
                        assisted: false,
                        assistedAtRep: 0
                      }));
                      setExercises([...exercises, { equipmentName: pEx.equipmentName, sets: defaultSets }]);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-[#1F2023] border border-[#2A2B2F] hover:border-[#E8414A]/30 text-[#E8414A] text-xs font-bold transition-colors shadow-sm"
                  >
                    + {pEx.equipmentName}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-6">
              {exercises.map((ex, eIdx) => (
                <div key={eIdx} className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 shadow-sm">
                  <input
                    value={ex.equipmentName}
                    onChange={(e) => {
                      const n = [...exercises];
                      n[eIdx].equipmentName = e.target.value;
                      setExercises(n);
                    }}
                    placeholder="Exercise Name (e.g. Bench Press)"
                    className="w-full bg-transparent border-b border-[#2A2B2F] text-xl font-black text-gray-100 pb-3 mb-6 focus:outline-none focus:border-[#E8414A]/50 placeholder:text-gray-600"
                  />
                  
                  <div className="space-y-4">
                    {ex.sets.map((set, sIdx) => (
                      <div key={sIdx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-[#161618] rounded-2xl border border-[#2A2B2F]">
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest min-w-[40px]">Set {sIdx + 1}</span>
                          <button 
                            onClick={() => {
                              const n = [...exercises];
                              n[eIdx].sets[sIdx].assisted = !n[eIdx].sets[sIdx].assisted;
                              setExercises(n);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-colors ${
                              set.assisted ? 'bg-[#E8414A]/10 border-[#E8414A] text-[#E8414A]' : 'bg-[#1F2023] border-[#2A2B2F] text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            Assist
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <input 
                              type="number"
                              value={set.weightUsed || ""}
                              onChange={(e) => {
                                const n = [...exercises];
                                n[eIdx].sets[sIdx].weightUsed = Number(e.target.value) || 0;
                                setExercises(n);
                              }}
                              placeholder="kg"
                              className="w-16 bg-[#1F2023] border border-[#2A2B2F] rounded-xl py-2 text-center text-sm font-bold text-gray-100 focus:outline-none focus:border-[#E8414A]/50 placeholder:text-gray-600"
                            />
                            <span className="text-xs font-bold text-gray-500">×</span>
                            <input 
                              type="number"
                              value={set.repsDone || ""}
                              onChange={(e) => {
                                const n = [...exercises];
                                n[eIdx].sets[sIdx].repsDone = Number(e.target.value) || 0;
                                setExercises(n);
                              }}
                              placeholder="reps"
                              className="w-16 bg-[#1F2023] border border-[#2A2B2F] rounded-xl py-2 text-center text-sm font-bold text-gray-100 focus:outline-none focus:border-[#E8414A]/50 placeholder:text-gray-600"
                            />
                          </div>
                          
                          {set.assisted && (
                            <div className="flex items-center gap-2 ml-4 pl-4 border-l border-[#2A2B2F]">
                              <span className="text-[9px] font-bold text-[#E8414A] uppercase tracking-widest hidden sm:block">Assisted at:</span>
                              <input 
                                type="number"
                                value={set.assistedAtRep || ""}
                                onChange={(e) => {
                                  const n = [...exercises];
                                  n[eIdx].sets[sIdx].assistedAtRep = Number(e.target.value) || 0;
                                  setExercises(n);
                                }}
                                placeholder="rep"
                                className="w-12 bg-[#E8414A]/10 border border-[#E8414A]/30 rounded-lg py-1.5 text-center text-xs font-bold text-[#E8414A] focus:outline-none placeholder:text-[#E8414A]/40"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-6 pt-6 border-t border-[#2A2B2F]">
                    <button 
                      onClick={() => {
                        const n = [...exercises];
                        n.splice(eIdx, 1);
                        setExercises(n);
                      }}
                      className="text-[11px] font-bold text-red-500 hover:text-red-400 uppercase tracking-widest transition-colors"
                    >
                      Remove
                    </button>

                    <button 
                      onClick={() => {
                        const n = [...exercises];
                        n[eIdx].sets.push({ repsDone: 0, weightUsed: 0, restSecondsTaken: 60, assisted: false, assistedAtRep: 0 });
                        setExercises(n);
                      }}
                      className="text-[11px] font-bold text-[#E8414A] hover:text-[#D62C35] uppercase tracking-widest transition-colors"
                    >
                      + Add Set
                    </button>
                  </div>
                </div>
              ))}
              
              {exercises.length === 0 && (
                <div className="text-center py-10 text-sm font-bold text-gray-500">
                  Optionally log specific exercises to backfill data.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
