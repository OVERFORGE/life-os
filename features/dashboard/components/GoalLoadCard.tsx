"use client";

type GoalPressure = {
  status: "aligned" | "strained" | "conflicting" | "toxic";
  pressureScore: number;
};

type GoalLoad = {
  global?: {
    mode?: string;
    score?: number;
    recommendation?: string;
    systemRules?: string[];
    distribution?: {
      aligned?: number;
      strained?: number;
      conflicting?: number;
      toxic?: number;
    };
  };
  perGoal?: GoalPressure[];
};

export function GoalLoadCard({ goalLoad }: { goalLoad: GoalLoad | null }) {
  if (!goalLoad) return null;

  /* ---------------- Derive distribution safely ---------------- */

  const perGoal = goalLoad.perGoal ?? [];

  const derivedDistribution = {
    aligned: 0,
    strained: 0,
    conflicting: 0,
    toxic: 0,
  };

  for (const g of perGoal) {
    derivedDistribution[g.status]++;
  }

  const global = goalLoad.global ?? {};

  const distribution =
    global.distribution && Object.keys(global.distribution).length
      ? global.distribution
      : derivedDistribution;

  const score =
    global.score ??
    (perGoal.length
      ? perGoal.reduce((a, g) => a + g.pressureScore, 0) / perGoal.length
      : 0);

  const mode =
    global.mode ??
    (score > 0.6 ? "overloaded" : score > 0.35 ? "constrained" : "balanced");

  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">Goal Load</div>
        <span className="px-2 py-0.5 rounded text-xs bg-gray-700/40 capitalize">
          {mode}
        </span>
      </div>

      <div className="text-2xl font-semibold">
        {(score * 100).toFixed(0)}%
      </div>

      {global.recommendation && (
        <div className="text-sm text-gray-400">
          {global.recommendation}
        </div>
      )}

      <div className="flex gap-4 text-xs text-gray-500 pt-2">
        <span>Aligned: {distribution.aligned}</span>
        <span>Strained: {distribution.strained}</span>
        <span>Conflicting: {distribution.conflicting}</span>
        <span>Toxic: {distribution.toxic}</span>
      </div>

      {global.systemRules?.length ? (
        <ul className="text-xs text-gray-500 list-disc pl-4 pt-2">
          {global.systemRules.map((rule, i) => (
            <li key={i}>{rule}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
