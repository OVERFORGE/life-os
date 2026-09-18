"use client";

import React from "react";
import { ArrowRight, Activity, Layers } from "lucide-react";
import Link from "next/link";

export interface DashboardLifeStateShape {
  state: string;
  confidence: number;
  explanation: string;
  evidence?: string[];
  stabilityScore?: number;
  physiologicalScore?: number | null;
  executionScore?: number | null;
}

interface LifeStateCardProps {
  lifeState?: DashboardLifeStateShape | null;
}

export function LifeStateCard({ lifeState }: LifeStateCardProps) {
  if (!lifeState) return null;

  const { state, confidence, explanation, physiologicalScore, executionScore, stabilityScore } = lifeState;
  const confidencePct = Math.round(confidence * 100);

  // Only show scores that are actual computed values (not null — null means no telemetry for that dimension)
  const hasPhysio = physiologicalScore !== null && physiologicalScore !== undefined;
  const hasExecution = executionScore !== null && executionScore !== undefined;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Card Left: LIFE STATE */}
      <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              LIFE STATE
            </div>
            <Activity className="w-4 h-4 text-gray-400" />
          </div>

          <div className="space-y-0.5">
            <div className="text-xl font-bold text-gray-100">{state}</div>
            <div className="text-xs text-gray-400">Confidence: {confidencePct}%</div>
          </div>

          <p className="text-xs text-gray-300 leading-relaxed font-normal">
            {explanation || "Phase selected by multi-signal scoring engine."}
          </p>

          <ul className="text-xs text-gray-400 space-y-1.5 pt-1">
            {/* Only render observed scores — do not show null dimensions */}
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E8414A]" />
              <span>System load: {hasExecution ? `${executionScore}%` : "—"}</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
              <span>Recovery capacity: {hasPhysio ? `${physiologicalScore}%` : "—"}</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
              <span>Stability: {stabilityScore ?? "—"}%</span>
            </li>
          </ul>
        </div>

        <div className="pt-3 border-t border-[#2A2B2F]">
          <Link
            href="/insights/phases"
            className="flex items-center justify-between text-xs text-[#E8414A] font-medium hover:underline"
          >
            <span>View timeline</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Card Right: CURRENT LIFE CHAPTER */}
      <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              CURRENT LIFE CHAPTER
            </div>
            <Layers className="w-4 h-4 text-gray-400" />
          </div>

          <div className="space-y-0.5">
            {/* Era name derives from current life state, not hardcoded */}
            <div className="text-xl font-bold text-gray-100">{state} Era</div>
            {/* Date is not known from DTO — do not fabricate */}
            <div className="text-xs text-gray-500 italic">Era start date not tracked yet</div>
          </div>

          <div className="flex items-center gap-3 text-xs font-medium pt-2 flex-wrap">
            <span className="bg-[#161618] border border-[#2A2B2F] px-3 py-1 rounded-lg text-gray-300">
              Direction: Stable
            </span>
            {stabilityScore !== undefined && (
              <span className="bg-[#161618] border border-[#2A2B2F] px-3 py-1 rounded-lg text-gray-300">
                Stability: {stabilityScore}%
              </span>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-[#2A2B2F]">
          <Link
            href="/dashboard/eras"
            className="flex items-center justify-between text-xs text-[#E8414A] font-medium hover:underline"
          >
            <span>View all chapters</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
