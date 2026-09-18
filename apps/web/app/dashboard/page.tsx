"use client";

import React, { useState } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import { useTasks } from "@/hooks/useTasks";
import { useGoals } from "@/hooks/useGoals";
import { useWorld } from "@/hooks/useWorld";
import { useLearning } from "@/hooks/useLearning";
import { useInsights } from "@/hooks/useInsights";
import { useSettings } from "@/hooks/useSettings";
import { useAssistant } from "@/hooks/useAssistant";
import { useDiagnostics } from "@/hooks/useDiagnostics";

import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { LifeStateCard } from "@/components/dashboard/LifeStateCard";
import { GoalPressureSection } from "@/components/dashboard/GoalPressureSection";
import { AssistantCard } from "@/components/dashboard/AssistantCard";
import { HabitsAndRecordsSection } from "@/components/dashboard/HabitsAndRecordsSection";
import { ExecutionOverview } from "@/components/dashboard/ExecutionOverview";
import { ExecutionGraphCard } from "@/components/dashboard/ExecutionGraphCard";
import { TaskPanel } from "@/components/dashboard/TaskPanel";
import { InsightsSection } from "@/components/dashboard/InsightsSection";
import { LearningSection } from "@/components/dashboard/LearningSection";
import { TrendSection } from "@/components/dashboard/TrendSection";
import { PredictionsSection } from "@/components/dashboard/PredictionsSection";
import { DiagnosticsDrawer } from "@/components/dashboard/DiagnosticsDrawer";

export default function DashboardPage() {
  const { dashboard, isLoading: isDashLoading, refresh: refreshDash } = useDashboard();
  const { graph: tasks } = useTasks();
  const { goals } = useGoals();
  const { world } = useWorld();
  const { learning } = useLearning();
  const { insights } = useInsights();
  const { settings } = useSettings();
  const { assistantContext } = useAssistant();
  const { diagnostics } = useDiagnostics();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      await refreshDash();
    } finally {
      setIsRefreshing(false);
    }
  };

  const isLoading = isDashLoading && !dashboard;

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-[#161618]">
        <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
        <div className="text-gray-400 mt-4 text-xs font-semibold uppercase tracking-wider">
          Syncing Kernel Telemetry...
        </div>
      </div>
    );
  }

  // Consolidated DTO projections
  const lifeState = dashboard?.lifeState || world?.lifeState;
  const goalPressures = goals || [];
  const readyTasksCount = tasks?.readyTasks?.length || 0;
  const blockedTasksCount = tasks?.blockedTasks?.length || 0;
  const activeGoalsCount = goalPressures.length;
  const stabilityScore = 100;
  const globalPressureScore = dashboard?.goalLoad?.globalLoadScore ?? 46;
  const criticalPathLength = tasks?.criticalPathTasks?.length || 0;

  return (
    <div className="flex-1 w-full min-h-screen bg-[#161618] text-gray-100 px-6 md:px-12 pt-8 pb-20 space-y-6 animate-in fade-in duration-300">
      {/* 1. Header & CURRENT LIFE PHASE (Matches Image 1) */}
      <DashboardHero
        lifeState={lifeState}
        timestamp={settings?.timestamp}
        snapshotId={assistantContext?.snapshotId}
        readinessScore={stabilityScore}
        executionMode={dashboard?.goalLoad?.mode}
        onRefresh={handleRefreshAll}
        isRefreshing={isRefreshing}
      />

      {/* 2. LIFE STATE & CURRENT LIFE CHAPTER / ERA (2-Column Row from Image 1) */}
      <LifeStateCard lifeState={lifeState} />

      {/* 3. GOAL LOAD Card (From Image 2) */}
      <GoalPressureSection
        goals={goalPressures}
        globalLoadScore={globalPressureScore}
        mode={dashboard?.goalLoad?.mode || "Stable System Load"}
      />

      {/* 4. JARVIS INSIGHT / SYSTEM INTELLIGENCE Card (From Image 2) */}
      <AssistantCard context={assistantContext} />

      {/* 5. HABITS, STREAKS & PERSONAL RECORDS (From Image 3) */}
      <HabitsAndRecordsSection />

      {/* 6. EXECUTION METRICS OVERVIEW */}
      <ExecutionOverview
        readyTasksCount={readyTasksCount}
        blockedTasksCount={blockedTasksCount}
        activeGoalsCount={activeGoalsCount}
        stabilityScore={stabilityScore}
        globalPressureScore={globalPressureScore}
        criticalPathLength={criticalPathLength}
      />

      {/* 7. EXECUTION TASK REGISTRY & DAG TOPOLOGY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TaskPanel graph={tasks} />
        </div>
        <div>
          <ExecutionGraphCard graph={tasks} />
        </div>
      </div>

      {/* 8. ADAPTIVE INTELLIGENCE TRENDS & PREDICTIONS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TrendSection trends={world?.trends} />
        <PredictionsSection predictions={world?.predictions} />
      </div>

      {/* 9. SYSTEM INSIGHTS TIMELINE */}
      <InsightsSection insights={insights} />

      {/* 10. LEARNING ENGINE & BEHAVIORAL MODEL */}
      <LearningSection learning={learning} />

      {/* 11. KERNEL DIAGNOSTICS INSPECTOR */}
      <DiagnosticsDrawer diagnostics={diagnostics} settings={settings} />
    </div>
  );
}
