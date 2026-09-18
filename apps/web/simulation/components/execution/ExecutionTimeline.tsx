"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Activity, RefreshCw, Eye, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { TimelineEntryDTO } from "@/simulation/execution/contracts/journalContracts";

interface ExecutionTimelineProps {
  runUid: string | null;
  onInspectStep: (stepNumber: number) => void;
  isExecuting?: boolean;
}

export function ExecutionTimeline({
  runUid,
  onInspectStep,
  isExecuting = false,
}: ExecutionTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntryDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    if (!runUid) {
      setEntries([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/simulation/${runUid}/timeline`);
      if (!res.ok) {
        throw new Error(`Failed to fetch timeline (${res.status})`);
      }
      const data = await res.json();
      setEntries(data.timeline ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Timeline fetch error");
    } finally {
      setIsLoading(false);
    }
  }, [runUid]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // Re-fetch when step execution completes
  useEffect(() => {
    if (!isExecuting && runUid) {
      fetchTimeline();
    }
  }, [isExecuting, runUid, fetchTimeline]);

  if (!runUid) return null;

  const intentColorMap: Record<string, string> = {
    WORK_ON_TASK: "bg-blue-950/40 text-blue-400 border-blue-800/40",
    REST_AND_RECOVER: "bg-amber-950/40 text-amber-400 border-amber-800/40",
    COMMUNICATE: "bg-purple-950/40 text-purple-400 border-purple-800/40",
    ADJUST_PLAN: "bg-indigo-950/40 text-indigo-400 border-indigo-800/40",
    TAKE_BREAK: "bg-teal-950/40 text-teal-400 border-teal-800/40",
    EXERCISE: "bg-emerald-950/40 text-emerald-400 border-emerald-800/40",
    IDLE: "bg-[#161618] text-[#71717A] border-[#27272A]",
  };

  return (
    <div className="rounded-xl border border-[#27272A] bg-[#0F0F10] p-4 space-y-3 font-sans">
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#E8414A]" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#71717A]">
            Execution Timeline (Journal)
          </span>
          <span className="text-[10px] font-mono text-[#52525B]">
            ({entries.length} steps recorded)
          </span>
        </div>
        <button
          onClick={fetchTimeline}
          disabled={isLoading}
          className="text-[#71717A] hover:text-white transition-colors p-1"
          title="Refresh timeline"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-[#E8414A]" : ""}`} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="text-xs font-mono text-red-400 bg-red-950/20 border border-red-900/30 p-2.5 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && entries.length === 0 && (
        <div className="flex items-center justify-center py-8 gap-2 text-[#52525B]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs font-mono">Loading timeline journal...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && entries.length === 0 && !error && (
        <div className="text-center py-8 text-xs font-mono text-[#52525B]">
          No simulation steps recorded yet. Click &quot;Advance Clock&quot; to execute a step.
        </div>
      )}

      {/* Timeline List */}
      {entries.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {entries.map((entry) => {
            const intentClass =
              intentColorMap[entry.decisionIntent] ??
              "bg-[#161618] text-gray-300 border-[#27272A]";

            return (
              <div
                key={entry.journalEntryId}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-[#27272A] bg-[#161618]/60 hover:bg-[#161618] hover:border-[#3F3F46] transition-all text-xs"
              >
                {/* Step & Time */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[10px] font-mono text-[#71717A] shrink-0">
                    Step #{entry.stepNumber}
                  </span>
                  <span className="text-[11px] font-mono text-gray-300 shrink-0">
                    {entry.virtualTimestamp}
                  </span>
                </div>

                {/* Intent Badge */}
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border font-semibold ${intentClass}`}
                  >
                    {entry.decisionIntent}
                  </span>
                </div>

                {/* Status Pill + Inspect Button */}
                <div className="flex items-center gap-3 shrink-0">
                  {entry.executionStatus === "SUCCESS" ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>SUCCESS</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-red-400">
                      <XCircle className="w-3 h-3" />
                      <span>FAILED</span>
                    </span>
                  )}

                  <button
                    onClick={() => onInspectStep(entry.stepNumber)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-[#27272A] hover:bg-[#3F3F46] text-white text-[10px] font-mono transition-colors"
                  >
                    <Eye className="w-3 h-3 text-[#E8414A]" />
                    <span>Inspect</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
