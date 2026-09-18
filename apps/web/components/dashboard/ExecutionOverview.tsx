"use client";

import React from "react";
import { CheckCircle2, AlertOctagon, Target, Gauge, Zap, GitCommit } from "lucide-react";

interface ExecutionOverviewProps {
  readyTasksCount?: number;
  blockedTasksCount?: number;
  activeGoalsCount?: number;
  stabilityScore?: number;
  globalPressureScore?: number;
  criticalPathLength?: number;
}

export function ExecutionOverview({
  readyTasksCount = 0,
  blockedTasksCount = 0,
  activeGoalsCount = 0,
  stabilityScore = 100,
  globalPressureScore = 0,
  criticalPathLength = 0,
}: ExecutionOverviewProps) {
  const metrics = [
    {
      title: "Ready Nodes",
      // These are DAG-ready execution graph nodes (tasks, habits, workflows)
      // not a filtered "today's tasks" list
      subtitle: "Execution-Ready (DAG)",
      value: readyTasksCount,
      icon: CheckCircle2,
    },
    {
      title: "Blocked Nodes",
      subtitle: "Awaiting Upstream",
      value: blockedTasksCount,
      icon: AlertOctagon,
    },
    {
      title: "Tracked Goals",
      // Only goals with DAG presence after orphan-filter — not raw DB count
      subtitle: "With Execution Graph",
      value: activeGoalsCount,
      icon: Target,
    },
    {
      title: "Stability Score",
      subtitle: "Engine Computed",
      value: `${stabilityScore}/100`,
      icon: Gauge,
    },
    {
      title: "Goal Pressure",
      subtitle: "Avg. Across Goals",
      value: `${globalPressureScore}/100`,
      icon: Zap,
    },
    {
      title: "Critical Path",
      subtitle: "Bottleneck Nodes",
      value: criticalPathLength,
      icon: GitCommit,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {metrics.map((metric, idx) => (
        <div
          key={idx}
          className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-4 flex flex-col justify-between shadow-sm"
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 truncate">
            {metric.title}
          </div>
          <div className="text-2xl font-bold text-gray-100 mb-1 font-mono">
            {metric.value}
          </div>
          <div className="text-[11px] text-gray-400 truncate">
            {metric.subtitle}
          </div>
        </div>
      ))}
    </div>
  );
}
