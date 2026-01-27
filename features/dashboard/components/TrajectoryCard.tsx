"use client";

import { useEffect, useState } from "react";
import { Brain, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

type LifeState = {
  phase: string;
  confidence: number;
  reason: string;
  snapshot: any;
  insights: string[];
};

export function TrajectoryCard() {
  const [data, setData] = useState<LifeState | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/insights/trajectory")
      .then((r) => r.json())
      .then((d) => {
        console.log("TrajectoryCard API:", d);
        setData(d);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-[#161922] border border-[#232632] rounded-xl p-5 text-gray-400">
        Analyzing life state...
      </div>
    );
  }

  if (!data) return null;

  const phaseLabel = data.phase?.replaceAll("_", " ") || "Unknown";
  const confidencePct = Math.round((data.confidence || 0) * 100);

  const phaseColorMap: Record<string, string> = {
    grind: "text-blue-400",
    burnout: "text-red-400",
    recovery: "text-green-400",
    slump: "text-yellow-400",
    balanced: "text-gray-300",
  };

  const phaseColor = phaseColorMap[data.phase] || "text-gray-400";

  return (
    <div
      onClick={() => router.push("/insights/phases")}
      className="bg-[#161922] border border-[#232632] rounded-xl p-5 space-y-4 cursor-pointer hover:bg-[#1b1f2a] transition"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">Life State</div>
        <Brain className={`w-5 h-5 ${phaseColor}`} />
      </div>

      {/* Phase */}
      <div className="space-y-1">
        <div className={`text-xl font-semibold capitalize ${phaseColor}`}>
          {phaseLabel}
        </div>
        <div className="text-sm text-gray-400">
          Confidence: {confidencePct}%
        </div>
      </div>

      {/* Reason */}
      <div className="text-sm text-gray-300 leading-relaxed">
        {data.reason}
      </div>

      {/* Insights */}
      {data.insights?.length > 0 && (
        <ul className="text-sm text-gray-400 list-disc pl-5 space-y-1">
          {data.insights.slice(0, 3).map((i, idx) => (
            <li key={idx}>{i}</li>
          ))}
        </ul>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-[#232632] flex items-center justify-between text-xs text-gray-500">
        <span>View life timeline</span>
        <ArrowRight className="w-4 h-4" />
      </div>
    </div>
  );
}
