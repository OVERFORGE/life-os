"use client";

import { Card } from "@/features/daily-log/ui/Card";
import { DashboardDTO } from "@life-os/execution-kernel";

export function GoalLoadCard({ goalLoad }: { goalLoad?: DashboardDTO["goalLoad"] }) {
  if (!goalLoad) {
    return (
      <Card title="Goal Load" subtitle="System-wide goal pressure">
        <p className="text-sm text-gray-400">No goal telemetry available.</p>
      </Card>
    );
  }

  const { globalLoadScore, mode, totalGoals, highPressureGoalsCount } = goalLoad;

  return (
    <Card title="Goal Load" subtitle="System-wide goal pressure">
      <div className="space-y-4">
        {/* Load Score Meter */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Load Score</span>
          <span className="font-semibold text-gray-100">{globalLoadScore} / 100</span>
        </div>

        <div className="w-full h-2.5 rounded-full bg-[#2A2B2F] overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              mode === "overloaded"
                ? "bg-[#E8414A]"
                : mode === "underutilized"
                ? "bg-blue-500"
                : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, globalLoadScore))}%` }}
          />
        </div>

        {/* System Load Status */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-[#2A2B2F]">
          <span className="text-gray-400 font-medium">Status</span>
          <span
            className={`px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${
              mode === "overloaded"
                ? "bg-[#E8414A]/20 text-[#E8414A]"
                : mode === "underutilized"
                ? "bg-blue-500/20 text-blue-400"
                : "bg-emerald-500/20 text-emerald-400"
            }`}
          >
            {mode}
          </span>
        </div>

        <div className="text-xs text-gray-400">
          {totalGoals} active goals • {highPressureGoalsCount} under high pressure
        </div>
      </div>
    </Card>
  );
}
