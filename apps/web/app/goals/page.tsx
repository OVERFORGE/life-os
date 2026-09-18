"use client";

import { useGoals } from "@/hooks/useGoals";
import { Plus, RefreshCw, AlertTriangle, Target, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

function StateBadge({ state }: { state?: string }) {
  const s = (state || "unknown").toLowerCase().replace(" ", "_");
  const map: Record<string, { bg: string; text: string; border: string }> = {
    on_track: { bg: "bg-[#E8414A]/10", text: "text-[#E8414A]", border: "border-[#E8414A]/30" },
    slow: { bg: "bg-[#F9A8AC]/10", text: "text-[#F9A8AC]", border: "border-[#F9A8AC]/30" },
    drifting: { bg: "bg-[#B42129]/10", text: "text-[#B42129]", border: "border-[#B42129]/30" },
    stalled: { bg: "bg-white/5", text: "text-gray-400", border: "border-white/10" },
    recovering: { bg: "bg-white/10", text: "text-white", border: "border-white/20" },
    stable: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
    unknown: { bg: "bg-white/5", text: "text-gray-500", border: "border-white/10" },
  };

  const style = map[s] || map.unknown;

  return (
    <div className={`px-3 py-1 rounded-full border ${style.bg} ${style.border}`}>
      <span className={`text-[10px] font-black uppercase tracking-widest ${style.text}`}>
        {s.replace("_", " ")}
      </span>
    </div>
  );
}

export default function GoalsPage() {
  const router = useRouter();
  const { goals, highPressureGoals, isLoading, refresh } = useGoals();

  if (isLoading && goals.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-[#161618]">
        <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
        <div className="text-gray-400 mt-4 text-sm font-medium">Syncing System Goals...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full bg-[#161618] text-[#FFFDFC] px-6 md:px-12 pt-8 pb-20 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-[#2A2B2F]">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#FFFDFC]">Global Goals</h1>
          <p className="text-sm text-gray-400 mt-1">
            {goals.length} active goals • {highPressureGoals.length} under high execution pressure
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refresh()}
            className="px-4 py-2.5 bg-[#1F2023] hover:bg-[#2A2B2F] border border-[#2A2B2F] text-gray-200 text-xs font-bold rounded-xl transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
            <span>Refresh Goals</span>
          </button>
          <button
            onClick={() => router.push("/goals/new")}
            className="px-5 py-2.5 bg-[#E8414A] hover:bg-[#D62C35] text-white text-xs font-black rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-[#E8414A]/20"
          >
            <Plus className="w-4 h-4" />
            <span>Create Goal</span>
          </button>
        </div>
      </div>

      {/* Goal Cards Grid */}
      {goals.length === 0 ? (
        <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-16 text-center text-gray-400 max-w-xl mx-auto my-12">
          <Target className="w-12 h-12 text-[#E8414A] mx-auto mb-4 opacity-80" />
          <h3 className="text-lg font-bold text-white mb-2">No Active Goals</h3>
          <p className="text-sm text-gray-400 mb-6">Create your first goal to start tracking progress and goal pressure.</p>
          <button
            onClick={() => router.push("/goals/new")}
            className="px-6 py-3 bg-[#E8414A] hover:bg-[#D62C35] text-white font-bold text-xs rounded-xl transition-colors"
          >
            Create Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map((goal) => {
            const score = goal.progressPercentage ?? 0;
            const state = goal.status || "in_progress";
            const pressureStatus = (goal.pressure as any)?.status;
            const isPressureHigh = (goal.pressure?.pressureScore ?? 0) >= 50;

            return (
              <div
                key={goal.id}
                onClick={() => router.push(`/goals/${goal.id}`)}
                className="bg-[#1F2023] border border-[#2A2B2F] hover:border-[#383A40] rounded-2xl p-6 cursor-pointer transition-all shadow-sm group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                      {goal.category || "General"}
                    </span>
                    <div className="flex items-center gap-2">
                      {pressureStatus && pressureStatus !== "aligned" && (
                        <span className="text-xs text-[#E8414A] font-bold capitalize flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {pressureStatus} Load
                        </span>
                      )}
                      <StateBadge state={state} />
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-[#FFFDFC] group-hover:text-[#E8414A] transition-colors leading-snug">
                    {goal.title}
                  </h3>

                  {goal.pressure?.explanation && (
                    <p className="text-xs text-gray-400 mt-2 line-clamp-2 leading-relaxed">
                      {goal.pressure.explanation}
                    </p>
                  )}
                </div>

                {/* Progress Bar & Pressure Info */}
                <div className="mt-6 pt-4 border-t border-[#2A2B2F]">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Progress</span>
                    <span className="font-extrabold text-[#FFFDFC]">{score}%</span>
                  </div>
                  <div className="h-1.5 bg-[#161618] rounded-full overflow-hidden mb-3">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        score > 70 ? "bg-[#E8414A]" : "bg-[#ECE7E3]"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        isPressureHigh
                          ? "bg-[#E8414A]/20 text-[#E8414A]"
                          : "bg-emerald-500/20 text-emerald-400"
                      }`}
                    >
                      Pressure {goal.pressure?.pressureScore ?? 0}
                    </span>
                    <span className="capitalize text-gray-300 text-[11px]">
                      Trend: {goal.pressure?.trend || "stable"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
