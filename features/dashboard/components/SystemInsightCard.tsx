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
      <div className="space-y-5">

        {/* System State */}
        <div>
          <div className="text-xs text-gray-400 mb-1">
            System State
          </div>
          <div className="text-lg font-semibold text-white">
            {insight.systemState}
          </div>
        </div>

        {/* Risks */}
        {insight.risks.length > 0 && (
          <div>
            <div className="text-xs text-red-400 mb-2 uppercase tracking-wide">
              Risks
            </div>

            <ul className="space-y-1">
              {insight.risks.map((r, i) => (
                <li
                  key={i}
                  className="text-sm text-red-300 flex items-start gap-2"
                >
                  <span>⚠️</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Observations */}
        {insight.observations.length > 0 && (
          <div>
            <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">
              Observations
            </div>

            <ul className="space-y-1">
              {insight.observations.map((o, i) => (
                <li
                  key={i}
                  className="text-sm text-gray-300 flex items-start gap-2"
                >
                  <span>•</span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendations */}
        {insight.recommendations.length > 0 && (
          <div>
            <div className="text-xs text-green-400 mb-2 uppercase tracking-wide">
              Recommendations
            </div>

            <ul className="space-y-1">
              {insight.recommendations.map((r, i) => (
                <li
                  key={i}
                  className="text-sm text-green-300 flex items-start gap-2"
                >
                  <span>💡</span>
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