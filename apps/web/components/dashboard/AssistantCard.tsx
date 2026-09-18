"use client";

import React from "react";
import { AssistantContextDTO } from "@life-os/execution-kernel";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

interface AssistantCardProps {
  context?: AssistantContextDTO | null;
}

export function AssistantCard({ context }: AssistantCardProps) {
  if (!context) return null;

  const { lifeState, predictions, goalPressure } = context;

  const topPrediction = predictions && predictions.length > 0 ? predictions[0] : null;

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-6">
      <div className="space-y-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          JARVIS INSIGHT
        </div>
        <div className="text-xs font-medium text-gray-400">
          Current system intelligence
        </div>
      </div>

      <div className="space-y-5">
        {/* System State */}
        <div className="pb-4 border-b border-[#2A2B2F]/50">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
            SYSTEM STATE
          </div>
          <div className="text-lg font-semibold text-gray-100">
            {lifeState?.state || "Low Momentum Phase"}
          </div>
        </div>

        {/* Observations */}
        {lifeState?.explanation && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              OBSERVATIONS
            </div>
            <ul className="space-y-1.5 text-xs text-gray-300">
              <li className="flex items-start gap-2 leading-relaxed">
                <span className="text-gray-500 mt-0.5">•</span>
                <span>{lifeState.explanation}</span>
              </li>
            </ul>
          </div>
        )}

        {/* Recommendations */}
        {topPrediction && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-300">
              RECOMMENDATIONS
            </div>
            <ul className="space-y-1.5 text-xs text-gray-300">
              <li className="flex items-start gap-2 leading-relaxed">
                <span className="text-gray-400 mt-0.5">↳</span>
                <span>{topPrediction.predictionText}</span>
              </li>
            </ul>
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-[#2A2B2F]">
        <Link
          href="/dashboard/assistant"
          className="flex items-center justify-between text-xs text-[#E8414A] font-medium hover:underline"
        >
          <span>Open Assistant Chat</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
