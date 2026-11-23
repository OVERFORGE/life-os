"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Trash2,
  Plus,
  Zap,
  AlertTriangle,
  Flame,
  Activity,
  Dumbbell,
  Footprints,
  Moon,
  Brain,
  Heart,
  Check,
  ChevronRight,
  SlidersHorizontal,
  Sparkles,
  Calendar,
  Layers,
  X,
  TrendingUp,
  Shield,
  HelpCircle,
} from "lucide-react";

interface SignalDef {
  key: string;
  weight: number;
}

interface AvailableSignal {
  key: string;
  label?: string;
  categoryKey?: string;
}

// Built-in LifeOS Signal Library
const DEFAULT_SIGNAL_PRESETS: { key: string; label: string; category: string; icon: string }[] = [
  { key: "physical.gym", label: "Gym & Resistance", category: "Physical", icon: "dumbbell" },
  { key: "physical.steps", label: "Daily Steps", category: "Physical", icon: "footprints" },
  { key: "work.deepWorkHours", label: "Deep Work Focus", category: "Cognitive", icon: "brain" },
  { key: "sleep.hours", label: "Sleep Duration", category: "Recovery", icon: "moon" },
  { key: "sleep.quality", label: "Sleep Quality", category: "Recovery", icon: "moon" },
  { key: "mental.energy", label: "Mental Energy", category: "Mind", icon: "zap" },
  { key: "mental.stress", label: "Stress Management", category: "Mind", icon: "heart" },
  { key: "mental.mood", label: "Mood Rating", category: "Mind", icon: "sparkles" },
  { key: "mental.anxiety", label: "Anxiety Resilience", category: "Mind", icon: "shield" },
  { key: "intellect.reading", label: "Pages Read", category: "Cognitive", icon: "layers" },
  { key: "health.hydration", label: "Daily Hydration", category: "Physical", icon: "heart" },
  { key: "health.meditation", label: "Mindfulness Session", category: "Mind", icon: "sparkles" },
];

function getSignalIcon(key: string) {
  if (key.includes("gym") || key.includes("workout")) return Dumbbell;
  if (key.includes("step") || key.includes("walk")) return Footprints;
  if (key.includes("sleep")) return Moon;
  if (key.includes("work") || key.includes("focus")) return Brain;
  if (key.includes("energy")) return Zap;
  if (key.includes("stress") || key.includes("heart")) return Heart;
  if (key.includes("read") || key.includes("learn")) return Layers;
  if (key.includes("anxiety") || key.includes("protect")) return Shield;
  return Activity;
}

