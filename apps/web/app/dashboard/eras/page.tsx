"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export default function ErasPage() {
  const [eras, setEras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  useEffect(() => {
    fetch("/api/insights/eras")
      .then((r) => r.json())
      .then((d) => {
        setEras(d.eras || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading life eras...</div>;
  }

  return (
    <div className="min-h-screen bg-[#161618] text-gray-100">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Your Life Eras</h1>

        <div className="text-sm text-gray-400 max-w-2xl">
          These are high-level chapters of your life, detected from long-term patterns.
        </div>

        <div className="space-y-4">
          {eras.map((era) => (
  <div
    key={era.id}
    className="relative bg-[#161618] border border-[#2A2B2F] rounded-2xl p-6 overflow-hidden cursor-pointer hover:bg-[#1b1f2a] transition"
    onClick={() => router.push(`/dashboard/eras/${era.id}`)}
  >
    {/* Left accent */}
    <div
      className={`absolute left-0 top-0 h-full w-1 ${
        era.narrative?.theme === "Growth"
        ? "bg-emerald-400/60"
        : era.narrative?.theme === "Overextension"
        ? "bg-red-400/60"
        : era.narrative?.theme === "Contraction"
        ? "bg-amber-400/60"
        : era.narrative?.theme === "Entropy"
        ? "bg-purple-400/60"
        : era.narrative?.theme === "Restoration"
        ? "bg-blue-400/60"
        : "bg-gray-400/40"

      }`}
    />

    <div className="flex justify-between items-start">
      <div>
        <div className="text-sm text-gray-400">
          {era.from} → {era.to || "Now"}
        </div>
        {era.narrative?.theme && (
        <div className="inline-block mt-2 text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
            {era.narrative.theme}
        </div>
        )}


        <div className="text-lg font-semibold text-gray-100 mt-1">
            {era.narrative?.title || "Untitled Era"}
            </div>

            {era.narrative?.subtitle && (
            <div className="text-sm text-gray-400">
                {era.narrative.subtitle}
            </div>
            )}
        </div>

      <div className="text-xs px-3 py-1 rounded-full bg-[#1F2023] border border-[#2A2B2F] text-gray-300">
        {era.direction === "up" && "📈 Ascending"}
        {era.direction === "down" && "📉 Declining"}
        {era.direction === "flat" && "➖ Stable"}
        {era.direction === "chaotic" && "🌪 Chaotic"}
      </div>
    </div>

    {/* Meta */}
    <div className="mt-4 grid grid-cols-3 gap-4 text-xs text-gray-400">
      <div>
        <div className="text-[#9ca3af]">Stability</div>
        <div className="text-gray-200">
          {Math.round(era.stability * 100)}%
        </div>
      </div>

      <div>
        <div className="text-[#9ca3af]">Volatility</div>
        <div className="text-gray-200">
          {Math.round(era.volatility * 100)}%
        </div>
      </div>

      <div>
        <div className="text-[#9ca3af]">Phases</div>
        <div className="text-gray-200">{era.phases.length}</div>
      </div>
    </div>
    {era.narrative?.story && (
        <div className="mt-4 text-sm text-gray-400 leading-relaxed max-w-3xl">
            {era.narrative.story}
        </div>
    )}

    {/* Mood line */}
    <div className="mt-4 text-xs text-[#9ca3af]">
      Mood:{" "}
      <span className="text-gray-300">
        {era.summaryVector.avgMood.toFixed(1)}
      </span>{" "}
      · Energy:{" "}
      <span className="text-gray-300">
        {era.summaryVector.avgEnergy.toFixed(1)}
      </span>{" "}
      · Stress:{" "}
      <span className="text-gray-300">
        {era.summaryVector.avgStress.toFixed(1)}
      </span>
    </div>
  </div>
))}

        </div>
      </div>
    </div>
  );
}
