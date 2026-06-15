"use client";

import { useEffect, useState } from "react";
import { PhaseTimeline } from "@/features/insights/phases/components/PhaseTimeline";

export default function PhasesPage() {
  const [phases, setPhases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights/phases", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        console.log("PHASE API DATA:", d);
        setPhases(d.timeline); // ✅ THIS IS THE REAL DATA
      })
      .catch((err) => {
        console.error("Failed to load phases:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading phases...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Your Life Timeline</h1>

        <div className="text-sm text-gray-400 max-w-2xl">
          This is a timeline of the phases your life has gone through, detected from your behavior patterns.
          Each bar represents a chapter.
        </div>

        <PhaseTimeline phases={phases} />
      </div>
    </div>
  );
}
