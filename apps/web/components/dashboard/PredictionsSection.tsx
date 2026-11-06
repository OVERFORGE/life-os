"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WorldDTO, WorldPrediction } from "@life-os/execution-kernel";

interface PredictionsSectionProps {
  predictions?: WorldDTO["predictions"] | WorldPrediction[] | null;
}

export function PredictionsSection({ predictions }: PredictionsSectionProps) {
  if (!predictions || predictions.length === 0) return null;

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          WORLD PREDICTIONS & RISK MODEL
        </div>
        <Link
          href="/insights"
          className="flex items-center gap-1 text-xs text-[#E8414A] font-medium hover:underline"
        >
          <span>View Risk Model</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {predictions.map((p, idx) => (
          <Link
            key={idx}
            href="/insights"
            className="block bg-[#161618] border border-[#2A2B2F] hover:border-gray-500 hover:bg-[#1a1b1e] transition-all rounded-xl p-4 space-y-2 cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-100">{p.title}</span>
              <span className="font-mono text-xs font-bold text-[#E8414A]">
                {Math.round(p.confidence * 100)}% Conf
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{p.predictionText}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
