import Link from "next/link";
import { Log, average } from "../utils/stats";

function StatCard({ title, value, href }: { title: string; value: string; href?: string }) {
  const content = (
    <div className="bg-[#1F2023] border border-[#2A2B2F] hover:border-[#E8414A]/40 hover:bg-[#25262B] transition-all rounded-xl p-4 cursor-pointer group">
      <div className="text-sm text-gray-400 group-hover:text-gray-300">{title}</div>
      <div className="text-2xl font-bold text-gray-100 group-hover:text-white font-mono">{value}</div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

export function SummaryGrid({ logs }: { logs: Log[] }) {
  const safeLogs = Array.isArray(logs) ? logs : [];
  const last7 = safeLogs.slice(-7);

  const avgMood = average(last7.map((l) => l.mental?.mood || 0));
  const avgEnergy = average(last7.map((l) => l.mental?.energy || 0));

  const gymDays = last7.filter((l) => l.physical?.gym).length;
  const codingDays = last7.filter((l) => l.work?.coded).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard title="Avg Mood (7d)" value={avgMood.toFixed(1)} href="/checkin" />
      <StatCard title="Avg Energy (7d)" value={avgEnergy.toFixed(1)} href="/checkin" />
      <StatCard title="Gym Days (7d)" value={String(gymDays)} href="/gym" />
      <StatCard title="Coding Days (7d)" value={String(codingDays)} href="/checkin" />
    </div>
  );
}
