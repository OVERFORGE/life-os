"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, ChevronUp } from "lucide-react";

export default function CreateGymPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [name, setName] = useState("");
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedCat, setExpandedCat] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Custom Equipment
  const [customEquipment, setCustomEquipment] = useState<{name: string, category: string}[]>([]);
  const [newCustomName, setNewCustomName] = useState("");
  const [newCustomCategory, setNewCustomCategory] = useState("Chest");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/gym/inventory");
        const data = await res.json();
        setCategories(data.categories || {});
        
        if (id) {
          const userGym = data.userGyms?.find((g: any) => g._id === id);
          if (userGym) {
            setName(userGym.name);
            setSelected(new Set(userGym.selectedPreSeeded || []));
            if (userGym.customEquipment) {
              setCustomEquipment(userGym.customEquipment);
            }
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const toggleSelect = (item: string) => {
    const next = new Set(selected);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    setSelected(next);
  };

  const toggleCategory = (cat: string) => {
    const next = new Set(expandedCat);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setExpandedCat(next);
  };

  const selectAllInCategory = (cat: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const items = categories[cat] || [];
    const next = new Set(selected);
    const allSelected = items.every(i => next.has(i));
    if (allSelected) {
      items.forEach(i => next.delete(i));
    } else {
      items.forEach(i => next.add(i));
    }
    setSelected(next);
  };

  const handleCreate = async () => {
    if (!name.trim()) return alert("Gym name is required");
    setSaving(true);
    try {
      const url = id ? `/api/gym/inventory/${id}` : "/api/gym/inventory";
      const method = id ? "PATCH" : "POST";
      const payload = { 
        name: name.trim(), 
        selectedPreSeeded: Array.from(selected),
        customEquipment 
      };
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        router.push("/gym");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to save gym");
      }
    } catch (e) {
      alert("Network request failed");
    } finally {
      setSaving(false);
    }
  };

  const getCategoryCount = (cat: string) => {
    return (categories[cat] || []).filter(i => selected.has(i)).length;
  };

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
            <h1 className="text-2xl font-bold tracking-tight text-gray-100">{id ? "Edit" : "Create"} Gym Profile</h1>
          </div>
        </div>
        
        <button 
          onClick={handleCreate}
          disabled={saving}
          className="px-5 py-2.5 bg-[#E8414A] hover:bg-[#D62C35] rounded-full text-xs font-bold tracking-widest text-white transition-colors uppercase shadow-sm disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-8">
        <div className="max-w-7xl mx-auto space-y-10">
          
          {/* Gym Name */}
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 ml-2">Gym Name</div>
            <input
              placeholder="e.g. Planet Fitness, Garage Gym"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#1F2023] border border-[#2A2B2F] text-gray-100 px-5 py-4 rounded-2xl text-[15px] font-semibold focus:outline-none focus:border-[#E8414A]/50 transition-colors placeholder:text-gray-600 shadow-sm"
            />
          </div>

          {/* Custom Equipment Adder */}
          <div className="pt-6 border-t border-[#2A2B2F]">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 ml-2">Add Custom Equipment</div>
            
            <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 shadow-sm">
              <input
                placeholder="e.g. Special GHD Machine"
                value={newCustomName}
                onChange={(e) => setNewCustomName(e.target.value)}
                className="w-full bg-[#161618] border border-[#2A2B2F] text-gray-100 px-5 py-3.5 rounded-xl text-sm font-semibold focus:outline-none focus:border-[#E8414A]/50 transition-colors placeholder:text-gray-600 shadow-sm mb-5"
              />
              
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-bold text-gray-400">Muscle Group:</span>
                <div className="flex flex-wrap gap-2">
                  {['Chest', 'Back', 'Legs', 'Arms', 'Shoulders', 'Core', 'Cardio'].map(cat => (
                    <button 
                      key={cat}
                      onClick={() => setNewCustomCategory(cat)}
                      className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
                        newCustomCategory === cat 
                          ? 'bg-[#E8414A]/10 border-[#E8414A]/30 text-[#E8414A]' 
                          : 'bg-transparent border-[#2A2B2F] text-gray-400 hover:bg-[#2A2B2F]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              
              <button 
                onClick={() => {
                  if(newCustomName.trim()) {
                    setCustomEquipment([...customEquipment, { name: newCustomName.trim(), category: newCustomCategory }]);
                    setNewCustomName('');
                  }
                }}
                className="w-full py-3.5 rounded-xl bg-[#161618] border border-[#2A2B2F] hover:bg-[#2A2B2F] text-xs font-bold text-[#E8414A] uppercase tracking-widest transition-colors shadow-sm"
              >
                + Add Equipment
              </button>
            </div>
            
            {customEquipment.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {customEquipment.map((eq, i) => (
                  <div key={i} className="flex items-center bg-[#E8414A]/10 border border-[#E8414A]/20 rounded-xl px-4 py-2 shadow-sm">
                    <span className="text-xs font-bold text-[#E8414A]">{eq.name} <span className="text-gray-400 opacity-80 font-semibold">({eq.category})</span></span>
                    <button 
                      onClick={() => setCustomEquipment(customEquipment.filter((_, idx) => idx !== i))}
                      className="ml-3 w-5 h-5 rounded-md hover:bg-red-500/20 text-red-500 flex items-center justify-center font-bold text-[10px]"
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pre-Seeded Equipment */}
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 ml-2">
              Available Equipment ({selected.size} selected)
            </div>
            
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(categories).map(([cat, items]) => {
                  const isExpanded = expandedCat.has(cat);
                  const count = getCategoryCount(cat);
                  const allSelected = items.every(i => selected.has(i));
                  
                  return (
                    <div key={cat} className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl overflow-hidden shadow-sm transition-all hover:border-gray-600/50">
                      
                      {/* Category Header */}
                      <div 
                        onClick={() => toggleCategory(cat)}
                        className="px-6 py-5 flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <h3 className="text-base font-bold text-gray-100">{cat}</h3>
                          {count > 0 && (
                            <div className="bg-[#E8414A]/15 px-2.5 py-1 rounded-lg">
                              <span className="text-[10px] font-bold text-[#E8414A]">{count}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <button
                            onClick={(e) => selectAllInCategory(cat, e)}
                            className="px-3 py-1.5 rounded-lg bg-[#161618] hover:bg-[#2A2B2F] transition-colors text-[10px] font-bold text-gray-400 uppercase tracking-widest border border-[#2A2B2F]"
                          >
                            {allSelected ? "None" : "All"}
                          </button>
                          {isExpanded ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
                        </div>
                      </div>

                      {/* Equipment Items */}
                      {isExpanded && (
                        <div className="px-5 pb-5 pt-1 bg-[#1F2023]">
                          <div className="h-px bg-[#2A2B2F] w-full mb-4" />
                          <div className="grid grid-cols-2 gap-3">
                            {items.map((item, idx) => {
                              const isSel = selected.has(item);
                              return (
                                <button
                                  key={idx}
                                  onClick={() => toggleSelect(item)}
                                  className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-colors ${
                                    isSel 
                                      ? 'bg-[#E8414A]/10 border-[#E8414A]/30' 
                                      : 'bg-[#161618] border-[#2A2B2F] hover:border-gray-500/50'
                                  }`}
                                >
                                  <span className={`text-sm ${isSel ? 'text-[#E8414A] font-bold' : 'text-gray-300 font-semibold'} truncate pr-2`}>
                                    {item}
                                  </span>
                                  {isSel && <Check size={16} className="text-[#E8414A] shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
