"use client";

import React from "react";
import { GoalDTO } from "@life-os/execution-kernel";
import { Target, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface GoalPanelProps {
  goals?: GoalDTO[] | null;
}

export function GoalPanel({ goals }: GoalPanelProps) {
  if (!goals || goals.length === 0) return null;

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[#2A2B2F]/50 pb-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          ACTIVE GOALS DIRECTORY
        </div>
        <span className="text-xs font-mono text-gray-400 bg-[#161618] border border-[#2A2B2F] px-2.5 py-0.5 rounded">
          {goals.length} Registered
        </span>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {goals.map((goal) => {
          const pressureScore = goal.pressure?.pressureScore ?? 20;
          const trend = goal.pressure?.trend || "stable";
          const TrendIcon = trend === "rising" ? TrendingUp : trend === "falling" ? TrendingDown : Minus;

          return (
            <div
              key={goal.id}
              className="p-3.5 rounded-xl bg-[#161618] border border-[#2A2B2F] space-y-1.5"
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
  );
}
