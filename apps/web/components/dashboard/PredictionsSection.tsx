"use client";

import React from "react";
import { WorldDTO, WorldPrediction } from "@life-os/execution-kernel";

interface PredictionsSectionProps {
  predictions?: WorldDTO["predictions"] | WorldPrediction[] | null;
}

export function PredictionsSection({ predictions }: PredictionsSectionProps) {
  if (!predictions || predictions.length === 0) return null;

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
        WORLD PREDICTIONS & RISK MODEL
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {predictions.map((p, idx) => (
          <div
            key={idx}
            className="bg-[#161618] border border-[#2A2B2F] rounded-xl p-4 space-y-2"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-100">{p.title}</span>
              <span className="font-mono text-xs font-bold text-[#E8414A]">
                {Math.round(p.confidence * 100)}% Conf
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{p.predictionText}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
