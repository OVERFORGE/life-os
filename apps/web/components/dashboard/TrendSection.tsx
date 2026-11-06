"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WorldDTO, WorldTrend } from "@life-os/execution-kernel";

interface TrendSectionProps {
  trends?: WorldDTO["trends"] | WorldTrend[] | null;
}

export function TrendSection({ trends }: TrendSectionProps) {
  if (!trends || trends.length === 0) return null;

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          ADAPTIVE METRIC TRENDS
        </div>
        <Link
          href="/insights"
          className="flex items-center gap-1 text-xs text-[#E8414A] font-medium hover:underline"
        >
          <span>View Trends</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {trends.map((t, idx) => (
          <Link
            key={idx}
            href="/insights"
            className="block bg-[#161618] border border-[#2A2B2F] hover:border-gray-500 hover:bg-[#1a1b1e] transition-all rounded-xl p-4 space-y-2 cursor-pointer"
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
          </Link>
        ))}
      </div>
    </div>
  );
}
