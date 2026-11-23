"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
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

export default function TrajectoryPage() {
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
  const [newHabitFrequency, setNewHabitFrequency] = useState("Daily");
  const [newHabitGoalTitle, setNewHabitGoalTitle] = useState("");
  const [newHabitCategory, setNewHabitCategory] = useState("routine");

  // Fetch Goals
  const {
    data: goals = [],
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

  // Fetch Habits
  const {
    data: habits = [],
    isLoading: isHabitsLoading,
    refetch: refetchHabits,
  } = useQuery<TrajectoryHabit[]>({
    queryKey: ["habits"],
    queryFn: async () => {
      const res = await fetch("/api/habits");
      if (!res.ok) throw new Error("Failed to fetch habits");
      return res.json();
    },
    refetchInterval: 15000,
  });

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
    return goals.filter((g) => {
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
  }, [goals, selectedHorizon, searchQuery]);

  // Habit Day Toggle Mutation
  const toggleHabitMutation = useMutation({
    mutationFn: async ({ habitId, date }: { habitId: string; date?: string }) => {
      const res = await fetch(`/api/habits/${habitId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) throw new Error("Failed to toggle habit");
      return res.json();
    },
    onMutate: async ({ habitId, date }) => {
      await queryClient.cancelQueries({ queryKey: ["habits"] });
      const previousHabits = queryClient.getQueryData<TrajectoryHabit[]>(["habits"]);
      if (previousHabits) {
        queryClient.setQueryData<TrajectoryHabit[]>(
          ["habits"],
          previousHabits.map((h) => {
            if (h.id !== habitId) return h;
            const updatedRecent = h.recentDays.map((d) => {
              if (date && d.date === date) {
                return { ...d, completed: !d.completed };
              }
              return d;
            });
            return { ...h, recentDays: updatedRecent };
          })
        );
      }
      return { previousHabits };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousHabits) {
        queryClient.setQueryData(["habits"], context.previousHabits);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
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
          nature: newGoalHorizon === "1 Year" ? "habitual_cadence" : "finite_deliverable",
          type: "performance",
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

  // Create Habit Mutation
  const createHabitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newHabitTitle.trim(),
          frequency: newHabitFrequency,
          supportingGoalTitle: newHabitGoalTitle ? `Supports ${newHabitGoalTitle}` : "General Cadence",
          category: newHabitCategory,
        }),
      });
      if (!res.ok) throw new Error("Failed to create habit");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      setIsAddHabitModalOpen(false);
      setNewHabitTitle("");
      setNewHabitFrequency("Daily");
      setNewHabitGoalTitle("");
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

          {isGoalsLoading && goals.length === 0 ? (
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
            {habits.map((habit) => {
              return (
                <div
                  key={habit.id}
                  className="p-3.5 rounded-xl bg-[#17171A] border border-[#23242A] hover:border-[#D98B2B]/40 transition-all flex flex-col justify-between gap-3 shadow-sm group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-semibold text-[#F7F5F0] truncate group-hover:text-[#ffb86c] transition-colors">
                        {habit.title}
                      </span>
                      <span className="text-[11px] text-[#C5C2BA]/60 mt-0.5 truncate">
                        {habit.supportingGoalTitle || "General Focus"}
                      </span>
                    </div>

                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#111113] border border-[#23242A] text-[#C5C2BA] flex-shrink-0">
                      {habit.frequency}
                    </span>
                  </div>

                  {/* Recent Activity Dot Trail (Interactive Toggle) */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#23242A]/50">
                    <span className="text-[10px] font-mono text-[#C5C2BA]/50">
                      Recent activity
                    </span>

                    <div className="flex items-center gap-1.5">
                      {habit.recentDays.map((day, idx) => {
                        const isLatest = idx === habit.recentDays.length - 1;
                        return (
                          <button
                            key={day.date}
                            type="button"
                            title={`${day.date}: ${day.completed ? "Completed" : "Not completed"} (click to toggle)`}
                            onClick={() =>
                              toggleHabitMutation.mutate({ habitId: habit.id, date: day.date })
                            }
                            className={`w-2 h-2 rounded-full transition-all cursor-pointer hover:scale-125 ${
                              day.completed
                                ? "bg-emerald-400"
                                : isLatest
                                ? "bg-[#ffb86c]"
                                : "bg-[#282930] hover:bg-[#3e404b]"
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
      {/* MODAL: NEW GOAL CREATION                                                  */}
      {/* ========================================================================= */}
      {isNewGoalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#17171A] border border-[#23242A] rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#23242A]">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-[#ffb86c]" />
                <h3 className="text-base font-semibold text-[#F7F5F0]">Create New Trajectory Goal</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewGoalModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-[#1E1F24] flex items-center justify-center text-[#C5C2BA]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-mono text-[#C5C2BA]/70 uppercase block mb-1">
                  Goal Title
                </label>
                <input
                  type="text"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="e.g. Distributed Core Engine & Cache Pipeline"
                  className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:ring-1 focus:ring-[#ffb86c] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-[#C5C2BA]/70 uppercase block mb-1">
                    Time Horizon
                  </label>
                  <select
                    value={newGoalHorizon}
                    onChange={(e) => setNewGoalHorizon(e.target.value)}
                    className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:ring-1 focus:ring-[#ffb86c] outline-none"
                  >
                    <option value="1 Month">1 Month</option>
                    <option value="3 Months">3 Months</option>
                    <option value="6 Months">6 Months</option>
                    <option value="1 Year">1 Year</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-mono text-[#C5C2BA]/70 uppercase block mb-1">
                    Target Date
                  </label>
                  <input
                    type="date"
                    value={newGoalTargetDate}
                    onChange={(e) => setNewGoalTargetDate(e.target.value)}
                    className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:ring-1 focus:ring-[#ffb86c] outline-none"
                  />
                </div>
              </div>

              {/* Milestones checklist builder */}
              <div>
                <label className="text-xs font-mono text-[#C5C2BA]/70 uppercase block mb-1.5">
                  Milestones ({newGoalMilestones.length})
                </label>
                <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {newGoalMilestones.map((ms, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-[#111113] border border-[#23242A]/60 text-xs"
                    >
                      <span className="text-[#F7F5F0] truncate flex-1 pr-2">
                        {idx + 1}. {ms}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setNewGoalMilestones((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-[#C5C2BA]/50 hover:text-rose-400"
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
                    placeholder="Add a milestone and press enter..."
                    className="flex-1 bg-[#111113] border border-[#23242A] rounded-xl px-3 py-1.5 text-xs text-[#F7F5F0] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newMilestoneInput.trim()) {
                        setNewGoalMilestones((prev) => [...prev, newMilestoneInput.trim()]);
                        setNewMilestoneInput("");
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] text-xs text-[#F7F5F0] font-medium border border-[#23242A]"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#23242A]">
              <button
                type="button"
                onClick={() => setIsNewGoalModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-[#C5C2BA] hover:text-[#F7F5F0] hover:bg-[#1E1F24] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newGoalTitle.trim() || createGoalMutation.isPending}
                onClick={() => createGoalMutation.mutate()}
                className="px-4 py-2 rounded-xl bg-[#ffb86c] hover:bg-[#ffb86c]/90 text-[#492900] font-semibold text-xs shadow-md transition-all disabled:opacity-50"
              >
                {createGoalMutation.isPending ? "Creating..." : "Save Goal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD HABIT                                                          */}
      {/* ========================================================================= */}
      {isAddHabitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#17171A] border border-[#23242A] rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#23242A]">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-[#ffb86c]" />
                <h3 className="text-base font-semibold text-[#F7F5F0]">Add Supporting Habit</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddHabitModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-[#1E1F24] flex items-center justify-center text-[#C5C2BA]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-mono text-[#C5C2BA]/70 uppercase block mb-1">
                  Habit Title
                </label>
                <input
                  type="text"
                  value={newHabitTitle}
                  onChange={(e) => setNewHabitTitle(e.target.value)}
                  placeholder="e.g. Deep Work Focus Block · 4.5h"
                  className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:ring-1 focus:ring-[#ffb86c] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-[#C5C2BA]/70 uppercase block mb-1">
                    Frequency
                  </label>
                  <input
                    type="text"
                    value={newHabitFrequency}
                    onChange={(e) => setNewHabitFrequency(e.target.value)}
                    placeholder="e.g. Mon–Fri, Daily"
                    className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:ring-1 focus:ring-[#ffb86c] outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono text-[#C5C2BA]/70 uppercase block mb-1">
                    Category
                  </label>
                  <select
                    value={newHabitCategory}
                    onChange={(e) => setNewHabitCategory(e.target.value)}
                    className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:ring-1 focus:ring-[#ffb86c] outline-none"
                  >
                    <option value="routine">Routine</option>
                    <option value="work">Work & Focus</option>
                    <option value="health">Health & Recovery</option>
                    <option value="learning">Learning</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-[#C5C2BA]/70 uppercase block mb-1">
                  Supporting Goal
                </label>
                <select
                  value={newHabitGoalTitle}
                  onChange={(e) => setNewHabitGoalTitle(e.target.value)}
                  className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:ring-1 focus:ring-[#ffb86c] outline-none"
                >
                  <option value="">-- Link to an active goal --</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.title}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#23242A]">
              <button
                type="button"
                onClick={() => setIsAddHabitModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-[#C5C2BA] hover:text-[#F7F5F0] hover:bg-[#1E1F24] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newHabitTitle.trim() || createHabitMutation.isPending}
                onClick={() => createHabitMutation.mutate()}
                className="px-4 py-2 rounded-xl bg-[#ffb86c] hover:bg-[#ffb86c]/90 text-[#492900] font-semibold text-xs shadow-md transition-all disabled:opacity-50"
              >
                {createHabitMutation.isPending ? "Adding..." : "Add Habit"}
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
