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
    <div className="space-y-2">
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

      {/* Timeline Bar */}
      <div className="h-3 bg-[#0f1115] rounded-full overflow-hidden border border-[#232632]">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${phase.widthPercent}%` }}
        />
      </div>

      {/* Meta line */}
      <div className="text-[11px] text-gray-500">
        Confidence: {Math.round((phase.confidence || 0.6) * 100)}% · Shape score:{" "}
        {(phase.shapeScore || 0).toFixed(2)}
      </div>
    </div>
  );
}
