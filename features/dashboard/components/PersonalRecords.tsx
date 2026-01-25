import {
  Dumbbell,
  Code2,
  Flame,
  Moon,
  Zap,
  Brain,
  Trophy,
} from "lucide-react";
import { Log } from "../utils/stats";
import { computePersonalRecords } from "../utils/records";

function RecordCard({
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
      <div className="w-10 h-10 rounded-lg bg-[#0f1115] border border-[#232632] flex items-center justify-center text-yellow-400">
        {icon}
      </div>
      <div>
        <div className="text-sm text-gray-400">{title}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}

export function PersonalRecords({ logs }: { logs: Log[] }) {
  const r = computePersonalRecords(logs);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-medium">
        <Trophy className="w-5 h-5 text-yellow-400" />
        <span>Personal Records</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RecordCard
          title="Longest Gym Streak"
          value={`${r.bestGymStreak} days`}
          icon={<Dumbbell className="w-5 h-5" />}
        />

        <RecordCard
          title="Longest Coding Streak"
          value={`${r.bestCodingStreak} days`}
          icon={<Code2 className="w-5 h-5" />}
        />

        <RecordCard
          title="Longest NoFap Streak"
          value={`${r.bestNoFapStreak} days`}
          icon={<Flame className="w-5 h-5" />}
        />

        <RecordCard
          title="Best Sleep Week"
          value={`${r.bestSleepWeek.toFixed(1)} h/day`}
          icon={<Moon className="w-5 h-5" />}
        />

        <RecordCard
          title="Best Energy Week"
          value={`${r.bestEnergyWeek.toFixed(1)} /10`}
          icon={<Zap className="w-5 h-5" />}
        />

        <RecordCard
          title="Best Focus Day"
          value={`${r.bestFocusDay} /10`}
          icon={<Brain className="w-5 h-5" />}
        />

        <RecordCard
          title="Best Discipline Day"
          value={`${r.bestDisciplineDay.toFixed(1)} score`}
          icon={<Trophy className="w-5 h-5" />}
        />
      </div>
    </div>
  );
}
