"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Timer,
  Sparkles,
  Trash2,
  Edit3,
  Check,
  CalendarDays,
  LayoutGrid,
  List,
  CheckSquare,
  X,
  ArrowRight,
  Maximize2,
  Minimize2,
  GripVertical,
} from "lucide-react";

// ─── Interfaces ───

interface TimelineBlock {
  blockId: string;
  occurrenceId?: string;
  chronicleId?: string;
  title: string;
  kind: string;
  dateOnly: string;
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
  variance: {
    status: "PLANNED_PENDING" | "ON_TRACK" | "OVERRUN" | "UNDERRUN" | "MISSED" | "UNPLANNED_EXECUTION";
    durationDeltaMinutes: number;
    explanation: string;
  };
}

interface UnscheduledTask {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate: string;
  dueTime?: string | null;
}

interface DayProjection {
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

// ─── Utilities ───

function formatMinutesToTime(min: number): string {
  const norm = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatHourLabel(h: number): string {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
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
  const dayOfWeek = date.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
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

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [viewMode, setViewMode] = useState<"day" | "week" | "agenda">("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Projections: Day or Week
  const [dayProjection, setDayProjection] = useState<DayProjection | null>(null);
  const [weekDaysData, setWeekDaysData] = useState<DayProjection[]>([]);
  const [unscheduledTasks, setUnscheduledTasks] = useState<UnscheduledTask[]>([]);

  // 24 Hours Grid Mode: Fit to screen (default) vs Scrollable expanded
  const [fitScreen, setFitScreen] = useState(true);

  // Drag and Drop State
  const [draggedBlock, setDraggedBlock] = useState<{
    occurrenceId?: string;
    taskId?: string;
    title: string;
    duration: number;
  } | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ date: string; hour: number } | null>(null);

  // Selected Block for Inspection / Actions
  const [selectedBlock, setSelectedBlock] = useState<TimelineBlock | null>(null);

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);

  // Form State: Schedule
  const [blockTitle, setBlockTitle] = useState("");
  const [blockDate, setBlockDate] = useState(() => selectedDate);
  const [blockStartTime, setBlockStartTime] = useState("10:00");
  const [blockDuration, setBlockDuration] = useState("60");
  const [blockKind, setBlockKind] = useState("WORK_SESSION");
  const [submitting, setSubmitting] = useState(false);

  // Form State: Quick Log
  const [logTitle, setLogTitle] = useState("");
  const [logDuration, setLogDuration] = useState("45");
  const [logNotes, setLogNotes] = useState("");
  const [activeOccurrenceId, setActiveOccurrenceId] = useState<string | null>(null);

  // Form State: Reschedule
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  // Current Time Indicator
  const [currentMinuteOfDay, setCurrentMinuteOfDay] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentMinuteOfDay(now.getHours() * 60 + now.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const isToday = useMemo(() => selectedDate === todayStr, [selectedDate, todayStr]);
  const currentWeekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);

  // ─── Data Fetching ───

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
        if (viewMode === "week" || viewMode === "agenda") {
          setWeekDaysData(json.data.days || []);
          setUnscheduledTasks(json.data.unscheduledTasks || []);
          const matchedDay = (json.data.days || []).find((d: any) => d.dateOnly === selectedDate);
          if (matchedDay) setDayProjection(matchedDay);
        } else {
          setDayProjection(json.data);
          setUnscheduledTasks(json.data.unscheduledTasks || []);
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
  }, [selectedDate, viewMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Date Navigation ───

  const changeDateBy = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + (viewMode === "week" ? days * 7 : days));
    setSelectedDate(current.toISOString().split("T")[0]);
  };

  const setDateToToday = () => {
    setSelectedDate(todayStr);
  };

  const dateHeadingTitle = useMemo(() => {
    if (viewMode === "week") {
      const start = new Date(currentWeekDays[0] + "T00:00:00");
      const end = new Date(currentWeekDays[6] + "T00:00:00");
      const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return `${startStr} – ${endStr}`;
    }

    const [y, m, d] = selectedDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedDate, viewMode, currentWeekDays]);

  // ─── Drag and Drop Handler ───

