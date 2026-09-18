"use client";

import React, { useState } from "react";
import { ExecutionGraphDTO, TaskDTO } from "@life-os/execution-kernel";
import { CheckCircle2, Clock } from "lucide-react";

interface TaskPanelProps {
  graph?: ExecutionGraphDTO | null;
}

export function TaskPanel({ graph }: TaskPanelProps) {
  const [activeTab, setActiveTab] = useState<"ready" | "blocked" | "critical">("ready");

  if (!graph) return null;

  const { readyTasks = [], blockedTasks = [], criticalPathTasks = [] } = graph;

  const currentTasks: TaskDTO[] =
    activeTab === "ready"
      ? readyTasks
      : activeTab === "blocked"
      ? blockedTasks
      : criticalPathTasks;

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-5">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2A2B2F]/50 pb-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          EXECUTION TASK REGISTRY
        </div>

        <div className="flex items-center bg-[#161618] p-1 rounded-xl border border-[#2A2B2F] text-xs font-medium">
          <button
            onClick={() => setActiveTab("ready")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "ready"
                ? "bg-[#2A2B2F] text-white font-bold"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Ready ({readyTasks.length})
          </button>
          <button
            onClick={() => setActiveTab("blocked")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "blocked"
                ? "bg-[#2A2B2F] text-[#E8414A] font-bold"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Blocked ({blockedTasks.length})
          </button>
          <button
            onClick={() => setActiveTab("critical")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "critical"
                ? "bg-[#2A2B2F] text-gray-100 font-bold"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Critical ({criticalPathTasks.length})
          </button>
        </div>
      </div>

      {/* Task List */}
      {currentTasks.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-500 font-mono">
          No tasks in [{activeTab.toUpperCase()}] queue.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {currentTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#161618] border border-[#2A2B2F]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    activeTab === "blocked" ? "bg-[#E8414A]" : "bg-emerald-400"
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-gray-100 truncate">{task.title}</div>
                  {task.blockReason && (
                    <div className="text-[11px] text-[#E8414A] truncate">
                      Blocked: {task.blockReason}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono shrink-0 text-gray-400">
                <span className="bg-[#2A2B2F] px-2 py-0.5 rounded text-gray-300">
                  Pri {task.priority}
                </span>
                {task.estimatedDurationMinutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-500" /> {task.estimatedDurationMinutes}m
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
