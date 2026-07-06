"use client";

import { Brain, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

type LifeState = {
  phase: string;
  confidence: number;
  reason: string;
  snapshot: any;
  insights: string[];
};

export function TrajectoryCard({ data }: { data?: LifeState | null }) {
  const router = useRouter();

  if (!data) return null;

  const phaseLabel = data.phase?.replaceAll("_", " ") || "Unknown";
  const confidencePct = Math.round((data.confidence || 0) * 100);

  const phaseColorMap: Record<string, string> = {
    grind: "text-gray-300",
    burnout: "text-[#E8414A]",
    recovery: "text-gray-300",
    slump: "text-gray-300",
    balanced: "text-gray-300",
  };

  const phaseColor = phaseColorMap[data.phase] || "text-gray-400";

  return (
    <div
      onClick={() => router.push("/insights/phases")}
      className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 space-y-4 cursor-pointer hover:border-gray-500 transition-colors shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-widest text-gray-500">Life State</div>
        <Brain className={`w-4 h-4 ${phaseColor}`} />
      </div>

      {/* Phase */}
      <div className="space-y-0.5">
        <div className={`text-xl font-semibold capitalize ${phaseColor}`}>
          {phaseLabel}
        </div>
        <div className="text-xs text-gray-400">
          Confidence: {confidencePct}%
        </div>
      </div>

      {/* Reason */}
      <div className="text-sm text-gray-300 leading-relaxed">
        {data.reason}
      </div>

      {/* Insights */}
      {data.insights?.length > 0 && (
        <ul className="text-xs text-gray-400 list-disc pl-4 space-y-1.5 mt-2">
          {data.insights.slice(0, 3).map((i, idx) => (
            <li key={idx}>{i}</li>
          ))}
        </ul>
      )}

      {/* Footer */}
      <div className="pt-3 border-t border-[#2A2B2F] flex items-center justify-between text-xs text-[#E8414A] font-medium">
        <span>View timeline</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </div>
  );
}
