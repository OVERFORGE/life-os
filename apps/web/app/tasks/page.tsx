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
} from "lucide-react";

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

  // New Task Modal State
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"high" | "medium" | "low">("medium");
  const [newTaskStatus, setNewTaskStatus] = useState<"pending" | "in_progress" | "waiting">("pending");
  const [newTaskDueDate, setNewTaskDueDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [newTaskDueTime, setNewTaskDueTime] = useState("");
  const [newTaskDuration, setNewTaskDuration] = useState("45");
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<string[]>([]);
  const [newSubtaskInput, setNewSubtaskInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    // Optimistic ID
    const tempId = `temp-${Date.now()}`;
    const optimisticTask: TaskItem = {
      id: tempId,
      title: newTaskTitle.trim(),
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
          priority: newTaskPriority,
          status: newTaskStatus,
          dueDate: newTaskDueDate,
          dueTime: newTaskDueTime || null,
          metadata: { estimatedDuration: durMinutes },
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
      setNewTaskDueTime("");
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

      {/* NEW TASK MODAL */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#17171A] border border-[#23242A] rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl flex flex-col gap-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#23242A]">
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-[#E29D52]" />
                <h3 className="text-base font-semibold text-[#F7F5F0]">Create New Task</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewTaskModalOpen(false)}
                className="p-1 rounded-lg text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#23242A] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateTask} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-[#C5C2BA] mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="e.g. Systems Architecture & Service Flow"
                  className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3.5 py-2 text-xs text-[#F7F5F0] placeholder:text-[#55534E] focus:border-[#E29D52] focus:ring-0 outline-none"
                />
              </div>

              {/* Priority & Status Controls */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#C5C2BA] mb-1">
                    Priority
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:border-[#E29D52] focus:ring-0 outline-none"
                  >
                    <option value="high">High Priority</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#C5C2BA] mb-1">
                    Initial Status
                  </label>
                  <select
                    value={newTaskStatus}
                    onChange={(e) => setNewTaskStatus(e.target.value as any)}
                    className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:border-[#E29D52] focus:ring-0 outline-none"
                  >
                    <option value="pending">To do</option>
                    <option value="in_progress">In progress</option>
                    <option value="waiting">Waiting</option>
                  </select>
                </div>
              </div>

              {/* Due Date & Scheduled Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#C5C2BA] mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] focus:border-[#E29D52] focus:ring-0 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#C5C2BA] mb-1">
                    Scheduled Time / Slot
                  </label>
                  <input
                    type="text"
                    value={newTaskDueTime}
                    onChange={(e) => setNewTaskDueTime(e.target.value)}
                    placeholder="e.g. 09:45 – 11:30"
                    className="w-full bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] placeholder:text-[#55534E] focus:border-[#E29D52] focus:ring-0 outline-none"
                  />
                </div>
              </div>

              {/* Subtasks Builder */}
              <div>
                <label className="block text-xs font-medium text-[#C5C2BA] mb-1">
                  Subtasks Checklist
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
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
                    placeholder="Add a subtask (press Enter)"
                    className="flex-1 bg-[#111113] border border-[#23242A] rounded-xl px-3 py-1.5 text-xs text-[#F7F5F0] placeholder:text-[#55534E] focus:border-[#E29D52] focus:ring-0 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newSubtaskInput.trim()) {
                        setNewTaskSubtasks([...newTaskSubtasks, newSubtaskInput.trim()]);
                        setNewSubtaskInput("");
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#23242A] hover:bg-[#2F3038] text-xs font-medium text-[#F7F5F0] transition-colors"
                  >
                    Add
                  </button>
                </div>

                {newTaskSubtasks.length > 0 && (
                  <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                    {newTaskSubtasks.map((st, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[#111113] border border-[#23242A] text-xs text-[#C5C2BA]"
                      >
                        <span className="truncate">{st}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setNewTaskSubtasks(newTaskSubtasks.filter((_, idx) => idx !== i))
                          }
                          className="text-[#85827A] hover:text-[#E8414A]"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#23242A]">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[#C5C2BA] hover:bg-[#23242A] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-[#E29D52] hover:bg-[#E29D52]/90 text-[#1A0F00] font-semibold text-xs shadow transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Task"}
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
