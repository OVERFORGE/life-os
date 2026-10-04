"use client";

import { useEffect, useState } from "react";
import { useInteractionSurface } from "@/hooks/useInteractionSurface";

export function AmbientActiveExecutionBanner() {
  const {
    projection,
    syncStatus,
    startExecution,
    completeTask,
    deferExecution,
    pauseExecution,
  } = useInteractionSurface();

  // Local live tick to keep chronometer smooth every second
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const active = projection?.activeExecution;

  // Silence Invariant: When dormant or silent, display nothing
  if (!active || projection?.interactionMode === "SILENT") {
    return null;
  }

  const entityId = active.occurrenceId || active.taskId || "active_entity";

  // Calculate live elapsed seconds
  const startedAt = active.startedAtMs || Date.now();
  const liveElapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const elapsedMins = Math.floor(liveElapsedSeconds / 60);
  const elapsedSecs = liveElapsedSeconds % 60;
  const timeFormatted = `${elapsedMins}:${elapsedSecs < 10 ? "0" : ""}${elapsedSecs}`;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-3 duration-300 pointer-events-auto">
      <div className="flex items-center gap-4 px-4 py-2.5 rounded-full bg-[#161618] border border-[#2A2B2F] shadow-2xl backdrop-blur-md">
        
        {/* Status Indicator Dot */}
        <div className="relative flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-[#E8414A] animate-pulse" />
          <div className="absolute w-4 h-4 rounded-full bg-[#E8414A]/20 animate-ping" />
        </div>

        {/* Content Section */}
        {active.status === "PROPOSAL_PENDING" ? (
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-[#F6F3F1] tracking-wide">
                Ready to start?
              </span>
              <span className="text-[11px] text-[#A0A0A5] truncate max-w-[200px]">
                {active.title} ({active.plannedDurationMinutes}m)
              </span>
            </div>

            <div className="flex items-center gap-1.5 ml-2">
              <button
                onClick={() => startExecution(entityId, active.plannedDurationMinutes)}
                className="px-3 py-1 rounded-full text-xs font-medium bg-[#E8414A] hover:bg-[#D62C35] text-white transition-colors"
              >
                Start
              </button>
              <button
                onClick={() => deferExecution(entityId, 15)}
                className="px-3 py-1 rounded-full text-xs font-medium bg-[#2A2B2F] hover:bg-[#34353A] text-[#ECE7E3] transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#F6F3F1] truncate max-w-[220px]">
                  {active.title}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#2A2B2F] text-[#ECE7E3]">
                  {timeFormatted}
                </span>
              </div>
              <span className="text-[11px] text-[#A0A0A5]">
                Just tell me when you&apos;re done.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1.5 ml-1">
              <button
                onClick={() => completeTask(entityId)}
                className="px-3 py-1 rounded-full text-xs font-medium bg-[#E8414A] hover:bg-[#D62C35] text-white transition-colors shadow-sm"
              >
                Done
              </button>
              <button
                onClick={() => pauseExecution(entityId)}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#2A2B2F] hover:bg-[#34353A] text-[#ECE7E3] transition-colors"
              >
                Pause
              </button>
              <button
                onClick={() => deferExecution(entityId, 15)}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#2A2B2F] hover:bg-[#34353A] text-[#ECE7E3] transition-colors"
              >
                +15m
              </button>
            </div>
          </div>
        )}

        {/* Syncing / Reconciling Status Indicator */}
        {syncStatus === "SYNCING" && (
          <span className="text-[10px] font-mono text-[#E8414A] animate-pulse">
            Syncing…
          </span>
        )}
      </div>
    </div>
  );
}
