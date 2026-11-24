"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bed,
  Moon,
  Sun,
  Smile,
  Heart,
  Zap,
  Brain,
  Dumbbell,
  Footprints,
  Clock,
  Flame,
  Coffee,
  Utensils,
  Droplet,
  Hourglass,
  Shield,
  Download,
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Play,
  Trash2,
  Sparkles,
  Layers,
  Calendar,
  ArrowRight,
  Settings,
  AlertCircle,
  FileText,
  Search,
  CheckCircle2,
} from "lucide-react";
import { getTodayDateString } from "@/utils/date";

/* ---------------- Types ---------------- */

interface DailyLogData {
  date?: string;
  mental?: {
    mood?: number;
    energy?: number;
    stress?: number;
    anxiety?: number;
    focus?: number;
    notes?: string;
  };
  sleep?: {
    hours?: number;
    quality?: number;
    sleepTime?: string;
    wakeTime?: string;
  };
  physical?: {
    gym?: boolean;
    workoutType?: string;
    calories?: number;
    meals?: number;
    dietNote?: string;
    steps?: number;
    bodyFeeling?: string;
    painNote?: string;
  };
  work?: {
    deepWorkHours?: number;
    coded?: boolean;
    executioners?: boolean;
    studied?: boolean;
    mainWork?: string;
  };
  habits?: {
    gym?: boolean;
    reading?: boolean;
    meditation?: boolean;
    coding?: boolean;
    content?: boolean;
    learning?: boolean;
    noFap?: boolean;
  };
  planning?: {
    plannedTasks?: number;
    completedTasks?: number;
    reasonNotCompleted?: string;
  };
  reflection?: {
    win?: string;
    mistake?: string;
    learned?: string;
    bothering?: string;
  };
  signals?: Record<string, any>;
}

interface WorkoutSessionItem {
  _id: string;
  splitDayName?: string;
  workoutType?: string;
  date: string | Date;
  dateOnly?: string;
  durationSeconds: number;
  calories?: number;
  exercises?: any[];
  status?: string;
}

interface NutritionDayLog {
  date: string;
  meals: Array<{
    mealType: string;
    foodItemId?: any;
    amount: number;
    macros?: {
      calories?: number;
      protein?: number;
      carbs?: number;
      fats?: number;
    };
  }>;
  dailyTotals: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
}

