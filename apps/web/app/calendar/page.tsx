"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Clock,
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Video,
  Lock,
  GripVertical,
  Coffee,
  Check,
  Calendar as CalendarIcon,
  Sparkles,
  Layers,
  X,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Trash2,
  CalendarDays,
  LayoutGrid,
  Play,
  ArrowRight,
  Shield,
  Zap,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useTasks } from "@/hooks/useTasks";
import { useDashboard } from "@/hooks/useDashboard";
import { useWorld } from "@/hooks/useWorld";
import { CustomDatePicker, CustomTimePicker } from "@/components/ui/CustomDateTimePicker";

// ─── Interfaces ───

export type TimelineViewMode = "day" | "week" | "month";

export interface TimelineBlock {
  blockId: string;
  occurrenceId?: string;
  chronicleId?: string;
  title: string;
  kind: string;
  dateOnly: string;
  status?: string;
  planned?: {
    startMinute: number;
    endMinute: number;
    durationMinutes: number;
    startIsoUtc: string;
    endIsoUtc: string;
  };
  actual?: {
    startedAtMs: number;
    endedAtMs: number;
    durationMinutes: number;
    interruptionsCount: number;
    completedWorkUnits?: string[];
  };
  variance?: {
    status: string;
    durationDeltaMinutes: number;
    explanation: string;
  };
}

export interface UnscheduledTask {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate: string;
  dueTime?: string | null;
  estimatedMinutes?: number;
}

export interface DayTimelineProjection {
  userId: string;
  dateOnly: string;
  timezone: string;
  blocks: TimelineBlock[];
  summary: {
    totalPlannedMinutes: number;
    totalActualMinutes: number;
    completedOccurrencesCount: number;
    missedOccurrencesCount: number;
    adHocSessionsCount: number;
  };
}

// ─── Temporal Helper Functions ───