  const handleDropOnSlot = async (targetDate: string, targetHour: number) => {
    if (!draggedBlock) return;
    const newStartTime = `${String(targetHour).padStart(2, "0")}:00`;
    const newStartMinute = targetHour * 60;
    const duration = draggedBlock.duration || 60;

    setDragOverSlot(null);

    // If it's a scheduled block being moved
    if (draggedBlock.occurrenceId) {
      const occId = draggedBlock.occurrenceId;

      // Optimistic update in UI
      setWeekDaysData((prevDays) =>
        prevDays.map((day) => {
          // Remove from old day if different
          const filtered = day.blocks.filter((b) => b.occurrenceId !== occId);
          // If this is target day, add/update block
          if (day.dateOnly === targetDate) {
            const existing = day.blocks.find((b) => b.occurrenceId === occId);
            const updatedBlock: TimelineBlock = existing
              ? {
                  ...existing,
                  dateOnly: targetDate,
                  planned: {
                    ...existing.planned!,
                    startMinute: newStartMinute,
                    endMinute: newStartMinute + duration,
                    durationMinutes: duration,
                  },
                }
              : {
                  blockId: `block_moved_${Date.now()}`,
                  occurrenceId: occId,
                  title: draggedBlock.title,
                  kind: "WORK_SESSION",
                  dateOnly: targetDate,
                  planned: {
                    startMinute: newStartMinute,
                    endMinute: newStartMinute + duration,
                    durationMinutes: duration,
                    startIsoUtc: `${targetDate}T${newStartTime}:00Z`,
                    endIsoUtc: `${targetDate}T${String(targetHour + 1).padStart(2, "0")}:00Z`,
                  },
                  variance: { status: "PLANNED_PENDING", durationDeltaMinutes: 0, explanation: "" },
                };
            return { ...day, blocks: [...filtered, updatedBlock] };
          }
          return { ...day, blocks: filtered };
        })
      );

      try {
        const res = await fetch("/api/calendar/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType: "reschedule_occurrence",
            payload: {
              occurrenceId: occId,
              newDateOnly: targetDate,
              newStartTime: newStartTime,
              newDurationMinutes: duration,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok || (!json.ok && !json.success)) {
          loadData(); // Revert on failure
        }
      } catch (e) {
        console.error("Drop reschedule error:", e);
        loadData();
      }
    } else if (draggedBlock.taskId) {
      // It's an unscheduled task being dragged onto the calendar
      try {
        const res = await fetch("/api/calendar/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType: "schedule_occurrence",
            payload: {
              title: draggedBlock.title,
              dateOnly: targetDate,
              startTime: newStartTime,
              durationMinutes: duration,
              kind: "WORK_SESSION",
              linkedEntity: { entityType: "task", entityId: draggedBlock.taskId, taskTitle: draggedBlock.title },
            },
          }),
        });
        const json = await res.json();
        if (res.ok && (json.ok || json.success)) {
          loadData();
        }
      } catch (e) {
        console.error("Drop schedule task error:", e);
        loadData();
      }
    }

    setDraggedBlock(null);
  };

  // ─── Actions (Dispatch to Kernel) ───

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockTitle.trim()) return;

    setSubmitting(true);
    try {
      const payload = {
        title: blockTitle.trim(),
        dateOnly: blockDate,
        startTime: blockStartTime,
        durationMinutes: parseInt(blockDuration, 10) || 60,
        kind: blockKind,
        locationCategory: "HOME",
      };

      const res = await fetch("/api/calendar/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "schedule_occurrence",
          payload,
        }),
      });

      const json = await res.json();
      if (res.ok && (json.ok || json.success)) {
        setShowScheduleModal(false);
        setBlockTitle("");
        loadData();
      } else {
        alert(json.error?.message || json.error || "Failed to schedule");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogWorkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logTitle.trim()) return;

    setSubmitting(true);
    try {
      const durationMins = parseInt(logDuration, 10) || 45;
      const endedAtMs = Date.now();
      const startedAtMs = endedAtMs - durationMins * 60 * 1000;

      const payload = {
        occurrenceId: activeOccurrenceId || undefined,
        title: logTitle.trim(),
        startedAtMs,
        endedAtMs,
        durationMinutes: durationMins,
        notes: logNotes.trim() || undefined,
      };

      const res = await fetch("/api/calendar/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "log_execution_interval",
          payload,
        }),
      });

      const json = await res.json();
      if (res.ok && (json.ok || json.success)) {
        setShowLogModal(false);
        setLogTitle("");
        setLogNotes("");
        setActiveOccurrenceId(null);
        setSelectedBlock(null);
        loadData();
      } else {
        alert(json.error?.message || json.error || "Failed to log time");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlock?.occurrenceId || !rescheduleTime) return;

    setSubmitting(true);
    try {
      const payload = {
        occurrenceId: selectedBlock.occurrenceId,
        newDateOnly: rescheduleDate || selectedBlock.dateOnly,
        newStartTime: rescheduleTime,
        newDurationMinutes: selectedBlock.planned?.durationMinutes || 60,
      };

      const res = await fetch("/api/calendar/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "reschedule_occurrence",
          payload,
        }),
      });

      const json = await res.json();
      if (res.ok && (json.ok || json.success)) {
        setShowRescheduleModal(false);
        setSelectedBlock(null);
        loadData();
      } else {
        alert(json.error?.message || json.error || "Failed to reschedule");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOccurrence = async (occurrenceId: string) => {
    if (!confirm("Remove this scheduled event?")) return;
    try {
      const res = await fetch("/api/calendar/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "cancel_occurrence",
          payload: { occurrenceId },
        }),
      });
      const json = await res.json();
      if (res.ok && (json.ok || json.success)) {
        setSelectedBlock(null);
        loadData();
      }
    } catch (err: any) {
      console.error("Cancel failed:", err);
    }
  };

  // 24 Full Hours (0 to 23)
  const hours24 = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  const openQuickScheduleAt = (dateStr: string, hour: number) => {
    setBlockDate(dateStr);
    setBlockStartTime(`${String(hour).padStart(2, "0")}:00`);
    setBlockDuration("60");
    setBlockKind("WORK_SESSION");
    setBlockTitle("");
    setShowScheduleModal(true);
  };

  return (
    <div className="h-full w-full flex flex-col p-4 md:p-6 overflow-hidden bg-[#161618] text-[#FFFDFC] select-none">
      {/* ─── Top Header Bar ─── */}
      <header className="flex-shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[#2A2B2F]">
        {/* Title & Brand */}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#FFFDFC]">Calendar</h1>
          <p className="text-xs text-gray-400">Your time, in one place.</p>
        </div>

        {/* Date Navigator Pill */}
        <div className="flex items-center gap-1.5 self-start md:self-auto bg-[#1F2023] border border-[#2A2B2F] rounded-xl p-1 shadow-sm">
          <button
            onClick={() => changeDateBy(-1)}
            className="p-1.5 hover:bg-[#2A2B2F] rounded-lg text-gray-300 hover:text-white transition-colors"
            title="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={setDateToToday}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              isToday ? "bg-[#E8414A] text-white" : "text-gray-300 hover:text-white hover:bg-[#2A2B2F]"
            }`}
          >
            Today
          </button>

          <div className="px-3 py-1 text-xs font-bold text-[#FFFDFC] tracking-wide min-w-[140px] text-center">
            {dateHeadingTitle}
          </div>

          <button
            onClick={() => changeDateBy(1)}
            className="p-1.5 hover:bg-[#2A2B2F] rounded-lg text-gray-300 hover:text-white transition-colors"
            title="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right Controls: View Switcher, Fit Toggle, Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* View Switcher: Day | Week | Agenda */}
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-xl p-1 flex items-center gap-1">
            <button
              onClick={() => setViewMode("day")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === "day" ? "bg-[#2A2B2F] text-white shadow-sm" : "text-gray-400 hover:text-white"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Day</span>
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === "week" ? "bg-[#2A2B2F] text-white shadow-sm" : "text-gray-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Week</span>
            </button>
            <button
              onClick={() => setViewMode("agenda")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === "agenda" ? "bg-[#2A2B2F] text-white shadow-sm" : "text-gray-400 hover:text-white"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Agenda</span>
            </button>
          </div>

          {/* Fit to screen toggle */}
          {viewMode === "week" && (
            <button
              onClick={() => setFitScreen(!fitScreen)}
              className={`p-1.5 border rounded-xl transition-colors ${
                fitScreen ? "bg-[#2A2B2F] border-gray-600 text-white" : "bg-[#1F2023] border-[#2A2B2F] text-gray-400"
              }`}
              title={fitScreen ? "Expand to scrollable grid" : "Fit 24 hours on screen"}
            >
              {fitScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            onClick={() => loadData()}
            className="p-2 bg-[#1F2023] hover:bg-[#2A2B2F] border border-[#2A2B2F] text-gray-300 hover:text-white rounded-xl transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => {
              setActiveOccurrenceId(null);
              setLogTitle("");
              setLogDuration("45");
              setShowLogModal(true);
            }}
            className="px-3 py-1.5 bg-[#1F2023] hover:bg-[#2A2B2F] border border-[#2A2B2F] text-[#ECE7E3] text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
          >
            <Timer className="w-3.5 h-3.5 text-[#E8414A]" />
            <span>Log time</span>
          </button>

          <button
            onClick={() => {
              setBlockDate(selectedDate);
              setBlockStartTime("10:00");
              setBlockTitle("");
              setShowScheduleModal(true);
            }}
            className="px-3.5 py-1.5 bg-[#E8414A] hover:bg-[#D62C35] text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-[#E8414A]/20"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule</span>
          </button>
        </div>
      </header>

      {/* ─── Main Content Canvas (Flex 1) ─── */}
      <div className="flex-1 min-h-0 pt-4 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ─── Left Calendar Surface (3/4 width, Full Height) ─── */}
        <div className="lg:col-span-3 h-full flex flex-col min-h-0 bg-[#1F2023] border border-[#2A2B2F] rounded-2xl overflow-hidden shadow-xl">
          {error && (
            <div className="p-3 bg-[#E8414A]/10 border-b border-[#E8414A]/30 text-[#F9A8AC] text-xs flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => loadData()} className="underline font-semibold ml-2">
                Retry
              </button>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* VIEW: WEEK (24-Hour Google Calendar-style Grid)                 */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          {viewMode === "week" && (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* 7-Column Day Header Row */}
              <div className="flex-shrink-0 grid grid-cols-8 border-b border-[#2A2B2F] bg-[#161618] z-20">
                <div className="p-2 text-[10px] text-gray-400 font-mono text-center border-r border-[#2A2B2F] flex items-center justify-center">
                  24h
                </div>
                {currentWeekDays.map((dayStr, idx) => {
                  const isTodayCol = dayStr === todayStr;
                  const dateNum = dayStr.split("-")[2];
                  return (
                    <button
                      key={dayStr}
                      onClick={() => {
                        setSelectedDate(dayStr);
                        setViewMode("day");
                      }}
                      className={`p-2 text-center border-r border-[#2A2B2F] transition-colors group hover:bg-[#1F2023] ${
                        isTodayCol ? "bg-[#1F2023]/60" : ""
                      }`}
                    >
                      <div className="text-[10px] font-bold text-gray-400 group-hover:text-gray-200">
                        {DAY_NAMES[idx]}
                      </div>
                      <div
                        className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold mx-auto ${
                          isTodayCol ? "bg-[#E8414A] text-white" : "text-[#FFFDFC] group-hover:bg-[#2A2B2F]"
                        }`}
                      >
                        {dateNum}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 24-Hour Grid Canvas */}
              <div
                className={`flex-1 min-h-0 relative flex flex-col ${
                  fitScreen ? "overflow-hidden" : "overflow-y-auto"
                }`}
              >
                {/* Real-time Red Current Time Line across 24 Hours */}
                <div
                  className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                  style={{
                    top: `${(currentMinuteOfDay / 1440) * 100}%`,
                  }}
                >
                  <div className="w-[12.5%] text-right pr-2 text-[9px] font-mono text-[#E8414A] font-bold">
                    {formatMinutesToTime(currentMinuteOfDay)}
                  </div>
                  <div className="flex-1 h-[2px] bg-[#E8414A] shadow-[0_0_8px_rgba(232,65,74,0.8)]" />
                </div>

                {/* 24 Hour Rows */}
                {hours24.map((hour) => {
                  const timeLabel = formatHourLabel(hour);
                  return (
                    <div
                      key={hour}
                      className={`grid grid-cols-8 border-b border-[#2A2B2F]/30 ${
                        fitScreen ? "flex-1 min-h-[22px]" : "min-h-[46px]"
                      }`}
                    >
                      {/* Hour Time Label */}
                      <div className="text-right pr-2 text-[10px] font-mono text-gray-400 border-r border-[#2A2B2F]/50 flex items-center justify-end select-none">
                        {timeLabel}
                      </div>

                      {/* 7 Day Hour Slots with Drop Zone */}
                      {currentWeekDays.map((dayStr) => {
                        const isSlotTarget = dragOverSlot?.date === dayStr && dragOverSlot?.hour === hour;
                        return (
                          <div
                            key={dayStr}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (dragOverSlot?.date !== dayStr || dragOverSlot?.hour !== hour) {
                                setDragOverSlot({ date: dayStr, hour });
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverSlot?.date === dayStr && dragOverSlot?.hour === hour) {
                                setDragOverSlot(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDropOnSlot(dayStr, hour);
                            }}
                            onClick={() => openQuickScheduleAt(dayStr, hour)}
                            className={`border-r border-[#2A2B2F]/30 relative group transition-colors cursor-pointer ${
                              isSlotTarget
                                ? "bg-[#E8414A]/20 ring-1 ring-[#E8414A]"
                                : "hover:bg-[#2A2B2F]/20"
                            }`}
                          >
                            <span className="opacity-0 group-hover:opacity-40 absolute top-0.5 right-1 text-gray-500 text-[10px]">
                              +
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Overlaid Draggable Blocks */}
                {weekDaysData.map((dayProj, colIdx) => {
                  const colLeftPercent = 12.5 + colIdx * 12.5;

                  return dayProj.blocks.map((block) => {
                    const startMin = block.planned?.startMinute ?? 0;
                    const duration = block.planned?.durationMinutes ?? block.actual?.durationMinutes ?? 60;
                    const topPercent = (startMin / 1440) * 100;
                    const heightPercent = (duration / 1440) * 100;

                    const isFocus = block.kind === "WORK_SESSION";
                    const isRoutine = block.kind === "ROUTINE_BLOCK";
                    const isDone = block.variance.status === "ON_TRACK" || block.variance.status === "OVERRUN";
                    const isBeingDragged = draggedBlock?.occurrenceId === block.occurrenceId;

                    return (
                      <div
                        key={block.blockId}
                        draggable={Boolean(block.occurrenceId)}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          setDraggedBlock({
                            occurrenceId: block.occurrenceId,
                            title: block.title,
                            duration,
                          });
                          e.dataTransfer.setData("text/plain", block.occurrenceId || "");
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDraggedBlock(null);
                          setDragOverSlot(null);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBlock(block);
                        }}
                        title={`${block.title} (${formatMinutesToTime(startMin)} – ${formatMinutesToTime(startMin + duration)})`}
                        style={{
                          top: `${topPercent}%`,
                          height: `${heightPercent}%`,
                          left: `calc(${colLeftPercent}% + 2px)`,
                          width: "calc(12.5% - 4px)",
                          minHeight: "24px",
                        }}
                        className={`absolute z-10 px-2 py-1 rounded-lg border text-left cursor-grab active:cursor-grabbing transition-all overflow-hidden shadow-md flex flex-col justify-center ${
                          isBeingDragged
                            ? "opacity-40 ring-2 ring-[#E8414A]"
                            : isDone
                            ? "bg-[#202227] border-[#2A2B2F] opacity-90"
                            : "bg-[#26282E] border-[#3E424B] hover:border-[#E8414A]/70 hover:bg-[#2E3038] hover:z-20"
                        } ${
                          isFocus
                            ? "border-l-[3.5px] border-l-[#E8414A]"
                            : isRoutine
                            ? "border-l-[3.5px] border-l-amber-500"
                            : "border-l-[3.5px] border-l-blue-500"
                        }`}
                      >
                        {/* Task Title (High Contrast & Visible) */}
                        <div className="flex items-center gap-1 leading-none">
                          <span className="text-[11px] font-bold text-white truncate drop-shadow-sm flex-1">
                            {block.title}
                          </span>
                        </div>

                        {/* Time & Status Subtitle (If block has room) */}
                        {duration >= 45 && (
                          <div className="text-[9px] font-mono text-gray-300 truncate mt-0.5 leading-none">
                            {formatMinutesToTime(startMin)}
                          </div>
                        )}
                      </div>
                    );
                  });
                })}
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* VIEW: DAY                                                       */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          {viewMode === "day" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="p-3 border-b border-[#2A2B2F] bg-[#161618] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#E8414A]" />
                  <span className="text-sm font-bold text-[#FFFDFC]">{dateHeadingTitle}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {dayProjection?.blocks?.length || 0} scheduled
                </span>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#2A2B2F]/30">
                {hours24.map((hour) => {
                  const hourStart = hour * 60;
                  const hourEnd = hourStart + 60;
                  const hourBlocks = (dayProjection?.blocks || []).filter((b) => {
                    const start = b.planned?.startMinute ?? 0;
                    return start >= hourStart && start < hourEnd;
                  });

                  return (
                    <div key={hour} className="flex items-start min-h-[52px] hover:bg-[#2A2B2F]/10 transition-colors">
                      <div className="w-20 shrink-0 p-2.5 text-right text-xs font-mono text-gray-400 border-r border-[#2A2B2F]">
                        {formatHourLabel(hour)}
                      </div>

                      <div
                        className="flex-1 p-2 space-y-2 cursor-pointer relative group"
                        onClick={() => openQuickScheduleAt(selectedDate, hour)}
                      >
                        {hourBlocks.length === 0 ? (
                          <div className="h-full flex items-center text-xs text-gray-600 group-hover:text-gray-400 transition-colors pl-2">
                            Free
                          </div>
                        ) : (
                          hourBlocks.map((block) => (
                            <div
                              key={block.blockId}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBlock(block);
                              }}
                              className="p-3 bg-[#24262C] border border-[#3A3D46] hover:border-[#E8414A]/50 rounded-xl transition-all flex items-center justify-between shadow-sm"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      block.kind === "WORK_SESSION" ? "bg-[#E8414A]" : "bg-amber-400"
                                    }`}
                                  />
                                  <h4 className="text-xs font-bold text-white">{block.title}</h4>
                                  {block.variance.status === "OVERRUN" && (
                                    <span className="text-[10px] font-semibold text-[#F9A8AC] bg-[#E8414A]/15 px-2 py-0.5 rounded-full border border-[#E8414A]/30">
                                      +{block.variance.durationDeltaMinutes}m longer
                                    </span>
                                  )}
                                  {block.variance.status === "UNDERRUN" && (
                                    <span className="text-[10px] font-semibold text-sky-300 bg-sky-500/15 px-2 py-0.5 rounded-full border border-sky-500/30">
                                      Finished early
                                    </span>
                                  )}
                                  {block.variance.status === "ON_TRACK" && (
                                    <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                      Completed
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] font-mono text-gray-300 pl-4">
                                  {formatMinutesToTime(block.planned?.startMinute || 0)} –{" "}
                                  {formatMinutesToTime(block.planned?.endMinute || 60)} (
                                  {formatDuration(block.planned?.durationMinutes || 60)})
                                </div>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveOccurrenceId(block.occurrenceId || null);
                                  setLogTitle(block.title);
                                  setLogDuration(String(block.planned?.durationMinutes || 60));
                                  setShowLogModal(true);
                                }}
                                className="px-2.5 py-1 bg-[#1F2023] hover:bg-[#2A2B2F] border border-[#2A2B2F] text-xs font-semibold text-gray-300 hover:text-white rounded-lg transition-colors flex items-center gap-1"
                              >
                                <Check className="w-3 h-3 text-[#E8414A]" />
                                <span>Log time</span>
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* VIEW: AGENDA                                                    */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          {viewMode === "agenda" && (
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
              <div className="border-b border-[#2A2B2F] pb-3">
                <h3 className="text-base font-bold text-[#FFFDFC]">Weekly Agenda</h3>
                <p className="text-xs text-gray-400">Chronological summary of your scheduled events</p>
              </div>

              <div className="space-y-6">
                {weekDaysData.map((dayProj, idx) => {
                  const dayBlocks = dayProj.blocks;
                  const isDayToday = dayProj.dateOnly === todayStr;
                  return (
                    <div key={dayProj.dateOnly} className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                            isDayToday
                              ? "bg-[#E8414A] text-white"
                              : "bg-[#161618] border border-[#2A2B2F] text-gray-300"
                          }`}
                        >
                          {DAY_NAMES[idx]}, {dayProj.dateOnly}
                        </span>
                        {isDayToday && <span className="text-xs text-[#E8414A] font-semibold">Today</span>}
                      </div>

                      {dayBlocks.length === 0 ? (
                        <div className="p-3 bg-[#161618]/50 border border-[#2A2B2F]/40 rounded-xl text-xs text-gray-500 italic">
                          No events scheduled • Free day
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dayBlocks.map((block) => (
                            <div
                              key={block.blockId}
                              onClick={() => setSelectedBlock(block)}
                              className="p-3 bg-[#24262C] border border-[#3A3D46] hover:border-[#E8414A]/40 rounded-xl transition-all flex items-center justify-between cursor-pointer"
                            >
                              <div className="space-y-1">
                                <h4 className="text-xs font-bold text-white">{block.title}</h4>
                                <div className="text-[11px] font-mono text-gray-300">
                                  {formatMinutesToTime(block.planned?.startMinute || 0)} –{" "}
                                  {formatMinutesToTime(block.planned?.endMinute || 60)}
                                </div>
                              </div>
                              <div className="text-xs text-gray-400">
                                {formatDuration(block.planned?.durationMinutes || 60)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ─── Right Sidebar: Today & Tasks To Schedule (1/4 width) ─── */}
        <aside className="lg:col-span-1 h-full flex flex-col min-h-0 space-y-4 overflow-y-auto pr-1">
          {/* Today Summary Card */}
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-4 shadow-lg flex-shrink-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#E8414A]" />
              <span>Today</span>
            </h3>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-[#161618] border border-[#2A2B2F] rounded-xl p-2.5">
                <div className="text-[10px] text-gray-400">Planned focus</div>
                <div className="text-base font-bold text-[#FFFDFC] mt-0.5">
                  {formatDuration(dayProjection?.summary.totalPlannedMinutes || 0)}
                </div>
              </div>

              <div className="bg-[#161618] border border-[#2A2B2F] rounded-xl p-2.5">
                <div className="text-[10px] text-gray-400">Time spent</div>
                <div className="text-base font-bold text-[#E8414A] mt-0.5">
                  {formatDuration(dayProjection?.summary.totalActualMinutes || 0)}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs border-t border-[#2A2B2F] pt-2.5 text-gray-400">
              <div className="flex justify-between">
                <span>Completed</span>
                <span className="text-[#FFFDFC] font-semibold">
                  {dayProjection?.summary.completedOccurrencesCount || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Extra work</span>
                <span className="text-[#FFFDFC] font-semibold">
                  {dayProjection?.summary.adHocSessionsCount || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Draggable Tasks to Schedule Card */}
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-4 shadow-lg flex-1 min-h-[180px] flex flex-col">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-[#E8414A]" />
                <span>Tasks to schedule</span>
              </h3>
              <span className="text-xs font-bold text-gray-500">{unscheduledTasks.length}</span>
            </div>

            <p className="text-[10px] text-gray-500 mb-2">Drag tasks onto the calendar or click Schedule</p>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {unscheduledTasks.length > 0 ? (
                unscheduledTasks.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedBlock({
                        taskId: t.id,
                        title: t.title,
                        duration: 60,
                      });
                      e.dataTransfer.setData("text/plain", t.id);
                    }}
                    onDragEnd={() => {
                      setDraggedBlock(null);
                      setDragOverSlot(null);
                    }}
                    className="p-2.5 bg-[#161618] border border-[#2A2B2F] hover:border-[#E8414A]/40 rounded-xl transition-all flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing group shadow-sm"
                  >
                    <div className="truncate flex items-center gap-1.5 min-w-0">
                      <GripVertical className="w-3 h-3 text-gray-600 group-hover:text-gray-400 shrink-0" />
                      <div className="truncate">
                        <div className="text-xs font-semibold text-[#FFFDFC] truncate">{t.title}</div>
                        <div className="text-[9px] text-gray-400 capitalize">{t.priority} priority</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setBlockTitle(t.title);
                        setBlockDate(t.dueDate || selectedDate);
                        setBlockStartTime("10:00");
                        setShowScheduleModal(true);
                      }}
                      className="px-2 py-1 bg-[#1F2023] hover:bg-[#E8414A] hover:text-white border border-[#2A2B2F] text-[10px] font-bold text-gray-300 rounded-lg transition-colors shrink-0"
                    >
                      + Schedule
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-500 mt-2">All tasks for today are scheduled.</p>
              )}
            </div>
          </div>

          {/* Aven's Suggestion Card */}
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-4 shadow-lg flex-shrink-0 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#E8414A]" />
              <span>Aven's suggestion</span>
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              You usually focus best between 10 AM and 1 PM.
            </p>
            <button
              onClick={() => {
                setBlockTitle("Focus Session");
                setBlockDate(selectedDate);
                setBlockStartTime("10:00");
                setBlockDuration("90");
                setShowScheduleModal(true);
              }}
              className="w-full py-1.5 bg-[#161618] hover:bg-[#2A2B2F] border border-[#2A2B2F] text-xs font-semibold text-[#FFFDFC] rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Plan focus block</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </aside>
      </div>

      {/* ─── Block Details Modal ─── */}
      {selectedBlock && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl max-w-sm w-full p-6 text-[#FFFDFC] shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {selectedBlock.kind.replace("_", " ")}
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">{selectedBlock.title}</h3>
              </div>
              <button
                onClick={() => setSelectedBlock(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-gray-300 border-t border-[#2A2B2F] pt-3 mb-5">
              <div className="flex justify-between">
                <span className="text-gray-400">Date</span>
                <span className="font-semibold text-white">{selectedBlock.dateOnly}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Time</span>
                <span className="font-semibold text-white">
                  {formatMinutesToTime(selectedBlock.planned?.startMinute || 0)} –{" "}
                  {formatMinutesToTime(selectedBlock.planned?.endMinute || 60)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Duration</span>
                <span className="font-semibold text-white">
                  {formatDuration(selectedBlock.planned?.durationMinutes || 60)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-[#2A2B2F]">
              <button
                onClick={() => {
                  setActiveOccurrenceId(selectedBlock.occurrenceId || null);
                  setLogTitle(selectedBlock.title);
                  setLogDuration(String(selectedBlock.planned?.durationMinutes || 60));
                  setShowLogModal(true);
                }}
                className="flex-1 py-2 bg-[#E8414A] hover:bg-[#D62C35] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-[#E8414A]/20"
              >
                Log time
              </button>

              <button
                onClick={() => {
                  setRescheduleDate(selectedBlock.dateOnly);
                  setRescheduleTime(formatMinutesToTime(selectedBlock.planned?.startMinute || 600));
                  setShowRescheduleModal(true);
                }}
                className="px-3 py-2 bg-[#161618] hover:bg-[#2A2B2F] border border-[#2A2B2F] text-gray-300 text-xs font-semibold rounded-xl transition-colors"
                title="Reschedule"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>

              {selectedBlock.occurrenceId && (
                <button
                  onClick={() => handleCancelOccurrence(selectedBlock.occurrenceId!)}
                  className="px-3 py-2 bg-[#161618] hover:bg-[#E8414A]/20 hover:text-[#E8414A] border border-[#2A2B2F] text-gray-400 text-xs font-semibold rounded-xl transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Schedule Block Modal ─── */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl max-w-md w-full p-6 text-[#FFFDFC] shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Schedule</h3>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                  What do you want to work on?
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Deep Work, Gym, Team Meeting"
                  value={blockTitle}
                  onChange={(e) => setBlockTitle(e.target.value)}
                  className="w-full bg-[#161618] border border-[#2A2B2F] focus:border-[#E8414A] rounded-xl px-3.5 py-2.5 text-sm text-[#FFFDFC] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Date</label>
                  <input
                    type="date"
                    required
                    value={blockDate}
                    onChange={(e) => setBlockDate(e.target.value)}
                    className="w-full bg-[#161618] border border-[#2A2B2F] focus:border-[#E8414A] rounded-xl px-3 py-2 text-xs text-[#FFFDFC] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Start Time</label>
                  <input
                    type="time"
                    required
                    value={blockStartTime}
                    onChange={(e) => setBlockStartTime(e.target.value)}
                    className="w-full bg-[#161618] border border-[#2A2B2F] focus:border-[#E8414A] rounded-xl px-3 py-2 text-xs text-[#FFFDFC] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Duration</label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {["30", "45", "60", "90"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setBlockDuration(d)}
                      className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        blockDuration === d
                          ? "bg-[#E8414A] border-[#E8414A] text-white"
                          : "bg-[#161618] border-[#2A2B2F] text-gray-400 hover:text-white"
                      }`}
                    >
                      {d}m
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Type</label>
                <select
                  value={blockKind}
                  onChange={(e) => setBlockKind(e.target.value)}
                  className="w-full bg-[#161618] border border-[#2A2B2F] focus:border-[#E8414A] rounded-xl px-3 py-2 text-xs text-[#FFFDFC] outline-none"
                >
                  <option value="WORK_SESSION">Focus work</option>
                  <option value="ROUTINE_BLOCK">Routine / Habit</option>
                  <option value="HARD_EVENT">Meeting / Commitment</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 bg-[#161618] hover:bg-[#2A2B2F] border border-[#2A2B2F] text-gray-300 text-xs font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#E8414A] hover:bg-[#D62C35] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-[#E8414A]/20"
                >
                  {submitting ? "Saving..." : "Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Log Time Modal ─── */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl max-w-md w-full p-6 text-[#FFFDFC] shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Log time</h3>
              <button
                onClick={() => setShowLogModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLogWorkSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Activity</label>
                <input
                  type="text"
                  required
                  placeholder="What did you work on?"
                  value={logTitle}
                  onChange={(e) => setLogTitle(e.target.value)}
                  className="w-full bg-[#161618] border border-[#2A2B2F] focus:border-[#E8414A] rounded-xl px-3.5 py-2.5 text-sm text-[#FFFDFC] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  step="5"
                  required
                  value={logDuration}
                  onChange={(e) => setLogDuration(e.target.value)}
                  className="w-full bg-[#161618] border border-[#2A2B2F] focus:border-[#E8414A] rounded-xl px-3.5 py-2.5 text-sm text-[#FFFDFC] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                  Notes (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Any details or thoughts..."
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  className="w-full bg-[#161618] border border-[#2A2B2F] focus:border-[#E8414A] rounded-xl px-3.5 py-2.5 text-sm text-[#FFFDFC] outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 bg-[#161618] hover:bg-[#2A2B2F] border border-[#2A2B2F] text-gray-300 text-xs font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#E8414A] hover:bg-[#D62C35] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-[#E8414A]/20 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{submitting ? "Saving..." : "Save"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Reschedule Modal ─── */}
      {showRescheduleModal && selectedBlock && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl max-w-sm w-full p-6 text-[#FFFDFC] shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Move Event</h3>
              <button
                onClick={() => setShowRescheduleModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">New Date</label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full bg-[#161618] border border-[#2A2B2F] focus:border-[#E8414A] rounded-xl px-3 py-2 text-xs text-[#FFFDFC] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">New Time</label>
                <input
                  type="time"
                  required
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full bg-[#161618] border border-[#2A2B2F] focus:border-[#E8414A] rounded-xl px-3 py-2 text-xs text-[#FFFDFC] outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRescheduleModal(false)}
                  className="px-4 py-2 bg-[#161618] hover:bg-[#2A2B2F] border border-[#2A2B2F] text-gray-300 text-xs font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#E8414A] hover:bg-[#D62C35] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-[#E8414A]/20"
                >
                  {submitting ? "Moving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