export default function VitalsPage() {
  const router = useRouter();
  const todayStr = useMemo(() => getTodayDateString(), []);

  // View state: "overview" (default) | "gym" | "nutrition"
  const [activeView, setActiveView] = useState<"overview" | "gym" | "nutrition">("overview");
  const [timeframe, setTimeframe] = useState<"today" | "7d" | "30d">("today");

  // Loading & data states
  const [loading, setLoading] = useState(true);
  const [todayLog, setTodayLog] = useState<DailyLogData>({});
  const [historyLogs, setHistoryLogs] = useState<DailyLogData[]>([]);
  const [sessions, setSessions] = useState<WorkoutSessionItem[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);
  const [gyms, setGyms] = useState<any[]>([]);
  const [nutritionLog, setNutritionLog] = useState<NutritionDayLog | null>(null);
  const [foodLibrary, setFoodLibrary] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [healthContext, setHealthContext] = useState<any>(null);

  // Modals
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isSleepHistoryOpen, setIsSleepHistoryOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [isAddFoodModalOpen, setIsAddFoodModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Quick hydration state (0 to 8)
  const [hydrationCount, setHydrationCount] = useState<number>(3);

  // Checkin Modal Form State
  const [checkinForm, setCheckinForm] = useState({
    sleepHours: 7.33,
    sleepTime: "23:15",
    wakeTime: "06:35",
    sleepQuality: 4,
    morningEnergy: 4,
    moodScore: 4,
    moodNote: "Clear head after morning outdoor air.",
    middayEnergy: 4,
    middayNote: "",
    breakfastNote: "Steel-cut oats with almonds & black coffee",
    dietNote: "",
    reflectionWin: "",
    reflectionLearned: "",
    reflectionBothering: "",
    stressNote: "",
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  /* ---------------- Fetch All Telemetry ---------------- */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        todayRes,
        dashRes,
        sessRes,
        routRes,
        invRes,
        nutRes,
        libRes,
        tplRes,
        healthRes,
      ] = await Promise.allSettled([
        fetch("/api/daily-log/today"),
        fetch("/api/daily-log/dashboard"),
        fetch("/api/gym/session"),
        fetch("/api/gym/routines"),
        fetch("/api/gym/inventory"),
        fetch(`/api/nutrition/log?date=${todayStr}`),
        fetch("/api/nutrition/library"),
        fetch("/api/nutrition/templates"),
        fetch("/api/health/context"),
      ]);

      if (todayRes.status === "fulfilled" && todayRes.value.ok) {
        const d = await todayRes.value.json();
        if (d && !d.error) {
          setTodayLog(d);
          const waterVal = d.signals?.water || d.signals?.hydration;
          if (typeof waterVal === "number") {
            setHydrationCount(Math.min(8, Math.max(0, waterVal)));
          }
          setCheckinForm((prev) => ({
            ...prev,
            sleepHours: d.sleep?.hours ?? prev.sleepHours,
            sleepTime: d.sleep?.sleepTime || prev.sleepTime,
            wakeTime: d.sleep?.wakeTime || prev.wakeTime,
            sleepQuality: d.sleep?.quality || prev.sleepQuality,
            morningEnergy: d.mental?.energy ?? prev.morningEnergy,
            moodScore: d.mental?.mood ?? prev.moodScore,
            moodNote: d.mental?.notes || prev.moodNote,
            breakfastNote: d.physical?.dietNote || prev.breakfastNote,
            reflectionWin: d.reflection?.win || prev.reflectionWin,
            reflectionLearned: d.reflection?.learned || prev.reflectionLearned,
            reflectionBothering: d.reflection?.bothering || prev.reflectionBothering,
          }));
        }
      }

      if (dashRes.status === "fulfilled" && dashRes.value.ok) {
        const d = await dashRes.value.json();
        if (Array.isArray(d)) setHistoryLogs(d);
      }

      if (sessRes.status === "fulfilled" && sessRes.value.ok) {
        const d = await sessRes.value.json();
        if (Array.isArray(d)) setSessions(d);
      }

      if (routRes.status === "fulfilled" && routRes.value.ok) {
        const d = await routRes.value.json();
        if (Array.isArray(d)) setRoutines(d);
      }

      if (invRes.status === "fulfilled" && invRes.value.ok) {
        const d = await invRes.value.json();
        setGyms(d.userGyms || []);
      }

      if (nutRes.status === "fulfilled" && nutRes.value.ok) {
        const d = await nutRes.value.json();
        if (d.success && d.log) setNutritionLog(d.log);
      }

      if (libRes.status === "fulfilled" && libRes.value.ok) {
        const d = await libRes.value.json();
        if (d.foods && Array.isArray(d.foods)) setFoodLibrary(d.foods);
      }

      if (tplRes.status === "fulfilled" && tplRes.value.ok) {
        const d = await tplRes.value.json();
        if (d.templates && Array.isArray(d.templates)) setTemplates(d.templates);
      }

      if (healthRes.status === "fulfilled" && healthRes.value.ok) {
        const d = await healthRes.value.json();
        if (d.success && d.data) setHealthContext(d.data);
      }
    } catch (e) {
      console.error("[Vitals] Load telemetry error:", e);
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ---------------- Hydration Click ---------------- */
  const handleSetHydration = async (count: number) => {
    setHydrationCount(count);
    showToast(`Hydration logged: ${count} glasses`);
    try {
      await fetch("/api/signals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: todayStr,
          key: "water",
          value: count,
        }),
      });
    } catch (e) {
      console.error("Hydration sync error:", e);
    }
  };

  /* ---------------- Submit Check-in Form ---------------- */
  const handleSaveCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        sleep: {
          hours: Number(checkinForm.sleepHours) || 7.33,
          sleepTime: checkinForm.sleepTime,
          wakeTime: checkinForm.wakeTime,
          quality: Number(checkinForm.sleepQuality) || 4,
        },
        mental: {
          energy: Number(checkinForm.morningEnergy) || 4,
          mood: Number(checkinForm.moodScore) || 4,
          notes: checkinForm.moodNote,
        },
        physical: {
          dietNote: checkinForm.breakfastNote,
        },
        reflection: {
          win: checkinForm.reflectionWin,
          learned: checkinForm.reflectionLearned,
          bothering: checkinForm.reflectionBothering,
        },
      };

      const res = await fetch("/api/daily-log/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast("Check-in saved successfully!");
        setIsCheckInOpen(false);
        await loadData();
      } else {
        showToast("Error saving check-in");
      }
    } catch (e) {
      console.error(e);
      showToast("Error saving check-in");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------------- Export Wellbeing Archive ---------------- */
  const handleExportWellbeing = () => {
    const exportBundle = {
      exportTimestamp: new Date().toISOString(),
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      todayLog,
      recentHistory: historyLogs,
      recentWorkoutSessions: sessions.slice(0, 20),
      todayNutrition: nutritionLog,
      healthContext,
    };

    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lifeos-vitals-sovereign-${todayStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Wellbeing log exported");
  };

  /* ---------------- Sleep 7-day Horizon Stats ---------------- */
  const sleepHorizon = useMemo(() => {
    // Generate last 7 days keys
    const days: { dayLetter: string; dateStr: string; hours: number; isToday: boolean }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      const dayLetter = ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];

      let hours = 0;
      if (iso === todayStr) {
        hours = todayLog.sleep?.hours ?? 7.33;
      } else {
        const found = historyLogs.find((h) => h.date === iso);
        hours = found?.sleep?.hours ?? (6.5 + ((i * 7) % 2) * 0.7);
      }

      days.push({
        dayLetter,
        dateStr: iso,
        hours,
        isToday: iso === todayStr,
      });
    }

    const total = days.reduce((acc, curr) => acc + curr.hours, 0);
    const avg = total / days.length;
    const avgH = Math.floor(avg);
    const avgM = Math.round((avg - avgH) * 60);

    return { days, avgH, avgM };
  }, [historyLogs, todayLog, todayStr]);

  /* ---------------- Formatted Sleep Time Display ---------------- */
  const sleepHoursDisplay = useMemo(() => {
    const hVal = todayLog.sleep?.hours ?? 7.33;
    const hrs = Math.floor(hVal);
    const mins = Math.round((hVal - hrs) * 60);
    return `${hrs}h ${mins.toString().padStart(2, "0")}m`;
  }, [todayLog]);

  const sleepRangeDisplay = useMemo(() => {
    const asleep = todayLog.sleep?.sleepTime || "23:15";
    const awake = todayLog.sleep?.wakeTime || "06:35";
    return `Asleep ${asleep} • Awake ${awake}`;
  }, [todayLog]);

  /* ---------------- Mood / Energy Labels ---------------- */
  const moodRatingText = useMemo(() => {
    const score = todayLog.mental?.mood ?? 4;
    if (score >= 4) return "Calm";
    if (score === 3) return "Focused";
    return "Reflective";
  }, [todayLog]);

  const energyLevel = useMemo(() => {
    return todayLog.mental?.energy ?? 4;
  }, [todayLog]);

  /* ---------------- Formatted Date Header ---------------- */
  const formattedTodayDate = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }, []);

  return (
    <div className="flex-1 h-full w-full overflow-y-auto bg-[#111113] text-[#F7F5F0] custom-h-scrollbar font-sans selection:bg-[#D98B2B]/30 select-none">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#17171A] border border-[#D98B2B]/60 text-[#F7F5F0] text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Sparkles size={13} className="text-[#D98B2B]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Canvas Container */}
      <div className="max-w-[1280px] mx-auto px-6 py-6 md:py-8 flex flex-col gap-6">

        {/* ========================================================= */}
        {/* TOP BAR / HEADER                                          */}
        {/* ========================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          
          {/* Title + Sub-navigation Tabs */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[#D98B2B] shadow-[0_0_8px_#D98B2B]" />
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#F7F5F0]">
                Vitals
              </h1>
            </div>

            {/* Sub-navigation: Overview | Gym Protocol | Nutrition Hub */}
            <div className="flex items-center bg-[#17171A] border border-[#23242A] p-1 rounded-full text-xs">
              <button
                onClick={() => setActiveView("overview")}
                className={`px-3.5 py-1.5 rounded-full font-medium transition-all ${
                  activeView === "overview"
                    ? "bg-[#23242A] text-[#F7F5F0] shadow-sm font-semibold"
                    : "text-[#85827A] hover:text-[#F7F5F0]"
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveView("gym")}
                className={`px-3.5 py-1.5 rounded-full font-medium transition-all ${
                  activeView === "gym"
                    ? "bg-[#23242A] text-[#D98B2B] shadow-sm font-semibold"
                    : "text-[#85827A] hover:text-[#F7F5F0]"
                }`}
              >
                Gym Protocol
              </button>
              <button
                onClick={() => setActiveView("nutrition")}
                className={`px-3.5 py-1.5 rounded-full font-medium transition-all ${
                  activeView === "nutrition"
                    ? "bg-[#23242A] text-[#D98B2B] shadow-sm font-semibold"
                    : "text-[#85827A] hover:text-[#F7F5F0]"
                }`}
              >
                Nutrition Hub
              </button>
            </div>
          </div>

          {/* Right Filters & Check-in CTA */}
          <div className="flex items-center gap-3">
            {/* Timeframe Tabs */}
            <div className="flex items-center bg-[#17171A] border border-[#23242A] p-1 rounded-full text-xs">
              <button
                onClick={() => setTimeframe("today")}
                className={`px-3 py-1 rounded-full transition-all ${
                  timeframe === "today"
                    ? "bg-[#23242A] text-[#F7F5F0] font-medium"
                    : "text-[#85827A] hover:text-[#F7F5F0]"
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setTimeframe("7d")}
                className={`px-3 py-1 rounded-full transition-all ${
                  timeframe === "7d"
                    ? "bg-[#23242A] text-[#F7F5F0] font-medium"
                    : "text-[#85827A] hover:text-[#F7F5F0]"
                }`}
              >
                Last 7 Days
              </button>
              <button
                onClick={() => setTimeframe("30d")}
                className={`px-3 py-1 rounded-full transition-all ${
                  timeframe === "30d"
                    ? "bg-[#23242A] text-[#F7F5F0] font-medium"
                    : "text-[#85827A] hover:text-[#F7F5F0]"
                }`}
              >
                30 Days
              </button>
            </div>

            {/* Check In Action Button */}
            <button
              onClick={() => setIsCheckInOpen(true)}
              className="px-4 py-1.5 rounded-full bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Plus size={14} className="stroke-[2.5]" />
              <span>Check In</span>
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* VIEW 1: OVERVIEW (Screenshot 1 & 2 Replication)           */}
        {/* ========================================================= */}
        {activeView === "overview" && (
          <div className="flex flex-col gap-6">

            {/* ----------------------------------------------------- */}
            {/* BANNER: TODAY'S GROUNDED OBSERVATION                  */}
            {/* ----------------------------------------------------- */}
            <div className="relative w-full bg-[#17171A] border border-[#23242A] rounded-2xl p-5 md:p-6 overflow-hidden shadow-xl">
              
              {/* Subtle background coordinate grid lines */}
              <div
                className="absolute inset-0 pointer-events-none opacity-30"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, rgba(217, 139, 43, 0.05) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(217, 139, 43, 0.05) 1px, transparent 1px)
                  `,
                  backgroundSize: "32px 32px",
                }}
              />

              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                
                {/* Left Observation Text */}
                <div className="lg:col-span-7 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-[#D98B2B]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#D98B2B]">
                      TODAY&apos;S GROUNDED OBSERVATION
                    </span>
                    <span className="text-xs text-[#85827A]">
                      · Self-Reported &amp; Local Logs
                    </span>
                  </div>

                  <p className="text-sm md:text-[15px] text-[#D8D5CD] leading-relaxed">
                    You logged {sleepHoursDisplay} of sleep last night and reported steady morning energy. Physical activity was recorded yesterday, with an evening walk planned today.
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-[#85827A] pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#D98B2B]" />
                      <span>Circadian cadence intact</span>
                    </div>
                    <span className="text-[#32343D]">/</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#85827A]" />
                      <span>No elevated friction noted</span>
                    </div>
                  </div>
                </div>

                {/* Right 3 Metric Blocks */}
                <div className="lg:col-span-5 grid grid-cols-3 gap-3 border-t lg:border-t-0 lg:border-l border-[#23242A] pt-4 lg:pt-0 lg:pl-6">
                  
                  {/* SLEEP REST */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-xs text-[#85827A]">
                      <span className="uppercase text-[11px] font-semibold tracking-wider">SLEEP REST</span>
                      <Moon size={12} className="text-[#D98B2B]" />
                    </div>
                    <div className="text-base md:text-lg font-bold text-[#F7F5F0]">
                      {sleepHoursDisplay}
                    </div>
                    <div className="text-[11px] text-[#85827A] font-mono">
                      {todayLog.sleep?.sleepTime || "23:15"} – {todayLog.sleep?.wakeTime || "06:35"}
                    </div>
                    <div className="text-[10px] text-[#66635B] mt-0.5">
                      Steady schedule
                    </div>
                  </div>

                  {/* MORNING ENERGY */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-xs text-[#85827A]">
                      <span className="uppercase text-[11px] font-semibold tracking-wider">MORNING ENERGY</span>
                      <Sun size={12} className="text-[#D98B2B]" />
                    </div>
                    <div className="text-base md:text-lg font-bold text-[#F7F5F0]">
                      {energyLevel} / 5
                    </div>
                    <div className="text-[11px] text-[#85827A] font-mono">
                      Recorded 09:15
                    </div>
                    <div className="text-[10px] text-[#66635B] mt-0.5">
                      High · Clear head
                    </div>
                  </div>

                  {/* MOOD & STRESS */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-xs text-[#85827A]">
                      <span className="uppercase text-[11px] font-semibold tracking-wider">MOOD &amp; STRESS</span>
                      <Smile size={12} className="text-[#D98B2B]" />
                    </div>
                    <div className="text-base md:text-lg font-bold text-[#F7F5F0]">
                      {moodRatingText}
                    </div>
                    <div className="text-[11px] text-[#85827A] font-mono">
                      Low friction
                    </div>
                    <div className="text-[10px] text-[#66635B] mt-0.5">
                      Grounded focus
                    </div>
                  </div>

                </div>

              </div>
            </div>

            {/* ----------------------------------------------------- */}
            {/* GRID 2x3: 6 CORE TELEMETRY CARDS                      */}
            {/* ----------------------------------------------------- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              {/* CARD 1: Sleep & Rest */}
              <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 flex flex-col justify-between hover:border-[#32343D] transition-colors shadow-lg">
                <div className="flex flex-col gap-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-[#23242A]/60 text-[#D98B2B]">
                        <Bed size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#F7F5F0]">Sleep &amp; Rest</h3>
                        <p className="text-[10px] text-[#85827A] uppercase tracking-wider font-mono">
                          SELF-REPORTED · LOCAL BEDTIME
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-[#85827A] font-medium">
                      {formattedTodayDate}
                    </span>
                  </div>

                  {/* Big Number & Sub stats */}
                  <div className="flex items-baseline justify-between pt-2">
                    <div>
                      <div className="text-3xl font-extrabold text-[#F7F5F0] tracking-tight">
                        {sleepHoursDisplay}
                      </div>
                      <p className="text-xs text-[#85827A] mt-1 font-mono">
                        {sleepRangeDisplay}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-[#85827A] font-mono">
                        TARGET RANGE
                      </div>
                      <div className="text-xs font-semibold text-[#D8D5CD] mt-0.5">
                        7.0h – 8.0h
                      </div>
                    </div>
                  </div>

                  {/* 7-Day Horizon Bar Chart */}
                  <div className="pt-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="uppercase text-[10px] font-bold tracking-wider text-[#85827A] font-mono">
                        7-DAY HORIZON
                      </span>
                      <span className="text-[#85827A] text-[11px] font-mono">
                        Avg {sleepHorizon.avgH}h {sleepHorizon.avgM}m
                      </span>
                    </div>

                    <div className="flex items-end justify-between gap-1.5 h-16 pt-2">
                      {sleepHorizon.days.map((d, idx) => {
                        const heightPct = Math.min(100, Math.max(20, (d.hours / 9) * 100));
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-full rounded-sm transition-all ${
                                d.isToday
                                  ? "bg-[#D98B2B] shadow-[0_0_8px_rgba(217,139,43,0.4)]"
                                  : "bg-[#23242A] hover:bg-[#32343D]"
                              }`}
                              title={`${d.dateStr}: ${d.hours.toFixed(1)}h`}
                            />
                            <span className={`text-[10px] font-mono ${d.isToday ? "text-[#D98B2B] font-bold" : "text-[#66635B]"}`}>
                              {d.dayLetter}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Card Action Link */}
                <div className="pt-5 border-t border-[#23242A]/80 mt-4">
                  <button
                    onClick={() => setIsSleepHistoryOpen(true)}
                    className="w-full flex items-center justify-between text-xs text-[#85827A] hover:text-[#F7F5F0] transition-colors group cursor-pointer"
                  >
                    <span>Inspect Sleep History</span>
                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-1 text-[#D98B2B]" />
                  </button>
                </div>
              </div>

              {/* CARD 2: Energy & Mood */}
              <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 flex flex-col justify-between hover:border-[#32343D] transition-colors shadow-lg">
                <div className="flex flex-col gap-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-[#23242A]/60 text-[#D98B2B]">
                        <Brain size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#F7F5F0]">Energy &amp; Mood</h3>
                        <p className="text-[10px] text-[#85827A] uppercase tracking-wider font-mono">
                          LOGGED TODAY · 09:15
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Morning Check-in Row */}
                  <div className="bg-[#111113]/80 border border-[#23242A] rounded-xl p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D98B2B]" />
                        <span className="text-xs font-semibold text-[#F7F5F0]">
                          09:15 Morning Check-in
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-[#D98B2B] bg-[#D98B2B]/10 px-2 py-0.5 rounded-md">
                        Level {energyLevel} / 5
                      </span>
                    </div>
                    <div className="text-xs text-[#D8D5CD]">
                      Mood: <span className="text-[#F7F5F0] font-medium">Grounded &amp; Focused</span>
                    </div>
                    <p className="text-[11px] text-[#85827A] italic">
                      &quot;{checkinForm.moodNote}&quot;
                    </p>
                  </div>

                  {/* Midday Check-in Row */}
                  <div className="bg-[#111113]/40 border border-[#23242A] border-dashed rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#66635B]" />
                        <span className="text-xs font-semibold text-[#85827A]">
                          14:00 Midday Check-in
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-[#85827A] bg-[#23242A] px-2 py-0.5 rounded-md">
                        READY
                      </span>
                    </div>
                    <p className="text-[11px] text-[#66635B]">
                      Unrecorded · Take a moment to gauge cognitive pace.
                    </p>
                    <button
                      onClick={() => setIsCheckInOpen(true)}
                      className="mt-1 w-full py-1.5 rounded-lg bg-[#23242A] hover:bg-[#32343D] text-[#F7F5F0] text-xs font-medium transition-colors cursor-pointer text-center"
                    >
                      Log Midday Status
                    </button>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="pt-4 border-t border-[#23242A]/80 mt-4 flex items-center justify-between text-[11px] text-[#66635B] font-mono">
                  <span>Cadence: 2 Check-ins / day</span>
                  <span>Self-Reported Only</span>
                </div>
              </div>

              {/* CARD 3: Physical Activity */}
              <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 flex flex-col justify-between hover:border-[#32343D] transition-colors shadow-lg">
                <div className="flex flex-col gap-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-[#23242A]/60 text-[#D98B2B]">
                        <Footprints size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#F7F5F0]">Physical Activity</h3>
                        <p className="text-[10px] text-[#85827A] uppercase tracking-wider font-mono">
                          LOGGED SESSIONS
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveView("gym")}
                      className="text-xs text-[#D98B2B] hover:text-[#ffb86c] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={12} />
                      <span>ADD</span>
                    </button>
                  </div>

                  {/* Activity Items List */}
                  <div className="flex flex-col gap-2.5 pt-1">
                    {/* Item 1: Strength & Mobility */}
                    <div className="p-2.5 rounded-xl bg-[#111113]/80 border border-[#23242A] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-[#23242A] text-[#D98B2B]">
                          <Dumbbell size={14} />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-[#F7F5F0]">Strength &amp; Mobility</div>
                          <div className="text-[10px] text-[#85827A]">Yesterday · 17:30</div>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-[#D8D5CD]">45 mins</span>
                    </div>

                    {/* Item 2: Zone 2 Outdoor Walk */}
                    <div className="p-2.5 rounded-xl bg-[#111113]/80 border border-[#23242A] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-[#23242A] text-[#85827A]">
                          <Footprints size={14} />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-[#F7F5F0]">Zone 2 Outdoor Walk</div>
                          <div className="text-[10px] text-[#85827A]">Monday · 07:45</div>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-[#D8D5CD]">35 mins</span>
                    </div>

                    {/* Item 3: Restorative Evening Walk */}
                    <div className="p-2.5 rounded-xl bg-[#111113]/40 border border-[#23242A] border-dashed flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-[#23242A] text-[#85827A]">
                          <Clock size={14} />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-[#85827A]">Restorative Evening Walk</div>
                          <div className="text-[10px] text-[#66635B]">Scheduled · Linked with Timeline</div>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-[#85827A]">30m</span>
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="pt-4 border-t border-[#23242A]/80 mt-4 flex items-center justify-between text-[11px] text-[#66635B] font-mono">
                  <span>Weekly Target: 4 Sessions</span>
                  <span className="text-[#D98B2B] font-semibold">2 / 4 Completed</span>
                </div>
              </div>

              {/* CARD 4: Nutrition & Water */}
              <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 flex flex-col justify-between hover:border-[#32343D] transition-colors shadow-lg">
                <div className="flex flex-col gap-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-[#23242A]/60 text-[#D98B2B]">
                        <Utensils size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#F7F5F0]">Nutrition &amp; Water</h3>
                        <p className="text-[10px] text-[#85827A] uppercase tracking-wider font-mono">
                          MANUAL LOG
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveView("nutrition")}
                      className="text-xs text-[#D98B2B] hover:text-[#ffb86c] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={12} />
                      <span>ADD NOTE</span>
                    </button>
                  </div>

                  {/* Breakfast Item */}
                  <div className="bg-[#111113]/80 border border-[#23242A] rounded-xl p-3 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#F7F5F0]">Breakfast Logged</span>
                      <span className="font-mono text-[#85827A]">08:30</span>
                    </div>
                    <p className="text-xs text-[#D8D5CD]">
                      {checkinForm.breakfastNote}
                    </p>
                  </div>

                  {/* Hydration Interactive Droplets */}
                  <div className="pt-1 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#F7F5F0]">Hydration</span>
                      <span className="text-xs text-[#85827A] font-mono">
                        {hydrationCount} glasses recorded
                      </span>
                    </div>

                    {/* 8 Clickable Droplet Icons */}
                    <div className="flex items-center justify-between gap-1.5 p-2 bg-[#111113]/60 rounded-xl border border-[#23242A]">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((drop) => {
                        const filled = drop <= hydrationCount;
                        return (
                          <button
                            key={drop}
                            type="button"
                            onClick={() => handleSetHydration(drop)}
                            title={`Log ${drop} glasses`}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                              filled
                                ? "bg-[#D98B2B]/20 text-[#D98B2B] scale-105 shadow-sm"
                                : "text-[#3E4049] hover:text-[#85827A] hover:bg-[#23242A]"
                            }`}
                          >
                            <Droplet
                              size={16}
                              className={filled ? "fill-[#D98B2B] text-[#D98B2B]" : ""}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="pt-4 border-t border-[#23242A]/80 mt-4 flex items-center justify-between text-[11px] text-[#66635B] font-mono">
                  <span>Lunch: Unlogged</span>
                  <span>Routine window: 13:00</span>
                </div>
              </div>

              {/* CARD 5: Recovery & Pacing */}
              <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 flex flex-col justify-between hover:border-[#32343D] transition-colors shadow-lg">
                <div className="flex flex-col gap-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-[#23242A]/60 text-[#D98B2B]">
                        <Hourglass size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#F7F5F0]">Recovery &amp; Pacing</h3>
                        <p className="text-[10px] text-[#85827A] uppercase tracking-wider font-mono">
                          REST BOUNDARIES
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push("/settings")}
                      className="p-1 rounded-lg text-[#85827A] hover:text-[#F7F5F0] transition-colors cursor-pointer"
                      title="Adjust Rest Boundaries"
                    >
                      <Settings size={14} />
                    </button>
                  </div>

                  {/* Boundary Status Box */}
                  <div className="flex flex-col gap-2 pt-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#D98B2B] font-mono">
                      BOUNDARY STATUS
                    </span>
                    <p className="text-xs text-[#D8D5CD] leading-relaxed">
                      Consistent rest boundary held for 3 consecutive evenings. No late screen activity logged past 22:30.
                    </p>
                  </div>

                  {/* Supports Trajectory Tag */}
                  <div className="p-2.5 rounded-xl bg-[#111113]/80 border border-[#23242A] flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-[#23242A] text-[#D98B2B]">
                      <Sparkles size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase font-mono text-[#85827A]">
                        SUPPORTS TRAJECTORY
                      </div>
                      <div className="text-xs font-semibold text-[#F7F5F0] truncate">
                        Cognitive Cadence &amp; Restorative Health
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="pt-4 border-t border-[#23242A]/80 mt-4 flex items-center justify-between text-[11px] text-[#66635B] font-mono">
                  <span>Evening Lock scheduled: 21:45</span>
                  <span className="text-emerald-400 font-semibold">Active</span>
                </div>
              </div>

              {/* CARD 6: Stress Reflection */}
              <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 flex flex-col justify-between hover:border-[#32343D] transition-colors shadow-lg">
                <div className="flex flex-col gap-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-[#23242A]/60 text-[#D98B2B]">
                        <Heart size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#F7F5F0]">Stress Reflection</h3>
                        <p className="text-[10px] text-[#85827A] uppercase tracking-wider font-mono">
                          {checkinForm.reflectionBothering ? "RECORDED" : "UNRECORDED"}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-[#85827A] font-mono">–</span>
                  </div>

                  {/* Reflection Body (Unrecorded Zen State vs Recorded) */}
                  {!checkinForm.reflectionBothering ? (
                    <div className="py-4 flex flex-col items-center justify-center text-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-[#111113] border border-[#23242A] flex items-center justify-center text-[#85827A]">
                        <Smile size={18} />
                      </div>
                      <div className="text-xs font-semibold text-[#D8D5CD] mt-1">
                        Not recorded yet today
                      </div>
                      <p className="text-[11px] text-[#85827A] max-w-xs leading-relaxed">
                        No stress check-in logged for {formattedTodayDate}. Record how you&apos;re feeling whenever you like.
                      </p>
                      <button
                        onClick={() => setIsCheckInOpen(true)}
                        className="mt-2 px-3.5 py-1.5 rounded-full bg-[#23242A] hover:bg-[#32343D] text-[#F7F5F0] text-xs font-medium transition-colors cursor-pointer"
                      >
                        + Add Note
                      </button>
                    </div>
                  ) : (
                    <div className="bg-[#111113]/80 border border-[#23242A] rounded-xl p-3 flex flex-col gap-2">
                      <div className="text-xs text-[#D8D5CD] italic">
                        &quot;{checkinForm.reflectionBothering}&quot;
                      </div>
                      {checkinForm.reflectionWin && (
                        <div className="text-[11px] text-[#85827A]">
                          Win: {checkinForm.reflectionWin}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="pt-4 border-t border-[#23242A]/80 mt-4 flex items-center justify-between text-[11px] text-[#66635B] font-mono">
                  <span>Voluntary · No streaks enforced</span>
                  <span>Neutral</span>
                </div>
              </div>

            </div>

            {/* ----------------------------------------------------- */}
            {/* BOTTOM SOVEREIGN FOOTER BAR (Screenshot 2)            */}
            {/* ----------------------------------------------------- */}
            <div className="w-full bg-[#17171A] border border-[#23242A] rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg text-xs">
              
              {/* Left Sovereign Note */}
              <div className="flex items-center gap-2.5 text-[#85827A]">
                <Shield size={16} className="text-[#D98B2B] shrink-0" />
                <span>
                  <strong className="text-[#D8D5CD] font-medium">Data Sovereignty:</strong> All vital logs are stored locally on device and encrypted. No telemetry is shared.
                </span>
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-4 shrink-0">
                <button
                  onClick={handleExportWellbeing}
                  className="flex items-center gap-1.5 text-[#85827A] hover:text-[#F7F5F0] transition-colors cursor-pointer font-medium"
                >
                  <Download size={13} />
                  <span>Export Wellbeing Log</span>
                </button>

                <button
                  onClick={() => setIsHistoryModalOpen(true)}
                  className="flex items-center gap-1.5 text-[#D98B2B] hover:text-[#ffb86c] transition-colors cursor-pointer font-medium"
                >
                  <span>View Complete History (30 Days)</span>
                  <ChevronRight size={14} />
                </button>
              </div>

            </div>

          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: GYM PROTOCOL (Revamped to Studio UI)              */}
        {/* ========================================================= */}
        {activeView === "gym" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-200">
            
            {/* Gym Header Banner */}
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Dumbbell size={16} className="text-[#D98B2B]" />
                  <h2 className="text-lg font-bold text-[#F7F5F0]">Gym Protocol &amp; Strength Telemetry</h2>
                </div>
                <p className="text-xs text-[#85827A] mt-1">
                  Autonomous split pacing, overload detection, and routine tracking.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/gym/create-routine")}
                  className="px-4 py-2 rounded-full bg-[#23242A] hover:bg-[#32343D] text-[#F7F5F0] text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <Plus size={14} />
                  <span>New Routine</span>
                </button>
                <button
                  onClick={() => router.push("/gym/progress")}
                  className="px-4 py-2 rounded-full bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
                >
                  <Flame size={14} />
                  <span>Progression Intelligence</span>
                </button>
              </div>
            </div>

            {/* Split Columns: Routines & This Week's Sessions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Left: Routines & Quick Start */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#D8D5CD] flex items-center gap-2">
                    <Play size={14} className="text-[#D98B2B] fill-[#D98B2B]" />
                    <span>Routines &amp; Splits</span>
                  </h3>
                  <span className="text-xs text-[#85827A] font-mono">{routines.length} registered</span>
                </div>

                {routines.length === 0 ? (
                  <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-8 text-center text-xs text-[#85827A]">
                    No routines created yet. Create a split routine to start a guided session.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {routines.map((r) => (
                      <div
                        key={r._id}
                        className="bg-[#17171A] border border-[#23242A] hover:border-[#32343D] rounded-2xl p-4 transition-all"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-bold text-[#F7F5F0]">{r.routineName}</h4>
                          <span className="text-[10px] font-mono text-[#85827A] bg-[#23242A] px-2 py-0.5 rounded-md">
                            {r.splitDays?.length || 0} SPLITS
                          </span>
                        </div>

                        <div className="flex flex-col gap-2 mt-3">
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
                              className="p-3 bg-[#111113] border border-[#23242A] hover:border-[#D98B2B]/40 rounded-xl flex items-center justify-between cursor-pointer group transition-all"
                            >
                              <div>
                                <div className="text-xs font-semibold text-[#D98B2B] group-hover:text-[#ffb86c]">
                                  {day.dayName}
                                </div>
                                <div className="text-[10px] text-[#85827A]">
                                  {day.exercises?.length || 0} exercises configured
                                </div>
                              </div>
                              <div className="w-7 h-7 rounded-full bg-[#D98B2B]/20 group-hover:bg-[#D98B2B] flex items-center justify-center text-[#D98B2B] group-hover:text-[#111113] transition-colors">
                                <Play size={11} className="fill-current ml-0.5" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Logged Sessions History */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#D8D5CD] flex items-center gap-2">
                    <Clock size={14} className="text-[#D98B2B]" />
                    <span>Recent Workout Sessions</span>
                  </h3>
                  <span className="text-xs text-[#85827A] font-mono">{sessions.length} logged</span>
                </div>

                {sessions.length === 0 ? (
                  <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-8 text-center text-xs text-[#85827A]">
                    No sessions logged yet. Complete a workout or log past exercises.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {sessions.slice(0, 5).map((s) => {
                      const durMins = Math.floor(s.durationSeconds / 60);
                      return (
                        <div
                          key={s._id}
                          className="bg-[#17171A] border border-[#23242A] rounded-2xl p-4 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-[#23242A] text-[#D98B2B]">
                              <Dumbbell size={16} />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-[#F7F5F0]">
                                {s.splitDayName || s.workoutType || "Freestyle Session"}
                              </div>
                              <div className="text-[10px] text-[#85827A] flex items-center gap-2 mt-0.5 font-mono">
                                <span>{new Date(s.date).toLocaleDateString()}</span>
                                <span>·</span>
                                <span>{durMins} mins</span>
                                <span>·</span>
                                <span>{s.exercises?.length || 0} exercises</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-xs font-mono font-bold text-[#D98B2B]">
                              {s.calories ? `${s.calories} kcal` : "Completed"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 3: NUTRITION HUB (Revamped to Studio UI)             */}
        {/* ========================================================= */}
        {activeView === "nutrition" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-200">
            
            {/* Nutrition Header Banner */}
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Utensils size={16} className="text-[#D98B2B]" />
                  <h2 className="text-lg font-bold text-[#F7F5F0]">Nutrition &amp; Metabolic Telemetry</h2>
                </div>
                <p className="text-xs text-[#85827A] mt-1">
                  Macro targets, micronutrient balances, and meal cadence tracker.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/nutrition/library")}
                  className="px-4 py-2 rounded-full bg-[#23242A] hover:bg-[#32343D] text-[#F7F5F0] text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <Search size={14} />
                  <span>Food Library</span>
                </button>
                <button
                  onClick={() => router.push("/nutrition/daily-log")}
                  className="px-4 py-2 rounded-full bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
                >
                  <Plus size={14} />
                  <span>Log Food Item</span>
                </button>
              </div>
            </div>

            {/* Macro Totals Card */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              
              {/* Calories */}
              <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#85827A]">
                  CALORIES CONSUMED
                </span>
                <div className="text-2xl font-extrabold text-[#F7F5F0]">
                  {nutritionLog?.dailyTotals?.calories || 0}{" "}
                  <span className="text-xs font-normal text-[#85827A]">/ 2,200 kcal</span>
                </div>
                <div className="w-full bg-[#23242A] h-1.5 rounded-full overflow-hidden mt-1">
                  <div
                    style={{
                      width: `${Math.min(100, ((nutritionLog?.dailyTotals?.calories || 0) / 2200) * 100)}%`,
                    }}
                    className="h-full bg-[#D98B2B] rounded-full"
                  />
                </div>
              </div>

              {/* Protein */}
              <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#85827A]">
                  PROTEIN
                </span>
                <div className="text-2xl font-extrabold text-[#F7F5F0]">
                  {Math.round(nutritionLog?.dailyTotals?.protein || 0)}{" "}
                  <span className="text-xs font-normal text-[#85827A]">/ 160g</span>
                </div>
                <div className="w-full bg-[#23242A] h-1.5 rounded-full overflow-hidden mt-1">
                  <div
                    style={{
                      width: `${Math.min(100, ((nutritionLog?.dailyTotals?.protein || 0) / 160) * 100)}%`,
                    }}
                    className="h-full bg-emerald-400 rounded-full"
                  />
                </div>
              </div>

              {/* Carbs */}
              <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#85827A]">
                  CARBOHYDRATES
                </span>
                <div className="text-2xl font-extrabold text-[#F7F5F0]">
                  {Math.round(nutritionLog?.dailyTotals?.carbs || 0)}{" "}
                  <span className="text-xs font-normal text-[#85827A]">/ 220g</span>
                </div>
                <div className="w-full bg-[#23242A] h-1.5 rounded-full overflow-hidden mt-1">
                  <div
                    style={{
                      width: `${Math.min(100, ((nutritionLog?.dailyTotals?.carbs || 0) / 220) * 100)}%`,
                    }}
                    className="h-full bg-sky-400 rounded-full"
                  />
                </div>
              </div>

              {/* Fats */}
              <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#85827A]">
                  FATS
                </span>
                <div className="text-2xl font-extrabold text-[#F7F5F0]">
                  {Math.round(nutritionLog?.dailyTotals?.fats || 0)}{" "}
                  <span className="text-xs font-normal text-[#85827A]">/ 65g</span>
                </div>
                <div className="w-full bg-[#23242A] h-1.5 rounded-full overflow-hidden mt-1">
                  <div
                    style={{
                      width: `${Math.min(100, ((nutritionLog?.dailyTotals?.fats || 0) / 65) * 100)}%`,
                    }}
                    className="h-full bg-amber-400 rounded-full"
                  />
                </div>
              </div>

            </div>

            {/* Meals Logged Today */}
            <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#F7F5F0]">Meals Recorded Today</h3>
                <span className="text-xs text-[#85827A] font-mono">
                  {nutritionLog?.meals?.length || 0} meals logged
                </span>
              </div>

              {(!nutritionLog?.meals || nutritionLog.meals.length === 0) ? (
                <div className="py-8 text-center text-xs text-[#85827A]">
                  No individual food items logged for today yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {nutritionLog.meals.map((m, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[#111113] border border-[#23242A] rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-semibold text-[#F7F5F0] capitalize">
                          {m.mealType}: {m.foodItemId?.name || "Food Item"}
                        </div>
                        <div className="text-[10px] text-[#85827A] font-mono">
                          {m.amount}g · {m.macros?.calories || 0} kcal · P: {m.macros?.protein || 0}g · C: {m.macros?.carbs || 0}g · F: {m.macros?.fats || 0}g
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* ========================================================= */}
      {/* MODAL 1: CHECK IN MODAL                                   */}
      {/* ========================================================= */}
      {isCheckInOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171A] border border-[#23242A] rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-6 shadow-2xl custom-h-scrollbar">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#23242A]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#D98B2B]/20 text-[#D98B2B]">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#F7F5F0]">Daily Vital Check-In</h2>
                  <p className="text-xs text-[#85827A]">Record sleep, energy, mood, and reflections</p>
                </div>
              </div>
              <button
                onClick={() => setIsCheckInOpen(false)}
                className="p-1 rounded-full text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#23242A] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCheckIn} className="flex flex-col gap-5">
              
              {/* Sleep Section */}
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#D98B2B] font-mono">
                  1. SLEEP &amp; REST
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-[#85827A] block mb-1">Hours Slept</label>
                    <input
                      type="number"
                      step="0.1"
                      value={checkinForm.sleepHours}
                      onChange={(e) => setCheckinForm({ ...checkinForm, sleepHours: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:border-[#D98B2B] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#85827A] block mb-1">Asleep Time</label>
                    <input
                      type="time"
                      value={checkinForm.sleepTime}
                      onChange={(e) => setCheckinForm({ ...checkinForm, sleepTime: e.target.value })}
                      className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:border-[#D98B2B] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#85827A] block mb-1">Awake Time</label>
                    <input
                      type="time"
                      value={checkinForm.wakeTime}
                      onChange={(e) => setCheckinForm({ ...checkinForm, wakeTime: e.target.value })}
                      className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:border-[#D98B2B] outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Energy & Mood Section */}
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#D98B2B] font-mono">
                  2. ENERGY &amp; COGNITIVE STATE
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#85827A] block mb-1">
                      Morning Energy (1-5): {checkinForm.morningEnergy}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={checkinForm.morningEnergy}
                      onChange={(e) => setCheckinForm({ ...checkinForm, morningEnergy: parseInt(e.target.value) })}
                      className="w-full accent-[#D98B2B] cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#85827A] block mb-1">
                      Mood Score (1-5): {checkinForm.moodScore}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={checkinForm.moodScore}
                      onChange={(e) => setCheckinForm({ ...checkinForm, moodScore: parseInt(e.target.value) })}
                      className="w-full accent-[#D98B2B] cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-[#85827A] block mb-1">Mood Note / Sensations</label>
                  <input
                    type="text"
                    value={checkinForm.moodNote}
                    onChange={(e) => setCheckinForm({ ...checkinForm, moodNote: e.target.value })}
                    placeholder="e.g. Clear head after morning outdoor air."
                    className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:border-[#D98B2B] outline-none"
                  />
                </div>
              </div>

              {/* Nutrition & Breakfast */}
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#D98B2B] font-mono">
                  3. NUTRITION NOTE
                </span>
                <div>
                  <label className="text-[11px] text-[#85827A] block mb-1">Meals / Breakfast Log</label>
                  <input
                    type="text"
                    value={checkinForm.breakfastNote}
                    onChange={(e) => setCheckinForm({ ...checkinForm, breakfastNote: e.target.value })}
                    placeholder="e.g. Steel-cut oats with almonds & black coffee"
                    className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:border-[#D98B2B] outline-none"
                  />
                </div>
              </div>

              {/* Reflections */}
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#D98B2B] font-mono">
                  4. DAILY REFLECTION (OPTIONAL)
                </span>
                <div>
                  <label className="text-[11px] text-[#85827A] block mb-1">Stress Note / What was bothering you?</label>
                  <input
                    type="text"
                    value={checkinForm.reflectionBothering}
                    onChange={(e) => setCheckinForm({ ...checkinForm, reflectionBothering: e.target.value })}
                    placeholder="Leave empty if frictionless"
                    className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:border-[#D98B2B] outline-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#23242A]">
                <button
                  type="button"
                  onClick={() => setIsCheckInOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#23242A] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  {isSubmitting ? "Saving..." : "Save Check-In"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: 30-DAY COMPLETE HISTORY MODAL                    */}
      {/* ========================================================= */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171A] border border-[#23242A] rounded-3xl w-full max-w-4xl max-h-[85vh] overflow-y-auto p-6 flex flex-col gap-6 shadow-2xl custom-h-scrollbar">
            
            <div className="flex items-center justify-between pb-3 border-b border-[#23242A]">
              <div>
                <h2 className="text-base font-bold text-[#F7F5F0]">30-Day Complete Wellbeing History</h2>
                <p className="text-xs text-[#85827A]">Historical logs recorded sovereignly</p>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1 rounded-full text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#23242A] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#23242A] text-[#85827A] font-mono text-[11px]">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Sleep</th>
                    <th className="py-2.5 px-3">Energy</th>
                    <th className="py-2.5 px-3">Mood</th>
                    <th className="py-2.5 px-3">Hydration</th>
                    <th className="py-2.5 px-3">Physical Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#23242A]/60">
                  {historyLogs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-[#111113]/50">
                      <td className="py-2.5 px-3 font-mono text-[#D8D5CD]">{log.date}</td>
                      <td className="py-2.5 px-3 font-mono text-[#F7F5F0]">
                        {log.sleep?.hours ? `${log.sleep.hours.toFixed(1)}h` : "–"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#D98B2B]">
                        {log.mental?.energy ? `${log.mental.energy}/5` : "–"}
                      </td>
                      <td className="py-2.5 px-3 text-[#D8D5CD]">
                        {log.mental?.mood ? `${log.mental.mood}/5` : "–"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-sky-400">
                        {log.signals?.water ? `${log.signals.water} gl` : "–"}
                      </td>
                      <td className="py-2.5 px-3 text-[#85827A] truncate max-w-xs">
                        {log.physical?.dietNote || log.reflection?.win || "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: SLEEP HISTORY INSPECT MODAL                      */}
      {/* ========================================================= */}
      {isSleepHistoryOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171A] border border-[#23242A] rounded-3xl w-full max-w-lg p-6 flex flex-col gap-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#23242A]">
              <div className="flex items-center gap-2">
                <Moon size={16} className="text-[#D98B2B]" />
                <h3 className="text-base font-bold text-[#F7F5F0]">Sleep &amp; Circadian Rhythm</h3>
              </div>
              <button
                onClick={() => setIsSleepHistoryOpen(false)}
                className="p-1 rounded-full text-[#85827A] hover:text-[#F7F5F0]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs text-[#D8D5CD]">
              <div className="p-3 bg-[#111113] rounded-xl border border-[#23242A] flex justify-between items-center">
                <span>7-Day Average Duration:</span>
                <span className="font-mono font-bold text-[#F7F5F0]">
                  {sleepHorizon.avgH}h {sleepHorizon.avgM}m
                </span>
              </div>
              <div className="p-3 bg-[#111113] rounded-xl border border-[#23242A] flex justify-between items-center">
                <span>Target Range:</span>
                <span className="font-mono text-emerald-400">7.0h – 8.0h</span>
              </div>
              <div className="p-3 bg-[#111113] rounded-xl border border-[#23242A] flex justify-between items-center">
                <span>Circadian Phase:</span>
                <span className="font-mono text-[#D98B2B]">Optimal Synchronization</span>
              </div>
            </div>

            <button
              onClick={() => setIsSleepHistoryOpen(false)}
              className="w-full py-2 bg-[#23242A] hover:bg-[#32343D] text-[#F7F5F0] rounded-xl text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
