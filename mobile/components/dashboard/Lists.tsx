import { View, Text, ScrollView } from 'react-native';
import { Log, calculateStreak } from './StatCards';
import { Lightbulb, Trophy } from 'lucide-react-native';

export function StreakGrid({ logs }: { logs: Log[] }) {
  const isGym = (l: Log) => !!l.physical?.gym;
  const isCode = (l: Log) => !!l.work?.coded;
  const isNoFap = (l: Log) => !!l.habits?.noFap;

  const gymStreak = calculateStreak(logs, isGym);
  const codeStreak = calculateStreak(logs, isCode);
  const noFapStreak = calculateStreak(logs, isNoFap);

  return (
    <View className="mb-6">
      <Text className="text-[#FFFDFC] font-semibold mb-3 px-1">Current Streaks</Text>
      <View className="flex-row">
        <View className="flex-1 bg-[#1F2023] border border-[#2A2B2F] rounded-xl p-4 mr-2 items-center">
          <Text className="text-sm text-[#ECE7E3]/70 mb-1">Gym</Text>
          <Text className="text-2xl font-bold text-[#FFFDFC]">{gymStreak}</Text>
        </View>
        <View className="flex-1 bg-[#1F2023] border border-[#2A2B2F] rounded-xl p-4 mr-2 items-center">
          <Text className="text-sm text-[#ECE7E3]/70 mb-1">Code</Text>
          <Text className="text-2xl font-bold text-[#FFFDFC]">{codeStreak}</Text>
        </View>
        <View className="flex-1 bg-[#1F2023] border border-[#2A2B2F] rounded-xl p-4 items-center">
          <Text className="text-sm text-[#ECE7E3]/70 mb-1">Discipline</Text>
          <Text className="text-2xl font-bold text-[#FFFDFC]">{noFapStreak}</Text>
        </View>
      </View>
    </View>
  );
}

export function PersonalRecords({ logs }: { logs: Log[] }) {
  const maxDeepWork = Math.max(...logs.map((l) => l.work?.deepWorkHours || 0), 0);
  
  return (
    <View className="bg-[#1F2023] border border-[#2A2B2F] rounded-xl p-5 mb-6">
      <View className="flex-row items-center mb-3">
        <Trophy size={18} color="#E8414A" />
        <Text className="text-[#FFFDFC] font-semibold ml-2">Personal Records</Text>
      </View>
      
      <View className="flex-row justify-between items-center bg-[#161618] px-4 py-3 rounded-lg border border-[#2A2B2F] mb-2">
         <Text className="text-sm text-[#ECE7E3]/70">Deep Work Stream</Text>
         <Text className="font-bold text-[#FFFDFC]">{maxDeepWork} hours</Text>
      </View>
    </View>
  );
}

export function InsightsGrid({ logs }: { logs: Log[] }) {
  // Mock insights engine simply derived from logs for the mobile frontend
  const recentLogs = logs.slice(-3);
  const consecutiveLowMood = recentLogs.every(l => (l.mental?.mood ?? 10) < 5);

  return (
    <View className="bg-[#1F2023] border border-[#2A2B2F] rounded-xl p-5 mb-6">
      <View className="flex-row items-center mb-4">
        <Lightbulb size={18} color="#E8414A" />
        <Text className="text-[#FFFDFC] font-semibold ml-2">Recent Insights</Text>
      </View>

      {consecutiveLowMood ? (
        <View className="mb-3 border-l-2 border-[#E8414A] pl-3">
          <Text className="text-[#ECE7E3]/90 text-sm leading-relaxed">
            Mood has been under baseline for 3 consecutive days. Consider scheduling recovery.
          </Text>
        </View>
      ) : (
        <View className="mb-3 border-l-2 border-[#D62C35] pl-3">
          <Text className="text-[#ECE7E3]/90 text-sm leading-relaxed">
            Sustained positive energy correlation with Gym days. 
          </Text>
        </View>
      )}
    </View>
  );
}

export function Heatmap({ logs }: { logs: Log[] }) {
  // Mobile simplified heatmap
  const recent = logs.slice(-21); // exactly 3 weeks

  return (
    <View className="mb-10">
      <Text className="text-[#FFFDFC] font-semibold mb-3 px-1">Consistency Matrix</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pl-1">
        <View className="flex-row flex-wrap w-[250px] content-start">
            {recent.map((l, i) => {
              const coded = Boolean(l.work?.coded);
              const gym = Boolean(l.physical?.gym);
              let color = "bg-[#2A2B2F]";
              if (coded && gym) color = "bg-[#D62C35]";
              else if (coded) color = "bg-[#F3767D]";
              else if (gym) color = "bg-[#F9A8AC]";
              
              return (
                <View 
                  key={i} 
                  className={`w-5 h-5 rounded-sm m-[2px] ${color}`}
                />
              )
            })}
        </View>
      </ScrollView>
      <View className="flex-row items-center mt-3 ml-1">
        <View className="w-3 h-3 bg-[#2A2B2F] rounded-sm mr-1"/><Text className="text-[10px] text-[#ECE7E3]/50 mr-3">Miss</Text>
        <View className="w-3 h-3 bg-[#F3767D] rounded-sm mr-1"/><Text className="text-[10px] text-[#ECE7E3]/50 mr-3">Code</Text>
        <View className="w-3 h-3 bg-[#F9A8AC] rounded-sm mr-1"/><Text className="text-[10px] text-[#ECE7E3]/50 mr-3">Gym</Text>
        <View className="w-3 h-3 bg-[#D62C35] rounded-sm mr-1"/><Text className="text-[10px] text-[#ECE7E3]/50 mr-3">Both</Text>
      </View>
    </View>
  );
}
