"use client";

import { useEffect, useState } from "react";
import { Layers, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

function directionLabel(dir: string) {
  if (dir === "up") return "Ascending";
  if (dir === "down") return "Declining";
  if (dir === "chaotic") return "Chaotic";
  return "Stable";
}

type Era = {
  from: string;
  to: string | null;
  dominantPhase: string;
  direction: string;
  stability: number;
  confidence: number;
};

export function CurrentEraCard() {
  const [era, setEra] = useState<Era | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/insights/eras")
      .then((r) => r.json())
      .then((d) => {
        const eras = d.eras || [];
        if (eras.length > 0) {
          setEra(eras[eras.length - 1]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 text-gray-400">
        Analyzing life chapters...
      </div>
    );
  }

  if (!era) return null;

  const phaseLabel = era.dominantPhase?.replaceAll("_", " ") || "Unknown";

  const phaseColorMap: Record<string, string> = {
    grind: "text-gray-300",
    burnout: "text-[#E8414A]",
    recovery: "text-gray-300",
    slump: "text-gray-300",
    balanced: "text-gray-300",
    drifting: "text-gray-300",
  };

  const phaseColor = phaseColorMap[era.dominantPhase] || "text-gray-400";

  return (
    <div
      onClick={() => router.push("/dashboard/eras")}
      className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 space-y-4 cursor-pointer hover:border-gray-500 transition-colors shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-widest text-gray-500">Current Life Chapter</div>
        <Layers className={`w-4 h-4 ${phaseColor}`} />
      </div>

      {/* Era Title */}
      <div className="space-y-0.5">
        <div className={`text-xl font-semibold capitalize ${phaseColor}`}>
          {phaseLabel} Era
        </div>
        <div className="text-xs text-gray-400">
          {era.from} → {era.to || "Now"}
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-2 pt-2">
        <div className="text-xs px-3 py-1.5 rounded-lg bg-[#2A2B2F]/50 border border-[#2A2B2F] text-gray-300 font-medium">
          Direction: {directionLabel(era.direction)}
        </div>
        <div className="text-xs px-3 py-1.5 rounded-lg bg-[#2A2B2F]/50 border border-[#2A2B2F] text-gray-300 font-medium">
          Stability: {Math.round((era.stability || 0) * 100)}%
        </div>
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-[#2A2B2F] flex items-center justify-between text-xs text-[#E8414A] font-medium">
        <span>View all chapters</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </div>
  );
}
