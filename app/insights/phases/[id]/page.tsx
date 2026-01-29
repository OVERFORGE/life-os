"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Activity, Gauge } from "lucide-react";

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-[#0f1115] border border-[#232632] rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-400/70"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function PhaseDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/insights/phases/${id}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading phase...</div>;
  }

  if (!data || data.error) {
    return <div className="p-6 text-red-400">Phase not found</div>;
  }

  const { phase, selfExplanation ,forecast } = data;

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-5xl mx-auto p-6 space-y-10">

        {/* Back */}
        <Link
          href="/insights/phases"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Timeline
        </Link>

        {/* Hero */}
        <div className="space-y-2">
          <div className="text-sm text-gray-400">Life Phase</div>
          <h1 className="text-3xl font-bold capitalize">
            {phase.phase.replaceAll("_", " ")}
          </h1>
          <div className="text-sm text-gray-500">
            {phase.startDate} → {phase.endDate || "Present"}
          </div>

          <div className="max-w-2xl text-gray-300 leading-relaxed mt-3">
            {selfExplanation.summary}
          </div>
        </div>

        {/* System State */}
        <div className="bg-[#161922] border border-[#232632] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-gray-300 font-medium">
            <Gauge className="w-5 h-5" />
            System State
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Bar label="Stress" value={selfExplanation.scores.stress} />
            <Bar label="Energy" value={selfExplanation.scores.energy} />
            <Bar label="Mood" value={selfExplanation.scores.mood} />
            <Bar label="Sleep" value={selfExplanation.scores.sleep} />
            <Bar label="Stability" value={selfExplanation.scores.stability} />
            <Bar label="Load" value={selfExplanation.scores.load} />
          </div>
        </div>

        {/* Signals */}
        {selfExplanation.signals?.length > 0 && (
          <div className="bg-[#161922] border border-[#232632] rounded-xl p-6">
            <div className="font-medium text-gray-300 mb-3 flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Key Signals
            </div>

            <div className="flex flex-wrap gap-2">
              {selfExplanation.signals.map((s: string, i: number) => (
                <div
                  key={i}
                  className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300"
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risks */}
        {selfExplanation.risks?.length > 0 && (
          <div className="bg-[#2a1616] border border-red-900/40 rounded-xl p-6">
            <div className="flex items-center gap-2 text-red-300 font-medium mb-3">
              <AlertTriangle className="w-5 h-5" />
              Risks
            </div>

            <ul className="text-sm text-red-300 list-disc pl-5 space-y-1">
              {selfExplanation.risks.map((r: string, i: number) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Leverage */}
        {selfExplanation.leverage?.length > 0 && (
          <div className="bg-[#161922] border border-[#232632] rounded-xl p-6">
            <div className="font-medium text-gray-300 mb-3">
              Highest Leverage Actions
            </div>

            <ul className="text-sm text-gray-400 list-disc pl-5 space-y-1">
              {selfExplanation.leverage.map((l: string, i: number) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        )}
        {selfExplanation.predictedNext && (
          <div className="bg-[#2a1616] border border-red-900/40 rounded-xl p-4 text-red-300">
            ⚠️ If this continues, you are likely heading toward{" "}
            <b>{selfExplanation.predictedNext}</b>.
          </div>
        )}
        {forecast && (
          <div className="bg-[#2a1f16] border border-orange-900/40 rounded-xl p-6 text-orange-300 space-y-2">
            <div className="font-semibold text-orange-200">
              ⚠️ Trajectory Analysis
            </div>

            {forecast.predictedPhase === "instability_loop" ? (
              <div className="text-sm">
                You are stuck in a <b>repeating instability loop</b> — alternating between
                recovery and collapse without real stabilization.
              </div>
            ) : (
              <div className="text-sm">
                If nothing changes, you are on track to enter{" "}
                <b className="capitalize">{forecast.predictedPhase}</b>{" "}
                in approximately{" "}
                <b>{forecast.etaDays} days</b>.
              </div>
            )}

            <div className="text-xs text-orange-400">
              Confidence: {Math.round(forecast.confidence * 100)}%
            </div>
          </div>
        )}



      </div>
    </div>
  );
}
