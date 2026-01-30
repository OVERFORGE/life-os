export function PhaseInterventionPlans({ plans }: { plans: any[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-100">
        How to Exit This Phase
      </h2>
      <div className="text-sm text-gray-400">
        Pick a path that fits your current capacity.
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {plans.map(plan => (
          <div
            key={plan.id}
            className="bg-[#161922] border border-[#232632] rounded-xl p-5 space-y-3"
          >
            <div className="flex justify-between items-center">
              <div className="font-medium text-gray-200">
                {plan.label}
              </div>
              <RiskBadge level={plan.riskLevel} />
            </div>

            <ul className="text-sm text-gray-400 space-y-1">
              {plan.steps.map((s: any, i: number) => (
                <li key={i}>• {s.humanReadable}</li>
              ))}
            </ul>

            {plan.warning && (
              <div className="text-xs text-red-400">
                ⚠️ {plan.warning}
              </div>
            )}

            <div className="text-xs text-gray-500 pt-2 border-t border-[#232632]">
              Confidence: {Math.round(plan.confidence * 100)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const map = {
    low: "bg-green-500/15 text-green-400",
    medium: "bg-yellow-500/15 text-yellow-400",
    high: "bg-red-500/15 text-red-400",
  };

  return (
    <div className={`text-xs px-2 py-1 rounded-full ${map[level]}`}>
      {level.toUpperCase()}
    </div>
  );
}
