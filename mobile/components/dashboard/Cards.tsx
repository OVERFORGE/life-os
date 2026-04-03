import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Brain, ArrowRight, Activity, Flame } from 'lucide-react-native';

export function TrajectoryCard({ data }: { data: any }) {
  const router = useRouter();

  if (!data) return null;

  const phaseLabel = data.phase?.replace("_", " ") || "Unknown";
  const confidencePct = Math.round((data.confidence || 0) * 100);

  const phaseColorMap: Record<string, string> = {
    grind: "text-blue-400",
    burnout: "text-red-400",
    recovery: "text-green-400",
    slump: "text-yellow-400",
    balanced: "text-gray-300",
  };
  const phaseThemeMap: Record<string, string> = {
    grind: "#60a5fa",
    burnout: "#f87171",
    recovery: "#4ade80",
    slump: "#facc15",
    balanced: "#d1d5db",
  };

  const colorClass = phaseColorMap[data.phase] || "text-gray-400";
  const hexColor = phaseThemeMap[data.phase] || "#9ca3af";

  return (
    <TouchableOpacity 
      activeOpacity={0.7}
      onPress={() => router.push("/(dashboard)/trajectory")}
      className="bg-[#161922] border border-[#232632] rounded-xl p-5 mb-4"
    >
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-xs text-gray-400 font-medium tracking-wider uppercase">Life State</Text>
        <Brain size={18} color={hexColor} />
      </View>

      <View className="mb-3">
        <Text className={`text-2xl font-bold capitalize ${colorClass}`}>
          {phaseLabel}
        </Text>
        <Text className="text-xs text-gray-500 mt-1">
          Confidence: {confidencePct}%
        </Text>
      </View>

      <Text className="text-sm text-gray-300 leading-relaxed mb-4">
        {data.reason || "Analyzing trajectory..."}
      </Text>

      {data.insights && data.insights.length > 0 && (
        <View className="mb-4 space-y-2">
          {data.insights.slice(0, 2).map((insight: string, idx: number) => (
            <View key={idx} className="flex-row items-start pr-4">
              <View className="w-1.5 h-1.5 rounded-full bg-gray-600 mt-1.5 mr-2" />
              <Text className="text-xs text-gray-400">{insight}</Text>
            </View>
          ))}
        </View>
      )}

      <View className="pt-3 border-t border-[#232632] flex-row items-center justify-between">
        <Text className="text-xs text-gray-500 font-medium tracking-wide">VIEW TIMELINE</Text>
        <ArrowRight size={14} color="#6b7280" />
      </View>
    </TouchableOpacity>
  );
}

export function CurrentEraCard() {
  const router = useRouter();
  
  return (
    <TouchableOpacity 
      activeOpacity={0.7}
      onPress={() => router.push("/(dashboard)/era/current")}
      className="bg-[#161922] border border-[#232632] rounded-xl p-5 mb-6"
    >
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-xs text-gray-400 font-medium tracking-wider uppercase">Current Era</Text>
        <Flame size={18} color="#f59e0b" />
      </View>

      <View className="mb-3">
        <Text className="text-2xl font-bold capitalize text-amber-500">
          The Builder Era
        </Text>
        <Text className="text-xs text-gray-500 mt-1">
          Day 42 • High Momentum
        </Text>
      </View>

      <Text className="text-sm text-gray-300 leading-relaxed mb-4">
        Focusing heavily on product iteration and core habit stabilization. Output is extremely high.
      </Text>

      <View className="pt-3 border-t border-[#232632] flex-row items-center justify-between">
        <Text className="text-xs text-gray-500 font-medium tracking-wide">VIEW ERA DETAILS</Text>
        <ArrowRight size={14} color="#6b7280" />
      </View>
    </TouchableOpacity>
  );
}

export function GoalLoadCard({ goalLoad }: { goalLoad: any }) {
  return (
    <View className="bg-[#161922] flex-1 border border-[#232632] rounded-xl p-5 mb-6">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs text-gray-400 uppercase tracking-wider">Goal Load</Text>
        <Activity size={18} color="#3b82f6" />
      </View>
      <Text className="text-3xl font-bold text-gray-100 mb-1">
        {goalLoad && goalLoad.goalLoad ? goalLoad.goalLoad.toFixed(1) : "0.0"}
      </Text>
      <Text className="text-xs text-blue-400">Current systemic friction</Text>
    </View>
  );
}
