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

import { Moon, Smile, Dumbbell,Flame, Zap, Brain, Code2, TrendingUp, TrendingDown } from "lucide-react";

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
  const gymStreak = calculateStreak(logs, (l) => l.physical?.gym === true);
  const codingStreak = calculateStreak(logs, (l) => l.work?.coded === true);
  const noFapStreak = calculateStreak(logs, (l) => l.habits?.noFap === true);


  const avgMood =
    last7.reduce((s, l) => s + (l.mental?.mood ?? 0), 0) / (last7.length || 1);

  const avgEnergy =
    last7.reduce((s, l) => s + (l.mental?.energy ?? 0), 0) /
    (last7.length || 1);

  const gymDays = last7.filter((l) => l.physical?.gym).length;
  const codingDays = last7.filter((l) => l.work?.coded).length;

  const valid = logs.filter(
  (l) =>
    l.sleep?.hours &&
    l.mental?.mood &&
    l.physical &&
    l.work
);

    // Sleep vs Mood
    const sleepHours = valid.map((l) => l.sleep!.hours);
    const moodVals = valid.map((l) => l.mental!.mood);

    // Gym vs Energy (convert boolean → number)
    const gymVals = valid.map((l) => (l.physical!.gym ? 1 : 0));
    const energyVals = valid.map((l) => l.mental!.energy);

    // Sleep Quality vs Focus
    const sleepQualityVals = valid.map((l) => l.sleep!.quality);
    const focusVals = valid.map((l) => l.mental!.focus);

    // Coding vs Focus
    const codingVals = valid.map((l) => (l.work!.coded ? 1 : 0));

    const sleepMoodCorr = pearsonCorrelation(sleepHours, moodVals);
    const gymEnergyCorr = pearsonCorrelation(gymVals, energyVals);
    const sleepFocusCorr = pearsonCorrelation(sleepQualityVals, focusVals);
    const codingFocusCorr = pearsonCorrelation(codingVals, focusVals);


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
        <div className="bg-[#161922] border border-[#232632] rounded-xl p-4 space-y-4">
        <div className="space-y-4">
            <div className="font-medium">Insights</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InsightCard
                    title="Sleep vs Mood"
                    value={sleepMoodCorr}
                    positive={sleepMoodCorr > 0}
                    description="More sleep is associated with better mood."
                    iconLeft={<Moon className="w-4 h-4" />}
                    iconRight={<Smile className="w-4 h-4" />}
                    />

                    <InsightCard
                    title="Gym vs Energy"
                    value={gymEnergyCorr}
                    positive={gymEnergyCorr > 0}
                    description="Working out seems to boost your energy."
                    iconLeft={<Dumbbell className="w-4 h-4" />}
                    iconRight={<Zap className="w-4 h-4" />}
                    />

                    <InsightCard
                    title="Sleep Quality vs Focus"
                    value={sleepFocusCorr}
                    positive={sleepFocusCorr > 0}
                    description="Better sleep quality improves your focus."
                    iconLeft={<Moon className="w-4 h-4" />}
                    iconRight={<Brain className="w-4 h-4" />}
                    />

                    <InsightCard
                    title="Coding vs Focus"
                    value={codingFocusCorr}
                    positive={codingFocusCorr > 0}
                    description="Coding days are linked with higher focus."
                    iconLeft={<Code2 className="w-4 h-4" />}
                    iconRight={<Brain className="w-4 h-4" />}
                    />
                </div>
            </div>
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
      <div className="w-10 h-10 rounded-lg bg-[#0f1115] border border-[#232632] flex items-center justify-center text-gray-300">
        {icon}
      </div>

      <div>
        <div className="text-sm text-gray-400">{title}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function InsightCard({
  title,
  value,
  description,
  positive,
  iconLeft,
  iconRight,
}: {
  title: string;
  value: number;
  description: string;
  positive: boolean;
  iconLeft: React.ReactNode;
  iconRight: React.ReactNode;
}) {
  const strength =
    Math.abs(value) > 0.6
      ? "Strong"
      : Math.abs(value) > 0.3
      ? "Moderate"
      : "Weak";

  const color =
    Math.abs(value) > 0.6
      ? "text-green-400"
      : Math.abs(value) > 0.3
      ? "text-yellow-400"
      : "text-gray-400";

  const TrendIcon = positive ? TrendingUp : TrendingDown;

  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-300">
          <div className="w-8 h-8 rounded-lg bg-[#0f1115] border border-[#232632] flex items-center justify-center">
            {iconLeft}
          </div>
          <span>→</span>
          <div className="w-8 h-8 rounded-lg bg-[#0f1115] border border-[#232632] flex items-center justify-center">
            {iconRight}
          </div>
        </div>

        <TrendIcon className={`w-5 h-5 ${positive ? "text-green-400" : "text-red-400"}`} />
      </div>

      <div>
        <div className="text-sm text-gray-400">{title}</div>
        <div className={`text-lg font-semibold ${color}`}>
          {strength} ({value.toFixed(2)})
        </div>
      </div>

      <div className="text-xs text-gray-400">
        {description}
      </div>
    </div>
  );
}


function calculateStreak<T>(
  logs: T[],
  predicate: (log: T) => boolean
): number {
  let streak = 0;

  // Start from latest day, go backwards
  for (let i = logs.length - 1; i >= 0; i--) {
    if (predicate(logs[i])) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function pearsonCorrelation(x: number[], y: number[]) {
  const n = x.length;
  if (n === 0) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  return num / Math.sqrt(denX * denY || 1);
}

function CorrelationRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const strength =
    Math.abs(value) > 0.6
      ? "Strong"
      : Math.abs(value) > 0.3
      ? "Moderate"
      : "Weak";

  const color =
    Math.abs(value) > 0.6
      ? "text-green-400"
      : Math.abs(value) > 0.3
      ? "text-yellow-400"
      : "text-gray-400";

  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={color}>
        {strength} ({value.toFixed(2)})
      </span>
    </div>
  );
}
