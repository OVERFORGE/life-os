import { Dumbbell, Code2, Flame } from "lucide-react";
import { Log, calculateStreak } from "../utils/stats";

function IconStatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-[#0f1115] border border-[#232632] flex items-center justify-center">
        {icon}
      </div>
      <div>
        <div className="text-sm text-gray-400">{title}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}

export function StreakGrid({ logs }: { logs: Log[] }) {
  const gymStreak = calculateStreak(logs, (l) => l.physical?.gym === true);
  const codingStreak = calculateStreak(logs, (l) => l.work?.coded === true);
  const noFapStreak = calculateStreak(logs, (l) => l.habits?.noFap === true);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <IconStatCard
        title="Gym Streak"
        value={`${gymStreak} days`}
        icon={<Dumbbell className="w-5 h-5" />}
      />
      <IconStatCard
        title="Coding Streak"
        value={`${codingStreak} days`}
        icon={<Code2 className="w-5 h-5" />}
      />
      <IconStatCard
        title="NoFap Streak"
        value={`${noFapStreak} days`}
        icon={<Flame className="w-5 h-5" />}
      />
    </div>
  );
}
