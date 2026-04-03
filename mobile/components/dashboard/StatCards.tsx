import { View, Text } from 'react-native';

export type Log = {
  date: string;
  mental?: { mood?: number; energy?: number; stress?: number; anxiety?: number; focus?: number; };
  sleep?: { hours?: number; quality?: number; };
  physical?: { gym?: boolean; };
  work?: { coded?: boolean; deepWorkHours?: number; };
  habits?: { noFap?: boolean; };
};

export function calculateStreak<T>(logs: T[], predicate: (log: T) => boolean): number {
  let streak = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    if (predicate(logs[i])) streak++;
    else break;
  }
  return streak;
}

export function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <View className="bg-[#161922] flex-1 border border-[#232632] rounded-xl p-4 m-1 min-w-[45%]">
      <Text className="text-xs text-gray-400 capitalize mb-1" numberOfLines={1}>{title}</Text>
      <Text className="text-xl font-bold text-gray-100">{value}</Text>
    </View>
  );
}

export function SummaryGrid({ logs }: { logs: Log[] }) {
  const last7 = logs.slice(-7);
  const avgMood = average(last7.map((l) => l.mental?.mood || 0));
  const avgEnergy = average(last7.map((l) => l.mental?.energy || 0));
  const gymDays = last7.filter((l) => l.physical?.gym).length;
  const codingDays = last7.filter((l) => l.work?.coded).length;

  return (
    <View className="mb-6">
      <Text className="text-gray-100 font-semibold mb-3 text-lg px-1">7-Day Summary</Text>
      <View className="flex-row flex-wrap justify-between">
        <StatCard title="Avg Mood" value={avgMood.toFixed(1)} />
        <StatCard title="Avg Energy" value={avgEnergy.toFixed(1)} />
        <StatCard title="Gym Hits" value={String(gymDays)} />
        <StatCard title="Coded" value={String(codingDays)} />
      </View>
    </View>
  );
}

export function SystemInsightCard() {
  return (
    <View className="bg-[#161922] border border-[#232632] rounded-xl p-5 mb-6">
      <View className="flex-row items-center mb-2">
        <View className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
        <Text className="text-sm font-semibold text-gray-300">System Insight</Text>
      </View>
      <Text className="text-gray-400 text-sm leading-relaxed">
        Your current trajectory suggests a stabilization period. Maintain your baseline habits to secure the recovery phase.
      </Text>
    </View>
  );
}
