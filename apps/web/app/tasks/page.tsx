"use client";

import { useEffect, useState, useCallback } from "react";
import { useTasks } from "@/hooks/useTasks";
import {
  Plus, CheckCircle2, Circle, Clock, AlertCircle, Calendar,
  RefreshCw, LayoutList, GitFork, ChevronRight
} from "lucide-react";
import { useRouter } from "next/navigation";

const PRIORITY_CONFIG: Record<string, { color: string; border: string; bg: string; label: string }> = {
  high: { color: "text-[#E8414A]", border: "border-[#E8414A]/40", bg: "bg-[#E8414A]/10", label: "High" },
  medium: { color: "text-[#F9A8AC]", border: "border-[#F9A8AC]/30", bg: "bg-[#F9A8AC]/10", label: "Medium" },
  low: { color: "text-gray-300", border: "border-gray-300/20", bg: "bg-gray-300/10", label: "Low" },
};

export default function TasksPage() {
  const router = useRouter();
  const { graph, readyTasks, blockedTasks, criticalPath, blockageRatio, nodeCount, isLoading: graphLoading, refresh: refreshGraph } = useTasks();

  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [loading, setLoading] = useState(true);
  const [tasksData, setTasksData] = useState<{ today: any[]; upcoming: any[]; overdue: any[] }>({
    today: [],
    upcoming: [],
    overdue: [],
  });

  const loadTasksList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks/list");
      if (res.ok) {
        const data = await res.json();
        setTasksData({
          today: data.today || [],
          upcoming: data.upcoming || [],
          overdue: data.overdue || [],
        });
      }
    } catch (e) {
      console.error("Failed to load tasks list:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasksList();
  }, [loadTasksList]);

  const toggleComplete = async (task: any) => {
    const targetId = String(task._id || task.id || "");
    if (!targetId) return;

    const isCompleted = task.status === "completed";
    const action = isCompleted ? "uncomplete" : "complete";
    const newStatus = action === "complete" ? "completed" : "pending";

    const updateList = (list: any[]) =>
      (list || []).map((t) => {
        const tid = String(t._id || t.id || "");
        return tid === targetId ? { ...t, status: newStatus } : t;
      });

    setTasksData((prev) => ({
      today: updateList(prev.today),
      upcoming: updateList(prev.upcoming),
      overdue: updateList(prev.overdue),
    }));

    try {
      await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: targetId, action }),
      });
      loadTasksList();
      refreshGraph();
    } catch (e) {
      console.error(e);
      loadTasksList();
    }
  };

  const todayTasks = tasksData.today || [];
  const overdueTasks = tasksData.overdue || [];
  const upcomingTasks = tasksData.upcoming || [];

  const allCount = todayTasks.length + overdueTasks.length;
  const doneCount = [...todayTasks, ...overdueTasks].filter((t) => t.status === "completed").length;
  const pct = allCount > 0 ? Math.round((doneCount / allCount) * 100) : 0;

  const renderTaskCard = (task: any, isOverdue = false) => {
    const priority = (task.priority || "medium").toLowerCase();
    const p = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
    const isDone = task.status === "completed";
    const subtasks = task.subtasks || [];
    const doneSubtasks = subtasks.filter((s: any) => s.done).length;

    return (
      <div
        key={task._id || task.id}
        onClick={() => router.push(`/tasks/${task._id || task.id}`)}
        className={`bg-[#1F2023] border rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all hover:border-[#383A40] ${
          isOverdue && !isDone ? "border-[#E8414A]/40" : "border-[#2A2B2F]"
        }`}
      >
        <div className="flex items-center gap-4 flex-1 pr-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleComplete(task);
            }}
            className="shrink-0 text-gray-400 hover:text-[#E8414A] transition-colors"
          >
            {isDone ? (
              <CheckCircle2 className="w-6 h-6 text-[#E8414A]" />
            ) : (
              <Circle className={`w-6 h-6 ${isOverdue ? "text-[#E8414A]" : "text-gray-500"}`} />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <h4
              className={`text-sm font-bold truncate ${
                isDone ? "text-gray-500 line-through" : "text-[#FFFDFC]"
              }`}
            >
              {task.title}
            </h4>

            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {task.dueTime && (
                <span className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                  <Clock className="w-3 h-3 text-gray-400" />
                  {task.dueTime}
                </span>
              )}
              {!isDone && (
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${p.bg} ${p.border} ${p.color}`}>
                  {p.label}
                </span>
              )}
              {isOverdue && !isDone && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-[#E8414A] uppercase tracking-wider">
                  <AlertCircle className="w-3 h-3" /> Overdue
                </span>
              )}
            </div>

            {subtasks.length > 0 && (
              <div className="mt-3">
                <div className="h-1 bg-[#161618] rounded-full overflow-hidden w-48">
                  <div
                    className="h-full bg-[#E8414A] rounded-full transition-all"
                    style={{ width: `${(doneSubtasks / subtasks.length) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 font-semibold mt-1 block">
                  {doneSubtasks}/{subtasks.length} subtasks
                </span>
              </div>
            )}
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
      </div>
    );
  };

  if (loading && graphLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-[#161618]">
        <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
        <div className="text-gray-400 mt-4 text-sm font-medium">Loading Tasks...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full bg-[#161618] text-[#FFFDFC] px-6 md:px-12 pt-8 pb-20 animate-in fade-in duration-300 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-[#2A2B2F]">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#FFFDFC]">Tasks</h1>
          {allCount > 0 && (
            <p className="text-sm text-gray-400 mt-1">
              {doneCount}/{allCount} completed today ({pct}%)
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* View Toggle */}
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-xl p-1 flex items-center gap-1">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${
                viewMode === "list" ? "bg-[#E8414A] text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode("graph")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${
                viewMode === "graph" ? "bg-[#E8414A] text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              <GitFork className="w-3.5 h-3.5" />
              <span>Graph ({nodeCount})</span>
            </button>
          </div>

          <button
            onClick={() => {
              loadTasksList();
              refreshGraph();
            }}
            className="px-4 py-2 bg-[#1F2023] hover:bg-[#2A2B2F] border border-[#2A2B2F] text-gray-200 text-xs font-bold rounded-xl transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => router.push("/tasks/new")}
            className="px-5 py-2 bg-[#E8414A] hover:bg-[#D62C35] text-white text-xs font-black rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-[#E8414A]/20"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Progress Bar Header */}
      {allCount > 0 && viewMode === "list" && (
        <div className="mb-8">
          <div className="h-1.5 bg-[#1F2023] border border-[#2A2B2F] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pct === 100 ? "bg-[#ECE7E3]" : "bg-[#E8414A]"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <div className="space-y-8">
          {/* Overdue Section */}
          {overdueTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 text-[#E8414A]" />
                <h3 className="text-xs font-black text-[#E8414A] uppercase tracking-widest">Overdue</h3>
              </div>
              <div className="space-y-3">
                {overdueTasks.map((t) => renderTaskCard(t, true))}
              </div>
            </div>
          )}

          {/* Today Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-gray-400" />
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Today</h3>
            </div>
            {todayTasks.length === 0 ? (
              <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-8 text-center text-gray-400">
                <CheckCircle2 className="w-8 h-8 text-gray-500 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold">All clear for today!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayTasks.map((t) => renderTaskCard(t))}
              </div>
            )}
          </div>

          {/* Upcoming Section */}
          {upcomingTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-4 h-4 text-gray-500" />
                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Upcoming</h3>
              </div>
              <div className="space-y-3">
                {upcomingTasks.map((t) => renderTaskCard(t))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* GRAPH VIEW */}
      {viewMode === "graph" && (
        <div className="space-y-8">
          {/* Critical Path Band */}
          {criticalPath.length > 0 && (
            <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
              <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-3">
                Execution Critical Path ({criticalPath.length} nodes)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {criticalPath.map((t, idx) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="bg-[#E8414A]/20 text-[#E8414A] text-xs px-3 py-1.5 rounded-lg font-bold">
                      {t.title}
                    </span>
                    {idx < criticalPath.length - 1 && <span className="text-gray-500 font-bold">➔</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ready Nodes */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4">Ready for Execution ({readyTasks.length})</h3>
            {readyTasks.length === 0 ? (
              <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 text-center text-gray-400 text-sm">
                No tasks currently ready for execution.
              </div>
            ) : (
              <div className="space-y-3">
                {readyTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => router.push(`/tasks/${t.id}`)}
                    className="bg-[#1F2023] border border-[#2A2B2F] hover:border-[#383A40] rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <div>
                        <h4 className="text-sm font-bold text-white">{t.title}</h4>
                        <span className="text-xs text-gray-400 font-mono">{t.entityType}</span>
                      </div>
                    </div>
                    <span className="text-xs bg-[#2A2B2F] px-3 py-1 rounded-lg text-gray-300 font-bold">
                      Priority {t.priority}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Blocked Nodes */}
          {blockedTasks.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-white mb-4">Blocked Tasks ({blockedTasks.length})</h3>
              <div className="space-y-3">
                {blockedTasks.map((t) => (
                  <div
                    key={t.id}
                    className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-4 flex items-center justify-between opacity-80"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#E8414A] shrink-0" />
                      <div>
                        <h4 className="text-sm font-bold text-white">{t.title}</h4>
                        {t.blockReason && <p className="text-xs text-red-400 mt-0.5">{t.blockReason}</p>}
                      </div>
                    </div>
                    <span className="text-xs bg-[#E8414A]/20 text-[#E8414A] px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider">
                      Blocked
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
