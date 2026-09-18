"use client";

import React from "react";
import { InsightDTO } from "@life-os/execution-kernel";

interface InsightsSectionProps {
  insights?: InsightDTO[] | null;
}

export function InsightsSection({ insights }: InsightsSectionProps) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
        SYSTEM OBSERVATIONS & INSIGHTS
      </div>

      <div className="space-y-3">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className="bg-[#161618] border border-[#2A2B2F] rounded-xl p-4 space-y-1.5"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-100">{insight.title}</span>
              <span className="text-[10px] uppercase font-mono text-[#E8414A] bg-[#E8414A]/10 px-2 py-0.5 rounded border border-[#E8414A]/20">
                {insight.type?.replace("_", " ")}
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              {insight.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
