"use client";

import React, { useState } from "react";
import { AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { useSimulationRuntime } from "@/simulation/hooks";
import {
  RuntimeHeader,
  RuntimeToolbar,
  RuntimeClockCard,
  RuntimeStateGrid,
  RuntimeLogFeed,
  StartSimulationModal,
} from "@/simulation/components/runtime";
import { ExecutionTimeline } from "@/simulation/components/execution/ExecutionTimeline";
import { ExecutionInspectorDrawer } from "@/simulation/components/execution/ExecutionInspectorDrawer";

export default function SimulationLabPage() {
  const {
    runs,
    activeRun,
    isLoading,
    isExecuting,
    error,
    selectRun,
    startSimulation,
    advance,
    pause,
    resume,
    finish,
    reset,
    refresh,
  } = useSimulationRuntime();

  const [showStartModal, setShowStartModal] = useState(false);
  const [inspectStepNumber, setInspectStepNumber] = useState<number | null>(null);

  return (
    <div className="space-y-6 font-sans">
      {/* Page Header */}
      <RuntimeHeader activeRun={activeRun} />

      {/* Toolbar */}
      <RuntimeToolbar
        activeRun={activeRun}
        isExecuting={isExecuting}
        onStartClick={() => setShowStartModal(true)}
        onAdvance={advance}
        onPause={pause}
        onResume={resume}
        onFinish={finish}
        onReset={reset}
      />

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-400 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={refresh}
            className="text-red-400/60 hover:text-red-400 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !activeRun && (
        <div className="flex items-center justify-center py-16 gap-2 text-[#52525B]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-mono">Initializing runtime...</span>
        </div>
      )}

      {/* Main Content */}
      {!isLoading && (
        <div className="space-y-4">
          {/* Top Row: Clock + Run list */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Virtual Clock Card */}
            <div className="lg:col-span-1">
              <RuntimeClockCard activeRun={activeRun} />
            </div>

            {/* Run History List */}
            <div className="lg:col-span-2 rounded-xl border border-[#27272A] bg-[#0F0F10] p-4 flex flex-col gap-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#52525B]">
                Simulation Runs
              </div>
              {runs.length === 0 ? (
                <div className="flex flex-1 items-center justify-center h-24 text-[11px] font-mono text-[#3F3F46]">
                  No simulation runs. Click &quot;New Simulation Run&quot; to start.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {runs.map((run) => {
                    const isActive = activeRun?.id === run.id;
                    const statusColors: Record<string, string> = {
                      RUNNING: "text-emerald-400",
                      PAUSED: "text-amber-400",
                      COMPLETED: "text-indigo-400",
                      FAILED: "text-red-400",
                      CREATED: "text-[#52525B]",
                      INITIALIZING: "text-blue-400",
                      CANCELLED: "text-[#3F3F46]",
                    };
                    return (
                      <button
                        key={run.id}
                        onClick={() => selectRun(run)}
                        className={`w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-all ${
                          isActive
                            ? "border-[#E8414A]/40 bg-[#E8414A]/5"
                            : "border-[#27272A] hover:border-[#3F3F46] bg-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              run.status === "RUNNING" ? "bg-emerald-400 animate-pulse" : "bg-[#3F3F46]"
                            }`}
                          />
                          <span className="text-[11px] font-mono text-white truncate">
                            {run.runUid}
                          </span>
                          <span className="text-[10px] font-sans text-[#52525B] truncate hidden sm:block">
                            {run.context.personaName}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-[9px] font-mono uppercase ${statusColors[run.status]}`}>
                            {run.status}
                          </span>
                          <span className="text-[10px] font-mono text-[#3F3F46]">
                            t:{run.state.tick}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* State Grid */}
          <RuntimeStateGrid activeRun={activeRun} />

          {/* Execution Observability Timeline */}
          <ExecutionTimeline
            runUid={activeRun?.runUid ?? null}
            isExecuting={isExecuting}
            onInspectStep={(stepNum) => setInspectStepNumber(stepNum)}
          />

          {/* Execution Trace Log Feed */}
          <RuntimeLogFeed logs={activeRun?.logs ?? []} />
        </div>
      )}

      {/* Start Simulation Modal */}
      <StartSimulationModal
        isOpen={showStartModal}
        isExecuting={isExecuting}
        onClose={() => setShowStartModal(false)}
        onStart={async (payload) => {
          await startSimulation(payload);
          setShowStartModal(false);
        }}
      />

      {/* Execution Inspector Drawer */}
      <ExecutionInspectorDrawer
        runUid={activeRun?.runUid ?? null}
        stepNumber={inspectStepNumber}
        isOpen={inspectStepNumber !== null}
        onClose={() => setInspectStepNumber(null)}
      />
    </div>
  );
}
