"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Trash2, Plus, X, Search, ArrowUp, ArrowDown, Image as ImageIcon } from "lucide-react";

function CreateRoutineInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  
  const [gyms, setGyms] = useState<any[]>([]);
  const [selectedGym, setSelectedGym] = useState<string | null>(null);
  const [routineName, setRoutineName] = useState("");
  
  const [splitDays, setSplitDays] = useState([{ dayName: "", exercises: [] as any[] }]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [currentDayIdx, setCurrentDayIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadContext, setActiveUploadContext] = useState<{dayIdx: number, exIdx: number} | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [invRes, routRes] = await Promise.all([
          fetch("/api/gym/inventory"),
          id ? fetch("/api/gym/routines") : Promise.resolve(null)
        ]);

        const invData = await invRes.json();
        setGyms(invData.userGyms || []);
        
        if (id && routRes) {
          const routines = await routRes.json();
          const routine = routines.find((r: any) => r._id === id);
          if (routine) {
            setRoutineName(routine.routineName);
            setSelectedGym(routine.gymId);
            setSplitDays(routine.splitDays || [{ dayName: "", exercises: [] }]);
          }
        } else if (invData.userGyms?.length > 0) {
          setSelectedGym(invData.userGyms[0]._id);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleSave = async () => {
    if (!routineName || !selectedGym) return alert("Please select a gym and name your routine.");
    
    const validDays = splitDays.filter(d => d.dayName.trim().length > 0);
    if(validDays.length === 0) return alert("Add at least one named split day.");

    setSaving(true);
    try {
      const url = id ? `/api/gym/routines/${id}` : "/api/gym/routines";
      const method = id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: selectedGym,
          routineName,
          splitDays: validDays
        })
      });
      if (res.ok) {
        router.push("/gym");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to save routine");
      }
    } catch (e) {
      alert("Network request failed");
    } finally {
      setSaving(false);
    }
  };

  const addDay = () => setSplitDays([...splitDays, { dayName: "", exercises: [] }]);
  
  const removeDay = (idx: number) => {
    const updated = [...splitDays];
    updated.splice(idx, 1);
    setSplitDays(updated);
  };

  const updateDayName = (idx: number, name: string) => {
    const updated = [...splitDays];
    updated[idx].dayName = name;
    setSplitDays(updated);
  };

  const openExerciseModal = (idx: number) => {
    setCurrentDayIdx(idx);
    setModalVisible(true);
  };

  const addExercise = (equipmentName: string) => {
    if (currentDayIdx === null) return;
    const updated = [...splitDays];
    updated[currentDayIdx].exercises.push({
      equipmentName,
      targetSets: 3,
      targetReps: 10,
      restSeconds: 90,
      exerciseNote: "",
      exerciseImageUrl: ""
    });
    setSplitDays(updated);
    setModalVisible(false);
    setSearchQuery("");
  };

  const removeExercise = (dayIdx: number, exIdx: number) => {
    const updated = [...splitDays];
    updated[dayIdx].exercises.splice(exIdx, 1);
    setSplitDays(updated);
  };

  const moveExercise = (dayIdx: number, exIdx: number, direction: "up" | "down") => {
    const updated = [...splitDays];
    const exercises = updated[dayIdx].exercises;
    if (direction === "up" && exIdx > 0) {
      const temp = exercises[exIdx];
      exercises[exIdx] = exercises[exIdx - 1];
      exercises[exIdx - 1] = temp;
    } else if (direction === "down" && exIdx < exercises.length - 1) {
      const temp = exercises[exIdx];
      exercises[exIdx] = exercises[exIdx + 1];
      exercises[exIdx + 1] = temp;
    }
    setSplitDays(updated);
  };

  const updateExercise = (dayIdx: number, exIdx: number, field: string, value: any) => {
    const updated = [...splitDays];
    updated[dayIdx].exercises[exIdx][field] = value;
    setSplitDays(updated);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeUploadContext || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Img = reader.result as string;
      setLoading(true);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: base64Img, folder: "gym-routine-notes" })
        });
        if (res.ok) {
          const data = await res.json();
          updateExercise(activeUploadContext.dayIdx, activeUploadContext.exIdx, "exerciseImageUrl", data.url);
        } else {
          alert("Could not upload image to server.");
        }
      } catch (err) {
        alert("Network error during upload.");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setActiveUploadContext(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerImagePicker = (dayIdx: number, exIdx: number) => {
    setActiveUploadContext({ dayIdx, exIdx });
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const currentGym = gyms.find(g => g._id === selectedGym);
  const currentGymEquipment = [
    ...(currentGym?.selectedPreSeeded || []),
    ...(currentGym?.customEquipment?.map((c: any) => c.name) || [])
  ];
  
  const filteredEquipment = currentGymEquipment.filter((e: string) => 
    e.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-7xl mx-auto w-full relative">
      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        style={{ display: "none" }} 
      />

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
            <h1 className="text-2xl font-bold tracking-tight text-gray-100">{id ? "Edit" : "Create"} Routine</h1>
          </div>
        </div>
        
        <button 
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-[#E8414A] hover:bg-[#D62C35] rounded-full text-xs font-bold tracking-widest text-white transition-colors uppercase shadow-sm disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-8">
        <div className="max-w-7xl mx-auto space-y-10">
          
          {/* Routine Name */}
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 ml-2">Routine Name</div>
            <input
              placeholder="e.g. Push Pull Legs"
              value={routineName}
              onChange={(e) => setRoutineName(e.target.value)}
              className="w-full bg-[#1F2023] border border-[#2A2B2F] text-gray-100 px-5 py-4 rounded-2xl text-[15px] font-semibold focus:outline-none focus:border-[#E8414A]/50 transition-colors placeholder:text-gray-600 shadow-sm"
            />
          </div>

          {/* Select Gym */}
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 ml-2">Select Gym Environment</div>
            {loading ? (
              <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin my-4" />
            ) : (
              <div className="flex flex-wrap gap-3">
                {gyms.map(g => (
                  <button
                    key={g._id}
                    onClick={() => setSelectedGym(g._id)}
                    className={`px-5 py-3 rounded-2xl text-sm font-bold border transition-colors shadow-sm ${
                      selectedGym === g._id 
                        ? 'bg-[#E8414A]/10 border-[#E8414A]/30 text-[#E8414A]' 
                        : 'bg-[#1F2023] border-[#2A2B2F] text-gray-400 hover:bg-[#2A2B2F]'
                    }`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-px bg-[#2A2B2F] w-full" />

          {/* Split Map */}
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-6 ml-2">Workout Split Map</div>
            
            <div className="space-y-8">
              {splitDays.map((day, idx) => (
                <div key={idx} className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 shadow-sm">
                  <div className="flex justify-between items-center mb-6 pb-6 border-b border-[#2A2B2F]">
                    <input
                      placeholder="Day Name (e.g. Chest)"
                      value={day.dayName}
                      onChange={(e) => updateDayName(idx, e.target.value)}
                      className="bg-transparent border-none text-gray-100 text-2xl font-bold focus:outline-none placeholder:text-gray-600 w-full max-w-sm"
                    />
                    <button 
                      onClick={() => removeDay(idx)}
                      className="w-10 h-10 rounded-xl bg-[#161618] border border-[#2A2B2F] hover:bg-red-500/10 hover:text-red-500 flex items-center justify-center transition-colors text-[#E8414A]"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="space-y-6">
                    {day.exercises.map((ex, eIdx) => (
                      <div key={eIdx} className="bg-[#161618] border border-[#2A2B2F] rounded-2xl p-5 shadow-sm">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-3">
                            <span className="text-[#E8414A] font-bold text-lg">{eIdx + 1}.</span>
                            <h3 className="text-gray-100 font-bold text-lg">{ex.equipmentName}</h3>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => moveExercise(idx, eIdx, 'up')}
                              disabled={eIdx === 0}
                              className="w-8 h-8 rounded-lg bg-[#1F2023] flex items-center justify-center text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
                            >
                              <ArrowUp size={16} />
                            </button>
                            <button 
                              onClick={() => moveExercise(idx, eIdx, 'down')}
                              disabled={eIdx === day.exercises.length - 1}
                              className="w-8 h-8 rounded-lg bg-[#1F2023] flex items-center justify-center text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
                            >
                              <ArrowDown size={16} />
                            </button>
                            <button 
                              onClick={() => removeExercise(idx, eIdx)}
                              className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 flex items-center justify-center ml-2 transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>

                        {/* Params */}
                        <div className="grid grid-cols-3 gap-4 mb-6">
                          <div>
                            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Sets</div>
                            <input
                              type="number"
                              value={ex.targetSets}
                              onChange={(e) => updateExercise(idx, eIdx, 'targetSets', Number(e.target.value))}
                              className="w-full bg-[#1F2023] border border-[#2A2B2F] rounded-xl py-3 text-center text-gray-100 font-bold text-base focus:outline-none focus:border-[#E8414A]/50"
                            />
                          </div>
                          <div>
                            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Reps</div>
                            <input
                              type="number"
                              value={ex.targetReps}
                              onChange={(e) => updateExercise(idx, eIdx, 'targetReps', Number(e.target.value))}
                              className="w-full bg-[#1F2023] border border-[#2A2B2F] rounded-xl py-3 text-center text-gray-100 font-bold text-base focus:outline-none focus:border-[#E8414A]/50"
                            />
                          </div>
                          <div>
                            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Rest (s)</div>
                            <input
                              type="number"
                              value={ex.restSeconds}
                              onChange={(e) => updateExercise(idx, eIdx, 'restSeconds', Number(e.target.value))}
                              className="w-full bg-[#1F2023] border border-[#2A2B2F] rounded-xl py-3 text-center text-gray-100 font-bold text-base focus:outline-none focus:border-[#E8414A]/50"
                            />
                          </div>
                        </div>

                        {/* Form Notes & Media */}
                        <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5">
                          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Form Notes & Media</div>
                          <textarea
                            placeholder="Focus on the negative, squeeze at the top..."
                            value={ex.exerciseNote || ""}
                            onChange={(e) => updateExercise(idx, eIdx, 'exerciseNote', e.target.value)}
                            className="w-full bg-[#161618] border border-[#2A2B2F] rounded-xl p-4 text-sm text-gray-300 min-h-[80px] focus:outline-none focus:border-[#E8414A]/50 mb-4 resize-y"
                          />

                          {ex.exerciseImageUrl ? (
                            <div className="relative w-full h-40 rounded-xl overflow-hidden border border-[#2A2B2F]">
                              <img src={ex.exerciseImageUrl} alt="Form visual" className="w-full h-full object-cover" />
                              <button 
                                onClick={() => updateExercise(idx, eIdx, 'exerciseImageUrl', '')}
                                className="absolute top-2 right-2 bg-black/60 p-2 rounded-lg hover:bg-black/80 transition-colors"
                              >
                                <X size={14} className="text-white" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => triggerImagePicker(idx, eIdx)}
                              className="flex items-center gap-2 bg-[#161618] border border-[#2A2B2F] hover:bg-[#2A2B2F] px-4 py-2.5 rounded-xl transition-colors"
                            >
                              <ImageIcon size={16} className="text-[#E8414A]" />
                              <span className="text-[11px] font-bold text-[#E8414A] uppercase tracking-widest">Attach Photo</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    <button 
                      onClick={() => openExerciseModal(idx)}
                      className="w-full py-5 rounded-2xl border-2 border-dashed border-[#2A2B2F] hover:border-[#E8414A]/50 hover:bg-[#E8414A]/5 flex items-center justify-center gap-2 transition-colors group"
                    >
                      <Plus size={18} className="text-gray-500 group-hover:text-[#E8414A]" />
                      <span className="text-[11px] font-bold text-gray-500 group-hover:text-[#E8414A] uppercase tracking-widest">Add Exercise</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addDay}
              className="w-full mt-8 bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] p-6 rounded-3xl flex items-center justify-center gap-3 transition-colors shadow-sm"
            >
              <Plus size={20} className="text-[#E8414A]" />
              <span className="text-sm font-bold text-[#E8414A] uppercase tracking-widest">Add Split Day</span>
            </button>
          </div>

        </div>
      </div>

      {/* Modal Overlay */}
      {modalVisible && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-[#1F2023] h-[85vh] rounded-t-[32px] border-t border-[#2A2B2F] flex flex-col animate-in slide-in-from-bottom-8 duration-300">
            <div className="px-8 pt-8 pb-6 border-b border-[#2A2B2F] flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-100">Select Exercise</h2>
              <button onClick={() => setModalVisible(false)} className="p-2 bg-[#161618] rounded-xl border border-[#2A2B2F] hover:bg-[#2A2B2F] transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            
            <div className="p-8 pb-0">
              <div className="bg-[#161618] border border-[#2A2B2F] rounded-2xl px-5 flex items-center h-14 mb-8">
                <Search size={20} className="text-gray-500 shrink-0" />
                <input
                  placeholder="Search equipment..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-gray-100 text-sm font-bold focus:outline-none w-full h-full ml-3 placeholder:text-gray-600"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 pb-12 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {filteredEquipment.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm font-bold text-gray-500">No matching equipment found in this gym.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredEquipment.map((item) => (
                    <button
                      key={item}
                      onClick={() => addExercise(item)}
                      className="w-full flex items-center justify-between p-5 rounded-2xl hover:bg-[#2A2B2F] transition-colors text-left group"
                    >
                      <span className="text-[15px] font-bold text-gray-100 group-hover:text-white">{item}</span>
                      <div className="w-8 h-8 rounded-xl bg-[#E8414A]/10 border border-[#E8414A]/20 flex items-center justify-center">
                        <Plus size={16} className="text-[#E8414A]" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateRoutinePage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading...</div>}>
      <CreateRoutineInner />
    </Suspense>
  );
}
