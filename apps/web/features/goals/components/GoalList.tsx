"use client";

import { useRouter } from "next/navigation";

export function GoalList({ items }: { items: any[] }) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {items.map((g) => {
        const score = g.stats?.currentScore ?? 0;
        const state = g.stats?.state ?? "unknown";
        const id = g._id?.toString() || g.id;

        return (
          <div 
            key={id} 
            onClick={() => router.push(`/goals/${id}`)}
            className="rounded-xl p-5 space-y-4 bg-[#1F2023] border border-[#2A2B2F] cursor-pointer transition-all duration-200 hover:border-[#3A3C42] shadow-sm"
          >
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <div className="font-semibold text-lg text-gray-100">{g.title}</div>
                {g.pressure?.status && g.pressure.status !== "aligned" && (
                  <div className="text-xs text-gray-400">
                    {pressureLabel(g.pressure.status)}
                  </div>
                )}
              </div>
              <StateBadge state={state} />
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium text-gray-400">
                <span>Progress</span>
                <span>{score}%</span>
              </div>
              <div className="h-1.5 bg-[#2A2B2F] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#E8414A] transition-all rounded-full"
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, string> = {
    on_track: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    slow: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    drifting: "bg-red-500/20 text-red-400 border border-red-500/30",
    stalled: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
    recovering: "bg-[#E8414A]/20 text-[#E8414A] border border-[#E8414A]/30",
    unknown: "bg-[#2A2B2F] text-gray-400 border border-[#2A2B2F]",
  };

  return (
    <span
      className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
        map[state] || map.unknown
      }`}
    >
      {state.replace("_", " ")}
    </span>
  );
}

function pressureLabel(status: string) {
  switch (status) {
    case "strained":
      return "Slightly heavy for current phase";
    case "conflicting":
      return "Conflicts with current life phase";
    case "toxic":
      return "Actively increasing life pressure";
    default:
      return "";
  }
}
