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

  useEffect(() => {
    fetch("/api/daily-log/dashboard")
      .then((res) => res.json())
      .then((data) => setLogs(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>

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
