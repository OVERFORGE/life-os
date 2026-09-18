"use client";

import React from "react";
import { LearningDTO } from "@life-os/execution-kernel";

interface LearningSectionProps {
  learning?: LearningDTO | null;
}

export function LearningSection({ learning }: LearningSectionProps) {
  if (!learning) return null;

  const { behavioralProfile, activeSignals } = learning;

  // Only show behavioral profile when real data exists — reject 0:00-0:00 sentinel (profile was null)
  const hasRealProfile =
    behavioralProfile &&
    (behavioralProfile.workHours?.startHour !== 0 ||
     behavioralProfile.workHours?.endHour !== 0 ||
     behavioralProfile.taskCompletionRate > 0);

  const hasSignals = activeSignals && activeSignals.length > 0;

  if (!hasRealProfile && !hasSignals) {
    return (
      <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
          BEHAVIORAL MODEL & LEARNING SIGNALS
        </div>
        <p className="text-xs text-gray-400">
          No behavioral model available yet. Log daily activity consistently to build your behavioral profile.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-6">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
        BEHAVIORAL MODEL & LEARNING SIGNALS
      </div>

      {hasRealProfile && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#161618] border border-[#2A2B2F] p-3.5 rounded-xl space-y-1">
            <div className="text-gray-500 text-[10px] uppercase font-bold">Completion Rate</div>
            <div className="text-base font-bold text-gray-100 font-mono">
              {Math.round((behavioralProfile.taskCompletionRate || 0) * 100)}%
            </div>
          </div>

          <div className="bg-[#161618] border border-[#2A2B2F] p-3.5 rounded-xl space-y-1">
            <div className="text-gray-500 text-[10px] uppercase font-bold">Consistency</div>
            <div className="text-base font-bold text-gray-100 font-mono">
              {Math.round((behavioralProfile.executionConsistency || 0) * 100)}%
            </div>
          </div>

          <div className="bg-[#161618] border border-[#2A2B2F] p-3.5 rounded-xl space-y-1">
            <div className="text-gray-500 text-[10px] uppercase font-bold">Work Window</div>
            <div className="text-base font-bold text-gray-100 font-mono">
              {behavioralProfile.workHours?.startHour}:00 – {behavioralProfile.workHours?.endHour}:00
            </div>
          </div>

          <div className="bg-[#161618] border border-[#2A2B2F] p-3.5 rounded-xl space-y-1">
            <div className="text-gray-500 text-[10px] uppercase font-bold">Sleep Window</div>
            <div className="text-base font-bold text-gray-100 font-mono">
              {behavioralProfile.sleepWindow?.startHour}:00 – {behavioralProfile.sleepWindow?.endHour}:00
            </div>
          </div>
        </div>
      )}

      {hasSignals && (
        <div className="space-y-2 pt-2 border-t border-[#2A2B2F]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            EMITTED LEARNING SIGNALS
          </div>
          <div className="space-y-2">
            {activeSignals.map((sig, idx) => (
              <div key={idx} className="bg-[#161618] border border-[#2A2B2F] p-3 rounded-xl text-xs space-y-1">
                <div className="font-bold text-[#E8414A]">{sig.title}</div>
                <div className="text-gray-300">{sig.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
