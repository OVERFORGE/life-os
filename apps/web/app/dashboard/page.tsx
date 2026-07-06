"use client";

import { useEffect, useState } from "react";
import { Log } from "@/features/dashboard/utils/stats";
import { PersonalRecords } from "@/features/dashboard/components/PersonalRecords";
import { SummaryGrid } from "@/features/dashboard/components/SummaryGrid";
import { StreakGrid } from "@/features/dashboard/components/StreakGrid";
import { MoodEnergyChart } from "@/features/dashboard/components/MoodEnergyChart";
import { InsightsGrid } from "@/features/dashboard/components/InsightsGrid";
import { Heatmap } from "@/features/dashboard/components/Heatmap";
import { TrajectoryCard } from "@/features/dashboard/components/TrajectoryCard";
import { CurrentEraCard } from "@/features/insights/eras/components/CurrentEraCard";
import { GoalLoadCard } from "@/features/dashboard/components/GoalLoadCard";
import { SystemInsightCard } from "@/features/dashboard/components/SystemInsightCard";
import Image from "next/image";

export default function DashboardPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<any>(null);
  const [goalLoad, setGoalLoad] = useState<any>(null);

  useEffect(() =>  {
    Promise.all([
      fetch("/api/daily-log/dashboard").then(r => r.json()),
      fetch("/api/insights/trajectory").then(r => r.json()),
      fetch("/api/dashboard/goal-load").then(r => r.json())
    ]).then(([dashData, trajData, goalData]) => {
      setLogs(Array.isArray(dashData) ? dashData : Array.isArray(dashData?.logs) ? dashData.logs : []);
      setPhase(trajData);
      setGoalLoad(goalData?.goalLoad ?? goalData);
    }).finally(() => setLoading(false));
  }, []);
  
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
        <div className="text-gray-400 mt-4 text-sm font-medium">Syncing Telemetry...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full px-6 md:px-12 pt-8 animate-in fade-in duration-300">
      
      {/* Dynamic Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-[#E8414A] flex items-center justify-center text-white font-bold text-xl shadow-sm">
          L
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Overview</h1>
      </div>

      <div className="space-y-6 pb-20">
        
        {/* Phase Context */}
        {phase && phase.phase && (
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Current Life Phase</div>
              <div className="text-xl font-semibold text-gray-100 capitalize">
                {phase.phase?.replace("_", " ")}
              </div>
              <div className="text-sm text-gray-400 mt-1">
                Confidence: {Math.round(phase.confidence * 100)}%
              </div>
            </div>
            <PhaseBadge phase={phase.phase} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TrajectoryCard data={phase} />
          <CurrentEraCard />
        </div>
        
        <GoalLoadCard goalLoad={goalLoad} />
        
        <SystemInsightCard />
        
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
  // Only use Red (#E8414A) and Gray as per user request
  const map: Record<string, string> = {
    burnout: "bg-[#E8414A]/10 text-[#E8414A] border-[#E8414A]/20",
    grind: "bg-[#2A2B2F] text-gray-200 border-[#3A3C42]",
    recovery: "bg-[#2A2B2F] text-gray-200 border-[#3A3C42]",
    slump: "bg-[#2A2B2F] text-gray-200 border-[#3A3C42]",
    balanced: "bg-[#2A2B2F] text-gray-200 border-[#3A3C42]",
  };

  return (
    <div className={`px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider w-fit ${map[phase] || "bg-[#2A2B2F] text-gray-400 border-[#3A3C42]"}`}>
      {phase.replace("_", " ")}
    </div>
  );
}
