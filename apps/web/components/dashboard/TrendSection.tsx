"use client";

import React from "react";
import { WorldDTO, WorldTrend } from "@life-os/execution-kernel";

interface TrendSectionProps {
  trends?: WorldDTO["trends"] | WorldTrend[] | null;
}

export function TrendSection({ trends }: TrendSectionProps) {
  if (!trends || trends.length === 0) return null;

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
        ADAPTIVE METRIC TRENDS
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {trends.map((t, idx) => (
          <div
            key={idx}
            className="bg-[#161618] border border-[#2A2B2F] rounded-xl p-4 space-y-2"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-100">{t.metricName}</span>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase font-bold ${
                  t.trend === "Improving"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : t.trend === "Declining"
                    ? "bg-[#E8414A]/20 text-[#E8414A]"
                    : "bg-blue-500/20 text-blue-400"
                }`}
              >
                {t.trend}
              </span>
            </div>
            <p className="text-xs text-gray-400">{t.changeDescription}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
