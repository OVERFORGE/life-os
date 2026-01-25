"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Log = {
  date: string;
  mental?: {
    mood?: number;
    energy?: number;
  };
  physical?: {
    gym?: boolean;
  };
  work?: {
    coded?: boolean;
  };
  habits?: {
    noFap?: boolean;
  };
};

export default function DashboardPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/daily-log/dashboard")
      .then((res) => res.json())
      .then((data) => setLogs(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading dashboard...</div>;
  }

  // Last 14 days for chart
  const last14 = logs.slice(-14);

  const chartData = last14.map((l) => ({
    date: l.date.slice(5), // MM-DD
    mood: l.mental?.mood ?? null,
    energy: l.mental?.energy ?? null,
  }));

  // Last 7 days stats
  const last7 = logs.slice(-7);

  const avgMood =
    last7.reduce((s, l) => s + (l.mental?.mood ?? 0), 0) / (last7.length || 1);

  const avgEnergy =
    last7.reduce((s, l) => s + (l.mental?.energy ?? 0), 0) /
    (last7.length || 1);

  const gymDays = last7.filter((l) => l.physical?.gym).length;
  const codingDays = last7.filter((l) => l.work?.coded).length;

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Avg Mood (7d)" value={avgMood.toFixed(1)} />
          <StatCard title="Avg Energy (7d)" value={avgEnergy.toFixed(1)} />
          <StatCard title="Gym Days (7d)" value={String(gymDays)} />
          <StatCard title="Coding Days (7d)" value={String(codingDays)} />
        </div>

        {/* Chart */}
        <div className="bg-[#161922] border border-[#232632] rounded-xl p-4 h-[300px]">
          <div className="mb-2 font-medium">Mood & Energy (Last 14 Days)</div>

          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="date" />
              <YAxis domain={[0, 10]} />
              <Tooltip />
              <Line type="monotone" dataKey="mood" stroke="#60a5fa" />
              <Line type="monotone" dataKey="energy" stroke="#34d399" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-4">
      <div className="text-sm text-gray-400">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
