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
      <div className="bg-[#161922] border border-[#232632] rounded-xl p-5 text-gray-400">
        Analyzing life chapters...
      </div>
    );
  }

  if (!era) return null;

  const phaseLabel = era.dominantPhase?.replaceAll("_", " ") || "Unknown";

  const phaseColorMap: Record<string, string> = {
    grind: "text-blue-400",
    burnout: "text-red-400",
    recovery: "text-green-400",
    slump: "text-yellow-400",
    balanced: "text-gray-300",
    drifting: "text-yellow-300",
  };

  const phaseColor = phaseColorMap[era.dominantPhase] || "text-gray-400";

  return (
    <div
      onClick={() => router.push("/dashboard/eras")}
      className="bg-[#161922] border border-[#232632] rounded-xl p-5 space-y-4 cursor-pointer hover:bg-[#1b1f2a] transition"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">Current Life Chapter</div>
        <Layers className={`w-5 h-5 ${phaseColor}`} />
      </div>

      {/* Era Title */}
      <div className="space-y-1">
        <div className={`text-xl font-semibold capitalize ${phaseColor}`}>
          {phaseLabel} Era
        </div>
        <div className="text-sm text-gray-400">
          {era.from} → {era.to || "Now"}
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-2 pt-1">
        <div className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
          Direction: {directionLabel(era.direction)}
        </div>
        <div className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
          Stability: {Math.round((era.stability || 0) * 100)}%
        </div>
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-[#232632] flex items-center justify-between text-xs text-gray-500">
        <span>View all life chapters</span>
        <ArrowRight className="w-4 h-4" />
      </div>
    </div>
  );
}