export default function GoalDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCadence, setDraftCadence] = useState("daily");
  const [draftSignals, setDraftSignals] = useState<SignalDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [customSignalKey, setCustomSignalKey] = useState("");

  const [availableSignals, setAvailableSignals] = useState<AvailableSignal[]>([]);
  const [selectedSignalCategory, setSelectedSignalCategory] = useState<string>("All");

  useEffect(() => {
    loadAll();
  }, [id]);

  async function loadAll() {
    setLoading(true);
    try {
      const [goalRes, sigRes] = await Promise.all([
        fetch(`/api/goals/${id}`),
        fetch("/api/signals"),
      ]);

      if (goalRes.ok) {
        const d = await goalRes.json();
        setData(d);
        if (d?.goal) {
          setDraftTitle(d.goal.title || "");
          setDraftCadence(d.goal.cadence || "daily");
          if (d.goal.signals) {
            setDraftSignals(d.goal.signals);
          }
        }
      }

      if (sigRes.ok) {
        const sigData = await sigRes.json();
        const sigs = sigData.signals || [];
        setAvailableSignals(sigs);
      }
    } catch (e) {
      console.error("[GoalDetailPage] Load error:", e);
    }
    setLoading(false);
  }

  const saveChanges = async () => {
    if (!draftTitle.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle.trim(),
          cadence: draftCadence,
          signals: draftSignals,
          rules: data?.goal?.rules,
        }),
      });
      if (res.ok) {
        setIsEditing(false);
        await loadAll();
      }
    } catch (e) {
      console.error("[GoalDetailPage] Save error:", e);
    }
    setSaving(false);
  };

  const deleteGoal = async () => {
    if (window.confirm("Are you sure you want to delete this habit trajectory?")) {
      try {
        await fetch(`/api/goals/${id}`, { method: "DELETE" });
        router.push("/trajectory");
      } catch (e) {
        console.error("[GoalDetailPage] Delete error:", e);
      }
    }
  };

  const addSignal = (key: string, weight: number = 2) => {
    if (draftSignals.some((s) => s.key === key)) return;
    setDraftSignals([...draftSignals, { key, weight }]);
  };

  const removeSignal = (key: string) => {
    setDraftSignals(draftSignals.filter((s) => s.key !== key));
  };

  const updateSignalWeight = (key: string, newWeight: number) => {
    const clamped = Math.max(1, Math.min(10, newWeight));
    setDraftSignals(
      draftSignals.map((s) => (s.key === key ? { ...s, weight: clamped } : s))
    );
  };

  const getLabel = (key: string) => {
    const fromApi = availableSignals.find((s) => s.key === key);
    if (fromApi?.label) return fromApi.label;
    const fromPreset = DEFAULT_SIGNAL_PRESETS.find((p) => p.key === key);
    if (fromPreset) return fromPreset.label;
    return key.replace(/_/g, " ").replace(/\./g, " · ");
  };

  // Generate 14-day date list (oldest to newest)
  const fourteenDayDates = useMemo(() => {
    if (data?.explanation?.last14Days && data.explanation.last14Days.length > 0) {
      const apiDates: string[] = data.explanation.last14Days;
      if (apiDates.length === 14) return apiDates;
    }
    // Fallback: calculate trailing 14 calendar dates
    const dates: string[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }, [data]);

  // Combined library of signals available to add
  const combinedSignalLibrary = useMemo(() => {
    const keys = new Set<string>();
    const library: { key: string; label: string; category: string }[] = [];

    availableSignals.forEach((s) => {
      keys.add(s.key);
      library.push({
        key: s.key,
        label: s.label || s.key,
        category: s.categoryKey || "Custom",
      });
    });

    DEFAULT_SIGNAL_PRESETS.forEach((p) => {
      if (!keys.has(p.key)) {
        keys.add(p.key);
        library.push({
          key: p.key,
          label: p.label,
          category: p.category,
        });
      }
    });

    return library;
  }, [availableSignals]);

  const unaddedSignals = useMemo(() => {
    return combinedSignalLibrary.filter(
      (s) => !draftSignals.some((d) => d.key === s.key)
    );
  }, [combinedSignalLibrary, draftSignals]);

  const filteredUnaddedSignals = useMemo(() => {
    if (selectedSignalCategory === "All") return unaddedSignals;
    return unaddedSignals.filter((s) => s.category.toLowerCase() === selectedSignalCategory.toLowerCase());
  }, [unaddedSignals, selectedSignalCategory]);

  const signalCategories = useMemo(() => {
    const set = new Set<string>(["All"]);
    unaddedSignals.forEach((s) => set.add(s.category));
    return Array.from(set);
  }, [unaddedSignals]);

  if (loading) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-[#111113] text-[#F7F5F0]">
        <div className="w-8 h-8 rounded-full border-2 border-[#ffb86c] border-t-transparent animate-spin mb-4" />
        <span className="font-mono text-xs text-[#C5C2BA]/70">
          Synchronizing Habit Trajectory Engine...
        </span>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-8 bg-[#111113] text-center">
        <AlertTriangle className="w-12 h-12 text-[#ffb86c] mb-4" />
        <h2 className="text-base font-semibold text-[#F7F5F0] mb-2">Habit Not Found</h2>
        <p className="text-xs text-[#C5C2BA]/60 max-w-sm mb-6">
          This trajectory habit record does not exist or may have been archived.
        </p>
        <button
          onClick={() => router.push("/trajectory")}
          className="px-4 py-2 rounded-xl bg-[#17171A] hover:bg-[#1E1F24] border border-[#23242A] text-xs font-semibold text-[#F7F5F0] transition-colors"
        >
          Return to Trajectory Workspace
        </button>
      </div>
    );
  }

  const { goal, stats, explanation, pressure } = data;
  const currentScore = stats?.currentScore ?? 0;
  const stateStr = (stats?.state || "unknown").toLowerCase();

  // State styling helper
  const stateColor =
    stateStr === "on_track" || stateStr === "aligned"
      ? { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30", label: "On Track" }
      : stateStr === "slow"
      ? { text: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/30", label: "Pacing Slow" }
      : stateStr === "drifting"
      ? { text: "text-[#ffb86c]", bg: "bg-[#ffb86c]/15", border: "border-[#ffb86c]/30", label: "Drifting" }
      : stateStr === "strained"
      ? { text: "text-rose-400", bg: "bg-rose-500/15", border: "border-rose-500/30", label: "Strained Load" }
      : stateStr === "recovering"
      ? { text: "text-sky-400", bg: "bg-sky-500/15", border: "border-sky-500/30", label: "Recovering" }
      : { text: "text-[#C5C2BA]", bg: "bg-[#23242A]", border: "border-[#32343D]", label: "Evaluating" };

  // Calculate total streak & active days across tracked signals
  const allSignalEntries = explanation?.signals || [];
  const totalWeight = draftSignals.reduce((acc, s) => acc + (s.weight || 1), 0);

  // Compute 14-day aggregated activity for each day
  const dailyHitCounts = fourteenDayDates.map((date, idx) => {
    let hits = 0;
    for (const sig of allSignalEntries) {
      if (sig.values && sig.values[idx] > 0) {
        hits++;
      }
    }
    return hits;
  });

  const activeDaysCount = dailyHitCounts.filter((c) => c > 0).length;
  const hitRatePercentage = Math.round((activeDaysCount / 14) * 100);

  // Calculate current streak backwards from today
  let currentStreak = 0;
  for (let i = dailyHitCounts.length - 1; i >= 0; i--) {
    if (dailyHitCounts[i] > 0) {
      currentStreak++;
    } else {
      break;
    }
  }

  // SVG Radial Progress Calculation
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (currentScore / 100) * circumference;

  return (
    <div className="flex-1 h-full w-full overflow-y-auto bg-[#111113] text-[#F7F5F0] custom-h-scrollbar">
      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* ========================================================================= */}
        {/* HEADER BAR & BREADCRUMB                                                   */}
        {/* ========================================================================= */}
        <div className="flex flex-col gap-3 pb-4 border-b border-[#23242A]">
          <div className="flex items-center justify-between">
            {/* Left: Breadcrumbs + Navigation */}
            <div className="flex items-center gap-2 text-xs font-mono text-[#85827A]">
              <button
                type="button"
                onClick={() => router.push("/trajectory")}
                className="flex items-center gap-1.5 hover:text-[#ffb86c] transition-colors cursor-pointer group"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                <span>Trajectory</span>
              </button>
              <ChevronRight className="w-3 h-3 text-[#23242A]" />
              <span className="text-[#C5C2BA]">Supporting Habits</span>
              <ChevronRight className="w-3 h-3 text-[#23242A]" />
              <span className="text-[#F7F5F0] truncate max-w-[200px]">{goal.title}</span>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {!isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftTitle(goal.title || "");
                      setDraftCadence(goal.cadence || "daily");
                      setDraftSignals(goal.signals || []);
                      setIsEditing(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#17171A] hover:bg-[#1E1F24] border border-[#23242A] hover:border-[#ffb86c]/40 text-xs font-semibold text-[#F7F5F0] shadow-sm transition-all cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#ffb86c]" />
                    <span>Edit Habit</span>
                  </button>

                  <button
                    type="button"
                    onClick={deleteGoal}
                    title="Delete Habit"
                    className="p-2 rounded-xl bg-[#17171A] hover:bg-rose-500/15 border border-[#23242A] hover:border-rose-500/30 text-[#85827A] hover:text-rose-400 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setDraftTitle(goal.title || "");
                      setDraftCadence(goal.cadence || "daily");
                      setDraftSignals(goal.signals || []);
                    }}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#17171A] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveChanges}
                    disabled={saving || !draftTitle.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#ffb86c] hover:bg-[#ffb86c]/90 text-[#492900] text-xs font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <div className="w-3 h-3 rounded-full border-2 border-[#492900] border-t-transparent animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Title Row & Metadata Badges */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              {!isEditing ? (
                <h1 className="text-2xl font-bold tracking-tight text-[#F7F5F0] truncate">
                  {goal.title}
                </h1>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono uppercase text-[#C5C2BA]/70">
                    Habit Title
                  </label>
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="bg-[#17171A] border border-[#ffb86c]/40 rounded-xl px-3 py-1.5 text-lg font-bold text-[#F7F5F0] outline-none focus:ring-1 focus:ring-[#ffb86c]"
                  />
                </div>
              )}

              {/* Badge Row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] px-2.5 py-0.5 rounded-full bg-[#ffb86c]/15 text-[#ffb86c] border border-[#ffb86c]/30 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Supporting Habit</span>
                </span>

                <span className="font-mono text-[10px] px-2.5 py-0.5 rounded-full bg-[#17171A] text-[#C5C2BA] border border-[#23242A]">
                  {goal.cadence ? (goal.cadence === "daily" ? "Daily Cadence" : "Weekly Cadence") : "14-Day Rolling Window"}
                </span>

                <span className={`font-mono text-[10px] px-2.5 py-0.5 rounded-full border ${stateColor.bg} ${stateColor.border} ${stateColor.text} flex items-center gap-1`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${stateColor.text.replace('text-', 'bg-')}`} />
                  <span>{stateColor.label}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* EXECUTIVE PERFORMANCE OVERVIEW CARD                                       */}
        {/* ========================================================================= */}
        <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-6 shadow-xl relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#ffb86c]/5 rounded-full blur-3xl pointer-events-none" />

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center relative z-10">

            {/* Col 1: Radial Gauge Score (4 Cols) */}
            <div className="md:col-span-4 flex items-center gap-5 border-b md:border-b-0 md:border-r border-[#23242A] pb-6 md:pb-0 pr-0 md:pr-6">
              <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 96 96">
                  {/* Background Track */}
                  <circle
                    cx="48"
                    cy="48"
                    r={radius}
                    className="stroke-[#23242A]"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  {/* Active Progress */}
                  <circle
                    cx="48"
                    cy="48"
                    r={radius}
                    stroke="url(#scoreGrad)"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                  <defs>
                    <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffb86c" />
                      <stop offset="100%" stopColor="#D98B2B" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Score Number in Center */}
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-bold font-mono text-[#F7F5F0]">
                    {currentScore}%
                  </span>
                  <span className="text-[9px] font-mono text-[#85827A] uppercase tracking-wider">
                    Score
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono uppercase tracking-wider text-[#85827A]">
                  Rolling 14-Day
                </span>
                <span className="text-sm font-semibold text-[#F7F5F0]">
                  Cadence Health
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${stateColor.text.replace('text-', 'bg-')} animate-pulse`} />
                  <span className={`text-xs font-mono font-medium ${stateColor.text}`}>
                    {stateColor.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Col 2: 14-Day Metric Breakdown (5 Cols) */}
            <div className="md:col-span-5 grid grid-cols-2 gap-3 border-b md:border-b-0 md:border-r border-[#23242A] pb-6 md:pb-0 pr-0 md:pr-6">
              {/* Streak */}
              <div className="p-3 rounded-xl bg-[#111113] border border-[#23242A] flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase text-[#85827A] flex items-center gap-1">
                  <Flame className="w-3 h-3 text-[#ffb86c]" />
                  <span>Current Streak</span>
                </span>
                <span className="text-base font-bold font-mono text-[#F7F5F0]">
                  {currentStreak} {currentStreak === 1 ? "Day" : "Days"}
                </span>
                <span className="text-[10px] text-[#C5C2BA]/60">
                  {currentStreak > 0 ? "Continuous momentum" : "Awaiting today's log"}
                </span>
              </div>

              {/* Consistency */}
              <div className="p-3 rounded-xl bg-[#111113] border border-[#23242A] flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase text-[#85827A] flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  <span>Consistency</span>
                </span>
                <span className="text-base font-bold font-mono text-emerald-400">
                  {hitRatePercentage}%
                </span>
                <span className="text-[10px] text-[#C5C2BA]/60">
                  {activeDaysCount} of 14 Days Active
                </span>
              </div>

              {/* Active Drivers */}
              <div className="p-3 rounded-xl bg-[#111113] border border-[#23242A] flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase text-[#85827A] flex items-center gap-1">
                  <Activity className="w-3 h-3 text-[#ffb86c]" />
                  <span>Signals</span>
                </span>
                <span className="text-base font-bold font-mono text-[#F7F5F0]">
                  {draftSignals.length} Active
                </span>
                <span className="text-[10px] text-[#C5C2BA]/60">
                  Driving execution score
                </span>
              </div>

              {/* Total Weight */}
              <div className="p-3 rounded-xl bg-[#111113] border border-[#23242A] flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase text-[#85827A] flex items-center gap-1">
                  <Layers className="w-3 h-3 text-[#ffb86c]" />
                  <span>Load Weight</span>
                </span>
                <span className="text-base font-bold font-mono text-[#F7F5F0]">
                  Σ {totalWeight} pts
                </span>
                <span className="text-[10px] text-[#C5C2BA]/60">
                  Relative daily priority
                </span>
              </div>
            </div>

            {/* Col 3: Cadence Architecture Details (3 Cols) */}
            <div className="md:col-span-3 flex flex-col justify-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#85827A]">
                Habit Architecture
              </span>
              <p className="text-xs text-[#C5C2BA]/80 leading-relaxed">
                Evaluates a rolling 14-day weighted sum of your daily logs and linked task completions. Continuous cadence keeps life momentum resilient.
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-[10px] text-[#85827A]">Engine:</span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#111113] text-[#ffb86c] border border-[#23242A]">
                  v2.0 Monotonic Outbox
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* ========================================================================= */}
        {/* COGNITIVE LOAD & STRAINED DEMAND BANNER                                    */}
        {/* ========================================================================= */}
        {pressure && pressure.status !== "aligned" && (
          <div className="bg-gradient-to-r from-rose-950/20 via-[#17171A] to-[#17171A] border border-rose-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-rose-500 via-amber-500 to-transparent" />

            <div className="flex flex-col gap-3 relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-300 font-mono">
                      Cognitive Load Alert · {pressure.status} Demand
                    </h3>
                    <span className="text-[11px] text-[#C5C2BA]/70">
                      System detected elevated friction against your daily habit cadence
                    </span>
                  </div>
                </div>

                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
                  Adaptation Advised
                </span>
              </div>

              {/* Reasons List */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                {pressure.reasons?.map((reason: string, i: number) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-[#111113]/80 border border-[#23242A] flex items-start gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                    <span className="text-xs text-[#C5C2BA] leading-relaxed">
                      {reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* AVEN INTELLIGENCE SUMMARY                                                 */}
        {/* ========================================================================= */}
        {explanation?.summary && (
          <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 flex items-start gap-3.5 shadow-sm">
            <div className="p-2 rounded-xl bg-[#ffb86c]/10 border border-[#ffb86c]/20 text-[#ffb86c] shrink-0 mt-0.5">
              <Zap className="w-4 h-4" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#F7F5F0]">
                  Aven Cadence Diagnostics
                </span>
                <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-[#111113] text-[#85827A] border border-[#23242A]">
                  AI Synthesis
                </span>
              </div>
              <p className="text-xs text-[#C5C2BA]/80 leading-relaxed">
                {explanation.summary}
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TRACKED SIGNALS & 14-DAY TIMELINE                                         */}
        {/* ========================================================================= */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#ffb86c]" />
              <h2 className="text-xs font-semibold tracking-wide uppercase text-[#C5C2BA]/80 font-mono">
                Tracked Signals ({draftSignals.length})
              </h2>
            </div>
            <span className="text-[11px] font-mono text-[#85827A]">
              14-Day Rolling Evaluation Horizon
            </span>
          </div>

          {draftSignals.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#17171A] border border-[#23242A] text-center flex flex-col items-center justify-center gap-3">
              <Activity className="w-10 h-10 text-[#C5C2BA]/40" />
              <div className="text-sm font-medium text-[#F7F5F0]">No signals currently tracked</div>
              <p className="text-xs text-[#C5C2BA]/60 max-w-sm">
                Habits require at least one tracked life signal or linked task tag to evaluate rolling momentum.
              </p>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="mt-2 px-4 py-1.5 rounded-xl bg-[#ffb86c] text-[#492900] text-xs font-semibold cursor-pointer"
              >
                Add Signals
              </button>
            </div>
          ) : (
            <div className="space-y-3.5">
              {draftSignals.map((s, idx) => {
                const IconComponent = getSignalIcon(s.key);
                const explanationEntry = allSignalEntries.find((e: any) => e.key === s.key);
                const rawValues: number[] = explanationEntry?.values || [];
                // Pad to 14 if needed
                const values = rawValues.length >= 14
                  ? rawValues.slice(-14)
                  : [...Array(Math.max(0, 14 - rawValues.length)).fill(0), ...rawValues];

                const activeCount = values.filter((v) => v > 0).length;

                return (
                  <div
                    key={s.key}
                    className="p-5 rounded-2xl bg-[#17171A] border border-[#23242A] hover:border-[#32343D] transition-all shadow-sm flex flex-col gap-4"
                  >
                    {/* Top Row: Icon + Label + Key + Weight Controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-[#ffb86c]/10 border border-[#ffb86c]/20 text-[#ffb86c] shrink-0">
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-[#F7F5F0]">
                            {getLabel(s.key)}
                          </span>
                          <span className="text-[11px] font-mono text-[#85827A]">
                            {s.key}
                          </span>
                        </div>
                      </div>

                      {/* Right: Weight Indicator or Editor Controls */}
                      {!isEditing ? (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#111113] border border-[#23242A] text-xs font-mono">
                            <span className="text-[#85827A]">Weight:</span>
                            <span className="font-bold text-[#ffb86c]">{s.weight}</span>
                          </div>
                          <span className="text-[11px] font-mono text-emerald-400">
                            {activeCount} of 14 Days Active
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          {/* Weight Stepper */}
                          <div className="flex items-center gap-2 bg-[#111113] border border-[#23242A] rounded-xl px-2.5 py-1">
                            <span className="text-[10px] font-mono text-[#85827A] uppercase">
                              Weight
                            </span>
                            <button
                              type="button"
                              onClick={() => updateSignalWeight(s.key, s.weight - 1)}
                              className="w-5 h-5 rounded hover:bg-[#23242A] text-[#F7F5F0] text-xs font-bold transition flex items-center justify-center cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-xs font-bold font-mono text-[#ffb86c]">
                              {s.weight}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateSignalWeight(s.key, s.weight + 1)}
                              className="w-5 h-5 rounded hover:bg-[#23242A] text-[#F7F5F0] text-xs font-bold transition flex items-center justify-center cursor-pointer"
                            >
                              +
                            </button>
                          </div>

                          {/* Remove Button */}
                          <button
                            type="button"
                            onClick={() => removeSignal(s.key)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Bottom Row: 14-Day Timeline Activity Heatmap */}
                    <div className="pt-3 border-t border-[#23242A]/60 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#85827A]">
                        <span>14-Day Rolling Activity Map</span>
                        <span>
                          {activeCount > 0 ? `${Math.round((activeCount / 14) * 100)}% consistency` : "No activity recorded"}
                        </span>
                      </div>

                      {/* 14 Day Blocks */}
                      <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5 sm:gap-2">
                        {values.map((v, dayIdx) => {
                          const dateStr = fourteenDayDates[dayIdx] || `Day ${dayIdx + 1}`;
                          const isToday = dayIdx === values.length - 1;
                          const dateObj = new Date(dateStr);
                          const dayLetter = isNaN(dateObj.getTime())
                            ? "D"
                            : ["S", "M", "T", "W", "T", "F", "S"][dateObj.getDay()];

                          const isHit = v > 0;

                          return (
                            <div
                              key={dayIdx}
                              title={`${dateStr}: ${isHit ? `Active (${v})` : "Inactive"}`}
                              className="flex flex-col items-center gap-1 group"
                            >
                              <div
                                className={`w-full h-8 rounded-lg transition-all flex items-center justify-center font-mono text-[9px] ${
                                  isHit
                                    ? "bg-emerald-500/25 border border-emerald-500/50 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                                    : "bg-[#111113] border border-[#23242A] text-[#85827A]/40"
                                } ${isToday ? "ring-1 ring-[#ffb86c] border-[#ffb86c]/60" : ""}`}
                              >
                                {isHit ? (
                                  <Check className="w-3 h-3 stroke-[3]" />
                                ) : (
                                  <span className="opacity-0 group-hover:opacity-100 text-[8px] transition-opacity">
                                    -
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-[9px] font-mono ${
                                  isToday ? "text-[#ffb86c] font-bold" : "text-[#85827A]"
                                }`}
                              >
                                {isToday ? "Now" : dayLetter}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SIGNAL PICKER & LIBRARY (In Edit Mode)                                    */}
          {/* ========================================================================= */}
          {isEditing && (
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-6 flex flex-col gap-4 mt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#23242A]">
                <div>
                  <h3 className="text-xs font-semibold text-[#F7F5F0] uppercase tracking-wider font-mono">
                    Add Signal to Habit
                  </h3>
                  <p className="text-[11px] text-[#85827A] mt-0.5">
                    Select a life signal to attach. Whenever logged, it will elevate this habit's 14-day rolling score.
                  </p>
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto custom-h-scrollbar py-1">
                  {signalCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedSignalCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-colors cursor-pointer shrink-0 ${
                        selectedSignalCategory === cat
                          ? "bg-[#ffb86c] text-[#492900] font-bold"
                          : "bg-[#111113] text-[#C5C2BA] hover:text-[#F7F5F0] border border-[#23242A]"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Signals Grid */}
              {filteredUnaddedSignals.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#85827A]">
                  All available signals in this category are already attached to this habit.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {filteredUnaddedSignals.map((sig) => {
                    const IconComponent = getSignalIcon(sig.key);
                    return (
                      <button
                        key={sig.key}
                        type="button"
                        onClick={() => addSignal(sig.key, 2)}
                        className="p-3 rounded-xl bg-[#111113] border border-[#23242A] hover:border-[#ffb86c]/60 hover:bg-[#1E1F24] transition-all flex items-center justify-between gap-2 group cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-1.5 rounded-lg bg-[#17171A] group-hover:bg-[#ffb86c]/15 text-[#85827A] group-hover:text-[#ffb86c] transition-colors shrink-0">
                            <IconComponent className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-medium text-[#F7F5F0] truncate group-hover:text-[#ffb86c] transition-colors">
                              {sig.label}
                            </span>
                            <span className="text-[10px] font-mono text-[#85827A] truncate">
                              {sig.key}
                            </span>
                          </div>
                        </div>

                        <div className="w-6 h-6 rounded-lg bg-[#17171A] border border-[#23242A] group-hover:bg-[#ffb86c] group-hover:text-[#492900] group-hover:border-transparent text-[#85827A] flex items-center justify-center transition-all shrink-0">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Custom Key Add Row */}
              <div className="pt-3 border-t border-[#23242A] flex items-center gap-2">
                <input
                  type="text"
                  value={customSignalKey}
                  onChange={(e) => setCustomSignalKey(e.target.value)}
                  placeholder="Or enter custom key: e.g. mindfulness.minutes"
                  className="flex-1 bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] font-mono outline-none focus:ring-1 focus:ring-[#ffb86c]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customSignalKey.trim()) {
                      e.preventDefault();
                      addSignal(customSignalKey.trim(), 2);
                      setCustomSignalKey("");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customSignalKey.trim()) {
                      addSignal(customSignalKey.trim(), 2);
                      setCustomSignalKey("");
                    }
                  }}
                  disabled={!customSignalKey.trim()}
                  className="px-4 py-2 rounded-xl bg-[#1E1F24] hover:bg-[#282930] text-xs font-semibold text-[#F7F5F0] border border-[#23242A] disabled:opacity-40 transition cursor-pointer"
                >
                  Add Custom
                </button>
              </div>

              {/* Sticky Save Changes Bar */}
              <div className="pt-4 border-t border-[#23242A] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#111113] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveChanges}
                  disabled={saving || !draftTitle.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#ffb86c] hover:bg-[#ffb86c]/90 text-[#492900] text-xs font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {saving ? "Saving Changes..." : "Save Changes"}
                </button>
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
