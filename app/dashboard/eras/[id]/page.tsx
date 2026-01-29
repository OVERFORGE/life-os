"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { EraHero } from "@/features/insights/eras/components/EraHero";
import { EraSummary } from "@/features/insights/eras/components/EraSummary";
import { EraMetricsGrid } from "@/features/insights/eras/components/EraMetricsGrid";
import { EraPhaseTimeline } from "@/features/insights/eras/components/EraPhaseTimeline";
import { EraPhaseTable } from "@/features/insights/eras/components/EraPhaseTable";
import { EraIntelligencePanel } from "@/features/insights/eras/components/EraIntelligencePanel";

export default function EraDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [era, setEra] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights/eras")
      .then((r) => r.json())
      .then((d) => {
        const found = (d.eras || []).find((e: any) => e.id === id);
        setEra(found || null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading era...</div>;
  }

  if (!era) {
    return <div className="p-6 text-red-400">Era not found.</div>;
  }

  const totalDays = era.phases.reduce(
    (a: number, b: any) => a + (b.durationDays || 0),
    0
  );

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-5xl mx-auto p-6 space-y-10">

        <EraHero era={era} totalDays={totalDays} />

        <EraSummary era={era} />

        {/* 🧠 NEW: Intelligence Panel */}
        <EraIntelligencePanel explanation={era.explanation} />

        <EraMetricsGrid era={era} totalDays={totalDays} />

        <EraPhaseTimeline phases={era.phases} />

        <EraPhaseTable phases={era.phases} />

      </div>
    </div>
  );
}
