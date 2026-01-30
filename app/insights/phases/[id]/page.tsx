"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  Activity,
  Gauge,
  Compass,
  Beaker,
} from "lucide-react";

/* ------------------ Human Meaning Layer ------------------ */

const DELTA_MEANINGS: any = {
  sleep: {
    "-3": "sleep ~2h less",
    "-2": "sleep ~1h less",
    "-1": "sleep ~30 min less",
    "1": "sleep ~30 min more",
    "2": "sleep ~1h more",
    "3": "sleep ~2h more",
  },
  stress: {
    "-3": "remove major stressors",
    "-2": "significantly reduce stress",
    "-1": "slightly reduce stress",
    "1": "slightly increase stress",
    "2": "high stress load",
    "3": "severe stress overload",
  },
  mood: {
    "-3": "emotionally depleted",
    "-2": "low emotional state",
    "-1": "slightly low mood",
    "1": "slightly improved mood",
    "2": "consistently positive mood",
    "3": "very high morale",
  },
  energy: {
    "-3": "severe fatigue",
    "-2": "low physical energy",
    "-1": "slightly tired",
    "1": "slightly energized",
    "2": "high energy",
    "3": "very high energy",
  },
};

function humanizeActions(actions: string[]) {
  return actions
    .map((a) => {
      const [key, val] = a.split(" ");
      return DELTA_MEANINGS[key]?.[val] || `${key} ${val}`;
    })
    .join(", ");
}

/* ------------------ UI Primitives ------------------ */

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-[#0f1115] border border-[#232632] rounded-full">
        <div
          className="h-full bg-indigo-400/70 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------ Page ------------------ */

export default function PhaseDetailPage() {
  const { id } = useParams() as { id: string };

  const [data, setData] = useState<any>(null);
  const [sim, setSim] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/insights/phases/${id}`).then((r) => r.json()),
      fetch(`/api/insights/phases/${id}/simulate-compound`).then((r) =>
        r.json()
      ),
    ])
      .then(([phaseData, simData]) => {
        setData(phaseData);
        setSim(simData);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6 text-gray-400">Loading phase...</div>;
  if (!data || data.error)
    return <div className="p-6 text-red-400">Phase not found</div>;

  const { phase, selfExplanation } = data;
  const simulations = sim?.simulations || [];

  const escapePaths = simulations.filter(
    (s: any) => s.resultPhase !== phase.phase
  );

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
        <div>
          <div className="text-sm text-gray-400">Life Phase</div>
          <h1 className="text-3xl font-bold capitalize">
            {phase.phase.replaceAll("_", " ")}
          </h1>
          <div className="text-sm text-gray-500">
            {phase.startDate} → {phase.endDate || "Present"}
          </div>

          <p className="max-w-2xl text-gray-300 mt-3">
            {selfExplanation.summary}
          </p>
        </div>

        {/* System State */}
        <div className="bg-[#161922] border border-[#232632] rounded-xl p-6">
          <div className="flex items-center gap-2 text-gray-300 font-medium mb-4">
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
            <div className="flex items-center gap-2 font-medium mb-3">
              <Activity className="w-5 h-5" />
              Key Signals
            </div>

            <div className="flex flex-wrap gap-2">
              {selfExplanation.signals.map((s: string, i: number) => (
                <span
                  key={i}
                  className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Exit Paths */}
        <div className="bg-[#161922] border border-[#232632] rounded-xl p-6">
          <div className="flex items-center gap-2 font-medium mb-4">
            <Compass className="w-5 h-5" />
            What Actually Moves You Out
          </div>

          {escapePaths.length === 0 ? (
            <p className="text-sm text-gray-400">
              Small optimizations won’t exit this phase.
              <br />
              <span className="text-gray-300">
                This requires a structural shift.
              </span>
            </p>
          ) : (
            <div className="space-y-3">
              {escapePaths.slice(0, 3).map((s: any, i: number) => (
                <div
                  key={i}
                  className="bg-[#0f1115] border border-[#232632] rounded-lg p-4"
                >
                  <div className="text-gray-200 font-medium">
                    If you {humanizeActions(s.actions)}
                  </div>
                  <div className="text-sm text-gray-400">
                    You likely move to{" "}
                    <span className="text-indigo-400 font-medium">
                      {s.resultPhase}
                    </span>{" "}
                    ({Math.round(s.confidence * 100)}%)
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Simulator */}
        <InterventionSimulator phaseId={phase._id} />

        {/* Risks */}
        {selfExplanation.risks?.length > 0 && (
          <div className="bg-[#2a1616] border border-red-900/40 rounded-xl p-6">
            <div className="flex items-center gap-2 text-red-300 font-medium mb-3">
              <AlertTriangle className="w-5 h-5" />
              Risks
            </div>

            <ul className="text-sm list-disc pl-5 space-y-1 text-red-300">
              {selfExplanation.risks.map((r: string, i: number) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </div>
  );
}

/* ------------------ Simulator ------------------ */

function InterventionSimulator({ phaseId }: { phaseId: string }) {
  const [deltas, setDeltas] = useState({
    sleep: 0,
    stress: 0,
    mood: 0,
    energy: 0,
  });

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const res = await fetch(`/api/insights/phases/${phaseId}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deltas),
    });
    const json = await res.json();
    setResult(json.result);
    setLoading(false);
  }

  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-6">
      <div className="flex items-center gap-2 font-medium mb-4">
        <Beaker className="w-5 h-5" />
        Try Your Own Intervention
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {Object.keys(deltas).map((k) => (
          <Slider
            key={k}
            label={k}
            value={(deltas as any)[k]}
            onChange={(v) => setDeltas((d) => ({ ...d, [k]: v }))}
          />
        ))}
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="px-4 py-2 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30"
      >
        {loading ? "Simulating..." : "Simulate"}
      </button>

      {result && (
        <div className="mt-4 bg-[#0f1115] border border-[#232632] rounded-lg p-4">
          <div className="text-sm text-gray-400">Result</div>
          <div className="text-lg font-semibold">{result.candidatePhase}</div>
          <div className="text-sm text-gray-400">
            Confidence: {Math.round(result.confidence * 100)}%
          </div>
        </div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span className="capitalize">{label}</span>
        <span>{DELTA_MEANINGS[label]?.[value] || value}</span>
      </div>
      <input
        type="range"
        min={-3}
        max={3}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
