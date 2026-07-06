"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Dumbbell, Flame } from "lucide-react";

function EditSessionWorkoutInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Form State
  const [selectedSplit, setSelectedSplit] = useState<string>("Freestyle");
  const [durationMinutes, setDurationMinutes] = useState<string>("45");
  const [routines, setRoutines] = useState<any[]>([]);

  // Advanced Logs
  type SetLog = { repsDone: number; weightUsed: number; restSecondsTaken: number; assisted: boolean; assistedAtRep: number; };
  type ExerciseLog = { _id?: string, equipmentName: string; sets: SetLog[] };
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);

  useEffect(() => {
    if (id) loadSession();
  }, [id]);

  const loadSession = async () => {
    try {
      const [resSession, resRoutines] = await Promise.all([
        fetch(`/api/gym/session/${id}`),
        fetch(`/api/gym/routines`)
      ]);

      if (resRoutines.ok) {
        setRoutines(await resRoutines.json());
      }

      if (resSession.ok) {
        const data = await resSession.json();
        setSelectedSplit(data.splitDayName || "Freestyle");
        setDurationMinutes(String(Math.round(data.durationSeconds / 60)));
        if (data.exercises) {
          setExercises(data.exercises);
        }
      } else {
        alert("Could not load session details.");
        router.back();
      }
    } catch (e) {
      console.error(e);
      alert("Network error.");
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async () => {
    const durationNum = parseInt(durationMinutes, 10);
    if (!durationNum || durationNum <= 0) {
      alert("Please enter a valid workout duration in minutes.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/gym/session/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          splitDayName: selectedSplit,
          durationSeconds: durationNum * 60,
          exercises: exercises.map(ex => ({
            equipmentName: ex.equipmentName || "Unnamed Exercise",
            sets: ex.sets
          }))
        })
      });

      if (res.ok) {
        router.back();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to edit session.");
      }
    } catch (e) {
      alert("Network error while saving changes.");
    } finally {
      setLoading(false);
    }
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
            <h1 className="text-2xl font-bold tracking-tight text-gray-100">Edit Workout</h1>
          </div>
        </div>
        
        <button 
          onClick={handleSave}
          disabled={loading || fetching}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-white rounded-full text-xs font-bold tracking-widest text-gray-900 transition-colors uppercase shadow-sm disabled:opacity-50"
        >
          {loading ? (
            <div className="w-4 h-4 rounded-full border-2 border-gray-900 border-t-transparent animate-spin" />
          ) : (
            <>
              <Check size={16} />
              <span>Update</span>
            </>
          )}
        </button>
      </div>

      {fetching ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-8">
          <div className="space-y-10">
            
            <div className="bg-[#E8414A]/10 border border-[#E8414A]/30 p-5 rounded-2xl">
               <div className="text-[10px] font-bold text-[#E8414A] uppercase tracking-widest mb-1.5">Editing Past Session</div>
               <div className="text-sm font-semibold text-gray-100">Changes will instantly recalculate your volume metrics.</div>
            </div>

            {/* Split Name Editor */}
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 ml-2">Workout Focus</div>
              <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl px-6">
                <input
                  value={selectedSplit}
                  onChange={(e) => setSelectedSplit(e.target.value)}
                  className="w-full bg-transparent border-none text-gray-100 font-bold text-lg py-5 focus:outline-none placeholder:text-gray-600"
                  placeholder="e.g. Chest & Triceps"
                />
              </div>
            </div>

            {/* Duration Input */}
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 ml-2">Total Duration</div>
              <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl flex items-center px-6 max-w-sm">
                <Flame size={18} className="text-gray-500" />
                <input
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-full bg-transparent border-none text-2xl font-black text-gray-100 py-5 ml-4 focus:outline-none placeholder:text-gray-600"
                  placeholder="e.g. 45"
                />
                <span className="text-sm font-bold text-gray-500">minutes</span>
              </div>
            </div>

            <div className="h-px bg-[#2A2B2F] w-full" />

            {/* Advanced Exercises */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Dumbbell size={18} className="text-gray-100" />
                  <h2 className="text-lg font-bold text-gray-100">Logged Exercises</h2>
                </div>
                <button 
                  onClick={() => setExercises([...exercises, { equipmentName: "", sets: [{ repsDone: 0, weightUsed: 0, restSecondsTaken: 60, assisted: false, assistedAtRep: 0 }] }])}
                  className="px-4 py-2 rounded-xl bg-[#161618] border border-[#2A2B2F] text-gray-100 text-[10px] font-bold uppercase tracking-widest hover:bg-[#2A2B2F] transition-colors"
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
                      className="px-4 py-2.5 rounded-xl bg-[#1F2023] border border-[#2A2B2F] hover:border-[#E8414A]/30 text-gray-100 text-xs font-bold transition-colors shadow-sm"
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
                        <div key={sIdx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest min-w-[40px]">Set {sIdx + 1}</span>
                            <button 
                              onClick={() => {
                                const n = [...exercises];
                                n[eIdx].sets[sIdx].assisted = !n[eIdx].sets[sIdx].assisted;
                                setExercises(n);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-colors ${
                                set.assisted ? 'bg-[#E8414A]/10 border-[#E8414A] text-[#E8414A]' : 'bg-[#161618] border-[#2A2B2F] text-gray-500 hover:text-gray-300'
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
                                className="w-16 bg-[#161618] border border-[#2A2B2F] rounded-xl py-2 text-center text-sm font-bold text-gray-100 focus:outline-none focus:border-[#E8414A]/50 placeholder:text-gray-600"
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
                                className="w-16 bg-[#161618] border border-[#2A2B2F] rounded-xl py-2 text-center text-sm font-bold text-gray-100 focus:outline-none focus:border-[#E8414A]/50 placeholder:text-gray-600"
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
                        className="text-[11px] font-bold text-[#E8414A] hover:text-[#D62C35] uppercase tracking-widest transition-colors"
                      >
                        Remove
                      </button>

                      <button 
                        onClick={() => {
                          const n = [...exercises];
                          n[eIdx].sets.push({ repsDone: 0, weightUsed: 0, restSecondsTaken: 60, assisted: false, assistedAtRep: 0 });
                          setExercises(n);
                        }}
                        className="text-[11px] font-bold text-gray-100 hover:text-white uppercase tracking-widest transition-colors"
                      >
                        + Add Set
                      </button>
                    </div>
                  </div>
                ))}
                
                {exercises.length === 0 && (
                  <div className="text-center py-10 text-sm font-bold text-gray-500">
                    No exercises logged yet. Add some to backfill data.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditSessionWorkoutPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading...</div>}>
      <EditSessionWorkoutInner />
    </Suspense>
  );
}
