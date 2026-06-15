"use client";

import { Card } from "@/features/daily-log/ui/Card";

function percent(n: number) {
  return Math.round(n * 100);
}

export function GoalLoadCard({ goalLoad }: { goalLoad: any }) {
  if (!goalLoad) return null;

  console.log("FINAL GOAL LOAD CARD DATA:", goalLoad);

  // ✅ API gives perGoal, not global
  const perGoal = goalLoad.perGoal ?? [];

  if (perGoal.length === 0) {
    return (
      <Card title="Goal Load" subtitle="Jarvis system-wide goal pressure">
        <p className="text-sm text-gray-500">No goals yet.</p>
      </Card>
    );
  }

  // ✅ Compute global score
  const avgScore =
    perGoal.reduce((sum: number, g: any) => sum + g.pressureScore, 0) /
    perGoal.length;

  // ✅ Count distribution
  const distribution = {
    aligned: perGoal.filter((g: any) => g.status === "aligned").length,
    strained: perGoal.filter((g: any) => g.status === "strained").length,
    conflicting: perGoal.filter((g: any) => g.status === "conflicting").length,
    toxic: perGoal.filter((g: any) => g.status === "toxic").length,
  };

  // ✅ Mode logic
  let modeLabel = "Stable System Load ✅";
  let explanation = "Your goals are balanced with your life capacity.";

  if (avgScore > 0.75) {
    modeLabel = "Overloaded ⚠️";
    explanation = "Too much pressure. Reduce cadence or recover.";
  } else if (avgScore < 0.35) {
    modeLabel = "Underutilized 💤";
    explanation = "You have unused capacity. Add challenge.";
  }

  return (
    <Card title="Goal Load" subtitle="Jarvis system-wide goal pressure">
      <div className="space-y-4">
        {/* Meter */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Load Score</span>
          <span className="font-semibold">{percent(avgScore)}%</span>
        </div>

        <div className="w-full h-3 rounded-full bg-[#1c1f2a] overflow-hidden">
          <div
            className="h-full bg-white transition-all"
            style={{ width: `${percent(avgScore)}%` }}
          />
        </div>

        {/* Mode */}
        <div className="text-sm font-medium">{modeLabel}</div>

        <p className="text-xs text-gray-500 leading-relaxed">{explanation}</p>

        {/* Distribution */}
        <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Aligned</span>
            <span>{distribution.aligned}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Strained</span>
            <span>{distribution.strained}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Conflicting</span>
            <span>{distribution.conflicting}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Toxic</span>
            <span>{distribution.toxic}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
