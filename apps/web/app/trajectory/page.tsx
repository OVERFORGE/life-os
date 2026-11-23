"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Calendar,
  ArrowRight,
  Check,
  Target,
  Sparkles,
  Flame,
  X,
  RefreshCw,
  Layers,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { CustomDatePicker } from "@/components/ui/CustomDateTimePicker";

interface Milestone {
  milestoneId: string;
  title: string;
  completed: boolean;
  completedAt?: string;
  order?: number;
}

interface TrajectoryGoal {
  id: string;
  title: string;
  description?: string;
  nature?: string;
  type?: string;
  horizon?: string;
  status: string;
  milestones: Milestone[];
  completedMilestones: number;
  totalMilestones: number;
  currentMilestone: string;
  nextMilestone: string;
  targetDateStr: string;
  targetCompletionDate?: string;
  theme?: {
    text: string;
    border: string;
    bg: string;
    dot: string;
    hex: string;
  };
  signals?: Array<{ key: string; weight: number }>;
  recent5Days?: Array<{ date: string; completed: boolean }>;
  activity14Days?: boolean[];
  streak?: number;
  trackedSignalsCount?: number;
  pressure?: {
    status: string;
    score: number;
  } | null;
}

interface HabitDay {
  date: string;
  completed: boolean;
}

interface TrajectoryHabit {
  id: string;
  title: string;
  frequency: string;
  supportingGoalTitle?: string;
  supportingGoalId?: string;
  category: string;
  targetDaysPerWeek: number;
  streak: number;
  recentDays: HabitDay[];
  isCompletedToday?: boolean;
}

const HORIZON_TABS = ["All Goals", "1 Month", "3 Months", "1 Year", "Custom"] as const;
type HorizonTab = (typeof HORIZON_TABS)[number];

const AVAILABLE_HABIT_SIGNALS = [
  { key: "mental.mood", label: "mood", category: "Mind" },
  { key: "mental.stress", label: "Stress", category: "Mind" },
  { key: "sleep.hours", label: "Sleep Hours", category: "Recovery" },
  { key: "work.deepWorkHours", label: "Deep Work Hours", category: "Cognitive" },
  { key: "mental.anxiety", label: "anxiety", category: "Mind" },
  { key: "intellect.reading", label: "pages read", category: "Cognitive" },
  { key: "learning.machine_learning", label: "Machine Learning Study Time", category: "Cognitive" },
  { key: "learning.product_engineering", label: "Product Engineering Study Time", category: "Cognitive" },
  { key: "learning.devops", label: "DevOps Study Time", category: "Cognitive" },
  { key: "work.coding", label: "Did Coding", category: "Cognitive" },
  { key: "work.execution", label: "Worked on Executioners", category: "Cognitive" },
  { key: "learning.general", label: "Studied / Learning", category: "Cognitive" },
  { key: "intellect.reading_book", label: "Reading", category: "Cognitive" },
  { key: "work.coding_practice", label: "Coding Practice", category: "Cognitive" },
  { key: "work.content_creation", label: "Content Creation", category: "Cognitive" },
  { key: "learning.study", label: "Learning / Study", category: "Cognitive" },
  { key: "wellness.discipline", label: "NoFap", category: "Mind" },
  { key: "health.meals", label: "Meals Eaten", category: "Physical" },
  { key: "health.diet", label: "Diet Note", category: "Physical" },
  { key: "physical.gym", label: "Gym & Workout", category: "Physical" },
  { key: "physical.steps", label: "Daily Steps", category: "Physical" },
];

