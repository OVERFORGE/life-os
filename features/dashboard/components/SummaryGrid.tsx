import { Log, average } from "../utils/stats";

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-4">
      <div className="text-sm text-gray-400">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

export function SummaryGrid({ logs }: { logs: Log[] }) {
  const last7 = logs.slice(-7);

  const avgMood = average(last7.map((l) => l.mental?.mood || 0));
  const avgEnergy = average(last7.map((l) => l.mental?.energy || 0));

  const gymDays = last7.filter((l) => l.physical?.gym).length;
  const codingDays = last7.filter((l) => l.work?.coded).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard title="Avg Mood (7d)" value={avgMood.toFixed(1)} />
      <StatCard title="Avg Energy (7d)" value={avgEnergy.toFixed(1)} />
      <StatCard title="Gym Days (7d)" value={String(gymDays)} />
      <StatCard title="Coding Days (7d)" value={String(codingDays)} />
    </div>
  );
}
