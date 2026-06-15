import { normalizeWidths } from "../utils/normalizeWidths";
import { PhaseRow } from "./PhaseRow";
import { PhaseLegend } from "./PhaseLegend";

type PhaseSegment = {
  phase: string;
  startDate: string;
  endDate?: string;
  widthPercent: number;
  durationDays: number;
};

export function PhaseTimeline({ phases }: { phases: any[] }) {
  console.log("phases in PhaseTimeline:", phases);

  // ✅ Tell TS what normalized actually contains
  const normalized = normalizeWidths(phases) as PhaseSegment[];

  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-5 space-y-6">
      <div className="flex justify-between items-center">
        <div className="font-medium text-gray-200">Life Phases</div>
      </div>

      <PhaseLegend />

      <div className="space-y-6">
        {normalized.map((p, i) => (
          <PhaseRow
            key={`${p.phase}-${p.startDate}-${i}`}
            phase={p}
          />
        ))}
      </div>
    </div>
  );
}