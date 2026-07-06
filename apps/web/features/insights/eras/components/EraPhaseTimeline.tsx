export function EraPhaseTimeline({ phases }: any) {
  const max = Math.max(...phases.map((p: any) => p.durationDays));

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Phase Timeline</h2>

      {phases.map((p: any, i: number) => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span className="capitalize">{p.phase}</span>
            <span>{p.durationDays} days</span>
          </div>

          <div className="h-2 bg-[#161618] rounded-full overflow-hidden border border-[#2A2B2F]">
            <div
              className="h-full bg-white/40"
              style={{ width: `${(p.durationDays / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
