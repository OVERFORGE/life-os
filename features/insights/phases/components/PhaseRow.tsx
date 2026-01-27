import { PHASE_COLORS } from "../utils/phaseColors";
import { PHASE_LABELS } from "../utils/phaseLabels";

export function PhaseRow({ phase }: { phase: any }) {
  const color = PHASE_COLORS[phase.phase] || "bg-[#2a2a2a]";
  const label = PHASE_LABELS[phase.phase] || phase.phase;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex justify-between text-xs text-gray-400">
        <span className="tracking-wide">{label}</span>
        <span>
          {phase.startDate} → {phase.endDate || "Now"} · {phase.durationDays} days
        </span>
      </div>

      {/* Timeline Bar */}
      <div className="h-2 bg-[#0f1115] rounded-full overflow-hidden border border-[#232632]">
        <div
          className={`h-full ${color} transition-all ${
            phase.isCurrent ? "ring-1 ring-white/30" : ""
          }`}
          style={{ width: `${phase.widthPercent}%` }}
        />
      </div>

      {/* Reason */}
      {phase.reason && (
        <div className="text-xs text-gray-500 leading-relaxed max-w-xl">
          {phase.reason}
        </div>
      )}
    </div>
  );
}
