"use client";

import React from "react";
import Link from "next/link";
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
      subtitle: "Execution-Ready (DAG)",
      value: readyTasksCount,
      icon: CheckCircle2,
      href: "/tasks",
    },
    {
      title: "Blocked Nodes",
      subtitle: "Awaiting Upstream",
      value: blockedTasksCount,
      icon: AlertOctagon,
      href: "/tasks",
    },
    {
      title: "Tracked Goals",
      subtitle: "With Execution Graph",
      value: activeGoalsCount,
      icon: Target,
      href: "/goals",
    },
    {
      title: "Stability Score",
      subtitle: "Engine Computed",
      value: `${stabilityScore}/100`,
      icon: Gauge,
      href: "/insights",
    },
    {
      title: "Goal Pressure",
      subtitle: "Avg. Across Goals",
      value: `${globalPressureScore}/100`,
      icon: Zap,
      href: "/goals",
    },
    {
      title: "Critical Path",
      subtitle: "Bottleneck Nodes",
      value: criticalPathLength,
      icon: GitCommit,
      href: "/tasks",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {metrics.map((metric, idx) => (
        <Link
          key={idx}
          href={metric.href}
          className="bg-[#1F2023] border border-[#2A2B2F] hover:border-[#E8414A]/40 hover:bg-[#25262B] transition-all duration-200 rounded-2xl p-4 flex flex-col justify-between shadow-sm cursor-pointer group"
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 truncate group-hover:text-gray-400">
            {metric.title}
          </div>
          <div className="text-2xl font-bold text-gray-100 mb-1 font-mono group-hover:text-white">
            {metric.value}
          </div>
          <div className="text-[11px] text-gray-400 truncate group-hover:text-gray-300">
            {metric.subtitle}
          </div>
        </Link>
      ))}
    </div>
  );
}
