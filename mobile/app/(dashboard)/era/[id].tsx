import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Flame, ArrowLeft } from 'lucide-react-native';

export default function EraScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  return (
    <View className="flex-1 bg-[#0f1115] p-6 pt-12">
      <TouchableOpacity onPress={() => router.back()} className="mb-6 flex-row items-center">
        <ArrowLeft size={20} color="#9ca3af" />
        <Text className="text-gray-400 ml-2 font-medium">Dashboard</Text>
      </TouchableOpacity>

      <View className="flex-row items-center mb-6">
        <Flame size={28} color="#f59e0b" />
        <Text className="text-2xl font-bold text-gray-100 ml-3">Era Overview</Text>
      </View>

      <View className="bg-[#161922] border border-[#232632] rounded-xl p-5 mb-6">
        <Text className="text-gray-400 leading-relaxed text-sm">
          This is a placeholder for the immersive Era detailed view (ID: {id}). Future updates will show all habit metrics tied to this specific life era.
        </Text>
      </View>
    </View>
  );
}
