"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPin, Plus, Trash2, Mic, AlertCircle } from "lucide-react";

type SavedLocation = {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  voiceAssistantEnabled: boolean;
};

export default function LocationsPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Form
  const [newName, setNewName] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedCoord, setSelectedCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user");
      if (res.ok) {
        const data = await res.json();
        if (data.preferences?.savedLocations) {
          setLocations(data.preferences.savedLocations);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const persist = async (list: SavedLocation[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { savedLocations: list } }),
      });
      if (res.ok) {
        setLocations(list);
        setIsAdding(false);
        setNewName("");
      }
    } catch (e) {
      console.error("Failed to save locations", e);
    } finally {
      setSaving(false);
    }
  };

  const captureLocation = () => {
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSelectedCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setGeoError(err.message);
      }
    );
  };

  const handleAdd = () => {
    if (!newName.trim()) return alert("Name required");
    if (!selectedCoord) return alert("Please capture location first");
    
    persist([...locations, {
      name: newName.trim(),
      lat: selectedCoord.lat,
      lng: selectedCoord.lng,
      radius: 150,
      voiceAssistantEnabled: voiceEnabled,
    }]);
  };

  const handleDelete = (index: number) => {
    if (confirm(`Delete "${locations[index].name}"?`)) {
      persist(locations.filter((_, i) => i !== index));
    }
  };

  const toggleVoice = (index: number) => {
    const updated = locations.map((l, i) =>
      i === index ? { ...l, voiceAssistantEnabled: !l.voiceAssistantEnabled } : l
    );
    persist(updated);
  };

  const resetForm = () => {
    setIsAdding(false);
    setNewName("");
    setSelectedCoord(null);
    setGeoError("");
  };

  return (
    <div className="min-h-screen bg-[#161618] text-gray-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] transition-colors shadow-sm mr-4"
        >
          <ArrowLeft size={18} className="text-gray-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Locations</h1>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1.5">Geofenced voice assistant zones</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="max-w-3xl mx-auto space-y-8 pb-20">

          <div className="bg-[#E8414A]/10 border border-[#E8414A]/20 rounded-3xl p-5 flex items-start gap-4 shadow-sm">
            <Mic size={20} className="text-[#E8414A] shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-gray-300 leading-relaxed">
              AI responses will be spoken aloud and the mic will auto-activate only when you're within a saved location that has Voice Assistant enabled.
            </p>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-24 bg-[#1F2023] rounded-3xl" />
              <div className="h-24 bg-[#1F2023] rounded-3xl" />
            </div>
          ) : isAdding ? (
            /* ADD FORM */
            <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 shadow-sm">
              <h2 className="text-xl font-bold mb-6">New Location</h2>
              
              <div className="space-y-6">
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 ml-2">Name</div>
                  <input
                    className="w-full bg-[#161618] border border-[#2A2B2F] text-gray-100 px-5 py-4 rounded-2xl text-[15px] font-semibold focus:outline-none focus:border-[#E8414A]/50 transition-colors placeholder:text-gray-600 shadow-sm"
                    placeholder="e.g. Home, Office, Gym"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 ml-2">Location Data</div>
                  {!selectedCoord ? (
                    <button
                      onClick={captureLocation}
                      className="w-full py-4 bg-[#161618] border border-[#2A2B2F] hover:bg-[#2A2B2F] rounded-2xl flex items-center justify-center gap-2 text-sm font-bold text-gray-300 transition-colors shadow-sm"
                    >
                      <MapPin size={16} /> Capture Current Geolocation
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 bg-[#E8414A]/10 border border-[#E8414A]/20 rounded-2xl px-5 py-4 w-max shadow-sm">
                      <MapPin size={16} className="text-[#E8414A]" />
                      <span className="text-sm font-bold text-[#E8414A]">
                        {selectedCoord.lat.toFixed(5)}, {selectedCoord.lng.toFixed(5)}
                      </span>
                    </div>
                  )}
                  {geoError && (
                    <div className="mt-3 flex items-center gap-2 text-xs font-bold text-[#E8414A]">
                      <AlertCircle size={14} /> {geoError}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between bg-[#161618] border border-[#2A2B2F] rounded-2xl p-5 shadow-sm">
                  <div>
                    <div className="text-[15px] font-bold text-gray-100">Voice Assistant</div>
                    <div className="text-xs font-semibold text-gray-500 mt-1">Speak responses aloud & auto-listen here</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={voiceEnabled} onChange={e => setVoiceEnabled(e.target.checked)} />
                    <div className="w-11 h-6 bg-[#2A2B2F] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E8414A]/80"></div>
                  </label>
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={resetForm} disabled={saving} className="flex-1 py-4 rounded-2xl bg-[#2A2B2F] hover:bg-[#3A3C42] text-white font-bold text-[15px] transition-colors shadow-sm">
                    Cancel
                  </button>
                  <button onClick={handleAdd} disabled={saving} className="flex-1 py-4 rounded-2xl bg-[#E8414A] hover:bg-[#D62C35] text-white font-bold text-[15px] transition-all shadow-sm">
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* LIST */
            <div className="space-y-4">
              {locations.length === 0 && (
                <div className="py-16 flex flex-col items-center text-center">
                  <MapPin size={48} className="text-gray-600 mb-5" />
                  <h3 className="text-xl font-bold text-gray-200 mb-2">No locations saved</h3>
                  <p className="text-sm font-semibold text-gray-500 max-w-sm">Add a location to enable the geofenced voice assistant.</p>
                </div>
              )}

              {locations.map((loc, idx) => (
                <div key={idx} className="flex items-center bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-5 shadow-sm">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mr-5 shrink-0 ${loc.voiceAssistantEnabled ? 'bg-[#E8414A]/15' : 'bg-[#2A2B2F]'}`}>
                    <MapPin size={22} className={loc.voiceAssistantEnabled ? 'text-[#E8414A]' : 'text-gray-400'} />
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-gray-100 mb-1">{loc.name}</h3>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)} • {loc.radius}m
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => toggleVoice(idx)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${loc.voiceAssistantEnabled ? 'bg-[#E8414A]/15 hover:bg-[#E8414A]/25 text-[#E8414A]' : 'bg-[#2A2B2F] hover:bg-[#3A3C42] text-gray-400'}`}
                    >
                      <Mic size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(idx)}
                      className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}

              <button 
                onClick={() => setIsAdding(true)}
                className="w-full flex items-center justify-center gap-3 bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] py-5 rounded-3xl transition-colors shadow-sm text-gray-200 font-bold mt-2"
              >
                <Plus size={20} /> Add Location
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
