import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Heart, FileText, Target, Clock, ChevronRight } from 'lucide-react-native';

export default function ToolsHubScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* ─── Header ─── */}
      <BlurView intensity={20} tint="dark" className="pt-16 pb-4 px-6 border-b border-[#232632] flex-row justify-between items-center z-10">
        <View>
          <Text className="text-white font-bold text-[22px]">Tools & Modules</Text>
          <Text className="text-gray-500 text-xs mt-1">Manage your life infrastructure</Text>
        </View>
        <TouchableOpacity 
          onPress={() => router.push('/(dashboard)/tools/history')}
          className="w-10 h-10 rounded-full bg-[#161922] border border-[#232632] items-center justify-center"
        >
          <Clock size={20} color="#9ca3af" />
        </TouchableOpacity>
      </BlurView>

      <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 120 }}>
        <Text className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-4">Available Modules</Text>

        {/* ─── Health Hub Card ─── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/health')}
          className="bg-[#161922] border border-[#232632] rounded-2xl p-5 mb-4 flex-row items-center"
        >
          <View className="w-12 h-12 rounded-xl bg-red-500/10 items-center justify-center mr-4">
            <Heart size={24} color="#ef4444" />
          </View>
          <View className="flex-1">
            <Text className="text-white font-semibold text-base">Health Hub</Text>
            <Text className="text-gray-500 text-sm mt-0.5">Biometrics, calories & weight</Text>
          </View>
          <ChevronRight size={20} color="#4b5563" />
        </TouchableOpacity>

        {/* ─── Manual Daily Log Card ─── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/tools/daily-log')}
          className="bg-[#161922] border border-[#232632] rounded-2xl p-5 mb-4 flex-row items-center"
        >
          <View className="w-12 h-12 rounded-xl bg-blue-500/10 items-center justify-center mr-4">
            <FileText size={24} color="#3b82f6" />
          </View>
          <View className="flex-1">
            <Text className="text-white font-semibold text-base">Daily Log Form</Text>
            <Text className="text-gray-500 text-sm mt-0.5">Manual data entry for today</Text>
          </View>
          <ChevronRight size={20} color="#4b5563" />
        </TouchableOpacity>

        {/* ─── Global Goals Card ─── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/tools/goals')}
          className="bg-[#161922] border border-[#232632] rounded-2xl p-5 mb-4 flex-row items-center"
        >
          <View className="w-12 h-12 rounded-xl bg-amber-500/10 items-center justify-center mr-4">
            <Target size={24} color="#f59e0b" />
          </View>
          <View className="flex-1">
            <Text className="text-white font-semibold text-base">Global Goals</Text>
            <Text className="text-gray-500 text-sm mt-0.5">Manage life ambitions & targets</Text>
          </View>
          <ChevronRight size={20} color="#4b5563" />
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}
