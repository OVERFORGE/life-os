import Link from "next/link";
import { PHASE_COLORS } from "../utils/phaseColors";
import { PHASE_LABELS } from "../utils/phaseLabels";

export function PhaseRow({ phase }: { phase: any }) {
  const color = PHASE_COLORS[phase.phase] || "bg-[#2a2a2a]";
  const label = PHASE_LABELS[phase.phase] || phase.phase;

  const shapeLabel =
    phase.shapeLabel ||
    phase.shape ||
    (phase.shapeScore > 0.7
      ? "Stable"
      : phase.shapeScore > 0.4
      ? "Unstable"
      : "Chaotic");

  return (
    <Link
      href={`/insights/phases/${phase._id}`}
      className="block"
    >
      <div className="space-y-2 hover:bg-[#1b1f2a] transition rounded-lg p-3 cursor-pointer border border-transparent hover:border-[#2a2f3a]">

        {/* Header */}
        <div className="flex justify-between text-xs text-gray-400">
          <span className="tracking-wide">
            {label} · <span className="text-gray-500">{shapeLabel}</span>
          </span>

          <span>
            {phase.startDate} → {phase.endDate || "Now"} ·{" "}
            {phase.durationDays} days
          </span>
          
        </div>
        <div className="text-xs text-gray-500">
            Risk Index: {Math.round(phase.intelligence.scores.load * 100)}%
        </div>
        {phase.riskLevel !== "low" && (
        <div
          className={`text-xs inline-block px-2 py-0.5 rounded-full border ${
            phase.riskLevel === "high"
              ? "bg-red-500/10 text-red-400 border-red-500/30"
              : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
          }`}
        >
          {phase.riskLevel === "high" ? "High Risk" : "Unstable"}
        </div>
      )}

        {/* Timeline Bar */}
        <div className="h-3 bg-[#0f1115] rounded-full overflow-hidden border border-[#232632]">
          <div
            className={`h-full ${color} transition-all`}
            style={{ width: `${phase.widthPercent}%` }}
          />
        </div>

        {/* Meta line */}
        <div className="text-[11px] text-gray-500">
          Confidence: {Math.round((phase.confidence || 0.7) * 100)}% · Shape score:{" "}
          {(phase.shapeScore || 0).toFixed(2)}
        </div>
      </div>
    </Link>
  );
}
