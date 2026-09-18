"use client";

import React from "react";
import { GoalDTO } from "@life-os/execution-kernel";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface GoalPressureSectionProps {
  goals?: GoalDTO[] | null;
  globalLoadScore?: number;
  mode?: string;
}

// Maps the internal "stable"/"underutilized"/"overloaded" mode strings to human-readable labels
function formatMode(mode: string): string {
  if (mode === "overloaded") return "High System Load";
  if (mode === "underutilized") return "System Underutilized";
  return "Stable System Load";
}

export function GoalPressureSection({
  goals = [],
  globalLoadScore = 0,
  mode = "stable",
}: GoalPressureSectionProps) {
  const activeGoals = goals || [];
  const highPressureCount = activeGoals.filter(
    (g) => (g.pressure?.pressureScore ?? 0) >= 50
  ).length;

  const humanMode = formatMode(mode);

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          GOAL LOAD
        </div>
        <div className="text-xs font-medium text-gray-400">
          Jarvis system-wide goal pressure
        </div>
      </div>

      {/* Progress Bar & Load Score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-gray-300">Load Score</span>
          <span className="text-gray-100 font-mono">{globalLoadScore}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[#2A2B2F] overflow-hidden">
          <div
            className="h-full bg-gray-200 transition-all duration-500 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, globalLoadScore))}%` }}
          />
        </div>
      </div>

      {/* System Load Status */}
      <div className="space-y-1">
        <div className="text-sm font-bold text-gray-100">{humanMode}</div>
        <div className="text-xs text-gray-400">
          {activeGoals.length} execution-tracked goal(s) • {highPressureCount} under high pressure (≥50)
        </div>
      </div>

      {/* Grid Metrics Breakdown */}
      {activeGoals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-[#2A2B2F] text-xs">
          <div className="flex justify-between text-gray-400">
            <span>Aligned</span>
            <span className="font-bold text-gray-200 font-mono">
              {activeGoals.filter(g => (g.pressure?.pressureScore ?? 0) < 20).length}
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Strained</span>
            <span className="font-bold text-gray-200 font-mono">
              {activeGoals.filter(g => { const s = g.pressure?.pressureScore ?? 0; return s >= 50 && s < 80; }).length}
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Conflicting</span>
            <span className="font-bold text-gray-200 font-mono">
              {activeGoals.filter(g => g.pressure?.trend === "rising").length}
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Critical</span>
            <span className="font-bold text-[#E8414A] font-mono">
              {activeGoals.filter(g => (g.pressure?.pressureScore ?? 0) >= 80).length}
            </span>
          </div>
        </div>
      )}

      {activeGoals.length === 0 && (
        <div className="text-xs text-gray-400 pt-2 border-t border-[#2A2B2F]">
          No execution-tracked goals found. Goals with tasks in the execution graph will appear here.
        </div>
      )}

      {/* Goal Cards List */}
      {activeGoals.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-[#2A2B2F]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            GOAL PRESSURE DETAILS
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeGoals.map((goal) => {
              const pressureScore = goal.pressure?.pressureScore ?? 0;
              const trend = goal.pressure?.trend || "stable";
              const TrendIcon = trend === "rising" ? TrendingUp : trend === "falling" ? TrendingDown : Minus;

              return (
                <div
                  key={goal.id}
                  className="bg-[#161618] border border-[#2A2B2F] rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-100 truncate">{goal.title}</span>
                    <span className="font-mono text-xs font-bold text-[#E8414A] shrink-0 ml-2">
                      {pressureScore}/100
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-gray-400">
                    <TrendIcon className="w-3.5 h-3.5 text-gray-400" />
                    <span className="capitalize">{trend}</span>
                    {goal.status && (
                      <span className="bg-[#2A2B2F] px-2 py-0.5 rounded text-[10px] uppercase text-gray-300">
                        {goal.status}
                      </span>
                    )}
                  </div>
                  {goal.pressure?.explanation && (
                    <div className="text-xs text-gray-400 line-clamp-2">
                      {goal.pressure.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
