"use client";

import { useEffect, useState } from "react";
import { Log } from "@/features/dashboard/utils/stats";
import { PersonalRecords } from "@/features/dashboard/components/PersonalRecords";
import { SummaryGrid } from "@/features/dashboard/components/SummaryGrid";
import { StreakGrid } from "@/features/dashboard/components/StreakGrid";
import { MoodEnergyChart } from "@/features/dashboard/components/MoodEnergyChart";
import { InsightsGrid } from "@/features/dashboard/components/InsightsGrid";
import { Heatmap } from "@/features/dashboard/components/Heatmap";

export default function DashboardPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<any>(null);
  useEffect(() => {
    fetch("/api/daily-log/dashboard")
      .then((res) => res.json())
      .then((data) => setLogs(data))
      .finally(() => setLoading(false));
    fetch("/api/insights/phase")
    .then((r) => r.json())
    .then((d) => setPhase(d.phase));
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {phase && (
  <div className="bg-[#161922] border border-[#232632] rounded-xl p-4 flex items-center justify-between">
    <div>
      <div className="text-sm text-gray-400">Current Life Phase</div>
      <div className="text-xl font-semibold capitalize">
        {phase.phase.replace("_", " ")}
      </div>
      <div className="text-xs text-gray-400 mt-1">
        Confidence: {Math.round(phase.confidence * 100)}%
      </div>
    </div>

    <PhaseBadge phase={phase.phase} />
  </div>
)}
        <SummaryGrid logs={logs} />
        <StreakGrid logs={logs} />
        <PersonalRecords logs={logs} />
        <MoodEnergyChart logs={logs} />
        <InsightsGrid logs={logs} />
        <Heatmap logs={logs} />
      </div>
    </div>
  );
}
function PhaseBadge({ phase }: { phase: string }) {
  const map: Record<string, string> = {
    grind: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    burnout: "bg-red-500/20 text-red-400 border-red-500/30",
    recovery: "bg-green-500/20 text-green-400 border-green-500/30",
    slump: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    balanced: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  };

  return (
    <div
      className={`px-3 py-1 rounded-full border text-sm ${
        map[phase] || "bg-gray-500/10 text-gray-400 border-gray-500/20"
      }`}
    >
      {phase}
    </div>
  );
}