function getTodayDateString(): string {
  const now = new Date();
  const yr = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const da = String(now.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

function formatMinutesToTime(min: number): string {
  const norm = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function minutesToTimeInput(min: number): string {
  const h = Math.floor(((min % 1440) + 1440) % 1440 / 60);
  const m = ((min % 1440) + 1440) % 1440 % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeInputToMinutes(timeStr: string): number {
  if (!timeStr) return 540;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function getWeekDays(referenceDate: string): string[] {
  const [y, m, d] = referenceDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayOfWeek = date.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    const yr = cur.getFullYear();
    const mo = String(cur.getMonth() + 1).padStart(2, "0");
    const da = String(cur.getDate()).padStart(2, "0");
    days.push(`${yr}-${mo}-${da}`);
  }
  return days;
}

function getMonthGridDays(referenceDate: string): { dateStr: string; dayNumber: number; isCurrentMonth: boolean }[] {
  const [y, m] = referenceDate.split("-").map(Number);
  const firstOfMonth = new Date(y, m - 1, 1);
  const lastOfMonth = new Date(y, m, 0);
  const dayOfWeek = firstOfMonth.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const startGrid = new Date(firstOfMonth);
  startGrid.setDate(firstOfMonth.getDate() + diffToMonday);

  const grid: { dateStr: string; dayNumber: number; isCurrentMonth: boolean }[] = [];
  const cur = new Date(startGrid);

  for (let i = 0; i < 42; i++) {
    const yr = cur.getFullYear();
    const mo = String(cur.getMonth() + 1).padStart(2, "0");
    const da = String(cur.getDate()).padStart(2, "0");
    const dateStr = `${yr}-${mo}-${da}`;
    grid.push({
      dateStr,
      dayNumber: cur.getDate(),
      isCurrentMonth: cur.getMonth() === m - 1,
    });
    if (i >= 27 && cur >= lastOfMonth && cur.getDay() === 0) {
      break;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return grid;
}

// ─── Classification Helper ───

function classifyBlockKind(kind: string): "focus" | "sync" | "buffer" | "ritual" {
  const upper = (kind || "").toUpperCase();
  if (upper.includes("FOCUS") || upper.includes("WORK") || upper.includes("DEEP") || upper.includes("HARD")) {
    return "focus";
  }
  if (upper.includes("SYNC") || upper.includes("MEET") || upper.includes("CALL")) {
    return "sync";
  }
  if (upper.includes("BUFFER") || upper.includes("REST") || upper.includes("BREAK") || upper.includes("TRANSITION")) {
    return "buffer";
  }
  return "ritual";
}

// ─── Compute Side-by-Side Layout for Overlaps ───

function computeOverlappingLayout(blocks: TimelineBlock[]): Map<string, { col: number; totalCols: number }> {
  const layout = new Map<string, { col: number; totalCols: number }>();
  if (blocks.length === 0) return layout;

  const sorted = [...blocks].sort((a, b) => (a.planned?.startMinute ?? 0) - (b.planned?.startMinute ?? 0));
  const clusters: TimelineBlock[][] = [];
  let currentCluster: TimelineBlock[] = [];
  let clusterEnd = -1;

  for (const block of sorted) {
    const start = block.planned?.startMinute ?? 0;
    const end = block.planned?.endMinute ?? start + (block.planned?.durationMinutes ?? 60);

    if (currentCluster.length === 0 || start < clusterEnd) {
      currentCluster.push(block);
      clusterEnd = Math.max(clusterEnd, end);
    } else {
      clusters.push(currentCluster);
      currentCluster = [block];
      clusterEnd = end;
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  for (const cluster of clusters) {
    const totalCols = Math.min(cluster.length, 3);
    cluster.forEach((b, idx) => {
      layout.set(b.blockId, { col: idx % totalCols, totalCols });
    });
  }

  return layout;
}

// ─── Constants ───
const HOUR_HEIGHT = 56; // 56px per hour -> 1344px for full 24 hours
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);

export default function TimelinePage() {
  const { data: session } = useSession();
  const userName = session?.user?.name || "Daksh Kaushal";

  // Navigation & Temporal State
  const [viewMode, setViewMode] = useState<TimelineViewMode>("day");
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateString());
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Projections & Backend Data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayProjection, setDayProjection] = useState<DayTimelineProjection | null>(null);
  const [todayProjection, setTodayProjection] = useState<DayTimelineProjection | null>(null);
  const [weekDaysData, setWeekDaysData] = useState<DayTimelineProjection[]>([]);
  const [monthDaysData, setMonthDaysData] = useState<DayTimelineProjection[]>([]);
  const [unscheduledTasks, setUnscheduledTasks] = useState<UnscheduledTask[]>([]);

  // Selection & Modal State
  const [selectedBlock, setSelectedBlock] = useState<TimelineBlock | null>(null);
  const [isNewCommitmentOpen, setIsNewCommitmentOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State: New Commitment
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(() => getTodayDateString());
  const [newStartTime, setNewStartTime] = useState("10:00");
  const [newDuration, setNewDuration] = useState("60");
  const [newKind, setNewKind] = useState("WORK_SESSION");

  // Form State: Edit Block Modal
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editDuration, setEditDuration] = useState("60");

  const timelineScrollRef = useRef<HTMLDivElement>(null);

  const todayStr = useMemo(() => getTodayDateString(), []);
  const isToday = useMemo(() => selectedDate === todayStr, [selectedDate, todayStr]);

  // Clock tick & auto-scroll on mount
  useEffect(() => {
    setMounted(true);
    const now = new Date();
    setCurrentTime(now);
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);

    // Auto-scroll to near current hour
    setTimeout(() => {
      if (timelineScrollRef.current) {
        const targetScroll = Math.max(0, (now.getHours() - 1) * HOUR_HEIGHT);
        timelineScrollRef.current.scrollTo({ top: targetScroll, behavior: "smooth" });
      }
    }, 200);

    return () => clearInterval(timer);
  }, []);

  // ─── Data Fetching ───

  const loadTodayData = useCallback(async () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch(`/api/calendar/timeline?date=${todayStr}&view=day&timezone=${encodeURIComponent(tz)}`);
      const json = await res.json();
      if (res.ok && (json.ok || json.success)) {
        setTodayProjection(json.data);
      }
    } catch (_) {}
  }, [todayStr]);

  useEffect(() => {
    loadTodayData();
  }, [loadTodayData]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch(
        `/api/calendar/timeline?date=${selectedDate}&view=${viewMode}&timezone=${encodeURIComponent(tz)}`
      );
      const json = await res.json();

      if (res.ok && (json.ok || json.success)) {
        if (viewMode === "week") {
          setWeekDaysData(json.data.days || []);
          setUnscheduledTasks(json.data.unscheduledTasks || []);
          const matchedDay = (json.data.days || []).find((d: any) => d.dateOnly === selectedDate);
          if (matchedDay) setDayProjection(matchedDay);
        } else if (viewMode === "month") {
          setMonthDaysData(json.data.days || []);
          setUnscheduledTasks(json.data.unscheduledTasks || []);
          const matchedDay = (json.data.days || []).find((d: any) => d.dateOnly === selectedDate);
          if (matchedDay) setDayProjection(matchedDay);
        } else {
          setDayProjection(json.data);
          setUnscheduledTasks(json.data.unscheduledTasks || []);
          if (selectedDate === todayStr) {
            setTodayProjection(json.data);
          }
        }
      } else {
        const errMsg = json.error?.message || (typeof json.error === "string" ? json.error : "Failed to load schedule");
        setError(errMsg);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, viewMode, todayStr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync edit form when a block is selected
  useEffect(() => {
    if (selectedBlock) {
      setEditDate(selectedBlock.dateOnly);
      const startMin = selectedBlock.planned?.startMinute ?? 540;
      setEditStartTime(minutesToTimeInput(startMin));
      setEditDuration(String(selectedBlock.planned?.durationMinutes ?? 60));
    }
  }, [selectedBlock]);

  // ─── Date Navigation ───

  const navigateDate = (direction: "prev" | "next") => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (viewMode === "day") {
      date.setDate(date.getDate() + (direction === "next" ? 1 : -1));
    } else if (viewMode === "week") {
      date.setDate(date.getDate() + (direction === "next" ? 7 : -7));
    } else {
      date.setMonth(date.getMonth() + (direction === "next" ? 1 : -1));
    }
    const yr = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const da = String(date.getDate()).padStart(2, "0");
    setSelectedDate(`${yr}-${mo}-${da}`);
  };

  const jumpToToday = () => {
    setSelectedDate(todayStr);
  };

  // Header Title Formatter
  const headerTitle = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (viewMode === "day") {
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }
    if (viewMode === "week") {
      const weekDays = getWeekDays(selectedDate);
      const [sy, sm, sd] = weekDays[0].split("-").map(Number);
      const [ey, em, ed] = weekDays[6].split("-").map(Number);
      const sDate = new Date(sy, sm - 1, sd);
      const eDate = new Date(ey, em - 1, ed);

      const firstDayOfYear = new Date(sy, 0, 1);
      const pastDays = (sDate.getTime() - firstDayOfYear.getTime()) / 86400000;
      const weekNum = Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);

      const sStr = sDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const eStr = eDate.toLocaleDateString("en-US", { day: "numeric", year: "numeric" });
      return `Week ${weekNum} · ${sStr} – ${eStr}`;
    }
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [selectedDate, viewMode]);

  // ─── Active Day Blocks & Conflict Detection ───

  const activeBlocks: TimelineBlock[] = useMemo(() => {
    if (dayProjection?.blocks && dayProjection.blocks.length > 0) {
      return [...dayProjection.blocks].sort(
        (a, b) => (a.planned?.startMinute ?? 0) - (b.planned?.startMinute ?? 0)
      );
    }
    return [];
  }, [dayProjection]);

  // Layout for side-by-side display of overlapping events
  const blockLayoutMap = useMemo(() => {
    return computeOverlappingLayout(activeBlocks);
  }, [activeBlocks]);

  // Detect overlapping pairs for Conflict Inspector
  const detectedConflicts = useMemo(() => {
    const pairs: Array<{ blockA: TimelineBlock; blockB: TimelineBlock; overlapStart: number }> = [];
    for (let i = 0; i < activeBlocks.length; i++) {
      for (let j = i + 1; j < activeBlocks.length; j++) {
        const b1 = activeBlocks[i];
        const b2 = activeBlocks[j];
        const s1 = b1.planned?.startMinute ?? 0;
        const e1 = b1.planned?.endMinute ?? s1 + (b1.planned?.durationMinutes ?? 60);
        const s2 = b2.planned?.startMinute ?? 0;
        const e2 = b2.planned?.endMinute ?? s2 + (b2.planned?.durationMinutes ?? 60);
        if (Math.max(s1, s2) < Math.min(e1, e2)) {
          pairs.push({ blockA: b1, blockB: b2, overlapStart: Math.max(s1, s2) });
        }
      }
    }
    return pairs;
  }, [activeBlocks]);

  const activeConflict = detectedConflicts[0] || null;

  // ─── Dynamic Telemetry Metrics ───

  const telemetry = useMemo(() => {
    const blocksToMeasure = dayProjection?.blocks || [];
    let focusMins = 0;
    let syncMins = 0;

    for (const b of blocksToMeasure) {
      const dur = b.planned?.durationMinutes ?? 60;
      const k = classifyBlockKind(b.kind);
      if (k === "focus") focusMins += dur;
      else if (k === "sync") syncMins += dur;
    }

    const focusHours = (focusMins / 60).toFixed(1);
    const syncHours = (syncMins / 60).toFixed(2);
    const scheduledTotal = focusMins + syncMins;
    const bufferPct = Math.max(15, Math.min(50, Math.round(100 - (scheduledTotal / 540) * 100)));

    return {
      shieldedHours: `${focusHours}h`,
      meetingOverhead: `${syncHours}h`,
      bufferRatio: `${bufferPct}% (${bufferPct >= 28 ? "Healthy" : "Tight"})`,
    };
  }, [dayProjection]);

  // Weekly focus shielded hours
  const weeklyFocusTotal = useMemo(() => {
    let totalMins = 0;
    for (const day of weekDaysData) {
      for (const b of day.blocks || []) {
        if (classifyBlockKind(b.kind) === "focus") {
          totalMins += b.planned?.durationMinutes ?? 60;
        }
      }
    }
    return `${(totalMins / 60).toFixed(1)}h Focus Shielded`;
  }, [weekDaysData]);

  // Monthly commitments count
  const monthlyCommitmentsCount = useMemo(() => {
    let total = 0;
    for (const day of monthDaysData) {
      total += day.blocks?.length || 0;
    }
    return total;
  }, [monthDaysData]);

  // ─── Live Needle Calculation (Exact 24-Hour Vertical Position) ───

  const nowHour = mounted ? currentTime.getHours() : 10;
  const nowMin = mounted ? currentTime.getMinutes() : 48;
  const nowTotalMinutes = nowHour * 60 + nowMin;

  // Exact vertical position: (nowTotalMinutes / 60) * HOUR_HEIGHT
  const liveNeedleTop = (nowTotalMinutes / 60) * HOUR_HEIGHT;
  const liveTimeBadge = mounted
    ? currentTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + " LIVE"
    : "10:48 AM LIVE";

  // ─── Actions & Mutations ───

  const handleCreateCommitment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/calendar/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "schedule_occurrence",
          payload: {
            title: newTitle.trim(),
            dateOnly: newDate || selectedDate,
            startTime: newStartTime,
            durationMinutes: parseInt(newDuration, 10) || 60,
            kind: newKind,
            locationCategory: "HOME",
          },
        }),
      });

      const json = await res.json();
      if (res.ok && (json.ok || json.success)) {
        setIsNewCommitmentOpen(false);
        setNewTitle("");
        loadData();
        loadTodayData();
      } else {
        alert(json.error?.message || json.error || "Failed to schedule commitment");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRescheduleBlock = async () => {
    if (!selectedBlock) return;
    setSubmitting(true);
    try {
      const durationMins = parseInt(editDuration, 10) || 60;
      const res = await fetch("/api/calendar/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "reschedule_occurrence",
          payload: {
            occurrenceId: selectedBlock.occurrenceId,
            newDateOnly: editDate,
            newStartTime: editStartTime,
            newDurationMinutes: durationMins,
          },
        }),
      });
      const json = await res.json();
      if (res.ok && (json.ok || json.success)) {
        setSelectedBlock(null);
        loadData();
        loadTodayData();
      } else {
        alert(json.error?.message || json.error || "Failed to reschedule block");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveConflictShift = async () => {
    if (!activeConflict) return;
    setSubmitting(true);
    try {
      const blockAEndMin = (activeConflict.blockA.planned?.startMinute ?? 0) +
        (activeConflict.blockA.planned?.durationMinutes ?? 60);
      const newShiftTime = minutesToTimeInput(blockAEndMin);

      const res = await fetch("/api/calendar/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "reschedule_occurrence",
          payload: {
            occurrenceId: activeConflict.blockB.occurrenceId,
            newDateOnly: selectedDate,
            newStartTime: newShiftTime,
            newDurationMinutes: activeConflict.blockB.planned?.durationMinutes || 45,
          },
        }),
      });
      const json = await res.json();
      if (res.ok && (json.ok || json.success)) {
        loadData();
        loadTodayData();
      } else {
        alert(json.error?.message || "Failed to shift conflict block");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOccurrence = async (occurrenceId?: string) => {
    const idToCancel =
      occurrenceId ||
      selectedBlock?.occurrenceId ||
      selectedBlock?.blockId?.replace(/^block_/, "");
    if (!idToCancel) return;
    if (!confirm(`Remove "${selectedBlock?.title || 'this scheduled block'}"?`)) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/calendar/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "cancel_occurrence",
          payload: {
            occurrenceId: idToCancel,
            title: selectedBlock?.title,
            dateOnly: selectedBlock?.dateOnly || selectedDate,
          },
        }),
      });
      const json = await res.json();
      if (res.ok && (json.ok || json.success)) {
        setSelectedBlock(null);
        await loadData();
        await loadTodayData();
      } else {
        alert(json.error?.message || "Failed to remove block");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleScheduleUnscheduledTask = async (task: UnscheduledTask) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/calendar/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "schedule_occurrence",
          payload: {
            title: task.title,
            dateOnly: selectedDate,
            startTime: "14:00",
            durationMinutes: task.estimatedMinutes || 45,
            kind: "WORK_SESSION",
            linkedEntity: { entityType: "task", entityId: task.id, taskTitle: task.title },
          },
        }),
      });
      const json = await res.json();
      if (res.ok && (json.ok || json.success)) {
        loadData();
        loadTodayData();
      } else {
        alert(json.error?.message || "Failed to stage task into timeline");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#111113] text-[#F7F5F0] overflow-x-hidden font-sans pb-16 selection:bg-[#D98B2B]/30 select-none">
      {/* Background Precise Coordinate Grid Lines (Matching Cockpit: Dim, Radial Fade-out to Edges) */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255, 255, 255, 0.022) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.022) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage:
            "radial-gradient(ellipse 65% 60% at 50% 48%, black 15%, rgba(0,0,0,0.4) 55%, transparent 88%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 65% 60% at 50% 48%, black 15%, rgba(0,0,0,0.4) 55%, transparent 88%)",
        }}
      />

      <div className="relative z-10 max-w-[1580px] mx-auto px-6 py-5">
        {/* ─── Top Control Strip ─── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#23242A]">
          {/* Left: Date Display & Date Step Controls */}
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#F7F5F0]">{headerTitle}</h1>
            <button
              onClick={jumpToToday}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                isToday
                  ? "bg-[#D98B2B]/20 border-[#D98B2B]/50 text-[#F5E6C8]"
                  : "bg-[#1E1F24] border-[#2A2B33] text-stone-300 hover:text-white hover:bg-[#25262D]"
              }`}
            >
              Today
            </button>
            <div className="flex items-center gap-1 bg-[#17171A] border border-[#23242A] rounded-lg p-0.5">
              <button
                onClick={() => navigateDate("prev")}
                className="p-1 hover:bg-[#23242A] rounded text-stone-400 hover:text-white transition-colors"
                title="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigateDate("next")}
                className="p-1 hover:bg-[#23242A] rounded text-stone-400 hover:text-white transition-colors"
                title="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {loading && <RefreshCw className="w-3.5 h-3.5 text-stone-500 animate-spin ml-1" />}
          </div>

          {/* Right: View Mode Segmented Control + New Commitment Button */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-[#17171A] border border-[#23242A] rounded-xl p-1 shadow-inner">
              {(["day", "week", "month"] as TimelineViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                    viewMode === mode
                      ? "bg-[#23242A] text-[#F7F5F0] shadow-sm font-bold"
                      : "text-stone-400 hover:text-[#F7F5F0]"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Warm Amber "+ New Commitment" Button Matching Stitch Design */}
            <button
              onClick={() => {
                setNewDate(selectedDate);
                setIsNewCommitmentOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#E29D52] hover:bg-[#F0AF62] text-[#141517] rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>New Commitment</span>
            </button>
          </div>
        </div>

        {/* ─── Main Workspace: 70% Timeline Canvas + 30% Contextual Rail ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 items-start">
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* LEFT: 70% (col-span-8) TIMELINE CANVAS                              */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {/* VIEW MODE 1: DAY (True 24-Hour Chronological Canvas with Exact Time Alignment) */}
            {viewMode === "day" && (
              <div className="bg-[#17171A]/70 border border-[#23242A] rounded-2xl p-5 backdrop-blur-md relative overflow-hidden shadow-xl flex flex-col">
                {/* Header Substrip */}
                <div className="flex items-center justify-between pb-4 border-b border-[#23242A]/60 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-stone-200 font-bold">
                      <Clock className="w-3.5 h-3.5 text-[#D98B2B]" />
                      24-Hour Chronological Flow
                    </span>
                    <span className="text-stone-400 font-mono text-[11px]">
                      {activeBlocks.length} Total Commitments · {detectedConflicts.length} Alert
                      {detectedConflicts.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-stone-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#D98B2B]" />
                      Deep Focus
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#38BDF8]" />
                      Sync
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                      Recovery
                    </span>
                  </div>
                </div>

                {/* 24-Hour Scrollable Canvas Container */}
                <div
                  ref={timelineScrollRef}
                  className="relative mt-3 overflow-y-auto max-h-[720px] pr-2 scrollbar-thin scrollbar-thumb-[#23242A]"
                  style={{ height: "720px" }}
                >
                  <div
                    className="relative flex"
                    style={{ height: `${24 * HOUR_HEIGHT}px`, minHeight: `${24 * HOUR_HEIGHT}px` }}
                  >
                    {/* Left Axis: All 24 Hours */}
                    <div className="w-16 flex-shrink-0 select-none">
                      {HOURS_24.map((hour) => (
                        <div
                          key={hour}
                          className="text-[11px] font-mono text-stone-400 flex items-start"
                          style={{ height: `${HOUR_HEIGHT}px` }}
                        >
                          <span className="-mt-2">
                            {String(hour).padStart(2, "0")}:00
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Timeline Grid & Positioned Event Cards */}
                    <div className="flex-1 relative border-l border-[#23242A]">
                      {/* Horizontal Grid Lines for every hour */}
                      {HOURS_24.map((hour) => (
                        <div
                          key={`line-${hour}`}
                          className="absolute left-0 right-0 border-t border-[#23242A]/30 pointer-events-none"
                          style={{ top: `${hour * HOUR_HEIGHT}px` }}
                        />
                      ))}

                      {/* Live Playhead Needle (Active if viewing today) */}
                      {isToday && (
                        <div
                          className="absolute left-0 right-0 z-30 pointer-events-none flex items-center transition-all duration-300"
                          style={{ top: `${liveNeedleTop}px` }}
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-[#D98B2B] shadow-[0_0_12px_#D98B2B] -ml-[5px]" />
                          <div className="flex-1 h-[1.5px] bg-gradient-to-r from-[#D98B2B] via-[#D98B2B]/80 to-transparent" />
                          <span className="bg-[#D98B2B] text-[#111113] text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-sm mr-2">
                            {liveTimeBadge}
                          </span>
                        </div>
                      )}

                      {/* Absolutely Positioned Dynamic Event Blocks */}
                      {activeBlocks.length > 0 ? (
                        activeBlocks.map((block) => {
                          const startMin = block.planned?.startMinute ?? 540;
                          const durMin = block.planned?.durationMinutes ?? 60;
                          const endMin = block.planned?.endMinute ?? startMin + durMin;

                          // Compute exact top & height based on 56px per hour
                          const topPx = (startMin / 60) * HOUR_HEIGHT;
                          const heightPx = Math.max(46, (durMin / 60) * HOUR_HEIGHT - 4);

                          const startStr = formatMinutesToTime(startMin);
                          const endStr = formatMinutesToTime(endMin);
                          const kindClass = classifyBlockKind(block.kind);

                          // Check if this block is part of any conflict
                          const isConflict = detectedConflicts.some(
                            (c) => c.blockA.blockId === block.blockId || c.blockB.blockId === block.blockId
                          );

                          // Side-by-side positioning for overlapping blocks
                          const layout = blockLayoutMap.get(block.blockId) || { col: 0, totalCols: 1 };
                          const widthPct = layout.totalCols > 1 ? 96 / layout.totalCols : 98;
                          const leftPct = layout.col * (100 / layout.totalCols) + 1;

                          return (
                            <div
                              key={block.blockId}
                              onClick={() => setSelectedBlock(block)}
                              style={{
                                top: `${topPx}px`,
                                height: `${heightPx}px`,
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                              }}
                              className={`absolute z-10 group cursor-pointer rounded-xl p-3 border transition-all duration-150 hover:scale-[1.008] hover:z-20 overflow-hidden shadow-lg flex flex-col justify-between ${
                                isConflict
                                  ? "bg-amber-950/30 border-amber-600/70 hover:border-amber-400"
                                  : kindClass === "focus"
                                  ? "bg-[#1E1F24]/95 border-[#D98B2B]/50 hover:border-[#D98B2B]"
                                  : kindClass === "sync"
                                  ? "bg-[#1A1E24]/95 border-sky-500/40 hover:border-sky-400"
                                  : kindClass === "buffer"
                                  ? "bg-[#18201C]/95 border-emerald-500/40 hover:border-emerald-400"
                                  : "bg-[#1A1A1E]/95 border-[#2A2B33] hover:border-stone-400"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2">
                                  <div className="mt-0.5 flex-shrink-0">
                                    {kindClass === "focus" && <Shield className="w-3.5 h-3.5 text-[#D98B2B]" />}
                                    {kindClass === "sync" && <Video className="w-3.5 h-3.5 text-sky-400" />}
                                    {kindClass === "buffer" && <Coffee className="w-3.5 h-3.5 text-emerald-400" />}
                                    {kindClass === "ritual" && <Clock className="w-3.5 h-3.5 text-stone-400" />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <h3 className="text-xs font-bold text-[#F7F5F0] tracking-tight group-hover:text-amber-200 transition-colors">
                                        {block.title}
                                      </h3>
                                      {isConflict && (
                                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/50 text-[8px] font-bold px-1.5 py-0.2 rounded uppercase">
                                          Conflict
                                        </span>
                                      )}
                                      {block.status && !isConflict && (
                                        <span className="bg-[#2A2B33] text-stone-300 text-[8px] font-semibold px-1.5 py-0.2 rounded uppercase">
                                          {block.status}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] font-mono text-stone-400 mt-0.5">
                                      {startStr} – {endStr} · {formatDuration(durMin)}
                                    </p>
                                  </div>
                                </div>

                                <div className="text-[9px] text-stone-400 font-mono flex-shrink-0 uppercase tracking-wider">
                                  {block.kind.replace("_", " ")}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center text-stone-400">
                          <Sparkles className="w-8 h-8 text-[#D98B2B] mb-2 opacity-60" />
                          <h3 className="text-sm font-bold text-stone-200">No Commitments Scheduled</h3>
                          <p className="text-xs text-stone-500 max-w-sm mt-1">
                            Zero scheduled occurrences for this day. Click "+ New Commitment" or stage an unscheduled intention from the right rail.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW MODE 2: WEEK (7-Column Weekly Horizon) */}
            {viewMode === "week" && (
              <div className="bg-[#17171A]/70 border border-[#23242A] rounded-2xl p-5 backdrop-blur-md shadow-xl overflow-x-auto">
                <div className="flex items-center justify-between pb-4 border-b border-[#23242A]/60 text-xs min-w-[760px]">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-stone-200 font-bold">
                      <Layers className="w-3.5 h-3.5 text-[#D98B2B]" />
                      Weekly Horizon
                    </span>
                    <span className="text-stone-400 font-mono text-[11px]">{weeklyFocusTotal}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-stone-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#D98B2B]" /> Deep Focus
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#38BDF8]" /> Sync
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#10B981]" /> Rest
                    </span>
                  </div>
                </div>

                {/* 7 Columns Grid */}
                <div className="grid grid-cols-7 gap-3 mt-4 min-w-[760px]">
                  {getWeekDays(selectedDate).map((dayStr) => {
                    const [y, m, d] = dayStr.split("-").map(Number);
                    const colDate = new Date(y, m - 1, d);
                    const dayName = colDate.toLocaleDateString("en-US", { weekday: "short" });
                    const isColToday = dayStr === todayStr;

                    const dayData = weekDaysData.find((w) => w.dateOnly === dayStr);
                    const dayBlocks = dayData?.blocks || [];

                    let focusMins = 0;
                    for (const b of dayBlocks) {
                      if (classifyBlockKind(b.kind) === "focus") {
                        focusMins += b.planned?.durationMinutes ?? 60;
                      }
                    }

                    return (
                      <div
                        key={dayStr}
                        onClick={() => {
                          setSelectedDate(dayStr);
                          setViewMode("day");
                        }}
                        className={`rounded-xl p-3 flex flex-col gap-2.5 min-h-[500px] cursor-pointer transition-all border ${
                          isColToday
                            ? "bg-[#1E1F24]/90 border-[#D98B2B]/60 shadow-[0_0_15px_rgba(217,139,43,0.12)]"
                            : "bg-[#141518]/70 border-[#23242A] hover:border-stone-600"
                        }`}
                      >
                        {/* Day Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-[#23242A]">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 block">
                              {dayName}
                            </span>
                            <span className={`text-base font-extrabold ${isColToday ? "text-[#D98B2B]" : "text-stone-200"}`}>
                              {d}
                            </span>
                          </div>
                          {focusMins > 0 && (
                            <span className="text-[10px] font-mono text-stone-400 bg-[#1E1F24] px-1.5 py-0.5 rounded border border-[#2A2B33]">
                              {(focusMins / 60).toFixed(1)}h
                            </span>
                          )}
                        </div>

                        {/* Today Live Marker Pill */}
                        {isColToday && (
                          <div className="bg-[#D98B2B]/20 border border-[#D98B2B]/40 rounded px-2 py-1 flex items-center justify-between text-[9px] font-mono text-[#F5E6C8]">
                            <span className="font-bold">IN FLOW</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-[#D98B2B] animate-pulse" />
                          </div>
                        )}

                        {/* Blocks in Column */}
                        <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
                          {dayBlocks.length > 0 ? (
                            dayBlocks.map((b) => {
                              const kind = classifyBlockKind(b.kind);
                              const startMin = b.planned?.startMinute ?? 540;
                              return (
                                <div
                                  key={b.blockId}
                                  className={`p-2 rounded-lg text-[10px] border transition-all ${
                                    kind === "focus"
                                      ? "bg-[#1F2026] border-[#D98B2B]/40 text-amber-200"
                                      : kind === "sync"
                                      ? "bg-[#182026] border-sky-500/30 text-sky-200"
                                      : "bg-[#18221C] border-emerald-500/30 text-emerald-200"
                                  }`}
                                >
                                  <div className="font-mono text-[9px] opacity-75">{formatMinutesToTime(startMin)}</div>
                                  <div className="font-bold truncate mt-0.5">{b.title}</div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-[10px] text-stone-600 font-mono text-center py-8">Free</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VIEW MODE 3: MONTH (Monthly Cadence Grid) */}
            {viewMode === "month" && (
              <div className="bg-[#17171A]/70 border border-[#23242A] rounded-2xl p-5 backdrop-blur-md shadow-xl">
                <div className="flex items-center justify-between pb-4 border-b border-[#23242A]/60 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-stone-200 font-bold">
                      <CalendarIcon className="w-3.5 h-3.5 text-[#D98B2B]" />
                      Monthly Cadence
                    </span>
                    <span className="text-stone-400 font-mono text-[11px]">
                      {monthlyCommitmentsCount} Scheduled Commitments
                    </span>
                  </div>
                </div>

                {/* Day Names Header */}
                <div className="grid grid-cols-7 gap-2 mt-4 text-center text-[10px] font-mono text-stone-400 uppercase tracking-wider pb-2 border-b border-[#23242A]">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>

                {/* Month Day Cells */}
                <div className="grid grid-cols-7 gap-2 mt-2">
                  {getMonthGridDays(selectedDate).map((cell, idx) => {
                    const isCellToday = cell.dateStr === todayStr;
                    const dayData = monthDaysData.find((m) => m.dateOnly === cell.dateStr);
                    const dayBlocks = dayData?.blocks || [];

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedDate(cell.dateStr);
                          setViewMode("day");
                        }}
                        className={`min-h-[96px] rounded-xl p-2 border flex flex-col justify-between cursor-pointer transition-all ${
                          !cell.isCurrentMonth
                            ? "opacity-25 bg-[#121214] border-[#1C1D21]"
                            : isCellToday
                            ? "bg-[#1E1F24] border-[#D98B2B] shadow-[0_0_12px_rgba(217,139,43,0.15)]"
                            : "bg-[#151619] border-[#23242A] hover:border-stone-500"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-bold ${
                              isCellToday ? "text-[#D98B2B] font-black" : "text-stone-300"
                            }`}
                          >
                            {cell.dayNumber}
                          </span>
                          {isCellToday && (
                            <span className="bg-[#D98B2B] text-[#111113] text-[8px] font-black px-1 rounded">
                              TODAY
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col gap-1 mt-1 overflow-hidden">
                          {dayBlocks.slice(0, 2).map((b) => (
                            <div
                              key={b.blockId}
                              className="text-[9px] truncate px-1 py-0.5 rounded bg-[#23242A] text-stone-200 font-mono"
                            >
                              {b.title}
                            </div>
                          ))}
                          {dayBlocks.length > 2 && (
                            <span className="text-[8px] text-stone-400 font-mono">+{dayBlocks.length - 2} more</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* RIGHT: 30% (col-span-4) PERSISTENT CONTEXTUAL RAIL                  */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            {/* 1. Unscheduled Intentions Shelf */}
            <div className="bg-[#17171A]/70 border border-[#23242A] rounded-2xl p-4 backdrop-blur-md shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-[#23242A]/60">
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-[#D98B2B]" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-stone-200">
                    Unscheduled Intentions
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-stone-400 bg-[#23242A] px-2 py-0.5 rounded">
                  {unscheduledTasks.length} Staged
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-2.5">
                {unscheduledTasks.length > 0 ? (
                  unscheduledTasks.map((task) => (
                    <div
                      key={task.id}
                      className="bg-[#1E1F24] border border-[#2A2B33] hover:border-[#D98B2B]/60 rounded-xl p-3 flex items-center justify-between gap-2 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <GripVertical className="w-3.5 h-3.5 text-stone-500 group-hover:text-stone-300 cursor-grab" />
                        <div>
                          <div className="text-xs font-bold text-stone-200 group-hover:text-amber-200 transition-colors">
                            {task.title}
                          </div>
                          <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                            Priority: {task.priority || "medium"}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleScheduleUnscheduledTask(task)}
                        disabled={submitting}
                        className="px-2 py-1 bg-[#2A2B33] hover:bg-[#D98B2B] hover:text-[#111113] text-stone-300 rounded text-[10px] font-bold transition-all"
                        title="Schedule into Today"
                      >
                        Stage
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-stone-500 text-xs font-mono">
                    Zero unscheduled tasks pending.
                  </div>
                )}
              </div>
            </div>

            {/* 2. Temporal Conflict Inspector */}
            <div className="bg-[#17171A]/70 border border-[#23242A] rounded-2xl p-4 backdrop-blur-md shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-[#23242A]/60">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`w-3.5 h-3.5 ${activeConflict ? "text-amber-400" : "text-emerald-400"}`}
                  />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-stone-200">
                    Conflict Inspector
                  </h2>
                </div>
                {activeConflict ? (
                  <span className="text-[9px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded">
                    Action Needed
                  </span>
                ) : (
                  <span className="text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded">
                    Healthy
                  </span>
                )}
              </div>

              <div className="mt-3">
                {activeConflict ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-stone-300 leading-relaxed">
                      <span className="font-bold text-amber-300">{activeConflict.blockA.title}</span> overlaps with{" "}
                      <span className="font-bold text-stone-200">{activeConflict.blockB.title}</span> at{" "}
                      <span className="font-mono text-amber-300 font-bold">
                        {formatMinutesToTime(activeConflict.overlapStart)}
                      </span>
                      .
                    </p>

                    <div className="p-3 bg-[#1E1F24] border border-[#2A2B33] rounded-xl flex flex-col gap-2">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-stone-400">Recommended Resolution</span>
                        <span className="text-[#D98B2B] font-bold">Aven Suggestion</span>
                      </div>
                      <p className="text-[11px] text-stone-300">
                        Shift {activeConflict.blockB.title} asynchronously to next open cognitive slot.
                      </p>

                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          onClick={handleResolveConflictShift}
                          disabled={submitting}
                          className="px-3 py-1.5 bg-[#D98B2B] hover:bg-[#E89938] text-[#111113] rounded-lg text-xs font-bold transition-all text-center"
                        >
                          Shift Block
                        </button>
                        <button
                          onClick={() => handleCancelOccurrence(activeConflict.blockB.occurrenceId)}
                          disabled={submitting}
                          className="px-3 py-1.5 bg-[#23242A] hover:bg-red-950/60 border border-[#2A2B33] hover:border-red-600/50 text-stone-300 hover:text-red-200 rounded-lg text-xs font-semibold transition-all text-center"
                        >
                          Remove One
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 py-3 text-xs text-stone-400">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>Zero temporal friction detected. Day schedule is clear and protected.</span>
                  </div>
                )}
              </div>

              {/* Telemetry Metrics */}
              <div className="mt-4 pt-3 border-t border-[#23242A]/60 flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 font-mono text-[11px]">Shielded Focus Time:</span>
                  <span className="text-stone-200 font-mono font-bold">{telemetry.shieldedHours}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 font-mono text-[11px]">Meeting Overhead:</span>
                  <span className="text-stone-200 font-mono font-bold">{telemetry.meetingOverhead}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400 font-mono text-[11px]">Buffer Ratio:</span>
                  <span className="text-emerald-400 font-mono font-bold">{telemetry.bufferRatio}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Modal 1: + New Commitment Modal ─── */}
      {isNewCommitmentOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#17171A] border border-[#2A2B33] rounded-2xl max-w-md w-full p-6 text-[#F7F5F0] shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#23242A]">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#D98B2B]" />
                <h3 className="text-sm font-bold">New Temporal Commitment</h3>
              </div>
              <button
                onClick={() => setIsNewCommitmentOpen(false)}
                className="text-stone-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCommitment} className="mt-4 flex flex-col gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-stone-400 block mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Systems Architecture Deep Dive"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-[#111113] border border-[#2A2B33] focus:border-[#D98B2B] rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <CustomDatePicker
                  label="Date"
                  value={newDate}
                  onChange={(val) => setNewDate(val)}
                />
                <CustomTimePicker
                  label="Start Time"
                  value={newStartTime}
                  onChange={(val) => setNewStartTime(val)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-stone-400 block">Duration (Mins)</label>
                <div className="flex items-center gap-2">
                  {[
                    { label: "15m", val: "15" },
                    { label: "30m", val: "30" },
                    { label: "45m", val: "45" },
                    { label: "60m", val: "60" },
                    { label: "90m", val: "90" },
                  ].map((dp) => (
                    <button
                      key={dp.val}
                      type="button"
                      onClick={() => setNewDuration(dp.val)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer border ${
                        newDuration === dp.val
                          ? "bg-[#E29D52]/15 border-[#E29D52] text-[#E29D52] font-bold"
                          : "bg-[#111113] border-[#2A2B33] text-stone-400 hover:text-white"
                      }`}
                    >
                      {dp.label}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="15"
                    step="15"
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    className="w-20 bg-[#111113] border border-[#2A2B33] focus:border-[#D98B2B] rounded-xl px-3 py-1.5 text-xs text-white outline-none ml-auto text-right font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-stone-400 block">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Focus Block (Work)", val: "WORK_SESSION" },
                    { label: "Sync / Meeting", val: "MEETING" },
                    { label: "Routine / Habit", val: "ROUTINE_BLOCK" },
                    { label: "Rest & Recovery", val: "RECOVERY" },
                  ].map((cat) => {
                    const isSelected = newKind === cat.val;
                    return (
                      <button
                        key={cat.val}
                        type="button"
                        onClick={() => setNewKind(cat.val)}
                        className={`py-2 px-3 rounded-xl text-xs font-medium border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#E29D52]/15 border-[#E29D52] text-[#E29D52] font-bold"
                            : "bg-[#111113] border-[#2A2B33] text-stone-400 hover:text-white hover:bg-[#1E1F24]"
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#23242A]">
                <button
                  type="button"
                  onClick={() => setIsNewCommitmentOpen(false)}
                  className="px-4 py-2 bg-[#1E1F24] hover:bg-[#25262D] text-stone-300 rounded-xl text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#E29D52] hover:bg-[#F0AF62] text-[#141517] rounded-xl text-xs font-bold transition-all shadow-md"
                >
                  {submitting ? "Saving..." : "Schedule Commitment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Edit / Inspect Block Modal ─── */}
      {selectedBlock && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#17171A] border border-[#2A2B33] rounded-2xl max-w-md w-full p-6 text-[#F7F5F0] shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#23242A]">
              <div>
                <span className="text-[9px] uppercase font-bold text-stone-400 font-mono">
                  {selectedBlock.kind.replace("_", " ")}
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">{selectedBlock.title}</h3>
              </div>
              <button
                onClick={() => setSelectedBlock(null)}
                className="text-stone-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-stone-400 block mb-1">Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full bg-[#111113] border border-[#2A2B33] focus:border-[#D98B2B] rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-stone-400 block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full bg-[#111113] border border-[#2A2B33] focus:border-[#D98B2B] rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-stone-400 block mb-1">Duration (Mins)</label>
                  <input
                    type="number"
                    min="15"
                    step="15"
                    value={editDuration}
                    onChange={(e) => setEditDuration(e.target.value)}
                    className="w-full bg-[#111113] border border-[#2A2B33] focus:border-[#D98B2B] rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#23242A]">
                <button
                  type="button"
                  onClick={() => handleCancelOccurrence()}
                  disabled={submitting}
                  className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedBlock(null)}
                    className="px-4 py-2 bg-[#1E1F24] hover:bg-[#25262D] text-stone-300 rounded-xl text-xs font-semibold transition-all"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleRescheduleBlock}
                    disabled={submitting}
                    className="px-4 py-2 bg-[#E29D52] hover:bg-[#F0AF62] text-[#141517] rounded-xl text-xs font-bold transition-all shadow-md"
                  >
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
