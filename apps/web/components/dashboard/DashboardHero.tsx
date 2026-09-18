"use client";

import React from "react";
import { RefreshCw, Search, AlertTriangle } from "lucide-react";
import { DashboardLifeStateShape } from "./LifeStateCard";

interface DashboardHeroProps {
  lifeState?: DashboardLifeStateShape | null;
  timestamp?: number | null;
  snapshotId?: string | null;
  readinessScore?: number | null;
  executionMode?: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function DashboardHero({
  lifeState,
  onRefresh,
  isRefreshing = false,
}: DashboardHeroProps) {
  const confidencePct = lifeState ? Math.round(lifeState.confidence * 100) : null;
  const isLowConfidence = confidencePct !== null && confidencePct < 50;

  return (
    <div className="space-y-4">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E8414A] flex items-center justify-center text-white font-bold text-xl shadow-sm">
            L
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Overview</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative hidden md:flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              readOnly
              placeholder="Search or type a command..."
              className="bg-[#1F2023] border border-[#2A2B2F] rounded-xl pl-9 pr-12 py-2 text-xs text-gray-300 placeholder-gray-500 w-64 focus:outline-none cursor-pointer"
            />
            <kbd className="absolute right-3 text-[10px] font-mono text-gray-500 bg-[#161618] px-1.5 py-0.5 rounded border border-[#2A2B2F]">
              ⌘K
            </kbd>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="px-4 py-2 bg-[#2A2B2F] hover:bg-[#323338] text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#E8414A]" : ""}`} />
              {isRefreshing ? "Syncing Telemetry..." : "Refresh Telemetry"}
            </button>
          )}
        </div>
      </div>

      {/* Low-Confidence Telemetry Warning */}
      {isLowConfidence && (
        <div className="bg-[#1F2023] border border-[#E8414A]/40 rounded-2xl px-5 py-3 flex items-center gap-3 shadow-sm">
          <AlertTriangle className="w-4 h-4 text-[#E8414A] shrink-0" />
          <div className="text-xs text-gray-300 leading-relaxed">
            <span className="font-bold text-[#E8414A]">Low Telemetry Confidence ({confidencePct}%).</span>{" "}
            No daily logs have been detected recently. Log today's activity to improve state accuracy.
          </div>
        </div>
      )}

      {/* CURRENT LIFE PHASE Hero Card */}
      {lifeState && (
        <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                CURRENT LIFE PHASE
              </div>
              <div className="text-2xl font-bold text-gray-100">
                {lifeState.state}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Confidence: {confidencePct}%
                {isLowConfidence && (
                  <span className="ml-2 text-[#E8414A] font-semibold">— Low (insufficient recent telemetry)</span>
                )}
              </div>
            </div>

            <div className="px-3 py-1 bg-[#161618] border border-[#2A2B2F] rounded-lg text-xs font-bold uppercase tracking-wider text-gray-300">
              {lifeState.state}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
