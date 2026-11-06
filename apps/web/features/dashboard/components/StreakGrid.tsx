import Link from "next/link";
import { Dumbbell, Code2, Flame } from "lucide-react";
import { Log, calculateStreak } from "../utils/stats";

function IconStatCard({
  title,
  value,
  icon,
  href,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const content = (
    <div className="bg-[#1F2023] border border-[#2A2B2F] hover:border-[#E8414A]/40 hover:bg-[#25262B] transition-all rounded-xl p-4 flex items-center gap-4 cursor-pointer group">
      <div className="w-10 h-10 rounded-lg bg-[#161618] border border-[#2A2B2F] flex items-center justify-center text-gray-300 group-hover:text-white">
        {icon}
      </div>
      <div>
        <div className="text-sm text-gray-400 group-hover:text-gray-300">{title}</div>
        <div className="text-xl font-bold text-gray-100 group-hover:text-white font-mono">{value}</div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
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
        href="/gym"
      />
      <IconStatCard
        title="Coding Streak"
        value={`${codingStreak} days`}
        icon={<Code2 className="w-5 h-5" />}
        href="/checkin"
      />
      <IconStatCard
        title="NoFap Streak"
        value={`${noFapStreak} days`}
        icon={<Flame className="w-5 h-5" />}
        href="/checkin"
      />
    </div>
  );
}
