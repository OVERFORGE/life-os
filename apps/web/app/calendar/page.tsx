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

// ─── Drag State Interface ───

interface DragState {
  occurrenceId?: string;
  taskId?: string;
  title: string;
  duration: number;
  kind?: string;
  originDate?: string;
  originStartMin?: number;
  blockId?: string;
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

/** Convert startMinute (0-1439) to "HH:MM" for <input type="time"> */
function minutesToTimeInput(min: number): string {
  const h = Math.floor(((min % 1440) + 1440) % 1440 / 60);
  const m = ((min % 1440) + 1440) % 1440 % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Convert "HH:MM" string to minutes-of-day */
function timeInputToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ─── Block Details Modal (Editable) ───

function BlockDetailsModal({
  block,
  onClose,
  onLogTime,
  onDelete,
  onSkip,
  onSave,
  submitting,
}: {
  block: TimelineBlock;
  onClose: () => void;
  onLogTime: () => void;
  onDelete: () => void;
  onSkip?: () => void;
  onSave: (newDate: string, newStartTime: string, newDurationMinutes: number) => Promise<void>;
  submitting: boolean;
}) {
  const origDate = block.dateOnly;
  const origStartMin = block.planned?.startMinute ?? 0;
  const origDuration = block.planned?.durationMinutes ?? 60;
  const origStartTime = minutesToTimeInput(origStartMin);

  const [editDate, setEditDate] = React.useState(origDate);
  const [editStartTime, setEditStartTime] = React.useState(origStartTime);
  const [editDuration, setEditDuration] = React.useState(String(origDuration));

  // Detect if anything changed
  const hasChanges =
    editDate !== origDate ||
    editStartTime !== origStartTime ||
    editDuration !== String(origDuration);

  // Compute derived end time for display
  const startMin = timeInputToMinutes(editStartTime);
  const durationMin = parseInt(editDuration, 10) || origDuration;
  const endMin = startMin + durationMin;

  const handleSave = async () => {
    await onSave(editDate, editStartTime, durationMin);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl max-w-sm w-full p-6 text-[#FFFDFC] shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {block.kind.replace("_", " ")}
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">{block.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Editable Fields */}
        <div className="space-y-3 border-t border-[#2A2B2F] pt-4 mb-5">
          {/* Date */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Date</label>
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full bg-[#161618] border border-[#2A2B2F] focus:border-[#E8414A] rounded-xl px-3 py-2 text-xs text-[#FFFDFC] outline-none transition-colors"
            />
          </div>

          {/* Start Time & End Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Start Time</label>
              <input
                type="time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                className="w-full bg-[#161618] border border-[#2A2B2F] focus:border-[#E8414A] rounded-xl px-3 py-2 text-xs text-[#FFFDFC] outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">End Time</label>
              <div className="w-full bg-[#161618]/50 border border-[#2A2B2F]/60 rounded-xl px-3 py-2 text-xs text-gray-400 font-mono">
                {formatMinutesToTime(endMin)}
              </div>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Duration</label>
            <div className="grid grid-cols-5 gap-1.5">
              {["30", "45", "60", "90", "120"].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setEditDuration(d)}
                  className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                    editDuration === d
                      ? "bg-[#E8414A] border-[#E8414A] text-white shadow-sm shadow-[#E8414A]/20"
                      : "bg-[#161618] border-[#2A2B2F] text-gray-400 hover:text-white hover:border-[#3E424B]"
                  }`}
                >
                  {formatDuration(parseInt(d, 10))}
                </button>
              ))}
            </div>
            {/* Custom duration input */}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min="5"
                step="5"
                value={editDuration}
                onChange={(e) => setEditDuration(e.target.value)}
                className="flex-1 bg-[#161618] border border-[#2A2B2F] focus:border-[#E8414A] rounded-xl px-3 py-1.5 text-xs text-[#FFFDFC] outline-none transition-colors"
              />
              <span className="text-[10px] text-gray-400 font-semibold">minutes</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-3 border-t border-[#2A2B2F]">
          {hasChanges ? (
            /* Show Save button when fields are modified */
            <button
              onClick={handleSave}
              disabled={submitting}
              className="flex-1 py-2 bg-[#E8414A] hover:bg-[#D62C35] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-[#E8414A]/20 flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{submitting ? "Saving..." : "Save changes"}</span>
            </button>
          ) : (
            /* Default: Log time */
            <button
              onClick={onLogTime}
              className="flex-1 py-2 bg-[#E8414A] hover:bg-[#D62C35] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-[#E8414A]/20"
            >
              Log time
            </button>
          )}

          {block.occurrenceId && onSkip && (
            <button
              onClick={onSkip}
              className="px-3 py-2 bg-[#161618] hover:bg-amber-500/20 hover:text-amber-400 border border-[#2A2B2F] text-gray-400 text-xs font-semibold rounded-xl transition-colors"
              title="Mark as skipped"
            >
              Skip
            </button>
          )}

          {block.occurrenceId && (
            <button
              onClick={onDelete}
              className="px-3 py-2 bg-[#161618] hover:bg-[#E8414A]/20 hover:text-[#E8414A] border border-[#2A2B2F] text-gray-400 text-xs font-semibold rounded-xl transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [viewMode, setViewMode] = useState<"day" | "week" | "agenda">("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Projections: Day or Week
  const [dayProjection, setDayProjection] = useState<DayProjection | null>(null);
  const [todayProjection, setTodayProjection] = useState<DayProjection | null>(null);
  const [weekDaysData, setWeekDaysData] = useState<DayProjection[]>([]);
  const [unscheduledTasks, setUnscheduledTasks] = useState<UnscheduledTask[]>([]);

  const gridScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current hour or 8 AM on load/date change
  useEffect(() => {
    if (gridScrollRef.current && viewMode === "week") {
      const curH = new Date().getHours();
      const targetHour = Math.max(0, curH - 1);
      gridScrollRef.current.scrollTop = targetHour * 56;
    }
  }, [viewMode, selectedDate]);

  // ─── Custom Pointer-Based Drag System (Google Calendar Style) ───
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverSlot, setHoverSlot] = useState<{ date: string; hour: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef(false);
  const dragJustEndedRef = useRef(false);

  // Cleanup long-press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Global pointermove + pointerup listeners during drag
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      setPointerPos({ x: e.clientX, y: e.clientY });

      // Detect which slot the pointer is over by checking elements under cursor
      const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
      if (elemBelow) {
        const slotEl = elemBelow.closest("[data-drop-slot]") as HTMLElement | null;
        if (slotEl) {
          const slotDate = slotEl.dataset.dropDate || "";
          const slotHour = parseInt(slotEl.dataset.dropHour || "0", 10);
          setHoverSlot({ date: slotDate, hour: slotHour });
        } else {
          setHoverSlot(null);
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      // If we have a drag state and hover slot, commit the drop
      if (dragState && hoverSlot) {
        handleDropOnSlot(hoverSlot.date, hoverSlot.hour);
      }
      // Reset everything
      cleanupDrag();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);

    // Prevent text selection during drag
    const preventSelect = (e: Event) => e.preventDefault();
    document.addEventListener("selectstart", preventSelect);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("selectstart", preventSelect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, dragState, hoverSlot]);

  const cleanupDrag = useCallback(() => {
    const wasDragging = isDragging;
    setDragState(null);
    setPointerPos(null);
    setHoverSlot(null);
    setIsDragging(false);
    hasMovedRef.current = false;
    dragStartPosRef.current = null;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    // Prevent the subsequent click event from opening the modal after a drag
    if (wasDragging) {
      dragJustEndedRef.current = true;
      setTimeout(() => { dragJustEndedRef.current = false; }, 100);
    }
  }, [isDragging]);

  // Start the long-press detection on a calendar block
  const handleBlockPointerDown = useCallback((e: React.PointerEvent, block: TimelineBlock) => {
    if (e.button !== 0) return; // Only left click
    // Don't preventDefault — let normal click events fire for opening the modal

    const startPos = { x: e.clientX, y: e.clientY };
    dragStartPosRef.current = startPos;
    hasMovedRef.current = false;

    const duration = block.planned?.durationMinutes ?? block.actual?.durationMinutes ?? 60;
    const startMin = block.planned?.startMinute ?? 0;

    // Start long-press timer (500ms) — only activates drag after a deliberate hold
    longPressTimerRef.current = setTimeout(() => {
      // Activate drag mode
      setDragState({
        occurrenceId: block.occurrenceId,
        title: block.title,
        duration,
        kind: block.kind,
        originDate: block.dateOnly,
        originStartMin: startMin,
        blockId: block.blockId,
      });
      setPointerPos(startPos);
      setIsDragging(true);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }, 500);

    // If the user moves mouse before the timer fires, cancel long-press
    const handleEarlyMove = (moveE: PointerEvent) => {
      const dx = moveE.clientX - startPos.x;
      const dy = moveE.clientY - startPos.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        window.removeEventListener("pointermove", handleEarlyMove);
      }
    };

    const handleEarlyUp = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      window.removeEventListener("pointermove", handleEarlyMove);
      window.removeEventListener("pointerup", handleEarlyUp);
    };

    window.addEventListener("pointermove", handleEarlyMove);
    window.addEventListener("pointerup", handleEarlyUp);
  }, []);

  // Start the long-press detection on an unscheduled task
  const handleTaskPointerDown = useCallback((e: React.PointerEvent, task: UnscheduledTask) => {
    if (e.button !== 0) return;
    // Don't preventDefault — let normal click events fire

    const startPos = { x: e.clientX, y: e.clientY };
    dragStartPosRef.current = startPos;

    longPressTimerRef.current = setTimeout(() => {
      setDragState({
        taskId: task.id,
        title: task.title,
        duration: 60,
      });
      setPointerPos(startPos);
      setIsDragging(true);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }, 500);

    const handleEarlyMove = (moveE: PointerEvent) => {
      const dx = moveE.clientX - startPos.x;
      const dy = moveE.clientY - startPos.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        window.removeEventListener("pointermove", handleEarlyMove);
      }
    };

    const handleEarlyUp = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      window.removeEventListener("pointermove", handleEarlyMove);
      window.removeEventListener("pointerup", handleEarlyUp);
    };

    window.addEventListener("pointermove", handleEarlyMove);
    window.addEventListener("pointerup", handleEarlyUp);
  }, []);

  // Selected Block for Inspection / Actions
  const [selectedBlock, setSelectedBlock] = useState<TimelineBlock | null>(null);

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);


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

  const loadTodayData = useCallback(async () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch(
        `/api/calendar/timeline?date=${todayStr}&view=day&timezone=${encodeURIComponent(tz)}`
      );
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
        if (viewMode === "week" || viewMode === "agenda") {
          setWeekDaysData(json.data.days || []);
          setUnscheduledTasks(json.data.unscheduledTasks || []);
          const matchedDay = (json.data.days || []).find((d: any) => d.dateOnly === selectedDate);
          if (matchedDay) setDayProjection(matchedDay);
          const matchedToday = (json.data.days || []).find((d: any) => d.dateOnly === todayStr);
          if (matchedToday) setTodayProjection(matchedToday);
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

  // ─── Drop Handler ───

  const handleDropOnSlot = async (targetDate: string, targetHour: number) => {
    if (!dragState) return;
    const newStartTime = `${String(targetHour).padStart(2, "0")}:00`;
    const newStartMinute = targetHour * 60;
    const duration = dragState.duration || 60;

    // If it's a scheduled block being moved
    if (dragState.occurrenceId) {
      const occId = dragState.occurrenceId;

      // Optimistic update in Week View
      setWeekDaysData((prevDays) =>
        prevDays.map((day) => {
          const filtered = day.blocks.filter((b) => b.occurrenceId !== occId);
          if (day.dateOnly === targetDate) {
            const existing = day.blocks.find((b) => b.occurrenceId === occId) ||
              dayProjection?.blocks.find((b) => b.occurrenceId === occId);
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
                  title: dragState.title,
                  kind: dragState.kind || "WORK_SESSION",
                  dateOnly: targetDate,
                  planned: {
                    startMinute: newStartMinute,
                    endMinute: newStartMinute + duration,
                    durationMinutes: duration,
                    startIsoUtc: `${targetDate}T${newStartTime}:00Z`,
                    endIsoUtc: `${targetDate}T${String((targetHour + Math.ceil(duration / 60)) % 24).padStart(2, "0")}:00Z`,
                  },
                  variance: { status: "PLANNED_PENDING", durationDeltaMinutes: 0, explanation: "" },
                };
            return { ...day, blocks: [...filtered, updatedBlock] };
          }
          return { ...day, blocks: filtered };
        })
      );

      // Optimistic update in Day View
      setDayProjection((prev) => {
        if (!prev) return prev;
        const filtered = prev.blocks.filter((b) => b.occurrenceId !== occId);
        if (targetDate === prev.dateOnly) {
          const existing = prev.blocks.find((b) => b.occurrenceId === occId) ||
            weekDaysData.flatMap((d) => d.blocks).find((b) => b.occurrenceId === occId);
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
                title: dragState.title,
                kind: dragState.kind || "WORK_SESSION",
                dateOnly: targetDate,
                planned: {
                  startMinute: newStartMinute,
                  endMinute: newStartMinute + duration,
                  durationMinutes: duration,
                  startIsoUtc: `${targetDate}T${newStartTime}:00Z`,
                  endIsoUtc: `${targetDate}T${String((targetHour + Math.ceil(duration / 60)) % 24).padStart(2, "0")}:00Z`,
                },
                variance: { status: "PLANNED_PENDING", durationDeltaMinutes: 0, explanation: "" },
              };
          return { ...prev, blocks: [...filtered, updatedBlock] };
        }
        return { ...prev, blocks: filtered };
      });

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
    } else if (dragState.taskId) {
      // It's an unscheduled task being dragged onto the calendar
      try {
        const res = await fetch("/api/calendar/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType: "schedule_occurrence",
            payload: {
              title: dragState.title,
              dateOnly: targetDate,
              startTime: newStartTime,
              durationMinutes: duration,
              kind: "WORK_SESSION",
              linkedEntity: { entityType: "task", entityId: dragState.taskId, taskTitle: dragState.title },
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

    cleanupDrag();
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
        loadTodayData();
      } else {
        alert(json.error?.message || json.error || "Failed to log time");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipOccurrence = async (occurrenceId: string) => {
    try {
      const res = await fetch("/api/calendar/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "cancel_occurrence",
          payload: { occurrenceId, status: "SKIPPED" },
        }),
      });
      const json = await res.json();
      if (res.ok && (json.ok || json.success)) {
        setSelectedBlock(null);
        loadData();
        loadTodayData();
      }
    } catch (err: any) {
      console.error("Skip failed:", err);
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
        loadTodayData();
      }
    } catch (err: any) {
      console.error("Cancel failed:", err);
    }
  };

  // 24 Full Hours (0 to 23)
  const hours24 = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  const openQuickScheduleAt = (dateStr: string, hour: number) => {
    if (isDragging) return; // Don't open modal while dragging
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

              {/* 24-Hour Grid Canvas (Scrollable with Spacious Hour Rows) */}
              <div
                ref={gridScrollRef}
                className="flex-1 min-h-0 relative overflow-y-auto select-none"
              >
                <div className="relative min-h-[1344px] h-[1344px] flex flex-col">
                  {/* Real-time Red Current Time Line across 24 Hours */}
                  {currentWeekDays.includes(todayStr) && (
                    <div
                      className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                      style={{
                        top: `${(currentMinuteOfDay / 60) * 56}px`,
                      }}
                    >
                      <div className="w-[12.5%] text-right pr-2 text-[9px] font-mono text-[#E8414A] font-bold">
                        {formatMinutesToTime(currentMinuteOfDay)}
                      </div>
                      <div className="flex-1 h-[2px] bg-[#E8414A] shadow-[0_0_8px_rgba(232,65,74,0.8)]" />
                    </div>
                  )}

                  {/* 24 Hour Rows — each row is a drop zone */}
                  {hours24.map((hour) => {
                    const timeLabel = formatHourLabel(hour);
                    return (
                      <div
                        key={hour}
                        style={{ height: "56px", minHeight: "56px" }}
                        className="grid grid-cols-8 border-b border-[#2A2B2F]/30"
                      >
                        {/* Hour Time Label */}
                        <div className="text-right pr-2 text-[10px] font-mono text-gray-400 border-r border-[#2A2B2F]/50 flex items-center justify-end select-none">
                          {timeLabel}
                        </div>

                        {/* 7 Day Hour Slots — Drop Zones with data attributes */}
                        {currentWeekDays.map((dayStr) => {
                          const isSlotTarget = isDragging && hoverSlot?.date === dayStr && hoverSlot?.hour === hour;
                          return (
                            <div
                              key={dayStr}
                              data-drop-slot="true"
                              data-drop-date={dayStr}
                              data-drop-hour={hour}
                              onClick={() => openQuickScheduleAt(dayStr, hour)}
                              className={`border-r border-[#2A2B2F]/30 relative group transition-colors cursor-pointer ${
                                isSlotTarget
                                  ? "bg-[#E8414A]/20 ring-2 ring-inset ring-[#E8414A]"
                                  : "hover:bg-[#2A2B2F]/20"
                              }`}
                            >
                              {/* Live Drop Target Ghost Placeholder */}
                              {isSlotTarget && dragState && (
                                <div
                                  style={{
                                    height: `${Math.max(26, (dragState.duration / 60) * 56 - 3)}px`,
                                  }}
                                  className="absolute left-0.5 right-0.5 top-0.5 z-20 bg-[#E8414A]/25 border-2 border-dashed border-[#E8414A] rounded-lg p-1 pointer-events-none flex flex-col justify-center shadow-lg shadow-[#E8414A]/30 animate-pulse"
                                >
                                  <span className="text-[10px] font-bold text-white truncate leading-none">
                                    {dragState.title}
                                  </span>
                                  <span className="text-[9px] font-mono text-[#F9A8AC] mt-0.5 leading-none">
                                    {formatMinutesToTime(hour * 60)} – {formatMinutesToTime(hour * 60 + dragState.duration)}
                                  </span>
                                </div>
                              )}
                              <span className="opacity-0 group-hover:opacity-40 absolute top-0.5 right-1 text-gray-500 text-[10px]">
                                +
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Overlaid Blocks (calendar events) */}
                  {weekDaysData.map((dayProj, colIdx) => {
                    const colLeftPercent = 12.5 + colIdx * 12.5;

                    return dayProj.blocks.map((block) => {
                      const startMin = block.planned?.startMinute ?? 0;
                      const duration = block.planned?.durationMinutes ?? block.actual?.durationMinutes ?? 60;
                      const topPx = (startMin / 60) * 56;
                      const heightPx = Math.max(26, (duration / 60) * 56 - 3);

                      const isFocus = block.kind === "WORK_SESSION";
                      const isRoutine = block.kind === "ROUTINE_BLOCK";
                      const isSkipped = (block.variance?.status as string) === "SKIPPED" || (block as any).status === "SKIPPED";
                      const isDone = block.variance?.status === "ON_TRACK" || block.variance?.status === "OVERRUN" || (block as any).status === "COMPLETED";
                      const isBeingDragged = isDragging && dragState?.blockId === block.blockId;

                      return (
                        <div
                          key={block.blockId}
                          onPointerDown={(e) => handleBlockPointerDown(e, block)}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDragging && !dragJustEndedRef.current) setSelectedBlock(block);
                          }}
                          title={`${block.title} (${formatMinutesToTime(startMin)} – ${formatMinutesToTime(startMin + duration)})`}
                          style={{
                            top: `${topPx}px`,
                            height: `${heightPx}px`,
                            left: `calc(${colLeftPercent}% + 2px)`,
                            width: "calc(12.5% - 4px)",
                            minHeight: "26px",
                            touchAction: "none",
                          }}
                          className={`absolute z-10 px-2 py-1 rounded-lg border text-left transition-all overflow-hidden shadow-md flex flex-col justify-center ${
                            isBeingDragged
                              ? "opacity-30 border-dashed border-[#E8414A] ring-2 ring-[#E8414A] scale-95"
                              : isSkipped
                              ? "bg-[#18191C]/70 border-dashed border-[#3A3B40] opacity-50 cursor-grab"
                              : isDone
                              ? "bg-[#18231C] border-[#2A3F30] opacity-95 cursor-grab border-l-[3.5px] border-l-emerald-500"
                              : "bg-[#26282E] border-[#3E424B] hover:border-[#E8414A]/70 hover:bg-[#2E3038] hover:z-20 cursor-grab"
                          } ${
                            !isDone && !isSkipped
                              ? isFocus
                                ? "border-l-[3.5px] border-l-[#E8414A]"
                                : isRoutine
                                ? "border-l-[3.5px] border-l-amber-500"
                                : "border-l-[3.5px] border-l-[#E8414A]/70"
                              : ""
                          }`}
                        >
                          {/* Task Title (High Contrast & Visible) */}
                          <div className="flex items-center gap-1 leading-none">
                            <span
                              className={`text-[11px] font-bold truncate drop-shadow-sm flex-1 ${
                                isSkipped ? "line-through text-gray-400" : "text-white"
                              }`}
                            >
                              {block.title}
                            </span>
                            {isDone && (
                              <span className="text-[10px] text-emerald-400 font-bold" title="Completed">✓</span>
                            )}
                            {isSkipped && (
                              <span className="text-[8px] uppercase tracking-wider bg-gray-700/60 text-gray-300 px-1 py-0.2 rounded font-mono">
                                Skip
                              </span>
                            )}
                          </div>

                          {/* Time & Duration Subtitle */}
                          {heightPx >= 36 && (
                            <div className="text-[9px] font-mono text-gray-300 truncate mt-0.5 leading-none">
                              {formatMinutesToTime(startMin)} – {formatMinutesToTime(startMin + duration)}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })}
                </div>
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
                  const isSlotTarget = isDragging && hoverSlot?.date === selectedDate && hoverSlot?.hour === hour;

                  return (
                    <div
                      key={hour}
                      data-drop-slot="true"
                      data-drop-date={selectedDate}
                      data-drop-hour={hour}
                      className={`flex items-start min-h-[58px] transition-colors relative group ${
                        isSlotTarget
                          ? "bg-[#E8414A]/15 ring-2 ring-inset ring-[#E8414A]"
                          : "hover:bg-[#2A2B2F]/10"
                      }`}
                    >
                      <div className="w-20 shrink-0 p-2.5 text-right text-xs font-mono text-gray-400 border-r border-[#2A2B2F] select-none">
                        {formatHourLabel(hour)}
                      </div>

                      <div
                        className="flex-1 p-2 space-y-2 cursor-pointer relative"
                        onClick={() => openQuickScheduleAt(selectedDate, hour)}
                      >
                        {/* Live Drop Preview Placeholder in Day View */}
                        {isSlotTarget && dragState && (
                          <div className="p-2.5 bg-[#E8414A]/25 border-2 border-dashed border-[#E8414A] rounded-xl flex items-center justify-between shadow-lg shadow-[#E8414A]/20 animate-pulse pointer-events-none">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[#E8414A]" />
                              <span className="text-xs font-bold text-white">{dragState.title}</span>
                              <span className="text-[10px] font-mono text-[#F9A8AC]">
                                {formatMinutesToTime(hour * 60)} – {formatMinutesToTime(hour * 60 + dragState.duration)}
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold text-[#F9A8AC] uppercase">Drop here</span>
                          </div>
                        )}

                        {hourBlocks.length === 0 && !isSlotTarget ? (
                          <div className="h-full flex items-center text-xs text-gray-600 group-hover:text-gray-400 transition-colors pl-2">
                            Free
                          </div>
                        ) : (
                          hourBlocks.map((block) => {
                            const isBeingDragged = isDragging && dragState?.blockId === block.blockId;
                            return (
                              <div
                                key={block.blockId}
                                onPointerDown={(e) => handleBlockPointerDown(e, block)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isDragging && !dragJustEndedRef.current) setSelectedBlock(block);
                                }}
                                style={{ touchAction: "none" }}
                                className={`p-3 bg-[#24262C] border rounded-xl transition-all flex items-center justify-between shadow-sm cursor-grab ${
                                  isBeingDragged
                                    ? "opacity-30 border-dashed border-[#E8414A] ring-2 ring-[#E8414A] scale-95"
                                    : "border-[#3A3D46] hover:border-[#E8414A]/50"
                                }`}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`w-2 h-2 rounded-full ${
                                        block.kind === "WORK_SESSION" ? "bg-[#E8414A]" : "bg-amber-400"
                                      }`}
                                    />
                                    <h4 className="text-xs font-bold text-white">{block.title}</h4>
                                    {(block.variance.status as string) === "SKIPPED" && (
                                      <span className="text-[10px] font-semibold text-gray-400 bg-gray-700/40 px-2 py-0.5 rounded-full border border-gray-600/40">
                                        Skipped
                                      </span>
                                    )}
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
                            );
                          })
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
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#E8414A]" />
                <span>Today</span>
              </span>
              <span className="text-[10px] text-gray-500 font-mono font-normal">
                {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </h3>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-[#161618] border border-[#2A2B2F] rounded-xl p-2.5">
                <div className="text-[10px] text-gray-400">Planned focus</div>
                <div className="text-base font-bold text-[#FFFDFC] mt-0.5">
                  {formatDuration((todayProjection || (isToday ? dayProjection : null))?.summary.totalPlannedMinutes || 0)}
                </div>
              </div>

              <div className="bg-[#161618] border border-[#2A2B2F] rounded-xl p-2.5">
                <div className="text-[10px] text-gray-400">Time spent</div>
                <div className="text-base font-bold text-[#E8414A] mt-0.5">
                  {formatDuration((todayProjection || (isToday ? dayProjection : null))?.summary.totalActualMinutes || 0)}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs border-t border-[#2A2B2F] pt-2.5 text-gray-400">
              <div className="flex justify-between">
                <span>Completed</span>
                <span className="text-[#FFFDFC] font-semibold">
                  {(todayProjection || (isToday ? dayProjection : null))?.summary.completedOccurrencesCount || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Extra work</span>
                <span className="text-[#FFFDFC] font-semibold">
                  {(todayProjection || (isToday ? dayProjection : null))?.summary.adHocSessionsCount || 0}
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

            <p className="text-[10px] text-gray-500 mb-2">Long-press tasks to pick up and drag onto the calendar</p>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {unscheduledTasks.length > 0 ? (
                unscheduledTasks.map((t) => {
                  const isBeingDragged = isDragging && dragState?.taskId === t.id;
                  return (
                    <div
                      key={t.id}
                      onPointerDown={(e) => handleTaskPointerDown(e, t)}
                      style={{ touchAction: "none" }}
                      className={`p-2.5 bg-[#161618] border border-[#2A2B2F] hover:border-[#E8414A]/40 rounded-xl transition-all flex items-center justify-between gap-2 cursor-grab group shadow-sm ${
                        isBeingDragged ? "opacity-30 scale-95 border-dashed border-[#E8414A]" : ""
                      }`}
                    >
                      <div className="truncate flex items-center gap-1.5 min-w-0">
                        <GripVertical className="w-3 h-3 text-gray-600 group-hover:text-gray-400 shrink-0" />
                        <div className="truncate">
                          <div className="text-xs font-semibold text-[#FFFDFC] truncate">{t.title}</div>
                          <div className="text-[9px] text-gray-400 capitalize">{t.priority} priority</div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
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
                  );
                })
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

      {/* ─── Block Details Modal (Editable) ─── */}
      {selectedBlock && (
        <BlockDetailsModal
          block={selectedBlock}
          onClose={() => setSelectedBlock(null)}
          onLogTime={() => {
            setActiveOccurrenceId(selectedBlock.occurrenceId || null);
            setLogTitle(selectedBlock.title);
            setLogDuration(String(selectedBlock.planned?.durationMinutes || 60));
            setShowLogModal(true);
          }}
          onDelete={() => {
            if (selectedBlock.occurrenceId) handleCancelOccurrence(selectedBlock.occurrenceId);
          }}
          onSkip={() => {
            if (selectedBlock.occurrenceId) handleSkipOccurrence(selectedBlock.occurrenceId);
          }}
          onSave={async (newDate, newStartTime, newDurationMinutes) => {
            if (!selectedBlock.occurrenceId) return;
            setSubmitting(true);
            try {
              const res = await fetch("/api/calendar/mutate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  actionType: "reschedule_occurrence",
                  payload: {
                    occurrenceId: selectedBlock.occurrenceId,
                    newDateOnly: newDate,
                    newStartTime,
                    newDurationMinutes,
                  },
                }),
              });
              const json = await res.json();
              if (res.ok && (json.ok || json.success)) {
                setSelectedBlock(null);
                loadData();
                loadTodayData();
              } else {
                alert(json.error?.message || json.error || "Failed to save changes");
              }
            } catch (err: any) {
              alert(err.message || "Network error");
            } finally {
              setSubmitting(false);
            }
          }}
          submitting={submitting}
        />
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



      {/* ─── FLOATING CARD (Google Calendar "Pick Up" Style) ─── */}
      {/* This renders as a fixed-position portal that follows the pointer during drag */}
      {isDragging && dragState && pointerPos && (
        <div
          className="fixed pointer-events-none z-[9999] select-none"
          style={{
            left: `${pointerPos.x}px`,
            top: `${pointerPos.y}px`,
            transform: "translate(-50%, -120%) rotate(1.5deg) scale(1.05)",
            transformOrigin: "center bottom",
          }}
        >
          <div
            className="bg-[#1C1E24]/95 backdrop-blur-md border-2 border-[#E8414A] rounded-xl px-4 py-3 shadow-[0_20px_50px_rgba(232,65,74,0.45),0_0_0_1px_rgba(232,65,74,0.2)] min-w-[200px] max-w-[260px]"
            style={{
              animation: "floatCardIn 0.15s ease-out",
            }}
          >
            {/* Card header with "Picked up" indicator */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E8414A] shadow-[0_0_8px_rgba(232,65,74,0.6)]" />
              <span className="text-xs font-bold text-white truncate flex-1">
                {dragState.title}
              </span>
            </div>

            {/* Duration chip */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-gray-400">
                {formatDuration(dragState.duration || 60)}
              </span>
              {hoverSlot ? (
                <span className="text-[10px] font-bold text-[#E8414A] bg-[#E8414A]/15 px-2 py-0.5 rounded-full border border-[#E8414A]/30">
                  {formatMinutesToTime(hoverSlot.hour * 60)} • {hoverSlot.date.split("-").slice(1).join("/")}
                </span>
              ) : (
                <span className="text-[10px] text-gray-500 italic">
                  Drag to a time slot
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inject keyframe animation for floating card entrance */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes floatCardIn {
          0% {
            opacity: 0;
            transform: translate(-50%, -100%) scale(0.9) rotate(0deg);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -120%) rotate(1.5deg) scale(1.05);
          }
        }
      `}} />
    </div>
  );
}
