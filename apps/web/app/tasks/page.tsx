"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Plus,
  Check,
  Circle,
  Timer,
  Play,
  Pause,
  Search,
  Hourglass,
  ChevronDown,
  X,
  Trash2,
  Layers,
  Calendar,
  Clock,
} from "lucide-react";
import { CustomDatePicker, CustomTimePicker } from "@/components/ui/CustomDateTimePicker";

interface Subtask {
  id?: string;
  title: string;
  done: boolean;
}

interface TaskItem {
  id: string;
  title: string;
  description?: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "waiting" | "blocked" | "completed";
  dueDate?: string;
  dueTime?: string;
  completedAt?: string;
  subtasks: Subtask[];
  blockReason?: string;
  estimatedDuration?: number;
}

type TabFilter = "all" | "in_progress" | "todo" | "waiting" | "completed";
type ViewMode = "my_tasks" | "backlog";
type FocusMode = "controlled" | "immersive";

export default function ExecutePage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("my_tasks");
  const [focusMode, setFocusMode] = useState<FocusMode>("controlled");

  // Focus Timer State
  const [activeFocusTaskId, setActiveFocusTaskId] = useState<string | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(45 * 60);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // New Task Modal State (Deep Form)
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"high" | "medium" | "low">("medium");
  const [newTaskStatus, setNewTaskStatus] = useState<"pending" | "in_progress" | "waiting">("pending");
  const [newTaskDueDate, setNewTaskDueDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [newTaskDueTime, setNewTaskDueTime] = useState("");
  const [newTaskRecurringType, setNewTaskRecurringType] = useState<"none" | "daily" | "weekly" | "custom">("none");
  const [newTaskRecurringInterval, setNewTaskRecurringInterval] = useState("1");
  const [newTaskGoalId, setNewTaskGoalId] = useState<string | null>(null);
  const [newTaskEnergyCost, setNewTaskEnergyCost] = useState(5);
  const [newTaskDuration, setNewTaskDuration] = useState("45");
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<string[]>([]);
  const [newSubtaskInput, setNewSubtaskInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableGoals, setAvailableGoals] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/goals/list")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAvailableGoals(data);
      })
      .catch((err) => console.error("Failed to fetch goals for task form:", err));
  }, []);

  // Task Details Modal / Drawer
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch Tasks from Database API
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks/list?filter=all");
      if (res.ok) {
        const json = await res.json();
        const rawList = json.all || [];

        const mapped: TaskItem[] = rawList.map((t: any) => {
          const rawStatus = (t.status || "pending").toLowerCase();
          let normalizedStatus: TaskItem["status"] = "pending";
          if (rawStatus === "completed") normalizedStatus = "completed";
          else if (rawStatus === "in_progress") normalizedStatus = "in_progress";
          else if (rawStatus === "waiting" || rawStatus === "blocked") normalizedStatus = "waiting";
          else normalizedStatus = "pending";

          const rawPriority = (t.priority || "medium").toLowerCase();
          const normalizedPriority: TaskItem["priority"] =
            rawPriority === "high" ? "high" : rawPriority === "low" ? "low" : "medium";

          const subtasks: Subtask[] = Array.isArray(t.subtasks)
            ? t.subtasks.map((s: any, idx: number) => ({
                id: s._id || s.id || `sub-${idx}`,
                title: typeof s === "string" ? s : s.title || "",
                done: Boolean(s.done),
              }))
            : [];

          return {
            id: String(t._id || t.id),
            title: t.title || "Untitled Task",
            description: t.description || "",
            priority: normalizedPriority,
            status: normalizedStatus,
            dueDate: t.dueDate || undefined,
            dueTime: t.dueTime || undefined,
            completedAt: t.completedAt ? new Date(t.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : undefined,
            subtasks,
            blockReason: t.blockReason || undefined,
            estimatedDuration: t.metadata?.estimatedDuration || 45,
          };
        });

        // Seed with sample context if user's database is brand new, else use real DB tasks
        if (mapped.length === 0) {
          const initialMock: TaskItem[] = [
            {
              id: "task-1",
              title: "Systems Architecture & Service Flow",
              priority: "high",
              status: "in_progress",
              dueTime: "09:45 – 11:30",
              estimatedDuration: 45,
              subtasks: [
                { id: "s1", title: "Review boundary contracts", done: true },
                { id: "s2", title: "Map event telemetry stream", done: true },
                { id: "s3", title: "Draft schema migration", done: true },
                { id: "s4", title: "Verify optimistic concurrency", done: false },
              ],
            },
            {
              id: "task-2",
              title: "Review Elena's Horizon Brief",
              priority: "medium",
              status: "in_progress",
              dueTime: "Scheduled 14:00",
              estimatedDuration: 30,
              subtasks: [
                { id: "s5", title: "Audit Q4 commitments", done: true },
                { id: "s6", title: "Send advisory annotations", done: false },
              ],
            },
            {
              id: "task-3",
              title: "Prepare Q4 Operational Budget Allocation",
              priority: "medium",
              status: "pending",
              dueDate: "Due Tomorrow",
              estimatedDuration: 60,
              subtasks: [
                { id: "s7", title: "Extract cost centers", done: false },
                { id: "s8", title: "Draft variance report", done: false },
                { id: "s9", title: "Sync with Finance VP", done: false },
              ],
            },
            {
              id: "task-4",
              title: "Sunset Reflection & Evening Boundary Note",
              priority: "low",
              status: "pending",
              dueTime: "Scheduled 17:30",
              estimatedDuration: 20,
              subtasks: [],
            },
            {
              id: "task-5",
              title: "Distributed Cache Resilience Testing",
              priority: "high",
              status: "waiting",
              blockReason: "Waiting for Systems Architecture to finish.",
              estimatedDuration: 90,
              subtasks: [],
            },
            {
              id: "task-6",
              title: "Executive Morning Sync & Alignment Notes",
              priority: "medium",
              status: "completed",
              completedAt: "09:15",
              subtasks: [],
            },
            {
              id: "task-7",
              title: "Review PR #842 — Dashboard Telemetry Hook",
              priority: "high",
              status: "completed",
              completedAt: "09:35",
              subtasks: [],
            },
          ];
          setTasks(initialMock);
        } else {
          // If the DB has tasks but none in progress, promote the first high/medium pending task to in_progress for active flow
          const hasInProgress = mapped.some((t) => t.status === "in_progress");
          if (!hasInProgress && mapped.some((t) => t.status === "pending")) {
            const firstPendingIdx = mapped.findIndex((t) => t.status === "pending");
            if (firstPendingIdx !== -1) {
              mapped[firstPendingIdx].status = "in_progress";
            }
          }
          setTasks(mapped);
        }
      }
    } catch (e) {
      console.error("Failed to fetch tasks for execute workspace:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Global Keyboard Shortcuts (Cmd+F / Ctrl+F for Search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setIsNewTaskModalOpen(false);
        setSelectedTask(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Timer Effect
  useEffect(() => {
    if (isTimerRunning && timerSecondsLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimerSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, timerSecondsLeft]);

  // Determine Focused Task for Hero Banner
  const focusedTask = useMemo(() => {
    if (activeFocusTaskId) {
      const match = tasks.find((t) => t.id === activeFocusTaskId);
      if (match) return match;
    }
    // Default to the first in-progress task, or first pending task
    return (
      tasks.find((t) => t.status === "in_progress") ||
      tasks.find((t) => t.status === "pending") ||
      tasks[0] ||
      null
    );
  }, [tasks, activeFocusTaskId]);

  const formatTimer = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Toggle Completion
  const toggleComplete = async (taskId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const isDone = task.status === "completed";
    const newStatus: TaskItem["status"] = isDone ? "pending" : "completed";
    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: newStatus,
              completedAt: isDone ? undefined : nowTime,
            }
          : t
      )
    );

    try {
      await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          action: isDone ? "uncomplete" : "complete",
        }),
      });
    } catch (err) {
      console.error("Failed to complete task on backend:", err);
      fetchTasks();
    }
  };

  // Create Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const subtasksList = newTaskSubtasks.map((title) => ({ title, done: false }));
    const durMinutes = parseInt(newTaskDuration, 10) || 45;

    let recurring = null;
    if (newTaskRecurringType !== "none") {
      recurring = {
        type: newTaskRecurringType,
        interval: newTaskRecurringType === "custom" ? parseInt(newTaskRecurringInterval, 10) || 1 : 1,
      };
    }

    // Optimistic ID
    const tempId = `temp-${Date.now()}`;
    const optimisticTask: TaskItem = {
      id: tempId,
      title: newTaskTitle.trim(),
      description: newTaskDescription.trim(),
      priority: newTaskPriority,
      status: newTaskStatus,
      dueDate: newTaskDueDate || undefined,
      dueTime: newTaskDueTime || undefined,
      estimatedDuration: durMinutes,
      subtasks: subtasksList,
    };

    setTasks((prev) => [optimisticTask, ...prev]);
    setIsNewTaskModalOpen(false);

    try {
      const res = await fetch("/api/tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          description: newTaskDescription.trim(),
          priority: newTaskPriority,
          status: newTaskStatus,
          dueDate: newTaskDueDate,
          dueTime: newTaskDueTime || null,
          recurring,
          goalId: newTaskGoalId || null,
          metadata: {
            energyCost: newTaskEnergyCost,
            estimatedDuration: durMinutes,
          },
          subtasks: subtasksList,
        }),
      });

      if (res.ok) {
        fetchTasks();
      }
    } catch (err) {
      console.error("Failed to save new task:", err);
      fetchTasks();
    } finally {
      setIsSubmitting(false);
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskDueTime("");
      setNewTaskRecurringType("none");
      setNewTaskGoalId(null);
      setNewTaskEnergyCost(5);
      setNewTaskDuration("45");
      setNewTaskSubtasks([]);
      setNewSubtaskInput("");
    }
  };

  // Toggle Subtask
  const toggleSubtask = async (taskId: string, subtaskIdx: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = [...task.subtasks];
    if (updatedSubtasks[subtaskIdx]) {
      updatedSubtasks[subtaskIdx] = {
        ...updatedSubtasks[subtaskIdx],
        done: !updatedSubtasks[subtaskIdx].done,
      };
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, subtasks: updatedSubtasks } : t))
    );

    try {
      await fetch("/api/tasks/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          subtasks: updatedSubtasks,
        }),
      });
    } catch (err) {
      console.error("Failed to update subtasks:", err);
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    if (selectedTask?.id === taskId) setSelectedTask(null);

    try {
      await fetch("/api/tasks/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
    } catch (err) {
      console.error("Failed to delete task:", err);
      fetchTasks();
    }
  };

  // Filter Tasks by Search Query and Tab
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // View Mode: Backlog vs My Tasks
    if (viewMode === "backlog") {
      result = result.filter(
        (t) => t.status === "waiting" || t.status === "pending" || !t.dueTime
      );
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.subtasks.some((s) => s.title.toLowerCase().includes(q))
      );
    }

    return result;
  }, [tasks, viewMode, searchQuery]);

  // Grouped task lists
  const inProgressTasks = useMemo(
    () => filteredTasks.filter((t) => t.status === "in_progress"),
    [filteredTasks]
  );

  const todoTasks = useMemo(
    () => filteredTasks.filter((t) => t.status === "pending"),
    [filteredTasks]
  );

  const waitingTasks = useMemo(
    () => filteredTasks.filter((t) => t.status === "waiting" || t.status === "blocked"),
    [filteredTasks]
  );

  const completedTasks = useMemo(
    () => filteredTasks.filter((t) => t.status === "completed"),
    [filteredTasks]
  );

  return (
    <div className="relative w-full h-full min-h-full bg-[#111113] text-[#F7F5F0] p-6 lg:p-7 flex flex-col gap-5 select-none font-sans overflow-hidden">
      
      {/* Background Precise Coordinate Grid Lines (Matching Cockpit & Timeline) */}
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

      {/* TOP INTEGRATED HEADER: Execute Title, View Mode Switcher, Search & New Task */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#23242A]/80 flex-shrink-0 relative z-10">
        {/* Left: Title & My Tasks / Backlog Switcher */}
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-[#F7F5F0]">
            Execute
          </h1>
          <div className="flex items-center bg-[#0D0D0F] p-0.5 rounded-xl border border-[#23242A] text-xs">
            <button
              type="button"
              onClick={() => setViewMode("my_tasks")}
              className={`px-3 py-1 rounded-lg transition-all ${
                viewMode === "my_tasks"
                  ? "bg-[#1E1F24] text-[#F7F5F0] font-medium shadow-sm"
                  : "text-[#C5C2BA]/70 hover:text-[#F7F5F0]"
              }`}
            >
              My Tasks
            </button>
            <button
              type="button"
              onClick={() => setViewMode("backlog")}
              className={`px-3 py-1 rounded-lg transition-all ${
                viewMode === "backlog"
                  ? "bg-[#1E1F24] text-[#F7F5F0] font-medium shadow-sm"
                  : "text-[#C5C2BA]/70 hover:text-[#F7F5F0]"
              }`}
            >
              Backlog
            </button>
          </div>
        </div>

        {/* Right: Search Filter Input & New Task Action Button */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center w-60 sm:w-64">
            <Search size={14} className="absolute left-2.5 text-[#C5C2BA]/50 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter tasks..."
              className="w-full bg-[#17171A] border border-[#23242A] rounded-xl pl-8 pr-9 py-1.5 text-xs text-[#F7F5F0] placeholder:text-[#C5C2BA]/40 focus:border-[#D98B2B]/50 focus:ring-0 outline-none transition-colors"
            />
            <kbd className="absolute right-2 font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#111113] border border-[#23242A] text-[#C5C2BA]/60">
              ⌘F
            </kbd>
          </div>

          <button
            type="button"
            onClick={() => setIsNewTaskModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#E29D52] hover:bg-[#E29D52]/90 text-[#1A0F00] font-semibold text-xs shadow-md transition-all active:scale-95"
          >
            <Plus size={16} className="font-bold stroke-[2.5]" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* SECONDARY FILTER ROW: Status Tabs (All, In progress, To do, Waiting, Completed) */}
      <div className="flex items-center justify-between gap-4 flex-shrink-0 relative z-10">
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeTab === "all"
                ? "bg-[#1E1F24] text-[#F7F5F0] font-medium border border-[#23242A] shadow-sm"
                : "text-[#C5C2BA]/70 hover:text-[#F7F5F0] hover:bg-[#17171A]"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("in_progress")}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeTab === "in_progress"
                ? "bg-[#1E1F24] text-[#F7F5F0] font-medium border border-[#23242A] shadow-sm"
                : "text-[#C5C2BA]/70 hover:text-[#F7F5F0] hover:bg-[#17171A]"
            }`}
          >
            In progress
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("todo")}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeTab === "todo"
                ? "bg-[#1E1F24] text-[#F7F5F0] font-medium border border-[#23242A] shadow-sm"
                : "text-[#C5C2BA]/70 hover:text-[#F7F5F0] hover:bg-[#17171A]"
            }`}
          >
            To do
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("waiting")}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeTab === "waiting"
                ? "bg-[#1E1F24] text-[#F7F5F0] font-medium border border-[#23242A] shadow-sm"
                : "text-[#C5C2BA]/70 hover:text-[#F7F5F0] hover:bg-[#17171A]"
            }`}
          >
            Waiting
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("completed")}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeTab === "completed"
                ? "bg-[#1E1F24] text-[#F7F5F0] font-medium border border-[#23242A] shadow-sm"
                : "text-[#C5C2BA]/70 hover:text-[#F7F5F0] hover:bg-[#17171A]"
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {/* HERO DEEP FOCUS BANNER (Controlled / Immersive Flow Runner) */}
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl bg-[#17171A] border border-[#23242A] flex-shrink-0 relative z-10 shadow-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <Timer size={18} className="text-[#E29D52] shrink-0" />
          <span className="text-xs font-medium text-[#F7F5F0] truncate">
            {focusedTask ? focusedTask.title : "Systems Architecture & Service Flow"}
          </span>
          <span className="text-xs text-[#C5C2BA]/60 font-mono flex-shrink-0">
            {isTimerRunning
              ? `· ${formatTimer(timerSecondsLeft)} remaining`
              : `· ${focusedTask?.estimatedDuration || 45}m`}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Mode Switcher: Controlled vs Immersive */}
          <div className="flex items-center bg-[#111113] p-0.5 rounded-lg border border-[#23242A] text-[11px]">
            <button
              type="button"
              onClick={() => setFocusMode("controlled")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                focusMode === "controlled"
                  ? "bg-[#1E1F24] text-[#F7F5F0] font-medium"
                  : "text-[#C5C2BA]/70 hover:text-[#F7F5F0]"
              }`}
            >
              Controlled
            </button>
            <button
              type="button"
              onClick={() => setFocusMode("immersive")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                focusMode === "immersive"
                  ? "bg-[#1E1F24] text-[#F7F5F0] font-medium"
                  : "text-[#C5C2BA]/70 hover:text-[#F7F5F0]"
              }`}
            >
              Immersive
            </button>
          </div>

          {/* Start / Pause Focus Button */}
          <button
            type="button"
            onClick={() => {
              if (focusedTask) {
                setActiveFocusTaskId(focusedTask.id);
              }
              setIsTimerRunning(!isTimerRunning);
            }}
            className={`px-3.5 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow ${
              isTimerRunning
                ? "bg-[#281A10] text-[#E29D52] border border-[#E29D52]/50 hover:bg-[#342214]"
                : "bg-[#E29D52] hover:bg-[#E29D52]/90 text-[#1A0F00]"
            }`}
          >
            {isTimerRunning ? (
              <>
                <Pause size={14} className="fill-current" />
                <span>Pause Focus</span>
              </>
            ) : (
              <>
                <Play size={14} className="fill-current" />
                <span>Start Focus</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* MAIN TASK SECTIONS (Scrollable Container) */}
      <div className="flex-1 w-full overflow-y-auto pr-1 flex flex-col gap-5 min-h-0 relative z-10 custom-h-scrollbar">
        {loading && (
          <div className="flex items-center justify-center py-12 text-xs text-[#85827A] font-mono">
            Synchronizing execution state with database...
          </div>
        )}

        {!loading && filteredTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Layers size={36} className="text-[#32343D] mb-3 stroke-1" />
            <p className="text-sm font-medium text-[#F7F5F0]">No commitments in this view</p>
            <p className="text-xs text-[#85827A] mt-1 max-w-sm">
              All tasks in this filter have been executed or scheduled. Use + New Task to queue high-priority objectives.
            </p>
          </div>
        )}

        {/* SECTION 1: IN PROGRESS */}
        {(activeTab === "all" || activeTab === "in_progress") && inProgressTasks.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-[#C5C2BA]/70 px-1 select-none">
              In progress
            </h2>

            {inProgressTasks.map((task) => {
              const completedSubtasks = task.subtasks.filter((s) => s.done).length;
              const totalSubtasks = task.subtasks.length;
              const isHigh = task.priority === "high";

              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`p-3.5 rounded-xl bg-[#17171A] hover:bg-[#1E1F24] border border-[#23242A] transition-all cursor-pointer flex items-center justify-between gap-4 ${
                    isHigh
                      ? "border-l-[3px] border-l-[#D98B2B]"
                      : "border-l-[3px] border-l-blue-400"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Bullseye / Active Focus Icon */}
                    <button
                      type="button"
                      onClick={(e) => toggleComplete(task.id, e)}
                      title="Mark as completed"
                      className="group"
                    >
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                          isHigh
                            ? "border-[#D98B2B] bg-[#D98B2B]/20 group-hover:border-emerald-400"
                            : "border-[#23242A] group-hover:border-emerald-400"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isHigh ? "bg-[#ffb86c]" : "bg-blue-400/80"
                          }`}
                        />
                      </div>
                    </button>

                    {/* Task Title & Details */}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#F7F5F0] truncate">
                          {task.title}
                        </span>

                        {/* Priority Pill */}
                        {task.priority === "high" && (
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#D98B2B]/15 text-[#ffb86c] border border-[#D98B2B]/30 shrink-0">
                            High Priority
                          </span>
                        )}
                        {task.priority === "medium" && (
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 shrink-0">
                            Medium
                          </span>
                        )}
                        {task.priority === "low" && (
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white/5 text-[#C5C2BA] border border-white/10 shrink-0">
                            Low
                          </span>
                        )}
                      </div>

                      {/* Subtitle: Time & Subtasks */}
                      <div className="flex items-center gap-2.5 text-xs text-[#C5C2BA]/60 mt-0.5 font-mono">
                        {task.dueTime ? (
                          <span>{task.dueTime}</span>
                        ) : task.dueDate ? (
                          <span>Due {task.dueDate}</span>
                        ) : (
                          <span>09:45 – 11:30</span>
                        )}
                        {totalSubtasks > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              {completedSubtasks} of {totalSubtasks} subtasks
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Action Pill */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFocusTaskId(task.id);
                        setTimerSecondsLeft((task.estimatedDuration || 45) * 60);
                        setIsTimerRunning(true);
                      }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-mono text-[#D98B2B] hover:bg-[#D98B2B]/10 border border-[#D98B2B]/30 transition-all opacity-0 group-hover:opacity-100 sm:opacity-100"
                    >
                      Focus
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* SECTION 2: TO DO */}
        {(activeTab === "all" || activeTab === "todo") && todoTasks.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-[#C5C2BA]/70 px-1 select-none">
              To do
            </h2>

            {todoTasks.map((task) => {
              const completedSubtasks = task.subtasks.filter((s) => s.done).length;
              const totalSubtasks = task.subtasks.length;

              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className="p-3.5 rounded-xl bg-[#17171A]/80 hover:bg-[#1E1F24] border border-[#23242A] transition-all cursor-pointer flex items-center justify-between gap-4 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Uncompleted Circle Checkbox */}
                    <button
                      type="button"
                      onClick={(e) => toggleComplete(task.id, e)}
                      title="Click to complete"
                      className="w-4 h-4 rounded-full border border-[#3E4049] hover:border-[#D98B2B] flex items-center justify-center flex-shrink-0 transition-colors"
                    />

                    {/* Title & Subtasks */}
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-[#F7F5F0] truncate">
                        {task.title}
                      </span>
                      <div className="flex items-center gap-2.5 text-xs text-[#C5C2BA]/60 mt-0.5 font-mono">
                        {task.dueDate ? (
                          <span>{task.dueDate}</span>
                        ) : task.dueTime ? (
                          <span>Scheduled {task.dueTime}</span>
                        ) : (
                          <span>Due Tomorrow</span>
                        )}
                        {totalSubtasks > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              {completedSubtasks} of {totalSubtasks} subtasks
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Priority / Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {task.priority === "high" && (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#D98B2B]/15 text-[#ffb86c] border border-[#D98B2B]/30">
                        High
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* SECTION 3: WAITING (BLOCKED) */}
        {(activeTab === "all" || activeTab === "waiting") && waitingTasks.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-[#C5C2BA]/70 px-1 select-none">
              Waiting
            </h2>

            {waitingTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className="p-3.5 rounded-xl bg-[#17171A]/80 hover:bg-[#1E1F24] border border-[#23242A] border-l-[3px] border-l-amber-400 transition-all cursor-pointer flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Hourglass Icon */}
                  <div className="w-4 h-4 rounded-full border border-amber-500/40 flex items-center justify-center flex-shrink-0">
                    <Hourglass size={10} className="text-amber-400" />
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-[#F7F5F0] truncate">
                      {task.title}
                    </span>
                    <span className="text-xs text-amber-300/80 mt-0.5">
                      {task.blockReason || "Waiting for prerequisite task to finish."}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SECTION 4: COMPLETED (Collapsible Details) */}
        {(activeTab === "all" || activeTab === "completed") && completedTasks.length > 0 && (
          <details className="flex flex-col gap-2 pt-2 border-t border-[#23242A]/60" open>
            <summary className="text-xs font-medium text-[#C5C2BA]/70 px-1 cursor-pointer select-none flex items-center gap-1.5 list-none">
              <ChevronDown size={14} className="text-emerald-400" />
              <span>Completed ({completedTasks.length})</span>
            </summary>

            <div className="flex flex-col gap-2 mt-2">
              {completedTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className="p-3 rounded-xl bg-[#111113]/70 border border-[#23242A]/60 flex items-center justify-between text-xs cursor-pointer hover:bg-[#17171A]/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Completed Checkmark Circle */}
                    <button
                      type="button"
                      onClick={(e) => toggleComplete(task.id, e)}
                      title="Click to restore"
                      className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0 hover:bg-emerald-500/40 transition-colors"
                    >
                      <Check size={11} className="font-bold stroke-[3]" />
                    </button>

                    <span className="text-[#C5C2BA] line-through truncate">
                      {task.title}
                    </span>
                  </div>

                  <span className="font-mono text-[11px] text-[#C5C2BA]/50 shrink-0 ml-2">
                    {task.completedAt ? `Completed ${task.completedAt}` : "Completed"}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* NEW TASK DEEP FORM MODAL (Matches Screenshots 3, 4, 5) */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#141518] border border-[#23242A] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#23242A] bg-[#17181C]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-[#1F2023] border border-[#2A2B2F] flex items-center justify-center text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#2A2B2F] transition-colors"
                >
                  <X size={16} />
                </button>
                <h2 className="text-lg font-bold text-[#F7F5F0] tracking-tight">New Task</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsNewTaskModalOpen(false)}
                className="text-xs text-[#85827A] hover:text-[#C5C2BA] font-medium"
              >
                Close
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleCreateTask} className="flex-1 overflow-y-auto p-6 space-y-6 custom-h-scrollbar">
              {/* SECTION: WHAT NEEDS TO BE DONE? */}
              <div>
                <label className="text-[10px] font-bold text-[#85827A] uppercase tracking-widest block mb-2">
                  What needs to be done?
                </label>
                <div className="space-y-2.5">
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Task title..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="w-full bg-[#18191E] border border-[#262830] rounded-xl px-4 py-3 text-sm font-semibold text-[#F7F5F0] placeholder:text-[#55534E] focus:border-[#E29D52] focus:outline-none transition-colors"
                  />
                  <textarea
                    placeholder="Add context or notes... (optional)"
                    value={newTaskDescription}
                    onChange={(e) => setNewTaskDescription(e.target.value)}
                    className="w-full bg-[#18191E] border border-[#262830] rounded-xl px-4 py-2.5 text-xs text-[#C5C2BA] placeholder:text-[#55534E] focus:border-[#E29D52] focus:outline-none transition-colors min-h-[75px] resize-none"
                  />
                </div>
              </div>

              {/* SECTION: SCHEDULE */}
              <div>
                <label className="text-[10px] font-bold text-[#85827A] uppercase tracking-widest block mb-2">
                  Schedule
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CustomDatePicker
                    value={newTaskDueDate}
                    onChange={(val) => setNewTaskDueDate(val)}
                  />
                  <CustomTimePicker
                    value={newTaskDueTime}
                    onChange={(val) => setNewTaskDueTime(val)}
                  />
                </div>
              </div>

              {/* SECTION: PRIORITY */}
              <div>
                <label className="text-[10px] font-bold text-[#85827A] uppercase tracking-widest block mb-2">
                  Priority
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {(["low", "medium", "high"] as const).map((p) => {
                    const isSelected = newTaskPriority === p;
                    const colors = {
                      low: isSelected ? "border-[#A0A2A8]/50 text-[#C5C2BA] bg-[#22242B]" : "border-[#262830] text-[#71737D] bg-[#18191E]",
                      medium: isSelected ? "border-[#E29D52] text-[#E29D52] bg-[#E29D52]/10" : "border-[#262830] text-[#71737D] bg-[#18191E]",
                      high: isSelected ? "border-[#E8414A] text-[#E8414A] bg-[#E8414A]/10" : "border-[#262830] text-[#71737D] bg-[#18191E]",
                    };
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewTaskPriority(p)}
                        className={`py-2.5 rounded-xl border font-bold text-xs capitalize transition-all ${colors[p]}`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION: SUBTASKS */}
              <div>
                <label className="text-[10px] font-bold text-[#85827A] uppercase tracking-widest block mb-2">
                  Subtasks ({newTaskSubtasks.length})
                </label>
                {newTaskSubtasks.length > 0 && (
                  <div className="space-y-1.5 mb-2.5">
                    {newTaskSubtasks.map((st, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#18191E] border border-[#262830] text-xs text-[#F7F5F0]"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#E29D52] flex-shrink-0" />
                          <span className="truncate">{st}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNewTaskSubtasks(newTaskSubtasks.filter((_, idx) => idx !== i))}
                          className="text-[#85827A] hover:text-[#E8414A] p-0.5 ml-2"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a subtask..."
                    value={newSubtaskInput}
                    onChange={(e) => setNewSubtaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (newSubtaskInput.trim()) {
                          setNewTaskSubtasks([...newTaskSubtasks, newSubtaskInput.trim()]);
                          setNewSubtaskInput("");
                        }
                      }
                    }}
                    className="flex-1 bg-[#18191E] border border-[#262830] rounded-xl px-3.5 py-2.5 text-xs text-[#F7F5F0] placeholder:text-[#55534E] focus:border-[#E29D52] focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newSubtaskInput.trim()) {
                        setNewTaskSubtasks([...newTaskSubtasks, newSubtaskInput.trim()]);
                        setNewSubtaskInput("");
                      }
                    }}
                    className="w-10 rounded-xl bg-[#E29D52]/10 border border-[#E29D52]/30 flex items-center justify-center text-[#E29D52] hover:bg-[#E29D52]/20 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* SECTION: REPEATS */}
              <div>
                <label className="text-[10px] font-bold text-[#85827A] uppercase tracking-widest block mb-2">
                  Repeats
                </label>
                <div className="flex flex-wrap gap-2">
                  {(["none", "daily", "weekly", "custom"] as const).map((rt) => (
                    <button
                      key={rt}
                      type="button"
                      onClick={() => setNewTaskRecurringType(rt)}
                      className={`px-4 py-2 rounded-xl border text-xs capitalize transition-colors font-semibold ${
                        newTaskRecurringType === rt
                          ? "bg-[#E29D52]/10 border-[#E29D52] text-[#E29D52]"
                          : "bg-[#18191E] border-[#262830] text-[#71737D] hover:bg-[#22242B]"
                      }`}
                    >
                      {rt}
                    </button>
                  ))}
                </div>
                {newTaskRecurringType === "custom" && (
                  <div className="flex items-center gap-2.5 mt-2.5 bg-[#18191E] border border-[#262830] rounded-xl px-3.5 py-2 max-w-fit">
                    <span className="text-xs text-[#85827A]">Every</span>
                    <input
                      type="number"
                      min="1"
                      value={newTaskRecurringInterval}
                      onChange={(e) => setNewTaskRecurringInterval(e.target.value)}
                      className="bg-[#111113] border border-[#262830] text-center font-bold text-xs text-[#F7F5F0] rounded-lg w-14 py-1 focus:border-[#E29D52] focus:outline-none"
                    />
                    <span className="text-xs text-[#85827A]">days</span>
                  </div>
                )}
              </div>

              {/* SECTION: LINK TO GOAL */}
              <div>
                <label className="text-[10px] font-bold text-[#85827A] uppercase tracking-widest block mb-2">
                  Link to Goal
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNewTaskGoalId(null)}
                    className={`px-4 py-2 rounded-xl border text-xs transition-colors font-semibold ${
                      newTaskGoalId === null
                        ? "bg-[#E29D52]/15 border-[#E29D52] text-[#E29D52]"
                        : "bg-[#18191E] border-[#262830] text-[#71737D] hover:bg-[#22242B]"
                    }`}
                  >
                    None
                  </button>
                  {availableGoals.map((g: any) => {
                    const gId = g.id || g._id;
                    const isSelected = newTaskGoalId === gId;
                    return (
                      <button
                        key={gId}
                        type="button"
                        onClick={() => setNewTaskGoalId(gId)}
                        className={`px-4 py-2 rounded-xl border text-xs transition-colors font-semibold max-w-[280px] truncate ${
                          isSelected
                            ? "bg-[#E29D52]/15 border-[#E29D52] text-[#E29D52]"
                            : "bg-[#18191E] border-[#262830] text-[#71737D] hover:bg-[#22242B]"
                        }`}
                      >
                        {g.title}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION: ENERGY COST — X/10 */}
              <div>
                <label className="text-[10px] font-bold text-[#85827A] uppercase tracking-widest block mb-2">
                  Energy Cost — {newTaskEnergyCost}/10
                </label>
                <div className="bg-[#18191E] border border-[#262830] rounded-xl p-3.5">
                  <div className="flex items-center justify-between gap-1 sm:gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setNewTaskEnergyCost(v)}
                        className={`flex-1 aspect-square rounded-lg flex items-center justify-center transition-all ${
                          newTaskEnergyCost >= v
                            ? "bg-[#E29D52]/20 border border-[#E29D52]/40"
                            : "bg-[#22242B] border border-transparent hover:bg-[#2A2B33]"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            newTaskEnergyCost >= v ? "bg-[#E29D52]" : "bg-[#55534E]"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-2 text-[10px] font-bold text-[#85827A] uppercase tracking-widest">
                    <span>Low</span>
                    <span>High</span>
                  </div>
                </div>
              </div>

              {/* SECTION: ESTIMATED DURATION */}
              <div>
                <label className="text-[10px] font-bold text-[#85827A] uppercase tracking-widest block mb-2">
                  Estimated Duration
                </label>
                <div className="flex items-center bg-[#18191E] border border-[#262830] rounded-xl px-4 py-2.5 focus-within:border-[#E29D52] transition-colors max-w-sm">
                  <Timer size={16} className="text-[#85827A] mr-3" />
                  <input
                    type="number"
                    min="5"
                    step="5"
                    placeholder="Minutes (e.g. 45)"
                    value={newTaskDuration}
                    onChange={(e) => setNewTaskDuration(e.target.value)}
                    className="flex-1 bg-transparent text-xs font-bold text-[#F7F5F0] focus:outline-none placeholder:text-[#55534E]"
                  />
                  <span className="text-xs font-bold text-[#85827A] ml-2">min</span>
                </div>
              </div>

              {/* SUBMIT BUTTON */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !newTaskTitle.trim()}
                  className="w-full py-3.5 rounded-xl bg-[#E29D52] hover:bg-[#E29D52]/90 disabled:opacity-50 text-[#1A0F00] font-bold text-xs uppercase tracking-wider transition-all shadow-lg active:scale-98 flex items-center justify-center"
                >
                  {isSubmitting ? "Creating Task..." : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TASK DETAIL / EDIT MODAL */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#17171A] border border-[#23242A] rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-start justify-between pb-3 border-b border-[#23242A]">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#D98B2B]">
                  {selectedTask.status.replace("_", " ")}
                </span>
                <h3 className="text-base font-semibold text-[#F7F5F0] mt-0.5">
                  {selectedTask.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="p-1 rounded-lg text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#23242A] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Subtasks Checklist */}
            <div>
              <h4 className="text-xs font-mono uppercase tracking-wider text-[#C5C2BA]/70 mb-2">
                Subtasks ({selectedTask.subtasks.filter((s) => s.done).length} / {selectedTask.subtasks.length})
              </h4>
              {selectedTask.subtasks.length === 0 ? (
                <p className="text-xs text-[#85827A] italic">No subtasks defined for this task.</p>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                  {selectedTask.subtasks.map((st, i) => (
                    <div
                      key={st.id || i}
                      onClick={() => toggleSubtask(selectedTask.id, i)}
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-[#111113] border border-[#23242A] cursor-pointer hover:border-[#383A40] transition-colors"
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                          st.done
                            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                            : "border-[#3E4049]"
                        }`}
                      >
                        {st.done && <Check size={10} className="stroke-[3]" />}
                      </div>
                      <span
                        className={`text-xs ${
                          st.done ? "text-[#77756F] line-through" : "text-[#F7F5F0]"
                        }`}
                      >
                        {st.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#23242A]">
              <button
                type="button"
                onClick={() => handleDeleteTask(selectedTask.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#E8414A] hover:bg-[#E8414A]/10 border border-[#E8414A]/20 transition-colors"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    toggleComplete(selectedTask.id);
                    setSelectedTask(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[#23242A] hover:bg-[#2F3038] text-xs font-medium text-[#F7F5F0] transition-colors"
                >
                  {selectedTask.status === "completed" ? "Mark Pending" : "Mark Completed"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveFocusTaskId(selectedTask.id);
                    setTimerSecondsLeft((selectedTask.estimatedDuration || 45) * 60);
                    setIsTimerRunning(true);
                    setSelectedTask(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[#E29D52] hover:bg-[#E29D52]/90 text-[#1A0F00] font-semibold text-xs shadow transition-all active:scale-95"
                >
                  Start Focus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