export default function TrajectoryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filters & Search
  const [selectedHorizon, setSelectedHorizon] = useState<HorizonTab>("All Goals");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [isNewGoalModalOpen, setIsNewGoalModalOpen] = useState(false);
  const [isAddHabitModalOpen, setIsAddHabitModalOpen] = useState(false);
  const [selectedGoalDetail, setSelectedGoalDetail] = useState<TrajectoryGoal | null>(null);

  // New Goal Form State
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalType, setNewGoalType] = useState<"performance" | "identity" | "maintenance">("performance");
  const [newGoalHorizon, setNewGoalHorizon] = useState<string>("3 Months");
  const [newGoalTargetDate, setNewGoalTargetDate] = useState("");
  const [newGoalMilestones, setNewGoalMilestones] = useState<string[]>([
    "Initial discovery & scope definition",
    "Prototype delivery & local integration",
    "Validation & stress test deployment",
  ]);
  const [newMilestoneInput, setNewMilestoneInput] = useState("");

  // New Habit Form State
  const [newHabitTitle, setNewHabitTitle] = useState("");
  const [newHabitType, setNewHabitType] = useState<"identity" | "performance" | "maintenance" | "recovery">("identity");
  const [newHabitCadence, setNewHabitCadence] = useState<"daily" | "weekly" | "flexible">("daily");
  const [newHabitGoalTitle, setNewHabitGoalTitle] = useState("");
  const [newHabitSignals, setNewHabitSignals] = useState<{ key: string; label: string; weight: number }[]>([
    { key: "mental.mood", label: "mood", weight: 2 },
  ]);
  const [customHabitSignalKey, setCustomHabitSignalKey] = useState("");

  // Fetch All Goals & Habits from Canonical Goal Engine
  const {
    data: allGoals = [],
    isLoading: isGoalsLoading,
    refetch: refetchGoals,
  } = useQuery<TrajectoryGoal[]>({
    queryKey: queryKeys.goals(),
    queryFn: async () => {
      const res = await fetch("/api/goals/list");
      if (!res.ok) throw new Error("Failed to fetch goals");
      return res.json();
    },
    refetchInterval: 15000,
  });

  // Partition into Strategic Deliverable Goals vs Continuous Supporting Habits
  const deliverableGoals = useMemo(() => {
    return allGoals.filter((g) => g.nature !== "habitual_cadence");
  }, [allGoals]);

  const habits = useMemo(() => {
    const list = allGoals.filter((g) => g.nature === "habitual_cadence");
    if (list.length > 0) return list;
    const withSignals = allGoals.filter((g) => (g.signals || []).length > 0);
    if (withSignals.length > 0) return withSignals;
    return [] as TrajectoryGoal[];
  }, [allGoals]);

  // Hotkey listener for ⌘F / Ctrl+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setIsNewGoalModalOpen(false);
        setIsAddHabitModalOpen(false);
        setSelectedGoalDetail(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filter Goals based on Horizon & Search
  const filteredGoals = useMemo(() => {
    return deliverableGoals.filter((g) => {
      // Horizon filter
      if (selectedHorizon !== "All Goals") {
        const h = (g.horizon || "").toLowerCase();
        const tab = selectedHorizon.toLowerCase();
        if (selectedHorizon === "Custom") {
          if (["1 month", "3 months", "1 year"].includes(h)) return false;
        } else if (!h.includes(tab.replace("goals", "").trim())) {
          return false;
        }
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = g.title?.toLowerCase().includes(q);
        const matchCurrent = g.currentMilestone?.toLowerCase().includes(q);
        const matchNext = g.nextMilestone?.toLowerCase().includes(q);
        return matchTitle || matchCurrent || matchNext;
      }

      return true;
    });
  }, [deliverableGoals, selectedHorizon, searchQuery]);

  // Create Habit Mutation (Creates a canonical habitual_cadence Goal)
  const createHabitMutation = useMutation({
    mutationFn: async () => {
      const backendType = newHabitType === "recovery" ? "maintenance" : newHabitType;
      const res = await fetch("/api/goals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newHabitTitle.trim(),
          nature: "habitual_cadence",
          cadence: newHabitCadence,
          type: backendType,
          signals: newHabitSignals.map((s) => ({
            key: s.key,
            weight: s.weight || 2,
            direction: "higher_better",
          })),
          description: newHabitGoalTitle ? `Supports: ${newHabitGoalTitle}` : undefined,
          status: "active",
        }),
      });
      if (!res.ok) throw new Error("Failed to create habit");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals() });
      setIsAddHabitModalOpen(false);
      setNewHabitTitle("");
      setNewHabitSignals([{ key: "mental.mood", label: "mood", weight: 2 }]);
      setNewHabitGoalTitle("");
    },
  });

  // Create Goal Mutation
  const createGoalMutation = useMutation({
    mutationFn: async () => {
      const milestones = newGoalMilestones
        .filter((m) => m.trim().length > 0)
        .map((title, i) => ({
          milestoneId: `ms_${Date.now()}_${i}`,
          title: title.trim(),
          completed: i === 0, // first initial baseline marked done
          order: i,
        }));

      const res = await fetch("/api/goals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newGoalTitle.trim(),
          horizon: newGoalHorizon,
          targetCompletionDate: newGoalTargetDate || undefined,
          milestones,
          nature: "finite_deliverable",
          type: newGoalType,
          status: "active",
        }),
      });
      if (!res.ok) throw new Error("Failed to create goal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals() });
      setIsNewGoalModalOpen(false);
      setNewGoalTitle("");
      setNewGoalTargetDate("");
      setNewGoalMilestones([
        "Initial discovery & scope definition",
        "Prototype delivery & local integration",
        "Validation & stress test deployment",
      ]);
    },
  });

  // Toggle Goal Milestone Mutation
  const toggleMilestoneMutation = useMutation({
    mutationFn: async ({ goalId, milestoneId }: { goalId: string; milestoneId: string }) => {
      if (!selectedGoalDetail) return;
      const updatedMilestones = selectedGoalDetail.milestones.map((m) => {
        if (m.milestoneId === milestoneId) {
          return { ...m, completed: !m.completed, completedAt: !m.completed ? new Date().toISOString() : undefined };
        }
        return m;
      });

      const res = await fetch(`/api/goals/${goalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestones: updatedMilestones,
        }),
      });
      if (!res.ok) throw new Error("Failed to update milestone");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals() });
      if (data?.goal) {
        setSelectedGoalDetail((prev) => (prev ? { ...prev, milestones: data.goal.milestones } : null));
      }
    },
  });

  return (
    <div className="relative w-full h-full min-h-full bg-[#111113] text-[#F7F5F0] p-6 lg:p-7 flex flex-col gap-5 select-none font-sans overflow-hidden">
      {/* Ambient Micro Grid Texture matching Stitch Specification */}
      <div
        className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255, 184, 108, 0.04) 1px, transparent 1px), linear-gradient(rgba(255, 184, 108, 0.04) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage: "radial-gradient(65% 60% at 50% 48%, black 35%, transparent 85%)",
        }}
      />

      {/* ========================================================================= */}
      {/* TOP BAR: Title, Horizon Filter Pill, Search Filter, New Goal CTA          */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#23242A]/80 flex-shrink-0 relative z-10">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight text-[#F7F5F0]">Trajectory</h1>

          {/* Granularity / Horizon Segmented Pill */}
          <div className="flex items-center bg-[#0D0D0F] p-0.5 rounded-xl border border-[#23242A] text-xs font-mono">
            {HORIZON_TABS.map((tab) => {
              const isActive = selectedHorizon === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSelectedHorizon(tab)}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    isActive
                      ? "bg-[#1E1F24] text-[#F7F5F0] font-medium shadow-sm"
                      : "text-[#C5C2BA]/70 hover:text-[#F7F5F0]"
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Input & Action Button */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center w-60 sm:w-64">
            <Search className="absolute left-2.5 w-4 h-4 text-[#C5C2BA]/50 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter goals..."
              className="w-full bg-[#17171A] border border-[#23242A] rounded-xl pl-8 pr-9 py-1.5 text-xs text-[#F7F5F0] placeholder:text-[#C5C2BA]/40 focus:ring-1 focus:ring-[#ffb86c]/40 outline-none transition-all"
            />
            <kbd className="absolute right-2 font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#111113] border border-[#23242A] text-[#C5C2BA]/60">
              ⌘F
            </kbd>
          </div>

          <button
            type="button"
            onClick={() => setIsNewGoalModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#ffb86c] hover:bg-[#ffb86c]/90 text-[#492900] font-semibold text-xs shadow-md transition-all active:scale-95 flex-shrink-0"
          >
            <Plus className="w-4 h-4 font-bold stroke-[2.5]" />
            <span>New Goal</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* UNIFIED SCROLLABLE CONTENT BODY: Active Goals + Supporting Habits         */}
      {/* ========================================================================= */}
      <div className="flex-1 w-full overflow-y-auto pr-1 flex flex-col gap-6 min-h-0 relative z-10 custom-h-scrollbar pb-16">
        {/* ACTIVE GOALS SECTION */}
        <section className="flex flex-col gap-3 flex-shrink-0">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold tracking-wide uppercase text-[#C5C2BA]/80 font-mono">
              Active Goals
            </h2>
            <span className="font-mono text-[11px] text-[#C5C2BA]/60">
              {filteredGoals.length} in progress
            </span>
          </div>

          {isGoalsLoading && deliverableGoals.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-[#17171A] rounded-2xl border border-[#23242A]">
              <RefreshCw className="w-6 h-6 text-[#ffb86c] animate-spin mb-3" />
              <span className="text-xs text-[#C5C2BA]/70 font-mono">Synchronizing Trajectory Goals...</span>
            </div>
          ) : filteredGoals.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#17171A] border border-[#23242A] text-center flex flex-col items-center justify-center gap-3">
              <Target className="w-10 h-10 text-[#C5C2BA]/40" />
              <div className="text-sm font-medium text-[#F7F5F0]">No goals match your criteria</div>
              <p className="text-xs text-[#C5C2BA]/60 max-w-sm">
                Try selecting &apos;All Goals&apos; or create a new long-term milestone trajectory.
              </p>
              <button
                type="button"
                onClick={() => setIsNewGoalModalOpen(true)}
                className="mt-2 px-4 py-1.5 rounded-xl bg-[#ffb86c] text-[#492900] text-xs font-semibold"
              >
                Create Goal
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredGoals.map((goal, index) => {
                const theme = goal.theme || {
                  text: index % 2 === 0 ? "text-[#ffb86c]" : "text-emerald-400",
                  border: index % 2 === 0 ? "border-[#D98B2B]/40" : "border-emerald-500/40",
                  dot: index % 2 === 0 ? "bg-[#ffb86c]" : "bg-emerald-400",
                  hex: index % 2 === 0 ? "#ffb86c" : "#34d399",
                };

                return (
                  <div
                    key={goal.id}
                    onClick={() => setSelectedGoalDetail(goal)}
                    className="p-4 rounded-2xl bg-[#17171A] hover:bg-[#1E1F24]/80 border border-[#23242A] hover:border-[#D98B2B]/40 transition-all cursor-pointer shadow-md flex flex-col gap-3 group"
                  >
                    {/* Top Row: Title, Horizon Badge, Milestone Stats, View Goal Button */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="text-base font-semibold text-[#F7F5F0] group-hover:text-[#ffb86c] transition-colors truncate">
                            {goal.title}
                          </h3>
                          <span
                            className={`font-mono text-[10px] px-2 py-0.5 rounded bg-[#282930] ${theme.text} border border-[#23242A]`}
                          >
                            {goal.horizon || "3 Months"}
                          </span>
                          <span className="font-mono text-[10px] text-[#C5C2BA]/60">·</span>
                          <span className={`font-mono text-[11px] ${theme.text}`}>
                            {goal.completedMilestones} of {goal.totalMilestones} milestones completed
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGoalDetail(goal);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#111113] hover:bg-[#1E1F24] border border-[#23242A] text-xs text-[#C5C2BA] hover:text-[#F7F5F0] transition-colors flex items-center gap-1.5 font-medium flex-shrink-0"
                      >
                        <span>View goal</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Bottom Sub-bar: Current Milestone, Next Milestone, Target Date */}
                    <div className="p-3 rounded-xl bg-[#111113]/80 border border-[#23242A]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                      {/* Current Milestone */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full ${theme.dot} animate-pulse flex-shrink-0`} />
                        <span className="text-[#C5C2BA]/70">Current:</span>
                        <span className="text-[#F7F5F0] font-medium truncate">
                          {goal.currentMilestone}
                        </span>
                      </div>

                      {/* Next Milestone */}
                      <div className="flex items-center gap-2 min-w-0 sm:border-l sm:border-[#23242A] sm:pl-3">
                        <span className="w-2 h-2 rounded-full bg-[#C5C2BA]/40 flex-shrink-0" />
                        <span className="text-[#C5C2BA]/70">Next:</span>
                        <span className="text-[#C5C2BA] truncate">{goal.nextMilestone}</span>
                      </div>

                      {/* Target Date */}
                      <div
                        className={`flex items-center gap-1.5 font-mono text-[11px] ${theme.text} sm:ml-auto flex-shrink-0`}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{goal.targetDateStr}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ========================================================================= */}
        {/* SUPPORTING HABITS SECTION                                                 */}
        {/* ========================================================================= */}
        <section className="flex flex-col gap-3 pt-5 pb-8 border-t border-[#23242A]/60 flex-shrink-0">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold tracking-wide uppercase text-[#C5C2BA]/80 font-mono">
                Supporting Habits
              </h2>
              <span className="font-mono text-[11px] text-[#C5C2BA]/50">
                · {habits.length} active
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsAddHabitModalOpen(true)}
              className="text-xs text-[#ffb86c] hover:underline font-medium flex items-center gap-1 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Habit</span>
            </button>
          </div>

          {/* 3-Column Habit Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {habits.map((habit: any) => {
              const days = habit.recent5Days || habit.recentDays || [];
              const frequencyLabel = habit.cadence ? (habit.cadence === "daily" ? "Daily" : habit.cadence === "weekly" ? "Weekly" : "Flexible") : habit.frequency || "Daily";
              const subtitle = habit.supportingGoalTitle || (habit.signals?.length ? `${habit.signals.length} tracked signals` : "Continuous Cadence");
              return (
                <div
                  key={habit.id}
                  onClick={() => router.push(`/goals/${habit.id}`)}
                  className="p-3.5 rounded-xl bg-[#17171A] border border-[#23242A] hover:border-[#ffb86c]/40 transition-all flex flex-col justify-between gap-3 shadow-sm group cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-semibold text-[#F7F5F0] truncate group-hover:text-[#ffb86c] transition-colors">
                        {habit.title}
                      </span>
                      <span className="text-[11px] text-[#C5C2BA]/60 mt-0.5 truncate">
                        {subtitle}
                      </span>
                    </div>

                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#111113] border border-[#23242A] text-[#C5C2BA] flex-shrink-0">
                      {frequencyLabel}
                    </span>
                  </div>

                  {/* Recent Activity Dot Trail */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#23242A]/50">
                    <span className="text-[10px] font-mono text-[#C5C2BA]/50">
                      Recent activity
                    </span>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {days.map((day: any, idx: number) => {
                        const isLatest = idx === days.length - 1;
                        return (
                          <div
                            key={day.date}
                            title={`${day.date}: ${day.completed ? "Active" : "Inactive"}`}
                            className={`w-2 h-2 rounded-full transition-all ${
                              day.completed
                                ? "bg-emerald-400"
                                : isLatest
                                ? "bg-[#ffb86c]"
                                : "bg-[#282930]"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: NEW GOAL CREATION (CUSTOM PRETTY UI)                               */}
      {/* ========================================================================= */}
      {isNewGoalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-[#17171A] border border-[#23242A] rounded-2xl p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto custom-h-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-[#23242A]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#ffb86c]/10 border border-[#ffb86c]/20 text-[#ffb86c]">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F7F5F0]">Create Strategic Goal</h3>
                  <p className="text-[11px] text-[#85827A]">Finite deliverable with structured milestone milestones.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewGoalModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-[#1E1F24] flex items-center justify-center text-[#C5C2BA] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Field 1: Goal Title */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 block mb-1.5">
                  Goal Title
                </label>
                <input
                  type="text"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="e.g. Distributed Core Engine & Cache Pipeline"
                  className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3.5 py-2.5 text-xs text-[#F7F5F0] placeholder:text-[#85827A]/50 focus:border-[#ffb86c]/60 focus:outline-none transition-colors"
                />
              </div>

              {/* Field 2: Goal Type Pills */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 block mb-1.5">
                  Goal Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["performance", "identity", "maintenance"] as const).map((t) => {
                    const isSelected = newGoalType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewGoalType(t)}
                        className={`py-2 rounded-xl text-xs font-mono capitalize transition-all cursor-pointer border ${
                          isSelected
                            ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                            : "bg-[#111113] border-[#23242A] text-[#85827A] hover:text-[#C5C2BA] hover:bg-[#17171A]"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Field 3: Time Horizon Pills */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 block mb-1.5">
                  Time Horizon
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(["1 Month", "3 Months", "6 Months", "1 Year", "Custom"] as const).map((h) => {
                    const isSelected = newGoalHorizon === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => {
                          setNewGoalHorizon(h);
                          // Auto calculate target completion date helper
                          const d = new Date();
                          if (h === "1 Month") d.setMonth(d.getMonth() + 1);
                          else if (h === "3 Months") d.setMonth(d.getMonth() + 3);
                          else if (h === "6 Months") d.setMonth(d.getMonth() + 6);
                          else if (h === "1 Year") d.setFullYear(d.getFullYear() + 1);
                          setNewGoalTargetDate(d.toISOString().slice(0, 10));
                        }}
                        className={`py-1.5 rounded-xl text-[11px] font-mono transition-all cursor-pointer border text-center ${
                          isSelected
                            ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                            : "bg-[#111113] border-[#23242A] text-[#85827A] hover:text-[#C5C2BA] hover:bg-[#17171A]"
                        }`}
                      >
                        {h}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Field 4: Target Date Picker */}
              <div>
                <CustomDatePicker
                  label="Target Completion Date"
                  value={newGoalTargetDate}
                  onChange={(val) => setNewGoalTargetDate(val)}
                />
              </div>

              {/* Field 5: Milestones Checklist Builder */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 block mb-1.5">
                  Milestones ({newGoalMilestones.length})
                </label>
                <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto custom-h-scrollbar pr-1">
                  {newGoalMilestones.map((ms, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-xl bg-[#111113] border border-[#23242A] text-xs"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="w-5 h-5 rounded-lg bg-[#17171A] border border-[#23242A] flex items-center justify-center font-mono text-[10px] text-[#ffb86c] shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-[#F7F5F0] truncate">{ms}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setNewGoalMilestones((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-[#85827A] hover:text-rose-400 p-1 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={newMilestoneInput}
                    onChange={(e) => setNewMilestoneInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newMilestoneInput.trim()) {
                        e.preventDefault();
                        setNewGoalMilestones((prev) => [...prev, newMilestoneInput.trim()]);
                        setNewMilestoneInput("");
                      }
                    }}
                    placeholder="Add milestone title and press enter..."
                    className="flex-1 bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] outline-none focus:border-[#ffb86c]/60 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newMilestoneInput.trim()) {
                        setNewGoalMilestones((prev) => [...prev, newMilestoneInput.trim()]);
                        setNewMilestoneInput("");
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#1E1F24] hover:bg-[#282930] text-xs text-[#F7F5F0] font-semibold border border-[#23242A] transition cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#23242A]">
              <button
                type="button"
                onClick={() => setIsNewGoalModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-[#C5C2BA] hover:text-[#F7F5F0] hover:bg-[#1E1F24] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newGoalTitle.trim() || createGoalMutation.isPending}
                onClick={() => createGoalMutation.mutate()}
                className="px-5 py-2 rounded-xl bg-[#ffb86c] hover:bg-[#ffb86c]/90 text-[#492900] font-semibold text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer"
              >
                {createGoalMutation.isPending ? "Creating..." : "Save Goal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD SUPPORTING HABIT (CUSTOM PRETTY UI & SIGNAL SELECTOR)          */}
      {/* ========================================================================= */}
      {isAddHabitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-[#17171A] border border-[#23242A] rounded-2xl p-6 shadow-2xl flex flex-col gap-5 max-h-[92vh] overflow-y-auto custom-h-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-[#23242A]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#ffb86c]/10 border border-[#ffb86c]/20 text-[#ffb86c]">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F7F5F0]">Add Supporting Habit</h3>
                  <p className="text-[11px] text-[#85827A]">
                    Continuous 14-day rolling cadence driven by weighted life signals.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddHabitModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-[#1E1F24] flex items-center justify-center text-[#C5C2BA] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Field 1: Habit Title */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 block mb-1.5">
                  Habit Title
                </label>
                <input
                  type="text"
                  value={newHabitTitle}
                  onChange={(e) => setNewHabitTitle(e.target.value)}
                  placeholder="e.g. Master React Native or Daily Deep Work Block"
                  className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3.5 py-2.5 text-xs text-[#F7F5F0] placeholder:text-[#85827A]/50 focus:border-[#ffb86c]/60 focus:outline-none transition-colors"
                />
              </div>

              {/* Field 2: Goal Type Selector (Matches Screenshot!) */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 block mb-1.5">
                  Goal Type
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(["identity", "performance", "maintenance", "recovery"] as const).map((t) => {
                    const isSelected = newHabitType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewHabitType(t)}
                        className={`py-2 rounded-xl text-xs font-mono capitalize transition-all cursor-pointer border text-center ${
                          isSelected
                            ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                            : "bg-[#111113] border-[#23242A] text-[#85827A] hover:text-[#C5C2BA] hover:bg-[#17171A]"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Field 3: Cadence Selector */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 block mb-1.5">
                  Cadence Frequency
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["daily", "weekly", "flexible"] as const).map((c) => {
                    const isSelected = newHabitCadence === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewHabitCadence(c)}
                        className={`py-2 rounded-xl text-xs font-mono capitalize transition-all cursor-pointer border text-center ${
                          isSelected
                            ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                            : "bg-[#111113] border-[#23242A] text-[#85827A] hover:text-[#C5C2BA] hover:bg-[#17171A]"
                        }`}
                      >
                        {c === "daily" ? "Daily (7d/wk)" : c === "weekly" ? "Weekly (1–3d/wk)" : "Flexible"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Field 4: Link to Active Goal */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 block mb-1.5">
                  Link to Deliverable Goal (Optional)
                </label>
                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto custom-h-scrollbar">
                  <button
                    type="button"
                    onClick={() => setNewHabitGoalTitle("")}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition cursor-pointer ${
                      newHabitGoalTitle === ""
                        ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold"
                        : "bg-[#111113] border-[#23242A] text-[#85827A] hover:text-[#C5C2BA]"
                    }`}
                  >
                    None / General
                  </button>
                  {deliverableGoals.map((g) => {
                    const isSelected = newHabitGoalTitle === g.title;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setNewHabitGoalTitle(g.title)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition cursor-pointer truncate max-w-[240px] ${
                          isSelected
                            ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold"
                            : "bg-[#111113] border-[#23242A] text-[#85827A] hover:text-[#C5C2BA]"
                        }`}
                      >
                        {g.title}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Field 5: Tracked Signals Section (Matches Screenshot!) */}
              <div className="p-4 rounded-xl bg-[#111113] border border-[#23242A] flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#23242A]">
                  <div>
                    <h4 className="text-xs font-bold text-[#F7F5F0] uppercase tracking-wider font-mono">
                      Tracked Signals
                    </h4>
                    <span className="text-[11px] text-[#85827A]">
                      Select signal tags to feed this habit's 14-day rolling window
                    </span>
                  </div>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#17171A] text-[#ffb86c] border border-[#23242A]">
                    {newHabitSignals.length} Selected
                  </span>
                </div>

                {/* SELECT SIGNAL CHIPS GRID */}
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#85827A] block mb-2">
                    SELECT SIGNAL
                  </span>
                  <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto custom-h-scrollbar pr-1">
                    {AVAILABLE_HABIT_SIGNALS.map((sig) => {
                      const isSelected = newHabitSignals.some((s) => s.key === sig.key);
                      return (
                        <button
                          key={sig.key}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setNewHabitSignals(newHabitSignals.filter((s) => s.key !== sig.key));
                            } else {
                              setNewHabitSignals([
                                ...newHabitSignals,
                                { key: sig.key, label: sig.label, weight: 2 },
                              ]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer font-medium ${
                            isSelected
                              ? "bg-[#ffb86c]/20 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                              : "bg-[#17171A] border-[#23242A] text-[#C5C2BA] hover:text-[#F7F5F0] hover:border-[#32343D]"
                          }`}
                        >
                          {sig.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Key Add Row */}
                <div className="flex gap-2 pt-1 border-t border-[#23242A]">
                  <input
                    type="text"
                    value={customHabitSignalKey}
                    onChange={(e) => setCustomHabitSignalKey(e.target.value)}
                    placeholder="Custom key: e.g. reading.pages"
                    className="flex-1 bg-[#17171A] border border-[#23242A] rounded-xl px-3 py-1.5 text-xs text-[#F7F5F0] font-mono outline-none focus:border-[#ffb86c]/60"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customHabitSignalKey.trim()) {
                        e.preventDefault();
                        if (!newHabitSignals.some((s) => s.key === customHabitSignalKey.trim())) {
                          setNewHabitSignals([
                            ...newHabitSignals,
                            {
                              key: customHabitSignalKey.trim(),
                              label: customHabitSignalKey.trim(),
                              weight: 2,
                            },
                          ]);
                        }
                        setCustomHabitSignalKey("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customHabitSignalKey.trim()) {
                        if (!newHabitSignals.some((s) => s.key === customHabitSignalKey.trim())) {
                          setNewHabitSignals([
                            ...newHabitSignals,
                            {
                              key: customHabitSignalKey.trim(),
                              label: customHabitSignalKey.trim(),
                              weight: 2,
                            },
                          ]);
                        }
                        setCustomHabitSignalKey("");
                      }
                    }}
                    disabled={!customHabitSignalKey.trim()}
                    className="px-3 py-1.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] text-xs font-semibold text-[#F7F5F0] border border-[#23242A] disabled:opacity-40 transition cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {/* Selected Signals List with Weight Adjusters */}
                {newHabitSignals.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#23242A]">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#85827A] block">
                      Active Signal Weights
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto custom-h-scrollbar pr-1">
                      {newHabitSignals.map((s, idx) => (
                        <div
                          key={s.key}
                          className="flex items-center justify-between p-2 rounded-xl bg-[#17171A] border border-[#23242A] text-xs"
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="text-[#F7F5F0] font-medium truncate">{s.label}</span>
                            <span className="text-[10px] font-mono text-[#85827A] truncate">{s.key}</span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {/* Weight Stepper */}
                            <div className="flex items-center gap-1.5 bg-[#111113] border border-[#23242A] rounded-lg px-2 py-0.5">
                              <span className="text-[9px] font-mono text-[#85827A]">WT</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...newHabitSignals];
                                  next[idx].weight = Math.max(1, (next[idx].weight || 2) - 1);
                                  setNewHabitSignals(next);
                                }}
                                className="w-4 h-4 rounded hover:bg-[#23242A] text-[#F7F5F0] font-bold text-xs flex items-center justify-center cursor-pointer"
                              >
                                -
                              </button>
                              <span className="w-4 text-center font-bold font-mono text-[#ffb86c] text-xs">
                                {s.weight || 2}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...newHabitSignals];
                                  next[idx].weight = Math.min(10, (next[idx].weight || 2) + 1);
                                  setNewHabitSignals(next);
                                }}
                                className="w-4 h-4 rounded hover:bg-[#23242A] text-[#F7F5F0] font-bold text-xs flex items-center justify-center cursor-pointer"
                              >
                                +
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => setNewHabitSignals(newHabitSignals.filter((_, i) => i !== idx))}
                              className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#23242A]">
              <button
                type="button"
                onClick={() => setIsAddHabitModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-[#C5C2BA] hover:text-[#F7F5F0] hover:bg-[#1E1F24] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newHabitTitle.trim() || newHabitSignals.length === 0 || createHabitMutation.isPending}
                onClick={() => createHabitMutation.mutate()}
                className="px-5 py-2 rounded-xl bg-[#ffb86c] hover:bg-[#ffb86c]/90 text-[#492900] font-semibold text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer"
              >
                {createHabitMutation.isPending ? "Creating..." : "Create Habit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: GOAL DETAIL & MILESTONE MANAGER                                    */}
      {/* ========================================================================= */}
      {selectedGoalDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#17171A] border border-[#23242A] rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-start justify-between pb-2 border-b border-[#23242A]">
              <div className="flex flex-col gap-1 pr-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-[10px] px-2 py-0.5 rounded bg-[#282930] text-[#ffb86c] border border-[#23242A]`}
                  >
                    {selectedGoalDetail.horizon || "3 Months"}
                  </span>
                  <span className="font-mono text-[10px] text-[#C5C2BA]/60">
                    {selectedGoalDetail.targetDateStr}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-[#F7F5F0] leading-snug">
                  {selectedGoalDetail.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedGoalDetail(null)}
                className="w-7 h-7 rounded-lg hover:bg-[#1E1F24] flex items-center justify-center text-[#C5C2BA]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-[#C5C2BA]/80 font-mono px-1">
                <span>Milestones Roadmap</span>
                <span>
                  {selectedGoalDetail.milestones.filter((m) => m.completed).length} /{" "}
                  {selectedGoalDetail.milestones.length} Done
                </span>
              </div>

              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {selectedGoalDetail.milestones.map((m) => (
                  <div
                    key={m.milestoneId}
                    onClick={() =>
                      toggleMilestoneMutation.mutate({
                        goalId: selectedGoalDetail.id,
                        milestoneId: m.milestoneId,
                      })
                    }
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#111113] hover:bg-[#1E1F24] border border-[#23242A] cursor-pointer transition-colors group"
                  >
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                        m.completed
                          ? "bg-[#ffb86c] border-[#ffb86c] text-[#1A0F00]"
                          : "border-[#45434A] group-hover:border-[#ffb86c]"
                      }`}
                    >
                      {m.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    <div className="flex-1 text-xs">
                      <span
                        className={`${
                          m.completed
                            ? "text-[#C5C2BA]/60 line-through"
                            : "text-[#F7F5F0] font-medium"
                        }`}
                      >
                        {m.title}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#23242A]">
              <span className="text-[11px] text-[#C5C2BA]/50 font-mono">
                Click any milestone to toggle completion status.
              </span>
              <button
                type="button"
                onClick={() => setSelectedGoalDetail(null)}
                className="px-4 py-1.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] text-xs font-semibold text-[#F7F5F0]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
