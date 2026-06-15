export function EraMetricsGrid({ era, totalDays }: any) {
  const v = era.summaryVector;

  const stats = [
    ["Avg Mood", v.avgMood.toFixed(1)],
    ["Avg Energy", v.avgEnergy.toFixed(1)],
    ["Avg Stress", v.avgStress.toFixed(1)],
    ["Avg Sleep", v.avgSleep.toFixed(1)],
    ["Avg Deep Work", v.avgDeepWork.toFixed(1)],
    ["Total Days", totalDays],
    ["Phases", era.phases.length],
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map(([label, value]) => (
        <div
          key={label}
          className="bg-[#161922] border border-[#232632] rounded-xl p-4"
        >
          <div className="text-xs text-gray-400">{label}</div>
          <div className="text-lg font-semibold text-gray-100">{value}</div>
        </div>
      ))}
    </div>
  );
}
