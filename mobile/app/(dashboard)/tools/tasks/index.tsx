import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, CheckCircle, Circle, Clock, Flame, BatteryMedium, Plus } from 'lucide-react-native';
import { fetchWithAuth } from '../../../../utils/api';
import { useCallback } from 'react';

export default function TasksScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tasksData, setTasksData] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [])
  );

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/tasks/list');
      if (res.ok) setTasksData(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (taskId: string) => {
    try {
      const res = await fetchWithAuth('/tasks/complete', {
        method: 'POST',
        body: JSON.stringify({ taskId, action: 'complete' })
      });
      if (res.ok) loadTasks();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#0f1115] items-center justify-center">
        <ActivityIndicator color="#4b5563" />
      </View>
    );
  }

  const renderTask = (task: any, isOverdue = false) => (
    <TouchableOpacity
      key={task._id}
      className="flex-row items-center bg-[#161922] p-4 rounded-xl border border-[#232632] mb-3"
      onPress={() => handleComplete(task._id)}
    >
      <View className="mr-4">
        {task.status === 'completed' ? (
          <CheckCircle size={24} color="#10b981" />
        ) : (
          <Circle size={24} color={isOverdue ? "#ef4444" : "#4b5563"} />
        )}
      </View>
      <View className="flex-1">
        <Text className={`text-gray-100 font-medium ${task.status === 'completed' ? 'line-through opacity-50' : ''}`}>
          {task.title}
        </Text>
        {task.description ? (
          <Text className="text-gray-400 text-sm mt-1">{task.description}</Text>
        ) : null}
        
        <View className="flex-row items-center mt-2 space-x-3">
          {task.dueTime && (
            <View className="flex-row items-center bg-[#232632] px-2 py-1 rounded">
              <Clock size={12} color="#9ca3af" className="mr-1" />
              <Text className="text-xs text-gray-400">{task.dueTime}</Text>
            </View>
          )}
          {task.metadata?.energyCost && (
            <View className="flex-row items-center bg-[#232632] px-2 py-1 rounded">
              <BatteryMedium size={12} color="#fbbf24" className="mr-1" />
              <Text className="text-xs text-gray-400">{task.metadata.energyCost}/10 Energy</Text>
            </View>
          )}
          {task.priority === 'high' && (
            <View className="flex-row items-center bg-[#451a1e] px-2 py-1 rounded">
              <Flame size={12} color="#ef4444" className="mr-1" />
              <Text className="text-xs text-red-400">High</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* Header */}
      <View className="px-6 pt-16 pb-4 border-b border-[#232632] flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-full border border-[#232632] bg-[#161922] items-center justify-center">
          <ArrowLeft color="#f3f4f6" size={20} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-100">Tasks</Text>
        <TouchableOpacity onPress={() => router.push('/(dashboard)/tools/tasks/new')} className="w-10 h-10 rounded-full border border-[#232632] bg-blue-600/20 items-center justify-center">
          <Plus color="#3b82f6" size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        {tasksData?.overdue?.length > 0 && (
          <View className="mb-6">
            <Text className="text-red-400 font-bold mb-3 uppercase text-xs tracking-wider">Overdue</Text>
            {tasksData.overdue.map((t: any) => renderTask(t, true))}
          </View>
        )}

        <View className="mb-6">
          <Text className="text-gray-400 font-bold mb-3 uppercase text-xs tracking-wider">Today</Text>
          {tasksData?.today?.length > 0 ? (
            tasksData.today.map((t: any) => renderTask(t))
          ) : (
            <Text className="text-gray-500 italic text-center py-4 bg-[#161922] rounded-xl border border-[#232632]">
              No tasks for today.
            </Text>
          )}
        </View>

        {tasksData?.upcoming?.length > 0 && (
          <View className="mb-6">
            <Text className="text-blue-400 font-bold mb-3 uppercase text-xs tracking-wider">Upcoming</Text>
            {tasksData.upcoming.map((t: any) => renderTask(t))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
