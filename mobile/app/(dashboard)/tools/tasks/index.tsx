import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, CheckCircle, Circle, Clock, Flame, BatteryMedium, Plus, Trash2, Edit2, X } from 'lucide-react-native';
import { fetchWithAuth } from '../../../../utils/api';

export default function TasksScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tasksData, setTasksData] = useState<any>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);

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

  const toggleComplete = async (task: any) => {
    try {
      const action = task.status === 'completed' ? 'uncomplete' : 'complete';
      const res = await fetchWithAuth('/tasks/complete', {
        method: 'POST',
        body: JSON.stringify({ taskId: task._id, action })
      });
      if (res.ok) {
        if (selectedTask && selectedTask._id === task._id) {
          setSelectedTask({...selectedTask, status: action === 'complete' ? 'completed' : 'pending'});
        }
        loadTasks();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (taskId: string) => {
    Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const res = await fetchWithAuth(`/tasks/delete`, {
            method: 'POST',
            body: JSON.stringify({ taskId })
          });
          if (res.ok) {
            setSelectedTask(null);
            loadTasks();
          }
        } catch (e) {
          console.error(e);
        }
      }}
    ]);
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
      onPress={() => setSelectedTask(task)}
    >
      <TouchableOpacity onPress={() => toggleComplete(task)} className="mr-4 p-1">
        {task.status === 'completed' ? (
          <CheckCircle size={24} color="#10b981" />
        ) : (
          <Circle size={24} color={isOverdue ? "#ef4444" : "#4b5563"} />
        )}
      </TouchableOpacity>
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

      {/* Task Details Modal */}
      <Modal visible={!!selectedTask} animationType="slide" transparent={true}>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-[#161922] rounded-t-3xl border-t border-[#232632] p-6 max-h-[80%]">
            <View className="flex-row justify-between items-center mb-6">
              <View className="flex-row items-center">
                <TouchableOpacity onPress={() => toggleComplete(selectedTask)} className="mr-3">
                  {selectedTask?.status === 'completed' ? (
                    <CheckCircle size={28} color="#10b981" />
                  ) : (
                    <Circle size={28} color="#4b5563" />
                  )}
                </TouchableOpacity>
                <Text className={`text-xl font-bold text-white flex-1 ${selectedTask?.status === 'completed' ? 'line-through opacity-50' : ''}`} numberOfLines={2}>
                  {selectedTask?.title}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedTask(null)} className="w-8 h-8 bg-[#232632] rounded-full items-center justify-center">
                <X color="#9ca3af" size={16} />
              </TouchableOpacity>
            </View>

            <ScrollView className="mb-6">
              {selectedTask?.description && (
                <Text className="text-gray-300 text-base mb-6 leading-relaxed bg-[#0f1115] p-4 rounded-xl border border-[#232632]">
                  {selectedTask.description}
                </Text>
              )}

              <View className="flex-row flex-wrap">
                {selectedTask?.dueDate && (
                  <View className="bg-[#232632] px-3 py-2 rounded-lg flex-row items-center mr-3 mb-3">
                    <Clock size={16} color="#9ca3af" className="mr-2" />
                    <Text className="text-gray-300">{selectedTask.dueDate} {selectedTask.dueTime || ''}</Text>
                  </View>
                )}
                {selectedTask?.priority && (
                  <View className="bg-[#232632] px-3 py-2 rounded-lg flex-row items-center mr-3 mb-3">
                    <Flame size={16} color={selectedTask.priority === 'high' ? '#ef4444' : selectedTask.priority === 'low' ? '#3b82f6' : '#f59e0b'} className="mr-2" />
                    <Text className="text-gray-300 capitalize">{selectedTask.priority}</Text>
                  </View>
                )}
                {selectedTask?.metadata?.energyCost && (
                  <View className="bg-[#232632] px-3 py-2 rounded-lg flex-row items-center mr-3 mb-3">
                    <BatteryMedium size={16} color="#fbbf24" className="mr-2" />
                    <Text className="text-gray-300">{selectedTask.metadata.energyCost}/10 Energy</Text>
                  </View>
                )}
              </View>
            </ScrollView>

            <View className="flex-row justify-between space-x-4 pt-4 border-t border-[#232632]">
              <TouchableOpacity 
                onPress={() => {
                  setSelectedTask(null);
                  router.push(`/tools/tasks/new`); // We'll handle edit routing if requested, but basic edit can use a similar form. For now, we skip deep edit view unless built.
                  Alert.alert('Not Implemented', 'Edit screen coming soon!');
                }}
                className="flex-1 bg-blue-600/20 border border-blue-500 py-3 rounded-xl flex-row justify-center items-center"
              >
                <Edit2 color="#3b82f6" size={18} className="mr-2" />
                <Text className="text-blue-400 font-bold">Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => handleDelete(selectedTask?._id)}
                className="flex-1 bg-red-500/10 border border-red-500/50 py-3 rounded-xl flex-row justify-center items-center"
              >
                <Trash2 color="#ef4444" size={18} className="mr-2" />
                <Text className="text-red-400 font-bold">Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}
