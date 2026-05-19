import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, Alert, KeyboardAvoidingView
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Calendar, Clock, Repeat, Zap, Timer, X, Plus, Bell } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { fetchWithAuth } from '../../../../utils/api';
import { scheduleTaskReminders } from '../../../../utils/notifications';

const PRIORITIES = [
  { key: 'low',    label: 'Low',    color: 'rgba(236,231,227,0.7)',  border: 'rgba(236,231,227,0.2)',  activeBg: 'rgba(236,231,227,0.08)' },
  { key: 'medium', label: 'Medium', color: '#F9A8AC',                border: 'rgba(249,168,172,0.35)', activeBg: 'rgba(249,168,172,0.08)' },
  { key: 'high',   label: 'High',   color: '#E8414A',                border: 'rgba(232,65,74,0.4)',    activeBg: 'rgba(232,65,74,0.1)'    },
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
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
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
            const dt = new Date(); dt.setHours(parseInt(h), parseInt(m), 0, 0);
            setDueTime(dt);
          }
          if (task.recurring) {
            setRecurringType(task.recurring.type || 'none');
            setRecurringInterval((task.recurring.interval || 1).toString());
          }
          if (task.metadata) {
            setEnergyCost(task.metadata.energyCost || 5);
            if (task.metadata.estimatedDuration) setEstimatedDuration(task.metadata.estimatedDuration.toString());
          }
          if (task.subtasks) setSubtasks(task.subtasks);
          if (task.reminders?.length > 0) setReminders(task.reminders.map((r: string) => new Date(r)));
        }
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not load task data.');
    } finally {
      setLoading(false);
    }
  };

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, { title: newSubtask.trim(), done: false }]);
    setNewSubtask('');
  };

  const handleUpdate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    let recurring = null;
    if (recurringType !== 'none') {
      recurring = { type: recurringType, interval: recurringType === 'custom' ? parseInt(recurringInterval) || 1 : 1 };
    }
    const payload = {
      taskId: id, title, description,
      dueDate: dueDate.toISOString().split('T')[0],
      dueTime: dueTime ? `${dueTime.getHours().toString().padStart(2, '0')}:${dueTime.getMinutes().toString().padStart(2, '0')}` : null,
      priority, recurring, goalId,
      metadata: { energyCost, estimatedDuration: estimatedDuration ? parseInt(estimatedDuration) : null },
      subtasks: subtasks.map(t => typeof t === 'string' ? { title: t, done: false } : { title: t.title || t, done: t.done || false }),
      reminders: reminders.map(r => r.toISOString()),
    };
    try {
      const res = await fetchWithAuth('/tasks/update', { method: 'POST', body: JSON.stringify(payload) });
      if (res.ok) {
        const resData = await res.json();
        if (resData.task) scheduleTaskReminders(resData.task).catch(() => {});
        else scheduleTaskReminders({ _id: String(id), title, reminders: payload.reminders }).catch(() => {});
        router.back();
      } else Alert.alert('Error', 'Failed to update task.');
    } catch (e) {
      Alert.alert('Error', 'Network error.');
    } finally {
      setSaving(false);
    }
  };

  const sectionLabel = (text: string) => (
    <Text style={{ color: 'rgba(236,231,227,0.4)', fontWeight: '700', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
      {text}
    </Text>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#161618', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E8414A" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#161618' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#2A2B2F' }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft color="rgba(236,231,227,0.7)" size={17} />
        </TouchableOpacity>
        <Text style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 16 }}>Edit Task</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">

        {/* Title */}
        <View style={{ marginBottom: 22 }}>
          {sectionLabel("What needs to be done?")}
          <TextInput
            style={{ backgroundColor: '#1F2023', color: '#FFFDFC', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontWeight: '600', marginBottom: 10 }}
            placeholder="Task title..."
            placeholderTextColor="rgba(236,231,227,0.3)"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={{ backgroundColor: '#1F2023', color: '#FFFDFC', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, minHeight: 80, textAlignVertical: 'top' }}
            placeholder="Add context or notes... (optional)"
            placeholderTextColor="rgba(236,231,227,0.3)"
            multiline
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* Date & Time */}
        <View style={{ marginBottom: 22 }}>
          {sectionLabel("Schedule")}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={{ flex: 1, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Calendar size={15} color="#E8414A" />
              <Text style={{ color: '#ECE7E3', fontSize: 13, fontWeight: '500' }}>{dueDate.toLocaleDateString()}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowTimePicker(true)}
              style={{ flex: 1, backgroundColor: '#1F2023', borderWidth: 1, borderColor: dueTime ? 'rgba(232,65,74,0.4)' : '#2A2B2F', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Clock size={15} color={dueTime ? '#E8414A' : 'rgba(236,231,227,0.4)'} />
              <Text style={{ color: dueTime ? '#E8414A' : 'rgba(236,231,227,0.4)', fontSize: 13, fontWeight: '500' }}>
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
        <View style={{ marginBottom: 22 }}>
          {sectionLabel("Priority")}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {PRIORITIES.map(p => (
              <TouchableOpacity
                key={p.key}
                onPress={() => setPriority(p.key as any)}
                style={{
                  flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center',
                  backgroundColor: priority === p.key ? p.activeBg : '#1F2023',
                  borderWidth: 1.5,
                  borderColor: priority === p.key ? p.border : '#2A2B2F'
                }}
              >
                <Text style={{ color: priority === p.key ? p.color : 'rgba(236,231,227,0.4)', fontWeight: '700', fontSize: 13 }}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Subtasks */}
        <View style={{ marginBottom: 22 }}>
          {sectionLabel(`Subtasks (${subtasks.length})`)}
          {subtasks.map((s, idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2023', borderRadius: 12, borderWidth: 1, borderColor: '#2A2B2F', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 }}>
              <TouchableOpacity
                onPress={() => { const u = [...subtasks]; u[idx].done = !u[idx].done; setSubtasks(u); }}
                style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: s.done ? '#E8414A' : 'rgba(236,231,227,0.3)', backgroundColor: s.done ? 'rgba(232,65,74,0.15)' : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}
              >
                {s.done && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#E8414A' }} />}
              </TouchableOpacity>
              <Text style={{ flex: 1, color: s.done ? 'rgba(236,231,227,0.35)' : 'rgba(236,231,227,0.8)', fontSize: 13, textDecorationLine: s.done ? 'line-through' : 'none' }}>
                {s.title || s}
              </Text>
              <TouchableOpacity onPress={() => setSubtasks(subtasks.filter((_, i) => i !== idx))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={15} color="rgba(236,231,227,0.4)" />
              </TouchableOpacity>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={{ flex: 1, backgroundColor: '#1F2023', color: '#FFFDFC', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 }}
              placeholder="Add a subtask..."
              placeholderTextColor="rgba(236,231,227,0.3)"
              value={newSubtask}
              onChangeText={setNewSubtask}
              onSubmitEditing={addSubtask}
              returnKeyType="done"
            />
            <TouchableOpacity onPress={addSubtask} style={{ width: 46, backgroundColor: 'rgba(232,65,74,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={19} color="#E8414A" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Recurring */}
        <View style={{ marginBottom: 22 }}>
          {sectionLabel("Repeat")}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(['none', 'daily', 'weekly', 'custom'] as const).map(rt => (
              <TouchableOpacity
                key={rt}
                onPress={() => setRecurringType(rt)}
                style={{ marginRight: 8, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 99, backgroundColor: recurringType === rt ? 'rgba(232,65,74,0.12)' : '#1F2023', borderWidth: 1, borderColor: recurringType === rt ? 'rgba(232,65,74,0.4)' : '#2A2B2F' }}
              >
                <Text style={{ color: recurringType === rt ? '#E8414A' : 'rgba(236,231,227,0.5)', fontWeight: recurringType === rt ? '700' : '400', fontSize: 13, textTransform: 'capitalize' }}>{rt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {recurringType === 'custom' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#1F2023', borderRadius: 12, borderWidth: 1, borderColor: '#2A2B2F', paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>
              <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 13 }}>Every</Text>
              <TextInput
                style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 15, backgroundColor: '#2A2B2F', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, minWidth: 48, textAlign: 'center' }}
                keyboardType="numeric"
                value={recurringInterval}
                onChangeText={setRecurringInterval}
              />
              <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 13 }}>days</Text>
            </View>
          )}
        </View>

        {/* Goal Link */}
        {goals.length > 0 && (
          <View style={{ marginBottom: 22 }}>
            {sectionLabel("Link to Goal")}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                onPress={() => setGoalId(null)}
                style={{ marginRight: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 99, backgroundColor: goalId === null ? '#2A2B2F' : '#1F2023', borderWidth: 1, borderColor: goalId === null ? 'rgba(236,231,227,0.2)' : '#2A2B2F' }}
              >
                <Text style={{ color: goalId === null ? '#ECE7E3' : 'rgba(236,231,227,0.4)', fontSize: 13 }}>None</Text>
              </TouchableOpacity>
              {goals.map(g => (
                <TouchableOpacity
                  key={g.id}
                  onPress={() => setGoalId(g.id)}
                  style={{ marginRight: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 99, backgroundColor: goalId === g.id ? 'rgba(232,65,74,0.12)' : '#1F2023', borderWidth: 1, borderColor: goalId === g.id ? 'rgba(232,65,74,0.4)' : '#2A2B2F' }}
                >
                  <Text style={{ color: goalId === g.id ? '#E8414A' : 'rgba(236,231,227,0.5)', fontWeight: goalId === g.id ? '700' : '400', fontSize: 13 }}>{g.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Energy cost */}
        <View style={{ marginBottom: 28 }}>
          {sectionLabel(`Energy Cost — ${energyCost}/10`)}
          <View style={{ backgroundColor: '#1F2023', borderRadius: 14, borderWidth: 1, borderColor: '#2A2B2F', padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setEnergyCost(v)}
                  style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: energyCost >= v ? 'rgba(232,65,74,0.15)' : '#2A2B2F' }}
                >
                  <View style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: energyCost >= v ? '#E8414A' : '#2A2B2F' }} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ color: 'rgba(236,231,227,0.3)', fontSize: 10 }}>Low</Text>
              <Text style={{ color: 'rgba(236,231,227,0.3)', fontSize: 10 }}>High</Text>
            </View>
          </View>
        </View>

        {/* Reminders */}
        <View style={{ marginBottom: 28 }}>
          {sectionLabel(`Reminders (${reminders.length})`)}
          {reminders.map((r, idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2023', borderRadius: 12, borderWidth: 1, borderColor: '#2A2B2F', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 }}>
              <Bell size={13} color="#E8414A" style={{ marginRight: 10 }} />
              <Text style={{ flex: 1, color: 'rgba(236,231,227,0.7)', fontSize: 13 }}>
                {r.toLocaleDateString([], { month: 'short', day: 'numeric' })} at {r.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <TouchableOpacity onPress={() => setReminders(reminders.filter((_, i) => i !== idx))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={15} color="rgba(236,231,227,0.4)" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            onPress={() => { setPendingReminder(new Date()); setPickerMode('date'); setShowReminderPicker(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(232,65,74,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(232,65,74,0.25)', paddingHorizontal: 14, paddingVertical: 12 }}
          >
            <Plus size={15} color="#E8414A" />
            <Text style={{ color: '#E8414A', fontSize: 13, fontWeight: '600' }}>Add Reminder</Text>
          </TouchableOpacity>
          {showReminderPicker && (
            <DateTimePicker
              value={pendingReminder}
              mode={Platform.OS === 'ios' ? 'datetime' : pickerMode}
              display="default"
              onChange={(e, d) => {
                if (Platform.OS === 'ios') {
                  setShowReminderPicker(false);
                  if (d) { setReminders(prev => [...prev, d].sort((a, b) => a.getTime() - b.getTime())); setPendingReminder(new Date()); }
                } else {
                  if (e.type === 'set' && d) {
                    if (pickerMode === 'date') { const nd = new Date(pendingReminder); nd.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setPendingReminder(nd); setPickerMode('time'); }
                    else { const nt = new Date(pendingReminder); nt.setHours(d.getHours(), d.getMinutes(), 0, 0); setReminders(prev => [...prev, nt].sort((a, b) => a.getTime() - b.getTime())); setShowReminderPicker(false); }
                  } else setShowReminderPicker(false);
                }
              }}
            />
          )}
        </View>

        {/* Estimated duration */}
        <View style={{ marginBottom: 32 }}>
          {sectionLabel("Estimated Duration")}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
            <Timer size={15} color="rgba(236,231,227,0.4)" />
            <TextInput
              style={{ flex: 1, color: '#FFFDFC', fontSize: 14 }}
              placeholder="Minutes (e.g. 45)"
              placeholderTextColor="rgba(236,231,227,0.3)"
              keyboardType="numeric"
              value={estimatedDuration}
              onChangeText={setEstimatedDuration}
            />
            <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 13 }}>min</Text>
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleUpdate}
          disabled={saving || !title.trim()}
          style={{ borderRadius: 16, paddingVertical: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: !title.trim() ? '#1F2023' : '#E8414A', borderWidth: 1, borderColor: !title.trim() ? '#2A2B2F' : '#D62C35' }}
        >
          {saving
            ? <ActivityIndicator color="#FFFDFC" />
            : <Text style={{ color: !title.trim() ? 'rgba(236,231,227,0.3)' : '#FFFDFC', fontWeight: '700', fontSize: 15 }}>Save Changes</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
