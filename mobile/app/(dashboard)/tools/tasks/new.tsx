import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Calendar, Clock, Target, Repeat, BatteryMedium, Timer } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { fetchWithAuth } from '../../../../utils/api';

export default function NewTaskScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [goals, setGoals] = useState<any[]>([]);
  
  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Date & Time State
  const [dueDate, setDueDate] = useState(new Date());
  const [dueTime, setDueTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Other fields
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [recurringType, setRecurringType] = useState<'none' | 'daily' | 'weekly' | 'custom'>('none');
  const [recurringInterval, setRecurringInterval] = useState('1');
  const [goalId, setGoalId] = useState<string | null>(null);
  
  // Metadata
  const [energyCost, setEnergyCost] = useState(5);
  const [estimatedDuration, setEstimatedDuration] = useState('');

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      const res = await fetchWithAuth('/goals/list');
      if (res.ok) {
        const data = await res.json();
        setGoals(data);
      }
    } catch (e) {
      console.error('Failed to fetch goals', e);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) setDueDate(selectedDate);
  };

  const onTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) setDueTime(selectedTime);
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    
    setLoading(true);
    
    // Format recurring object if not 'none'
    let recurring = null;
    if (recurringType !== 'none') {
      recurring = {
        type: recurringType,
        interval: recurringType === 'custom' ? parseInt(recurringInterval) || 1 : 1,
      };
    }

    try {
      const res = await fetchWithAuth('/tasks/create', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          dueDate: dueDate.toISOString().split('T')[0],
          dueTime: dueTime ? `${dueTime.getHours().toString().padStart(2, '0')}:${dueTime.getMinutes().toString().padStart(2, '0')}` : null,
          priority,
          recurring,
          goalId,
          metadata: {
            energyCost,
            estimatedDuration: estimatedDuration ? parseInt(estimatedDuration) : null,
          }
        })
      });
      
      if (res.ok) {
        router.back();
      } else {
        console.error('Failed to create task');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* ─── Header ─── */}
      <View className="px-6 pt-16 pb-4 border-b border-[#232632] flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-full border border-[#232632] bg-[#161922] items-center justify-center">
          <ArrowLeft color="#f3f4f6" size={20} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-100">New Task</Text>
        <View className="w-10 h-10" />
      </View>

      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* ─── Core Info ─── */}
        <View className="mb-6">
          <Text className="text-gray-400 font-bold mb-2 uppercase text-xs tracking-wider">Task Details</Text>
          <TextInput
            className="bg-[#161922] text-gray-100 border border-[#232632] p-4 rounded-xl mb-3 font-medium text-base"
            placeholder="What needs to be done?"
            placeholderTextColor="#4b5563"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            className="bg-[#161922] text-gray-100 border border-[#232632] p-4 rounded-xl h-24"
            placeholder="Add context or notes... (Optional)"
            placeholderTextColor="#4b5563"
            multiline
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* ─── Date & Time ─── */}
        <View className="flex-row space-x-4 mb-6">
          <View className="flex-1 mr-2">
            <Text className="text-gray-400 font-bold mb-2 uppercase text-xs tracking-wider">Date</Text>
            <TouchableOpacity 
              onPress={() => setShowDatePicker(true)}
              className="bg-[#161922] border border-[#232632] p-4 rounded-xl flex-row items-center"
            >
              <Calendar color="#9ca3af" size={18} className="mr-3" />
              <Text className="text-gray-100 font-medium">{dueDate.toLocaleDateString()}</Text>
            </TouchableOpacity>
          </View>
          <View className="flex-1 ml-2">
            <Text className="text-gray-400 font-bold mb-2 uppercase text-xs tracking-wider">Time</Text>
            <TouchableOpacity 
              onPress={() => setShowTimePicker(true)}
              className="bg-[#161922] border border-[#232632] p-4 rounded-xl flex-row items-center"
            >
              <Clock color="#9ca3af" size={18} className="mr-3" />
              <Text className={dueTime ? "text-gray-100 font-medium" : "text-gray-500 font-medium"}>
                {dueTime ? dueTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Anytime'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={dueDate}
            mode="date"
            display="default"
            onChange={onDateChange}
          />
        )}
        
        {showTimePicker && (
          <DateTimePicker
            value={dueTime || new Date()}
            mode="time"
            display="default"
            onChange={onTimeChange}
          />
        )}

        {/* ─── Priority ─── */}
        <View className="mb-6">
          <Text className="text-gray-400 font-bold mb-2 uppercase text-xs tracking-wider">Priority</Text>
          <View className="flex-row bg-[#161922] border border-[#232632] rounded-xl p-1">
            {['low', 'medium', 'high'].map(p => (
              <TouchableOpacity
                key={p}
                className={`flex-1 py-3 rounded-lg items-center ${priority === p ? 'bg-[#2a2d3b]' : ''}`}
                onPress={() => setPriority(p as any)}
              >
                <Text className={`capitalize ${priority === p ? 'text-white font-bold' : 'text-gray-500'}`}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ─── Recurring ─── */}
        <View className="mb-6">
          <View className="flex-row items-center mb-2">
            <Repeat color="#9ca3af" size={14} className="mr-2" />
            <Text className="text-gray-400 font-bold uppercase text-xs tracking-wider">Recurrence</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            {['none', 'daily', 'weekly', 'custom'].map(rt => (
              <TouchableOpacity
                key={rt}
                onPress={() => setRecurringType(rt as any)}
                className={`mr-3 px-5 py-2.5 rounded-full border ${recurringType === rt ? 'bg-blue-600/20 border-blue-500' : 'bg-[#161922] border-[#232632]'}`}
              >
                <Text className={`capitalize ${recurringType === rt ? 'text-blue-400 font-bold' : 'text-gray-400'}`}>{rt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {recurringType === 'custom' && (
            <View className="mt-4 flex-row items-center bg-[#161922] border border-[#232632] rounded-xl p-2 px-4">
              <Text className="text-gray-400 mr-4">Repeat every</Text>
              <TextInput
                className="text-white text-lg font-bold w-12 text-center bg-[#232632] rounded-lg py-1"
                keyboardType="numeric"
                value={recurringInterval}
                onChangeText={setRecurringInterval}
              />
              <Text className="text-gray-400 ml-4">days</Text>
            </View>
          )}
        </View>

        {/* ─── Link to Goal ─── */}
        {goals.length > 0 && (
          <View className="mb-6">
            <View className="flex-row items-center mb-2">
              <Target color="#9ca3af" size={14} className="mr-2" />
              <Text className="text-gray-400 font-bold uppercase text-xs tracking-wider">Link to Active Goal</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              <TouchableOpacity
                onPress={() => setGoalId(null)}
                className={`mr-3 px-4 py-3 rounded-xl border ${goalId === null ? 'bg-gray-600/20 border-gray-500' : 'bg-[#161922] border-[#232632]'}`}
              >
                <Text className={goalId === null ? 'text-gray-200 font-medium' : 'text-gray-500'}>None</Text>
              </TouchableOpacity>
              {goals.map(g => (
                <TouchableOpacity
                  key={g.id}
                  onPress={() => setGoalId(g.id)}
                  className={`mr-3 px-4 py-3 rounded-xl border ${goalId === g.id ? 'bg-amber-500/20 border-amber-500' : 'bg-[#161922] border-[#232632]'}`}
                >
                  <Text className={goalId === g.id ? 'text-amber-400 font-bold' : 'text-gray-300'}>{g.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ─── Execution Metadata ─── */}
        <View className="mb-8">
          <Text className="text-gray-400 font-bold mb-3 uppercase text-xs tracking-wider">Execution Metadata</Text>
          
          <View className="bg-[#161922] border border-[#232632] rounded-xl p-4">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <BatteryMedium color="#fbbf24" size={18} className="mr-2" />
                <Text className="text-gray-300 font-medium">Energy Cost</Text>
              </View>
              <Text className="text-amber-400 font-bold">{energyCost}/10</Text>
            </View>
            
            <View className="flex-row justify-between w-full mb-6">
              {[2, 4, 6, 8, 10].map(val => (
                <TouchableOpacity
                  key={val}
                  onPress={() => setEnergyCost(val)}
                  className={`w-12 h-10 rounded-lg items-center justify-center border ${energyCost === val ? 'bg-amber-500/20 border-amber-500' : 'bg-[#232632] border-transparent'}`}
                >
                  <Text className={energyCost === val ? 'text-amber-400 font-bold' : 'text-gray-500'}>{val}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="flex-row items-center justify-between pt-4 border-t border-[#232632]">
              <View className="flex-row items-center">
                <Timer color="#9ca3af" size={18} className="mr-2" />
                <Text className="text-gray-300 font-medium">Est. Minutes</Text>
              </View>
              <TextInput
                className="bg-[#232632] text-white font-medium px-4 py-2 rounded-lg w-24 text-center"
                placeholder="e.g. 30"
                placeholderTextColor="#6b7280"
                keyboardType="numeric"
                value={estimatedDuration}
                onChangeText={setEstimatedDuration}
              />
            </View>
          </View>
        </View>

        {/* ─── Submit Button ─── */}
        <TouchableOpacity 
          className={`rounded-2xl py-4 items-center flex-row justify-center mb-12 shadow-lg ${!title.trim() ? 'bg-blue-600/50' : 'bg-blue-600'}`}
          onPress={handleCreate}
          disabled={loading || !title.trim()}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-lg">Create Task</Text>
          )}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}
