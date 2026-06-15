export function EraHero({ era, totalDays }: any) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-400">
        {era.from} → {era.to || "Now"} · {totalDays} days
      </div>

      <h1 className="text-3xl font-bold capitalize">
        {era.dominantPhase} Era
      </h1>

      <div className="flex flex-wrap gap-2 pt-2">
        <Badge>Direction: {era.direction}</Badge>
        <Badge>Stability: {Math.round(era.stability * 100)}%</Badge>
        <Badge>Volatility: {Math.round(era.volatility * 100)}%</Badge>
        <Badge>Dominant: {era.dominantPhase}</Badge>
      </div>
    </div>
  );
}

function Badge({ children }: any) {
  return (
    <div className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
      {children}
    </div>
  );
}
