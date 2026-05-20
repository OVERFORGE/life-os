import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Heart, FileText, Target, Clock, ChevronRight, CheckSquare } from 'lucide-react-native';

export default function ToolsHubScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-[#161618]">
      {/* ─── Header ─── */}
      <BlurView intensity={20} tint="dark" className="pt-16 pb-4 px-6 border-b border-[#2A2B2F] flex-row justify-between items-center z-10">
        <View>
          <Text className="text-[#FFFDFC] font-bold text-[22px]">Tools & Modules</Text>
          <Text className="text-[#ECE7E3]/50 text-xs mt-1">Manage your life infrastructure</Text>
        </View>
      </BlurView>

      <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 120 }}>
        <Text className="text-[#ECE7E3]/70 text-xs font-bold uppercase tracking-wider mb-4">Available Modules</Text>

        {/* ─── Task Manager Card ─── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/tools/tasks')}
          className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 mb-4 flex-row items-center"
        >
          <View className="w-12 h-12 rounded-xl bg-[#2A2B2F] items-center justify-center mr-4">
            <CheckSquare size={24} color="#ECE7E3" />
          </View>
          <View className="flex-1">
            <Text className="text-[#FFFDFC] font-semibold text-base">Task Manager</Text>
            <Text className="text-[#ECE7E3]/50 text-sm mt-0.5">Manage daily schedule and to-dos</Text>
          </View>
          <ChevronRight size={20} color="rgba(236,231,227,0.3)" />
        </TouchableOpacity>

        {/* ─── Health Hub Card ─── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/health')}
          className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 mb-4 flex-row items-center"
        >
          <View className="w-12 h-12 rounded-xl bg-[#2A2B2F] items-center justify-center mr-4">
            <Heart size={24} color="#ECE7E3" />
          </View>
          <View className="flex-1">
            <Text className="text-[#FFFDFC] font-semibold text-base">Health Hub</Text>
            <Text className="text-[#ECE7E3]/50 text-sm mt-0.5">Biometrics, calories & weight</Text>
          </View>
          <ChevronRight size={20} color="rgba(236,231,227,0.3)" />
        </TouchableOpacity>

        {/* ─── Manual Daily Log Card ─── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/tools/daily-log')}
          className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 mb-4 flex-row items-center"
        >
          <View className="w-12 h-12 rounded-xl bg-[#2A2B2F] items-center justify-center mr-4">
            <FileText size={24} color="#ECE7E3" />
          </View>
          <View className="flex-1">
            <Text className="text-[#FFFDFC] font-semibold text-base">Daily Log Form</Text>
            <Text className="text-[#ECE7E3]/50 text-sm mt-0.5">Manual data entry for today</Text>
          </View>
          <ChevronRight size={20} color="rgba(236,231,227,0.3)" />
        </TouchableOpacity>

        {/* ─── Global Goals Card ─── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/tools/goals')}
          className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 mb-4 flex-row items-center"
        >
          <View className="w-12 h-12 rounded-xl bg-[#2A2B2F] items-center justify-center mr-4">
            <Target size={24} color="#ECE7E3" />
          </View>
          <View className="flex-1">
            <Text className="text-[#FFFDFC] font-semibold text-base">Global Goals</Text>
            <Text className="text-[#ECE7E3]/50 text-sm mt-0.5">Manage life ambitions & targets</Text>
          </View>
          <ChevronRight size={20} color="rgba(236,231,227,0.3)" />
        </TouchableOpacity>

        {/* ─── Ambient Focus Card ─── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/tools/ambient')}
          className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 mb-4 flex-row items-center"
        >
          <View className="w-12 h-12 rounded-xl bg-[#2A2B2F] items-center justify-center mr-4">
            <Clock size={24} color="#ECE7E3" />
          </View>
          <View className="flex-1">
            <Text className="text-[#FFFDFC] font-semibold text-base">Ambient Focus</Text>
            <Text className="text-[#ECE7E3]/50 text-sm mt-0.5">Focus music & media notification</Text>
          </View>
          <ChevronRight size={20} color="rgba(236,231,227,0.3)" />
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}
