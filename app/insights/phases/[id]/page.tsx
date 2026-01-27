"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, AlertTriangle, Activity } from "lucide-react";
import Link from "next/link";

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

  const { phase, previousPhase, delta, interpretation } = data;

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-4xl mx-auto p-6 space-y-8">

        {/* Back */}
        <Link
          href="/insights/phases"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Timeline
        </Link>

        {/* Header */}
        <div className="space-y-2">
          <div className="text-sm text-gray-400">Life Phase</div>
          <h1 className="text-3xl font-semibold capitalize">
            {phase.phase.replaceAll("_", " ")}
          </h1>

          <div className="text-sm text-gray-500">
            {phase.startDate} {phase.endDate ? `→ ${phase.endDate}` : "→ Present"}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-[#161922] border border-[#232632] rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-gray-300">
            <Activity className="w-5 h-5" />
            <div className="font-medium">Summary</div>
          </div>

          <p className="text-gray-400 leading-relaxed">
            {interpretation?.summary || phase.reason}
          </p>
        </div>

        {/* What Changed */}
        {delta && (
          <div className="bg-[#161922] border border-[#232632] rounded-xl p-5 space-y-4">
            <div className="font-medium text-gray-300">What Changed</div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {Object.entries(delta).map(([k, v]: any) => (
                <div
                  key={k}
                  className="bg-[#0f1115] border border-[#232632] rounded-lg p-3"
                >
                  <div className="text-gray-500 text-xs mb-1">{k}</div>
                  <div
                    className={`font-medium ${
                      v > 0 ? "text-green-400" : v < 0 ? "text-red-400" : "text-gray-400"
                    }`}
                  >
                    {v > 0 ? "+" : ""}
                    {v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Causes */}
        {interpretation?.causes?.length > 0 && (
          <ReasonBox title="Likely Causes" items={interpretation.causes} />
        )}

        {/* Warnings */}
        {interpretation?.warnings?.length > 0 && (
          <div className="bg-[#2a1616] border border-red-900/40 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-red-300">
              <AlertTriangle className="w-5 h-5" />
              <div className="font-medium">Warnings</div>
            </div>

            <ul className="text-sm text-red-300 list-disc pl-5 space-y-1">
              {interpretation.warnings.map((w: string, i: number) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggestions */}
        {interpretation?.suggestions?.length > 0 && (
          <ReasonBox title="What You Should Do" items={interpretation.suggestions} />
        )}

      </div>
    </div>
  );
}

/* ---------- UI Bits ---------- */

function ReasonBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-5 space-y-3">
      <div className="font-medium text-gray-300">{title}</div>

      <ul className="text-sm text-gray-400 list-disc pl-5 space-y-1">
        {items.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
