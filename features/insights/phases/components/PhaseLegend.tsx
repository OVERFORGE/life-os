import { PHASE_COLORS } from "../utils/phaseColors";
import { PHASE_LABELS } from "../utils/phaseLabels";

export function PhaseLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-gray-400">
      {Object.keys(PHASE_LABELS).map((key) => (
        <div key={key} className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-sm ${PHASE_COLORS[key]}`} />
          <span>{PHASE_LABELS[key]}</span>
        </div>
      ))}
    </div>
  );
}
