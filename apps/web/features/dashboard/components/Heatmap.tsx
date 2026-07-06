import { Log } from "../utils/stats";
import { buildHeatmapDays, scoreToColor } from "../utils/heatmap";

export function Heatmap({ logs }: { logs: Log[] }) {
  const days = buildHeatmapDays(logs);

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-xl p-4 space-y-4">
      <div className="font-medium">Consistency Heatmap (Last 90 Days)</div>

      <div className="grid grid-cols-[repeat(15,20px)] gap-[3px]">
        {days.map((d) => (
          <div
            key={d.date}
            title={`${d.date} — Score: ${d.score.toFixed(1)}`}
            className={`w-[20px] h-[20px] rounded-[2px] ${scoreToColor(d.score)}`}
          />
        ))}
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-400 pt-2">
        <LegendItem label="Bad" color="bg-[#1a1d26]" />
        <LegendItem label="Okay" color="bg-red-900/40" />
        <LegendItem label="Good" color="bg-yellow-900/40" />
        <LegendItem label="Great" color="bg-green-500/70" />
      </div>

    </div>
  );
}
function LegendItem({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-sm border border-[#2A2B2F] ${color}`} />
      <span>{label}</span>
    </div>
  );
}
