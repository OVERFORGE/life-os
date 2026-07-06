"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Play, Timer, Save, ChevronRight, ChevronLeft, Zap, Camera, X, TrendingUp, AlertCircle, Image as ImageIcon } from "lucide-react";

function LiveSessionInner() {
  const searchParams = useSearchParams();
  const routineId = searchParams.get("routineId");
  const dayName = searchParams.get("dayName");
  
  const router = useRouter();
  
  const [routines, setRoutines] = useState<any[]>([]);
  const [selectedRoutine, setSelectedRoutine] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  const [currentExIdx, setCurrentExIdx] = useState(0);

  const [logs, setLogs] = useState<any>({}); 
  const [saving, setSaving] = useState(false);
  
  const [exerciseNotes, setExerciseNotes] = useState<Record<number, { note: string; imageUrl: string }>>({});
  const [setNotes, setSetNotes] = useState<Record<string, string>>({}); 
  const [expandedSetNote, setExpandedSetNote] = useState<string | null>(null); 
  const [history, setHistory] = useState<Record<string, any>>({});
  const [weightTexts, setWeightTexts] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadExIdx, setActiveUploadExIdx] = useState<number | null>(null);

  const PERSIST_KEY = "@live_session_draft";
  const getNotesKey = (rId: string, dName: string) => `@set_notes_${rId}_${dName}`;

  const checkPersistedSession = async (routinesData: any[]) => {
    try {
      const draftStr = localStorage.getItem(PERSIST_KEY);
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (confirm(`Resume your active session for ${draft.selectedDay?.dayName || 'Workout'}?\nClick OK to Resume, Cancel to Discard.`)) {
          setSelectedRoutine(draft.selectedRoutine);
          setSelectedDay(draft.selectedDay);
          setLogs(draft.logs);
          setExerciseNotes(draft.exerciseNotes || {});
          setCurrentExIdx(draft.currentExIdx);
          setSeconds(draft.seconds);
          setStartTime(Date.now() - (draft.seconds * 1000));
          setActive(true);
          fetchHistoryForDay(draft.selectedDay);
          
          if (draft.selectedRoutine?._id && draft.selectedDay?.dayName) {
            const savedNotes = localStorage.getItem(getNotesKey(draft.selectedRoutine._id, draft.selectedDay.dayName));
            if (savedNotes) setSetNotes(JSON.parse(savedNotes));
          }
        } else {
          localStorage.removeItem(PERSIST_KEY);
          handleInitialParams(routinesData);
        }
      } else {
        handleInitialParams(routinesData);
      }
    } catch (e) {
      handleInitialParams(routinesData);
    }
  };

  const handleInitialParams = (routinesData: any[]) => {
    if (routineId && dayName) {
      const r = routinesData.find((x: any) => x._id === routineId);
      if (r) {
        setSelectedRoutine(r);
        const d = r.splitDays?.find((x: any) => x.dayName === dayName);
        if (d) {
          setSelectedDay(d);
          startWorkout(d);
        }
      }
    }
  };

  useEffect(() => {
    fetch("/api/gym/routines")
      .then(res => res.json())
      .then(async data => {
        setRoutines(data);
        checkPersistedSession(data);
        if (routineId && dayName) {
          try {
            const savedNotes = localStorage.getItem(getNotesKey(routineId, dayName));
            if (savedNotes) setSetNotes(JSON.parse(savedNotes));
          } catch {}
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let int: NodeJS.Timeout;
    if (active && startTime) {
      int = setInterval(() => {
        const s = Math.floor((Date.now() - startTime) / 1000);
        setSeconds(s);
        if (s % 10 === 0) {
          saveDraftLocally(s, logs, exerciseNotes, currentExIdx);
        }
      }, 1000);
    }
    return () => clearInterval(int);
  }, [active, startTime, logs, exerciseNotes, currentExIdx]);

  const saveDraftLocally = (s: number, currentLogs: any, currentNotes: any, exIdx: number) => {
    if (!selectedRoutine || !selectedDay) return;
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({
        selectedRoutine,
        selectedDay,
        logs: currentLogs,
        exerciseNotes: currentNotes,
        seconds: s,
        currentExIdx: exIdx
      }));
    } catch (e) {}
  };

  const getWeightText = (exIdx: number, setIdx: number) => {
    const key = `${exIdx}-${setIdx}`;
    if (weightTexts[key] !== undefined) return weightTexts[key];
    const val = logs[exIdx]?.[setIdx]?.weightUsed;
    return val ? String(val) : '';
  };

  const handleWeightChange = (exIdx: number, setIdx: number, raw: string) => {
    const key = `${exIdx}-${setIdx}`;
    const cleaned = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setWeightTexts(prev => ({ ...prev, [key]: cleaned }));
    const num = cleaned === '' || cleaned === '.' ? 0 : parseFloat(cleaned) || 0;
    handleSaveSet(exIdx, setIdx, 'weightUsed', num);
  };

  const fetchHistoryForDay = async (day: any) => {
    if (!day || !day.exercises) return;
    const equipmentNames = day.exercises.map((e: any) => e.equipmentName);
    try {
      const res = await fetch("/api/gym/exercise-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipmentNames })
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || {});
      }
    } catch (e) {}
  };

  const startWorkout = (day: any = selectedDay) => {
    if (!day) return;
    setStartTime(Date.now());
    setActive(true);
    fetchHistoryForDay(day);
  };

  const toggleWorkout = () => {
    if (!active) startWorkout();
    else setActive(false);
  };

  const handleSaveSet = (exIdx: number, setIdx: number, field: string, value: any) => {
    const nextLogs = { ...logs };
    if (!nextLogs[exIdx]) nextLogs[exIdx] = [];
    if (!nextLogs[exIdx][setIdx]) nextLogs[exIdx][setIdx] = { repsDone: 0, weightUsed: 0, restSecondsTaken: 0, assisted: false, assistedAtRep: 0 };
    nextLogs[exIdx][setIdx][field] = value;
    setLogs(nextLogs);
    saveDraftLocally(seconds, nextLogs, exerciseNotes, currentExIdx);
  };

  const handleSaveExNote = (exIdx: number, field: 'note' | 'imageUrl', value: string) => {
    const nextNotes = { ...exerciseNotes };
    if (!nextNotes[exIdx]) nextNotes[exIdx] = { note: '', imageUrl: '' };
    nextNotes[exIdx][field] = value;
    setExerciseNotes(nextNotes);
    saveDraftLocally(seconds, logs, nextNotes, currentExIdx);
  };

  const handleSaveSetNote = (exIdx: number, setIdx: number, value: string) => {
    const key = `${exIdx}-${setIdx}`;
    const next = { ...setNotes, [key]: value };
    setSetNotes(next);
    if (selectedRoutine?._id && selectedDay?.dayName) {
      try {
        localStorage.setItem(getNotesKey(selectedRoutine._id, selectedDay.dayName), JSON.stringify(next));
      } catch {}
    }
  };

  const getSetNote = (exIdx: number, setIdx: number) => setNotes[`${exIdx}-${setIdx}`] || '';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeUploadExIdx === null || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Img = reader.result as string;
      setLoading(true);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: base64Img, folder: "gym-live-session" })
        });
        if (res.ok) {
          const data = await res.json();
          handleSaveExNote(activeUploadExIdx, 'imageUrl', data.url);
        } else {
          alert("Could not upload image to server.");
        }
      } catch (err) {
        alert("Network error during upload.");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setActiveUploadExIdx(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerImagePicker = (exIdx: number) => {
    setActiveUploadExIdx(exIdx);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const finishWorkout = async () => {
    if (!selectedRoutine || !selectedDay) return;
    setActive(false);
    setSaving(true);
    
    try {
      const exercises = selectedDay.exercises.map((ex: any, i: number) => {
        const eNote = exerciseNotes[i] || { note: '', imageUrl: '' };
        return {
          equipmentName: ex.equipmentName,
          sets: logs[i] ? logs[i].filter(Boolean) : [],
          exerciseNote: eNote.note,
          exerciseImageUrl: eNote.imageUrl
        };
      });

      const res = await fetch("/api/gym/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routineId: selectedRoutine._id,
          splitDayName: selectedDay.dayName,
          durationSeconds: seconds,
          exercises
        })
      });

      if (res.ok) {
        localStorage.removeItem(PERSIST_KEY);
        router.push("/gym");
      } else {
        alert("Failed to sync workout to server.");
        setActive(true);
      }
    } catch (e) {
      alert("Could not reach the server.");
      setActive(true);
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}:${rs < 10 ? '0' : ''}${rs}`;
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 w-full relative">
      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        style={{ display: "none" }} 
      />

      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => {
            if (active) {
              if (confirm("Pause Workout?\nYou can resume later, your progress is auto-saved locally.")) {
                router.back();
              }
            } else {
              router.back();
            }
          }}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] transition-colors shadow-sm"
        >
          <ArrowLeft size={18} className="text-gray-300" />
        </button>
        
        {active && (
          <div className="flex items-center gap-2 px-4 py-2 bg-[#1F2023] border border-[#2A2B2F] rounded-full shadow-sm">
            <Timer size={14} className="text-[#E8414A]" />
            <span className="font-mono font-bold text-[#E8414A] text-sm tracking-wider">{formatTime(seconds)}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-8">
        <div className="max-w-7xl mx-auto">
          {!active && !selectedRoutine && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold text-gray-100">Start Session</h1>
              {loading ? (
                <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin my-4" />
              ) : (
                <div className="space-y-4">
                  {routines.map(r => (
                    <button
                      key={r._id}
                      onClick={() => setSelectedRoutine(r)}
                      className="w-full text-left bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] rounded-3xl p-6 transition-colors shadow-sm"
                    >
                      <h2 className="text-xl font-bold text-gray-100 mb-2">{r.routineName}</h2>
                      <p className="text-sm font-bold text-gray-500">{r.splitDays?.length || 0} Split Days</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!active && selectedRoutine && !selectedDay && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-100 mb-2">{selectedRoutine.routineName}</h1>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Select your split day</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedRoutine.splitDays.map((d: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedDay(d)}
                    className="w-full text-left bg-[#1F2023] border border-[#2A2B2F] hover:border-[#E8414A]/30 rounded-3xl p-6 transition-colors shadow-sm group"
                  >
                    <h2 className="text-xl font-bold text-[#E8414A] mb-2">{d.dayName}</h2>
                    <p className="text-sm font-bold text-gray-500 group-hover:text-gray-300">{d.exercises?.length || 0} Exercises</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedDay && (
            <div>
              {!active ? (
                <button
                  onClick={toggleWorkout}
                  className="w-full bg-[#E8414A] hover:bg-[#D62C35] rounded-3xl p-6 flex justify-center items-center gap-3 transition-colors shadow-lg"
                >
                  <Play size={24} className="text-white fill-white" />
                  <span className="text-lg font-bold text-white uppercase tracking-widest">Begin {selectedDay.dayName}</span>
                </button>
              ) : (
                <div className="space-y-8 animate-in fade-in duration-500">
                  {/* Stepper Header */}
                  <div className="flex items-center gap-6">
                    <div className="flex-1 h-2 bg-[#2A2B2F] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#E8414A] transition-all duration-300"
                        style={{ width: `${((currentExIdx + 1) / selectedDay.exercises.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                      {currentExIdx + 1} / {selectedDay.exercises.length}
                    </span>
                  </div>

                  {/* Active Exercise */}
                  {selectedDay.exercises.map((ex: any, exIdx: number) => {
                    if (exIdx !== currentExIdx) return null;

                    const pastExRecord = history[ex.equipmentName];
                    const exNoteState = exerciseNotes[exIdx] || { note: '', imageUrl: '' };

                    return (
                      <div key={exIdx} className="space-y-8 animate-in slide-in-from-right-8 duration-300">
                        
                        {/* Muscle Graphic Placeholder / Name Banner */}
                        <div className="h-48 bg-gradient-to-tr from-[#161618] to-[#1F2023] border border-[#2A2B2F] rounded-3xl relative overflow-hidden flex items-end p-8 shadow-inner">
                          <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                          <div className="relative z-10 w-full">
                            <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter shadow-sm truncate">{ex.equipmentName}</h2>
                            <div className="flex items-center gap-2 mt-2">
                              <Zap size={16} className="text-[#E8414A] fill-[#E8414A]" />
                              <span className="text-xs font-bold text-[#E8414A] uppercase tracking-widest">{selectedDay.dayName}</span>
                            </div>
                          </div>
                        </div>

                        {/* Targets */}
                        <div className="flex items-center justify-between px-2">
                          <div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Target</div>
                            <div className="text-lg font-bold text-gray-100">{ex.targetSets} Sets × {ex.targetReps} Reps</div>
                          </div>
                          
                          <button
                            onClick={() => router.push(`/gym/exercise/${encodeURIComponent(ex.equipmentName)}/progress`)}
                            className="px-4 py-2 rounded-full bg-[#E8414A]/10 border border-[#E8414A]/30 text-xs font-bold text-[#E8414A] uppercase tracking-widest hover:bg-[#E8414A]/20 transition-colors"
                          >
                            View Progress
                          </button>
                          
                          <div className="text-right">
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Ideal Rest</div>
                            <div className="text-lg font-bold text-[#E8414A]">{ex.restSeconds}s</div>
                          </div>
                        </div>

                        {/* Sets Logger */}
                        <div className="space-y-6">
                          {Array.from({ length: ex.targetSets }).map((_, setIdx) => {
                            const setData = logs[exIdx]?.[setIdx] || { repsDone: 0, weightUsed: 0, restSecondsTaken: 0, assisted: false, assistedAtRep: 0 };
                            const prevData = pastExRecord?.sets?.[setIdx];
                            
                            return (
                              <div key={setIdx} className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 shadow-sm">
                                
                                <div className="flex items-center justify-between mb-6">
                                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Set {setIdx + 1}</h3>
                                  <button
                                    onClick={() => handleSaveSet(exIdx, setIdx, 'assisted', !setData.assisted)}
                                    className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border transition-colors ${
                                      setData.assisted ? 'bg-[#E8414A]/10 border-[#E8414A] text-[#E8414A]' : 'bg-[#161618] border-[#2A2B2F] text-gray-500 hover:text-gray-300'
                                    }`}
                                  >
                                    Assist
                                  </button>
                                </div>

                                {/* Progressive Overload Banner */}
                                {prevData && (
                                  <div className="bg-[#161618] border border-[#2A2B2F] rounded-2xl p-5 mb-6 flex items-center justify-between shadow-sm">
                                    <div>
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Last Session</span>
                                        {prevData.assisted && (
                                          <span className="bg-red-500/10 text-red-500 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">Assisted</span>
                                        )}
                                      </div>
                                      <div className="text-base font-bold text-gray-100">{prevData.weightUsed || 0}kg × {prevData.repsDone || 0} reps</div>
                                    </div>
                                    <div className="flex items-center gap-2 bg-[#E8414A]/10 border border-[#E8414A]/30 px-3 py-2 rounded-xl">
                                      <TrendingUp size={14} className="text-[#E8414A]" />
                                      <span className="text-[10px] font-bold text-[#E8414A] uppercase tracking-widest">
                                        {(prevData.repsDone || 0) >= ex.targetReps ? 'Increase Wgt' : `Push ${ex.targetReps} reps`}
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {/* Inputs */}
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                  <div className="bg-[#161618] border border-[#2A2B2F] rounded-2xl p-4">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Weight (kg)</div>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={getWeightText(exIdx, setIdx)}
                                      onChange={(e) => handleWeightChange(exIdx, setIdx, e.target.value)}
                                      className="w-full bg-transparent border-none text-3xl font-black text-gray-100 focus:outline-none placeholder:text-gray-600"
                                    />
                                  </div>
                                  <div className="bg-[#161618] border border-[#2A2B2F] rounded-2xl p-4">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Reps</div>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={setData.repsDone ? String(setData.repsDone) : ''}
                                      onChange={(e) => {
                                        const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                                        handleSaveSet(exIdx, setIdx, 'repsDone', cleaned === '' ? 0 : parseFloat(cleaned) || 0);
                                      }}
                                      className="w-full bg-transparent border-none text-3xl font-black text-gray-100 focus:outline-none placeholder:text-gray-600"
                                    />
                                  </div>
                                </div>

                                {setData.assisted && (
                                  <div className="bg-[#E8414A]/10 border border-[#E8414A]/30 rounded-2xl p-4 mb-6 flex items-center justify-between animate-in fade-in zoom-in-95 duration-200">
                                    <span className="text-[11px] font-bold text-[#E8414A] uppercase tracking-widest">Assisted at rep #</span>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={setData.assistedAtRep ? String(setData.assistedAtRep) : ''}
                                      onChange={(e) => handleSaveSet(exIdx, setIdx, 'assistedAtRep', Number(e.target.value))}
                                      className="w-20 bg-[#161618] border border-[#E8414A]/20 rounded-lg py-1 px-3 text-center text-lg font-bold text-[#E8414A] focus:outline-none"
                                    />
                                  </div>
                                )}

                                {/* Rest Logger */}
                                <div className="mb-6">
                                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 ml-1">Log Actual Rest</div>
                                  <div className="flex flex-wrap gap-2">
                                    {['45s', '1.5m', '2m', '3m', '3m+'].map((label) => {
                                      const valMap: any = { '45s': 45, '1.5m': 90, '2m': 120, '3m': 180, '3m+': 300 };
                                      const isSel = setData.restSecondsTaken === valMap[label];
                                      return (
                                        <button
                                          key={label}
                                          onClick={() => handleSaveSet(exIdx, setIdx, 'restSecondsTaken', valMap[label])}
                                          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                            isSel ? 'bg-gray-200 border-gray-200 text-gray-900' : 'bg-[#161618] border-[#2A2B2F] text-gray-500 hover:bg-[#2A2B2F]'
                                          }`}
                                        >
                                          {label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Set Note */}
                                {(() => {
                                  const noteKey = `${exIdx}-${setIdx}`;
                                  const existingNote = getSetNote(exIdx, setIdx);
                                  const isExpanded = expandedSetNote === noteKey;

                                  return (
                                    <div>
                                      {existingNote && !isExpanded && (
                                        <div className="bg-[#161618] border border-[#2A2B2F] rounded-xl p-4 mb-3">
                                          <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Last Note</div>
                                          <div className="text-sm font-semibold text-gray-300">{existingNote}</div>
                                        </div>
                                      )}
                                      
                                      {isExpanded ? (
                                        <div className="bg-[#161618] border border-[#E8414A]/40 rounded-xl p-4">
                                          <textarea
                                            autoFocus
                                            placeholder="Note for this set..."
                                            value={existingNote}
                                            onChange={(e) => handleSaveSetNote(exIdx, setIdx, e.target.value)}
                                            className="w-full bg-transparent border-none text-sm font-semibold text-gray-100 focus:outline-none placeholder:text-gray-600 resize-none min-h-[60px]"
                                          />
                                          <div className="flex justify-end mt-2">
                                            <button 
                                              onClick={() => setExpandedSetNote(null)}
                                              className="text-[11px] font-bold text-[#E8414A] uppercase tracking-widest hover:text-[#D62C35]"
                                            >
                                              Done
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setExpandedSetNote(noteKey)}
                                          className="text-[11px] font-bold text-[#E8414A] uppercase tracking-widest hover:text-[#D62C35] flex items-center gap-1.5"
                                        >
                                          {existingNote ? '✎ Edit Note' : '+ Add Note'}
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>

                        {/* Routine Tip */}
                        {(ex.exerciseNote || ex.exerciseImageUrl) && (
                          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8">
                            <div className="flex items-center gap-2 mb-4">
                              <AlertCircle size={14} className="text-gray-500" />
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Routine Tip</span>
                            </div>
                            {ex.exerciseNote && <p className="text-sm font-semibold text-gray-300 mb-4">{ex.exerciseNote}</p>}
                            {ex.exerciseImageUrl && (
                              <img src={ex.exerciseImageUrl} alt="Tip" className="w-full h-48 object-cover rounded-2xl border border-[#2A2B2F]" />
                            )}
                          </div>
                        )}

                        {/* Exercise Media & Notes */}
                        <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8">
                          <h3 className="text-base font-bold text-gray-100 uppercase tracking-widest mb-6">Exercise Media & Notes</h3>
                          
                          {(ex.exerciseNote || ex.exerciseImageUrl || pastExRecord?.exerciseNote || pastExRecord?.exerciseImageUrl) && (
                            <div className="bg-[#161618] border border-[#2A2B2F] rounded-2xl p-5 mb-6 shadow-sm">
                              <div className="flex items-center gap-2 mb-3">
                                <AlertCircle size={12} className="text-gray-500" />
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Previous Notes</span>
                              </div>
                              {ex.exerciseNote && <p className="text-sm font-semibold text-gray-300 mb-3">{ex.exerciseNote}</p>}
                              {pastExRecord?.exerciseNote && !ex.exerciseNote && <p className="text-sm font-semibold text-gray-300 mb-3">{pastExRecord.exerciseNote}</p>}
                              
                              {ex.exerciseImageUrl ? (
                                <img src={ex.exerciseImageUrl} alt="Past visual" className="w-full h-40 object-cover rounded-xl mt-2" />
                              ) : pastExRecord?.exerciseImageUrl ? (
                                <img src={pastExRecord.exerciseImageUrl} alt="Past visual" className="w-full h-40 object-cover rounded-xl mt-2" />
                              ) : null}
                            </div>
                          )}

                          <div className="bg-[#161618] border border-[#2A2B2F] rounded-2xl p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Live Session Notes</span>
                              {!exNoteState.imageUrl && (
                                <button onClick={() => triggerImagePicker(exIdx)} className="p-1.5 bg-[#1F2023] rounded-lg border border-[#2A2B2F] hover:bg-[#2A2B2F]">
                                  <Camera size={14} className="text-[#E8414A]" />
                                </button>
                              )}
                            </div>
                            
                            <textarea
                              placeholder="Add a note for this exercise..."
                              value={exNoteState.note}
                              onChange={(e) => handleSaveExNote(exIdx, 'note', e.target.value)}
                              className="w-full bg-transparent border-none text-sm font-semibold text-gray-100 focus:outline-none placeholder:text-gray-600 min-h-[60px] resize-y"
                            />
                            
                            {exNoteState.imageUrl && (
                              <div className="relative w-full h-40 rounded-xl overflow-hidden mt-4 border border-[#2A2B2F]">
                                <img src={exNoteState.imageUrl} alt="Live visual" className="w-full h-full object-cover" />
                                <button 
                                  onClick={() => handleSaveExNote(exIdx, 'imageUrl', '')}
                                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 p-2 rounded-lg transition-colors"
                                >
                                  <X size={14} className="text-white" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation Buttons (Sticky Bottom) */}
      {!loading && active && selectedDay && selectedDay.exercises && (
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 bg-[#161618]/90 backdrop-blur-md border-t border-[#2A2B2F] flex gap-4">
          <button 
            onClick={() => setCurrentExIdx(prev => Math.max(0, prev - 1))}
            disabled={currentExIdx === 0}
            className="flex-1 h-16 bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] rounded-3xl flex items-center justify-center disabled:opacity-40 transition-colors shadow-sm"
          >
            <ChevronLeft size={24} className="text-gray-400" />
          </button>

          {currentExIdx < selectedDay.exercises.length - 1 ? (
            <button 
              onClick={() => setCurrentExIdx(prev => prev + 1)}
              className="flex-[3] h-16 bg-[#E8414A] hover:bg-[#D62C35] rounded-3xl flex items-center justify-center gap-2 shadow-lg shadow-[#E8414A]/20 transition-all"
            >
              <span className="text-white font-bold text-sm uppercase tracking-widest">Next Exercise</span>
              <ChevronRight size={20} className="text-white" />
            </button>
          ) : (
            <button 
              onClick={finishWorkout}
              disabled={saving}
              className="flex-[3] h-16 bg-gray-100 hover:bg-white rounded-3xl flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-70"
            >
              {saving ? (
                <div className="w-5 h-5 rounded-full border-2 border-gray-900 border-t-transparent animate-spin" />
              ) : (
                <>
                  <span className="text-gray-900 font-bold text-sm uppercase tracking-widest">Finish Session</span>
                  <Save size={18} className="text-gray-900" />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function LiveSessionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading...</div>}>
      <LiveSessionInner />
    </Suspense>
  );
}
