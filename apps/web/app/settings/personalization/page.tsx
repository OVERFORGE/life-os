"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Scale, Moon, Flame, Check } from "lucide-react";

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(hour: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h}:00 ${ampm}`;
}

export default function PersonalizationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Preferences
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDay, setReminderDay] = useState(0);     
  const [reminderHour, setReminderHour] = useState(9);   
  const [rolloverHour, setRolloverHour] = useState(4);   

  // Diet mode
  const [dietMode, setDietMode] = useState('recomp');
  const [maintenanceCals, setMaintenanceCals] = useState(2200);

  useEffect(() => {
    Promise.all([
      fetch("/api/user"),
      fetch("/api/health/weight-trend")
    ]).then(async ([userRes, weightRes]) => {
      
      let dynamicMaintenance = null;
      if (weightRes.ok) {
        const d = await weightRes.json();
        const weeks = d.weeklyData || [];
        const latestWithEstimate = [...weeks].reverse().find((w: any) => w.maintenanceEstimate !== null);
        if (latestWithEstimate) {
          dynamicMaintenance = latestWithEstimate.maintenanceEstimate;
        }
      }

      if (userRes.ok) {
        const d = await userRes.json();
        const prefs = d.preferences || {};
        setReminderEnabled(prefs.weightReminderEnabled !== false);
        setReminderDay(prefs.weightReminderDay ?? 0);
        setReminderHour(prefs.weightReminderHour ?? 9);
        setRolloverHour(prefs.dayRolloverHour ?? 4);

        if (d.dietMode) setDietMode(d.dietMode);
        
        const baseMaintenance = dynamicMaintenance || d.maintenanceCalories || 2200;
        setMaintenanceCals(Math.round(baseMaintenance / 50) * 50);
      }
      setLoading(false);
    }).catch(console.error);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: {
            weightReminderEnabled: reminderEnabled,
            weightReminderDay: reminderDay,
            weightReminderHour: reminderHour,
            dayRolloverHour: rolloverHour,
          },
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const MODES = [
    { key: 'bulk',       label: 'Bulk',         desc: '+500 kcal surplus',   color: 'text-[#E8414A]', bg: 'bg-[#E8414A]/10', border: 'border-[#E8414A]', offset: 500 },
    { key: 'slight_bulk',label: 'Slight Bulk',  desc: '+250 kcal surplus',   color: 'text-[#E8414A]', bg: 'bg-[#E8414A]/10', border: 'border-[#E8414A]', offset: 250 },
    { key: 'recomp',     label: 'Recomp',       desc: '~Maintenance',        color: 'text-[#E8414A]', bg: 'bg-[#E8414A]/10', border: 'border-[#E8414A]', offset: 0 },
    { key: 'slight_cut', label: 'Slight Cut',   desc: '−250 kcal deficit',   color: 'text-[#E8414A]', bg: 'bg-[#E8414A]/10', border: 'border-[#E8414A]', offset: -250 },
    { key: 'cut',        label: 'Cut',          desc: '−500 kcal deficit',   color: 'text-[#E8414A]', bg: 'bg-[#E8414A]/10', border: 'border-[#E8414A]', offset: -500 },
  ];
  const activeModeObj = MODES.find(m => m.key === dietMode) || MODES[2];
  const targetCals = maintenanceCals + activeModeObj.offset;

  const saveDietMode = async (newMode: string) => {
    const modeObj = MODES.find(m => m.key === newMode) || MODES[2];
    setDietMode(newMode);
    try {
      await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dietMode: newMode,
          dietModeCalorieOffset: modeObj.offset,
          targetCalories: Math.max(1200, maintenanceCals + modeObj.offset),
        }),
      });
    } catch (e) { console.error(e); }
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
          <h1 className="text-2xl font-bold tracking-tight">Personalization</h1>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1.5">App Preferences</p>
        </div>
        
        <button
          onClick={save}
          disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold tracking-wide transition-all shadow-sm ${
            saved 
              ? 'bg-[#E8414A]/15 text-[#E8414A]' 
              : 'bg-white text-black hover:bg-gray-200'
          }`}
        >
          {saving ? 'SAVING...' : saved ? <><Check size={16} /> SAVED!</> : 'SAVE'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="max-w-3xl mx-auto space-y-8 pb-20">
          
          {loading ? (
            <div className="animate-pulse space-y-8">
              <div className="h-48 bg-[#1F2023] rounded-3xl" />
              <div className="h-48 bg-[#1F2023] rounded-3xl" />
            </div>
          ) : (
            <>
              {/* Weight Reminder */}
              <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-[#E8414A]/15 flex items-center justify-center">
                      <Scale size={24} className="text-[#E8414A]" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">Weight Reminder</h2>
                      <p className="text-sm font-semibold text-gray-400 mt-1">Get notified to measure your weight</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={reminderEnabled} onChange={e => setReminderEnabled(e.target.checked)} />
                    <div className="w-11 h-6 bg-[#2A2B2F] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E8414A]/80"></div>
                  </label>
                </div>

                {reminderEnabled && (
                  <div className="space-y-8">
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Reminder Day</div>
                      <div className="flex flex-wrap gap-2">
                        {DAYS.map((day, i) => (
                          <button
                            key={day}
                            onClick={() => setReminderDay(i)}
                            className={`flex-1 min-w-[40px] py-3 rounded-xl border transition-colors text-sm shadow-sm ${
                              reminderDay === i 
                                ? 'bg-[#E8414A]/10 border-[#E8414A]/30 text-[#E8414A] font-bold' 
                                : 'bg-[#161618] border-[#2A2B2F] text-gray-400 font-semibold hover:bg-[#2A2B2F]'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Reminder Time (Local)</div>
                      <input 
                        type="time"
                        value={`${String(reminderHour).padStart(2, '0')}:00`}
                        onChange={(e) => setReminderHour(parseInt(e.target.value.split(':')[0]))}
                        className="bg-[#161618] border border-[#2A2B2F] text-gray-100 px-5 py-3 rounded-xl text-lg font-bold focus:outline-none focus:border-[#E8414A]/50 transition-colors shadow-sm [color-scheme:dark]"
                      />
                      <p className="text-xs font-semibold text-gray-400 mt-4 leading-relaxed">
                        You'll be reminded every {DAYS_FULL[reminderDay]} at {formatHour(reminderHour)} to measure your weight.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Day Rollover Hour */}
              <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center gap-5 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-[#E8414A]/15 flex items-center justify-center">
                    <Moon size={24} className="text-[#E8414A]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Day Rollover Hour</h2>
                    <p className="text-sm font-semibold text-gray-400 mt-1">When does your "day" actually start?</p>
                  </div>
                </div>

                <div className="flex gap-4 items-center">
                  <input 
                    type="time"
                    value={`${String(rolloverHour).padStart(2, '0')}:00`}
                    onChange={(e) => setRolloverHour(parseInt(e.target.value.split(':')[0]))}
                    className="bg-[#161618] border border-[#2A2B2F] text-gray-100 px-5 py-3 rounded-xl text-lg font-bold focus:outline-none focus:border-[#E8414A]/50 transition-colors shadow-sm [color-scheme:dark]"
                  />
                </div>

                <div className="bg-[#E8414A]/10 border border-[#E8414A]/20 rounded-2xl p-5 mt-6 shadow-sm">
                  <div className="text-[10px] font-bold text-[#E8414A] uppercase tracking-widest mb-2">How it works</div>
                  <p className="text-xs font-semibold text-gray-300 leading-relaxed">
                    Currently set to <span className="text-white font-bold">{formatHour(rolloverHour)}</span>.<br/>
                    Any food or activity logged before {formatHour(rolloverHour)} will count towards <span className="text-white font-bold">yesterday's</span> record — great if you're a night owl.
                  </p>
                </div>
              </div>

              {/* Diet Plan */}
              <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center gap-5 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-[#E8414A]/15 flex items-center justify-center">
                    <Flame size={24} className="text-[#E8414A]" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold">Diet Plan</h2>
                    <p className="text-sm font-semibold text-gray-400 mt-1">Target: {targetCals} kcal/day</p>
                  </div>
                </div>

                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Select Mode</div>
                <div className="space-y-3">
                  {MODES.map(m => {
                    const isActive = dietMode === m.key;
                    return (
                      <button
                        key={m.key}
                        onClick={() => saveDietMode(m.key)}
                        className={`w-full flex items-center p-4 rounded-2xl border transition-all shadow-sm ${
                          isActive 
                            ? `${m.bg} ${m.border}/30` 
                            : 'bg-[#161618] border-[#2A2B2F] hover:bg-[#2A2B2F]'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded-full mr-5 shrink-0 ${isActive ? 'bg-[#E8414A]' : 'bg-[#3A3C42]'}`} />
                        <div className="flex-1 text-left">
                          <div className={`text-sm font-bold ${isActive ? m.color : 'text-gray-200'}`}>{m.label}</div>
                          <div className="text-xs font-semibold text-gray-500 mt-1">{m.desc}</div>
                        </div>
                        {isActive && <Check size={18} className={m.color} />}
                      </button>
                    )
                  })}
                </div>

                <div className="bg-[#E8414A]/10 border border-[#E8414A]/20 rounded-2xl p-5 mt-6 shadow-sm">
                  <p className="text-[13px] font-semibold text-[#E8414A] leading-relaxed">
                    Maintenance: <span className="font-bold">{maintenanceCals} kcal</span>
                    {activeModeObj.offset !== 0 ? (
                      <span> {activeModeObj.offset > 0 ? '+ ' : '− '}{Math.abs(activeModeObj.offset)} = <span className="font-bold">{targetCals} kcal target</span></span>
                    ) : ' (your target)'}
                  </p>
                  <p className="text-xs font-bold text-gray-400 mt-3">You can also say "switch to bulk" or "start a cut" in the AI chat.</p>
                </div>

              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
