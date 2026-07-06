"use client";

import { useEffect, useState } from "react";
import { Card } from "@/features/daily-log/ui/Card";
import { useRouter } from "next/navigation";
type Insight = {
  systemState: string;
  risks: string[];
  recommendations: string[];
  observations: string[];
};

export function SystemInsightCard() {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  useEffect(() => {
    fetch("/api/insights/system")
      .then((r) => r.json())
      .then((d) => {
        if (d?.insight) {
          setInsight(d.insight);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card title="Jarvis Insight" subtitle="System intelligence">
        <div className="text-sm text-gray-400">Analyzing system...</div>
      </Card>
    );
  }

  if (!insight) return null;

  return (
    <div onClick={() => router.push("/insights")}>
        <Card
      title="Jarvis Insight"
      subtitle="Current system intelligence"
      
    >
      <div className="space-y-6">

        {/* System State */}
        <div className="pb-4 border-b border-[#2A2B2F]/50">
          <div className="text-xs font-bold tracking-widest text-gray-500 mb-1 uppercase">
            System State
          </div>
          <div className="text-lg font-semibold text-gray-100">
            {insight.systemState}
          </div>
        </div>

        {/* Risks */}
        {insight.risks.length > 0 && (
          <div>
            <div className="text-xs font-bold text-[#E8414A] mb-2 uppercase tracking-widest">
              Risks
            </div>

            <ul className="space-y-1.5">
              {insight.risks.map((r, i) => (
                <li
                  key={i}
                  className="text-sm text-gray-300 flex items-start gap-2 leading-relaxed"
                >
                  <span className="text-[#E8414A] mt-0.5">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Observations */}
        {insight.observations.length > 0 && (
          <div>
            <div className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">
              Observations
            </div>

            <ul className="space-y-1.5">
              {insight.observations.map((o, i) => (
                <li
                  key={i}
                  className="text-sm text-gray-300 flex items-start gap-2 leading-relaxed"
                >
                  <span className="text-gray-500 mt-0.5">•</span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendations */}
        {insight.recommendations.length > 0 && (
          <div>
            <div className="text-xs font-bold text-gray-300 mb-2 uppercase tracking-widest">
              Recommendations
            </div>

            <ul className="space-y-1.5">
              {insight.recommendations.map((r, i) => (
                <li
                  key={i}
                  className="text-sm text-gray-300 flex items-start gap-2 leading-relaxed"
                >
                  <span className="text-gray-400 mt-0.5">↳</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
    </div>
    
  );
}