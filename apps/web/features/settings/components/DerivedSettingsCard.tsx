"use client";

type Metric = {
  value: number;
  direction: "up" | "down" | "stable";
  lastChanged: string | null;
  reason: string;
  confidence: number;
};

export function DerivedSettingsCard({
  title,
  metric,
}: {
  title: string;
  metric: Metric;
}) {
  const arrow =
    metric.direction === "up"
      ? "↑"
      : metric.direction === "down"
      ? "↓"
      : "→";

  return (
    <div className="border border-[#232632] rounded-xl p-4 bg-[#161922]">
      <div className="text-sm text-gray-400">{title}</div>

      <div className="flex items-center gap-2 mt-1">
        <div className="text-2xl font-semibold">
          {metric.value.toFixed(2)}
        </div>
        <div className="text-sm text-gray-400">{arrow}</div>
      </div>

      <div className="text-xs text-gray-500 mt-2">
        {metric.reason}
      </div>

      <div className="text-xs text-gray-600 mt-1">
        Confidence: {Math.round(metric.confidence * 100)}%
        {metric.lastChanged && ` · Updated ${metric.lastChanged}`}
      </div>
    </div>
  );
}
