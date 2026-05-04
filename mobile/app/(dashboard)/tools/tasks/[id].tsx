import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, Alert, KeyboardAvoidingView
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Calendar, Clock, Target, Repeat, Zap, Timer, X, Plus, Bell } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { fetchWithAuth } from '../../../../utils/api';
import { scheduleTaskReminders } from '../../../../utils/notifications';

const PRIORITIES = [
  { key: 'low',    label: 'Low',    color: '#34d399', bg: '#064738' },
  { key: 'medium', label: 'Medium', color: '#fb923c', bg: '#7c2d12' },
  { key: 'high',   label: 'High',   color: '#f87171', bg: '#7f1d1d' },
];

export default function EditTaskScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goals, setGoals] = useState<any[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
  const [dueTime, setDueTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [recurringType, setRecurringType] = useState<'none' | 'daily' | 'weekly' | 'custom'>('none');
  const [recurringInterval, setRecurringInterval] = useState('1');
  const [goalId, setGoalId] = useState<string | null>(null);
  const [energyCost, setEnergyCost] = useState(5);
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [subtasks, setSubtasks] = useState<any[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [reminders, setReminders] = useState<Date[]>([]);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [pendingReminder, setPendingReminder] = useState<Date>(new Date());

  useEffect(() => {
    fetchGoals();
    if (id) fetchTask();
  }, [id]);

  const fetchGoals = async () => {
    try {
      const res = await fetchWithAuth('/goals/list');
      if (res.ok) setGoals(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchTask = async () => {
    try {
      const res = await fetchWithAuth('/tasks/list');
      if (res.ok) {
        const data = await res.json();
        const allTasks = [...(data.today || []), ...(data.overdue || []), ...(data.upcoming || [])];
        const task = allTasks.find((t: any) => t._id === id);
        
        if (task) {
          setTitle(task.title || '');
          setDescription(task.description || '');
          setPriority(task.priority || 'medium');
          setGoalId(task.goalId || null);
          
          if (task.dueDate) setDueDate(new Date(task.dueDate));
          if (task.dueTime) {
            const [h, m] = task.dueTime.split(':');
            const dt = new Date();
            dt.setHours(parseInt(h), parseInt(m), 0, 0);
            setDueTime(dt);
          }
          
          if (task.recurring) {
            setRecurringType(task.recurring.type || 'none');
            setRecurringInterval((task.recurring.interval || 1).toString());
          }
          
          if (task.metadata) {
            setEnergyCost(task.metadata.energyCost || 5);
            if (task.metadata.estimatedDuration) {
              setEstimatedDuration(task.metadata.estimatedDuration.toString());
            }
          }

          if (task.subtasks) {
            setSubtasks(task.subtasks);
          }

          // Load existing reminders as Date objects
          if (task.reminders && task.reminders.length > 0) {
            setReminders(task.reminders.map((r: string) => new Date(r)));
          }
        }
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not load task data.");
    } finally {
      setLoading(false);
    }
  };

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, { title: newSubtask.trim(), done: false }]);
    setNewSubtask('');
  };

  const removeSubtask = (idx: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== idx));
  };

  const toggleSubtask = (idx: number) => {
    const updated = [...subtasks];
    updated[idx].done = !updated[idx].done;
    setSubtasks(updated);
  };

  const handleUpdate = async () => {
    if (!title.trim()) return;
    setSaving(true);

    let recurring = null;
    if (recurringType !== 'none') {
      recurring = { type: recurringType, interval: recurringType === 'custom' ? parseInt(recurringInterval) || 1 : 1 };
    }

    const payload = {
      taskId: id,
      title,
      description,
      dueDate: dueDate.toISOString().split('T')[0],
      dueTime: dueTime
        ? `${dueTime.getHours().toString().padStart(2, '0')}:${dueTime.getMinutes().toString().padStart(2, '0')}`
        : null,
      priority,
      recurring,
      goalId,
      metadata: {
        energyCost,
        estimatedDuration: estimatedDuration ? parseInt(estimatedDuration) : null,
      },
      subtasks: subtasks.map(t => typeof t === 'string' ? { title: t, done: false } : { title: t.title || t, done: t.done || false }),
      reminders: reminders.map(r => r.toISOString()),
    };

    try {
      const res = await fetchWithAuth('/tasks/update', { method: 'POST', body: JSON.stringify(payload) });
      if (res.ok) {
        // Schedule local notifications for the updated reminders
        const resData = await res.json();
        if (resData.task) {
          scheduleTaskReminders(resData.task).catch(() => {});
        } else {
          scheduleTaskReminders({ _id: String(id), title, reminders: payload.reminders }).catch(() => {});
        }
        router.back();
      } else Alert.alert('Error', 'Failed to update task.');
    } catch (e) {
      Alert.alert('Error', 'Network error.');
    } finally {
      setSaving(false);
    }
  };

  const sectionLabel = (text: string) => (
    <Text style={{ color: '#6b7280', fontWeight: '700', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
      {text}
    </Text>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0b0e', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#8b5cf6" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#0a0b0e' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#12141a' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#12141a', borderWidth: 1, borderColor: '#1e2029', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft color="#9ca3af" size={18} />
        </TouchableOpacity>
        <Text style={{ color: '#f9fafb', fontWeight: '700', fontSize: 18 }}>Edit Task</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">

        {/* Title */}
        <View style={{ marginBottom: 20 }}>
          {sectionLabel('What needs to be done?')}
          <TextInput
            style={{ backgroundColor: '#12141a', color: '#f9fafb', borderWidth: 1, borderColor: '#1e2029', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontWeight: '600' }}
            placeholder="Task title..."
            placeholderTextColor="#4b5563"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={{ backgroundColor: '#12141a', color: '#f9fafb', borderWidth: 1, borderColor: '#1e2029', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, marginTop: 10, minHeight: 80, textAlignVertical: 'top' }}
            placeholder="Add context or notes... (optional)"
            placeholderTextColor="#4b5563"
            multiline
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* Date & Time */}
        <View style={{ marginBottom: 20 }}>
          {sectionLabel('Schedule')}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={{ flex: 1, backgroundColor: '#12141a', borderWidth: 1, borderColor: '#1e2029', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Calendar size={16} color="#8b5cf6" />
              <Text style={{ color: '#d1d5db', fontSize: 14, fontWeight: '500' }}>{dueDate.toLocaleDateString()}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowTimePicker(true)}
              style={{ flex: 1, backgroundColor: '#12141a', borderWidth: 1, borderColor: dueTime ? '#3b1d8a' : '#1e2029', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Clock size={16} color={dueTime ? '#a78bfa' : '#6b7280'} />
              <Text style={{ color: dueTime ? '#a78bfa' : '#6b7280', fontSize: 14, fontWeight: '500' }}>
                {dueTime ? dueTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Anytime'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker value={dueDate} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(Platform.OS === 'ios'); if (d) setDueDate(d); }} />
        )}
        {showTimePicker && (
          <DateTimePicker value={dueTime || new Date()} mode="time" display="default" onChange={(e, d) => { setShowTimePicker(Platform.OS === 'ios'); if (d) setDueTime(d); }} />
        )}

        {/* Priority */}
        <View style={{ marginBottom: 20 }}>
          {sectionLabel('Priority')}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {PRIORITIES.map(p => (
              <TouchableOpacity
                key={p.key}
                onPress={() => setPriority(p.key as any)}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: priority === p.key ? p.bg + '55' : '#12141a', borderWidth: 1.5, borderColor: priority === p.key ? p.color + '88' : '#1e2029' }}
              >
                <Text style={{ color: priority === p.key ? p.color : '#6b7280', fontWeight: '700', fontSize: 14 }}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sub-tasks */}
        <View style={{ marginBottom: 20 }}>
          {sectionLabel(`Subtasks (${subtasks.length})`)}
          {subtasks.map((s, idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#12141a', borderRadius: 12, borderWidth: 1, borderColor: '#1e2029', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 }}>
              <TouchableOpacity onPress={() => toggleSubtask(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: s.done ? '#8b5cf6' : '#4b5563', alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: s.done ? '#8b5cf6' : 'transparent' }}>
                {s.done && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />}
              </TouchableOpacity>
              <Text style={{ flex: 1, color: s.done ? '#6b7280' : '#d1d5db', fontSize: 14, textDecorationLine: s.done ? 'line-through' : 'none' }}>
                {s.title || s}
              </Text>
              <TouchableOpacity onPress={() => removeSubtask(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color="#6b7280" />
              </TouchableOpacity>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={{ flex: 1, backgroundColor: '#12141a', color: '#f9fafb', borderWidth: 1, borderColor: '#1e2029', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 }}
              placeholder="Add a subtask..."
              placeholderTextColor="#4b5563"
              value={newSubtask}
              onChangeText={setNewSubtask}
              onSubmitEditing={addSubtask}
              returnKeyType="done"
            />
            <TouchableOpacity onPress={addSubtask} style={{ width: 48, backgroundColor: '#1c1a2e', borderRadius: 12, borderWidth: 1, borderColor: '#3b1d8a', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={20} color="#a78bfa" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Recurring */}
        <View style={{ marginBottom: 20 }}>
          {sectionLabel('Repeat')}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(['none', 'daily', 'weekly', 'custom'] as const).map(rt => (
              <TouchableOpacity
                key={rt}
                onPress={() => setRecurringType(rt)}
                style={{ marginRight: 10, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 99, backgroundColor: recurringType === rt ? '#1c1a2e' : '#12141a', borderWidth: 1, borderColor: recurringType === rt ? '#8b5cf6' : '#1e2029' }}
              >
                <Text style={{ color: recurringType === rt ? '#a78bfa' : '#6b7280', fontWeight: recurringType === rt ? '700' : '400', fontSize: 14, textTransform: 'capitalize' }}>{rt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {recurringType === 'custom' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: '#12141a', borderRadius: 12, borderWidth: 1, borderColor: '#1e2029', paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>
              <Text style={{ color: '#6b7280' }}>Every</Text>
              <TextInput
                style={{ color: '#f9fafb', fontWeight: '700', fontSize: 16, backgroundColor: '#1e2029', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, minWidth: 48, textAlign: 'center' }}
                keyboardType="numeric"
                value={recurringInterval}
                onChangeText={setRecurringInterval}
              />
              <Text style={{ color: '#6b7280' }}>days</Text>
            </View>
          )}
        </View>

        {/* Goal Link */}
        {goals.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            {sectionLabel('Link to Goal')}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                onPress={() => setGoalId(null)}
                style={{ marginRight: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 99, backgroundColor: goalId === null ? '#1e2029' : '#12141a', borderWidth: 1, borderColor: goalId === null ? '#4b5563' : '#1e2029' }}
              >
                <Text style={{ color: goalId === null ? '#d1d5db' : '#6b7280', fontSize: 14 }}>None</Text>
              </TouchableOpacity>
              {goals.map(g => (
                <TouchableOpacity
                  key={g.id}
                  onPress={() => setGoalId(g.id)}
                  style={{ marginRight: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 99, backgroundColor: goalId === g.id ? '#1c1a2e' : '#12141a', borderWidth: 1, borderColor: goalId === g.id ? '#8b5cf6' : '#1e2029' }}
                >
                  <Text style={{ color: goalId === g.id ? '#a78bfa' : '#6b7280', fontWeight: goalId === g.id ? '700' : '400', fontSize: 14 }}>{g.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Energy cost */}
        <View style={{ marginBottom: 28 }}>
          {sectionLabel(`Energy Cost — ${energyCost}/10`)}
          <View style={{ backgroundColor: '#12141a', borderRadius: 14, borderWidth: 1, borderColor: '#1e2029', padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setEnergyCost(v)}
                  style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: energyCost >= v ? '#3b1d8a' : '#1e2029' }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: energyCost >= v ? '#a78bfa' : '#2a2d3a' }} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ color: '#4b5563', fontSize: 11 }}>Low</Text>
              <Text style={{ color: '#4b5563', fontSize: 11 }}>High</Text>
            </View>
          </View>
        </View>

        {/* Reminders */}
        <View style={{ marginBottom: 28 }}>
          {sectionLabel(`Reminders (${reminders.length})`)}
          {reminders.length > 0 && reminders.map((r, idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#12141a', borderRadius: 12, borderWidth: 1, borderColor: '#1e2029', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 }}>
              <Bell size={14} color="#a78bfa" style={{ marginRight: 10 }} />
              <Text style={{ flex: 1, color: '#d1d5db', fontSize: 14 }}>
                {r.toLocaleDateString([], { month: 'short', day: 'numeric' })} at {r.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <TouchableOpacity onPress={() => setReminders(reminders.filter((_, i) => i !== idx))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color="#6b7280" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            onPress={() => {
              setPendingReminder(new Date());
              setShowReminderPicker(true);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1c1a2e', borderRadius: 12, borderWidth: 1, borderColor: '#3b1d8a', paddingHorizontal: 14, paddingVertical: 12 }}
          >
            <Plus size={16} color="#a78bfa" />
            <Text style={{ color: '#a78bfa', fontSize: 14, fontWeight: '600' }}>Add Reminder</Text>
          </TouchableOpacity>
          {showReminderPicker && (
            <DateTimePicker
              value={pendingReminder}
              mode="datetime"
              display="default"
              onChange={(e, d) => {
                setShowReminderPicker(Platform.OS === 'ios');
                if (d) {
                  setReminders(prev => [...prev, d].sort((a, b) => a.getTime() - b.getTime()));
                  setPendingReminder(new Date());
                }
              }}
            />
          )}
        </View>

        {/* Estimated duration */}
        <View style={{ marginBottom: 32 }}>
          {sectionLabel('Estimated Duration')}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#12141a', borderWidth: 1, borderColor: '#1e2029', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
            <Timer size={16} color="#6b7280" />
            <TextInput
              style={{ flex: 1, color: '#f9fafb', fontSize: 14 }}
              placeholder="Minutes (e.g. 45)"
              placeholderTextColor="#4b5563"
              keyboardType="numeric"
              value={estimatedDuration}
              onChangeText={setEstimatedDuration}
            />
            <Text style={{ color: '#6b7280' }}>min</Text>
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleUpdate}
          disabled={saving || !title.trim()}
          style={{ borderRadius: 16, paddingVertical: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: !title.trim() ? '#1c1a2e' : '#3b1d8a', borderWidth: 1, borderColor: !title.trim() ? '#2a2d3a' : '#8b5cf6' }}
        >
          {saving
            ? <ActivityIndicator color="#a78bfa" />
            : <Text style={{ color: !title.trim() ? '#4b5563' : '#a78bfa', fontWeight: '700', fontSize: 16 }}>Save Changes</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
