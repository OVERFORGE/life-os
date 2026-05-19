import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, Alert, Animated, PanResponder, Dimensions, TextInput
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ArrowLeft, Plus, CheckCircle2, Circle, Clock,
  Trash2, Edit3, X, ChevronRight, AlertCircle, Calendar,
  AlarmClock, History
} from 'lucide-react-native';
import { fetchWithAuth } from '../../../../utils/api';
import { scheduleAllTaskReminders } from '../../../../utils/notifications';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const PRIORITY_CONFIG: Record<string, { color: string; border: string; label: string }> = {
  high:   { color: '#E8414A', border: 'rgba(232,65,74,0.3)', label: 'High' },
  medium: { color: '#F9A8AC', border: 'rgba(249,168,172,0.3)', label: 'Medium' },
  low:    { color: 'rgba(236,231,227,0.6)', border: 'rgba(236,231,227,0.2)', label: 'Low' },
};

export default function TasksScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tasksData, setTasksData] = useState<any>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [rescheduleTask, setRescheduleTask] = useState<any>(null);
  const [rescheduleDays, setRescheduleDays] = useState('1');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useFocusEffect(useCallback(() => { loadTasks(); }, []));

  const loadTasks = async (silent = false) => {
    if (!silent && !tasksData) setLoading(true);
    try {
      const res = await fetchWithAuth('/tasks/list');
      if (res.ok) setTasksData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openModal = (task: any) => {
    setSelectedTask(task);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
  };

  const closeModal = () => {
    Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 260, useNativeDriver: true }).start(() => {
      setSelectedTask(null);
    });
  };

  const toggleComplete = async (task: any) => {
    const action = task.status === 'completed' ? 'uncomplete' : 'complete';
    const newStatus = action === 'complete' ? 'completed' : 'pending';
    const upd = (list: any[]) => list?.map(t => t._id === task._id ? { ...t, status: newStatus } : t);
    setTasksData((prev: any) => ({ today: upd(prev.today), upcoming: upd(prev.upcoming), overdue: upd(prev.overdue) }));
    if (selectedTask?._id === task._id) setSelectedTask({ ...selectedTask, status: newStatus });
    fetchWithAuth('/tasks/complete', { method: 'POST', body: JSON.stringify({ taskId: task._id, action }) })
      .then(() => scheduleAllTaskReminders().catch(() => {}))
      .catch(() => loadTasks(true));
  };

  const handleDelete = (taskId: string) => {
    Alert.alert('Delete Task', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          // Optimistic — remove immediately, send request in bg
          const upd = (list: any[]) => list?.filter(t => t._id !== taskId);
          setTasksData((prev: any) => ({ today: upd(prev.today), upcoming: upd(prev.upcoming), overdue: upd(prev.overdue) }));
          closeModal();
          fetchWithAuth('/tasks/delete', { method: 'POST', body: JSON.stringify({ taskId }) })
            .then(() => scheduleAllTaskReminders().catch(() => {}))
            .catch(() => loadTasks(true));
        }
      },
    ]);
  };

  const handleReschedule = async () => {
    if (!rescheduleTask) return;
    const days = parseInt(rescheduleDays) || 1;
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + days);
    const dateStr = newDate.toISOString().split('T')[0];
    const upd = (list: any[]) => list?.filter(t => t._id !== rescheduleTask._id);
    setTasksData((prev: any) => ({ today: upd(prev.today), upcoming: upd(prev.upcoming), overdue: upd(prev.overdue) }));
    const targetTask = rescheduleTask;
    setRescheduleTask(null);
    closeModal();
    fetchWithAuth('/tasks/update', {
      method: 'POST',
      body: JSON.stringify({ taskId: targetTask._id, dueDate: dateStr, dueTime: rescheduleTime || null })
    }).then(() => { loadTasks(true); scheduleAllTaskReminders().catch(() => {}); })
      .catch(e => { console.error(e); loadTasks(true); });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#161618', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E8414A" size="large" />
      </View>
    );
  }

  const allCount = (tasksData?.today?.length || 0) + (tasksData?.overdue?.length || 0);
  const doneCount = [...(tasksData?.today || []), ...(tasksData?.overdue || [])].filter((t: any) => t.status === 'completed').length;
  const pct = allCount > 0 ? Math.round((doneCount / allCount) * 100) : 0;

  const renderTask = (task: any, isOverdue = false) => {
    const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
    const isDone = task.status === 'completed';
    return (
      <TouchableOpacity
        key={task._id}
        onPress={() => openModal(task)}
        activeOpacity={0.75}
        style={{
          backgroundColor: '#1F2023',
          borderRadius: 14,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: isOverdue && !isDone ? 'rgba(232,65,74,0.25)' : '#2A2B2F',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
          <TouchableOpacity
            onPress={() => toggleComplete(task)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ marginRight: 12 }}
          >
            {isDone
              ? <CheckCircle2 size={22} color="#E8414A" />
              : <Circle size={22} color={isOverdue ? '#E8414A' : 'rgba(236,231,227,0.25)'} />
            }
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{
              color: isDone ? 'rgba(236,231,227,0.35)' : '#FFFDFC',
              fontWeight: '600', fontSize: 14,
              textDecorationLine: isDone ? 'line-through' : 'none',
            }}>
              {task.title}
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
              {task.dueTime && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Clock size={10} color="rgba(236,231,227,0.4)" />
                  <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 11 }}>{task.dueTime}</Text>
                </View>
              )}
              {!isDone && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, borderWidth: 1, borderColor: p.border }}>
                  <Text style={{ color: p.color, fontSize: 10, fontWeight: '700' }}>{p.label}</Text>
                </View>
              )}
              {isOverdue && !isDone && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <AlertCircle size={10} color="#E8414A" />
                  <Text style={{ color: '#E8414A', fontSize: 10, fontWeight: '600' }}>Overdue</Text>
                </View>
              )}
            </View>
            {task.subtasks?.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <View style={{ height: 2, backgroundColor: '#2A2B2F', borderRadius: 2 }}>
                  <View style={{
                    height: 2, borderRadius: 2,
                    width: `${(task.subtasks.filter((s: any) => s.done).length / task.subtasks.length) * 100}%`,
                    backgroundColor: '#E8414A'
                  }} />
                </View>
                <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, marginTop: 3 }}>
                  {task.subtasks.filter((s: any) => s.done).length}/{task.subtasks.length} subtasks
                </Text>
              </View>
            )}
          </View>
          <ChevronRight size={16} color="rgba(236,231,227,0.2)" style={{ marginLeft: 8 }} />
        </View>
      </TouchableOpacity>
    );
  };

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
    onPanResponderMove: (_, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 120) closeModal();
      else Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#161618' }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#2A2B2F' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center' }}
          >
            <ArrowLeft color="rgba(236,231,227,0.7)" size={17} />
          </TouchableOpacity>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 16 }}>Tasks</Text>
            {allCount > 0 && (
              <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 11, marginTop: 2 }}>{doneCount}/{allCount} done today</Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/tools/tasks/history' as any)}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center' }}
            >
              <History color="rgba(236,231,227,0.7)" size={17} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/tools/tasks/new')}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8414A', alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus color="#FFFDFC" size={20} />
            </TouchableOpacity>
          </View>
        </View>

        {allCount > 0 && (
          <View style={{ marginTop: 14, height: 2, backgroundColor: '#2A2B2F', borderRadius: 2 }}>
            <View style={{ height: 2, width: `${pct}%`, backgroundColor: pct === 100 ? '#ECE7E3' : '#E8414A', borderRadius: 2 }} />
          </View>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {/* Overdue */}
        {tasksData?.overdue?.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <AlertCircle size={12} color="#E8414A" />
              <Text style={{ color: '#E8414A', fontWeight: '700', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' }}>Overdue</Text>
            </View>
            {tasksData.overdue.map((t: any) => renderTask(t, true))}
          </View>
        )}

        {/* Today */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Calendar size={12} color="rgba(236,231,227,0.6)" />
            <Text style={{ color: 'rgba(236,231,227,0.6)', fontWeight: '700', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' }}>Today</Text>
          </View>
          {tasksData?.today?.length > 0
            ? tasksData.today.map((t: any) => renderTask(t))
            : (
              <View style={{ backgroundColor: '#1F2023', borderRadius: 14, borderWidth: 1, borderColor: '#2A2B2F', padding: 28, alignItems: 'center' }}>
                <CheckCircle2 size={28} color="#2A2B2F" />
                <Text style={{ color: 'rgba(236,231,227,0.4)', marginTop: 10, fontSize: 13 }}>All clear for today</Text>
              </View>
            )
          }
        </View>

        {/* Upcoming */}
        {tasksData?.upcoming?.length > 0 && (() => {
          const grouped = tasksData.upcoming.reduce((acc: any, task: any) => {
            const date = task.dueDate || 'No Date';
            if (!acc[date]) acc[date] = [];
            acc[date].push(task);
            return acc;
          }, {});
          return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([dateStr, tasks]: any) => {
            let label = dateStr;
            if (dateStr !== 'No Date') {
              const d = new Date(dateStr);
              const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
              if (d.toISOString().split('T')[0] === tomorrow.toISOString().split('T')[0]) {
                label = `Tomorrow · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
              } else {
                label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              }
            }
            return (
              <View key={dateStr} style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Calendar size={12} color="rgba(236,231,227,0.35)" />
                  <Text style={{ color: 'rgba(236,231,227,0.35)', fontWeight: '700', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' }}>{label}</Text>
                </View>
                {tasks.map((t: any) => renderTask(t))}
              </View>
            );
          });
        })()}
      </ScrollView>

      {/* Task Detail Modal */}
      <Modal visible={!!selectedTask} transparent animationType="none" onRequestClose={closeModal}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeModal} />
          <Animated.View style={{ transform: [{ translateY: slideAnim }] }} {...panResponder.panHandlers}>
            <View style={{
              backgroundColor: '#1F2023',
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
              borderColor: '#2A2B2F',
              paddingBottom: 40,
            }}>
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
                <View style={{ width: 32, height: 3, backgroundColor: '#2A2B2F', borderRadius: 99 }} />
              </View>
              {selectedTask && (() => {
                const p = PRIORITY_CONFIG[selectedTask.priority] || PRIORITY_CONFIG.medium;
                const isDone = selectedTask.status === 'completed';
                return (
                  <View style={{ paddingHorizontal: 22 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 }}>
                      <TouchableOpacity onPress={() => toggleComplete(selectedTask)} style={{ marginTop: 3, marginRight: 12 }}>
                        {isDone
                          ? <CheckCircle2 size={24} color="#E8414A" />
                          : <Circle size={24} color="rgba(236,231,227,0.3)" />
                        }
                      </TouchableOpacity>
                      <Text style={{
                        flex: 1, color: isDone ? 'rgba(236,231,227,0.4)' : '#FFFDFC',
                        fontWeight: '700', fontSize: 18, lineHeight: 26,
                        textDecorationLine: isDone ? 'line-through' : 'none'
                      }}>
                        {selectedTask.title}
                      </Text>
                      <TouchableOpacity onPress={closeModal} style={{ marginLeft: 8, marginTop: 2 }}>
                        <X size={18} color="rgba(236,231,227,0.4)" />
                      </TouchableOpacity>
                    </View>

                    {selectedTask.description && (
                      <Text style={{ color: 'rgba(236,231,227,0.6)', fontSize: 13, lineHeight: 20, marginBottom: 14, backgroundColor: '#161618', padding: 12, borderRadius: 10 }}>
                        {selectedTask.description}
                      </Text>
                    )}

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                      {selectedTask.dueDate && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2A2B2F', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99 }}>
                          <Calendar size={12} color="rgba(236,231,227,0.6)" />
                          <Text style={{ color: 'rgba(236,231,227,0.8)', fontSize: 12 }}>
                            {selectedTask.dueDate} {selectedTask.dueTime || ''}
                          </Text>
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2A2B2F', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: p.border }}>
                        <Text style={{ color: p.color, fontSize: 12, fontWeight: '600' }}>{p.label} Priority</Text>
                      </View>
                    </View>

                    {selectedTask.subtasks?.length > 0 && (
                      <View style={{ marginBottom: 18 }}>
                        <Text style={{ color: 'rgba(236,231,227,0.4)', fontWeight: '700', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>Subtasks</Text>
                        {selectedTask.subtasks.map((sub: any, idx: number) => (
                          <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            {sub.done
                              ? <CheckCircle2 size={16} color="#E8414A" />
                              : <Circle size={16} color="rgba(236,231,227,0.25)" />
                            }
                            <Text style={{ color: sub.done ? 'rgba(236,231,227,0.35)' : 'rgba(236,231,227,0.8)', fontSize: 13, textDecorationLine: sub.done ? 'line-through' : 'none' }}>
                              {sub.title}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                      <TouchableOpacity
                        onPress={() => { const id = selectedTask._id; closeModal(); router.push(`/(dashboard)/tools/tasks/${id}` as any); }}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2A2B2F', paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: '#2A2B2F' }}
                      >
                        <Edit3 size={15} color="rgba(236,231,227,0.7)" />
                        <Text style={{ color: 'rgba(236,231,227,0.8)', fontWeight: '600', fontSize: 14 }}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setRescheduleTask(selectedTask); setRescheduleTime(selectedTask.dueTime || ''); }}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2A2B2F', paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: '#2A2B2F' }}
                      >
                        <AlarmClock size={15} color="rgba(236,231,227,0.7)" />
                        <Text style={{ color: 'rgba(236,231,227,0.8)', fontWeight: '600', fontSize: 14 }}>Delay</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDelete(selectedTask._id)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(232,65,74,0.1)', paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(232,65,74,0.25)' }}
                    >
                      <Trash2 size={15} color="#E8414A" />
                      <Text style={{ color: '#E8414A', fontWeight: '600', fontSize: 14 }}>Delete Task</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Reschedule Modal */}
      <Modal visible={!!rescheduleTask} transparent animationType="fade" onRequestClose={() => setRescheduleTask(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#1F2023', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: '#2A2B2F' }}>
            <Text style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 17, marginBottom: 6 }}>Delay Task</Text>
            <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 13, marginBottom: 18 }} numberOfLines={1}>
              "{rescheduleTask?.title}"
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[1, 2, 3, 7].map(d => (
                <TouchableOpacity
                  key={d}
                  onPress={() => setRescheduleDays(d.toString())}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                    backgroundColor: rescheduleDays === d.toString() ? 'rgba(232,65,74,0.15)' : '#161618',
                    borderWidth: 1,
                    borderColor: rescheduleDays === d.toString() ? 'rgba(232,65,74,0.4)' : '#2A2B2F'
                  }}
                >
                  <Text style={{ color: rescheduleDays === d.toString() ? '#E8414A' : 'rgba(236,231,227,0.6)', fontWeight: '700', fontSize: 14 }}>{d}d</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#161618', borderRadius: 12, paddingHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2A2B2F' }}>
              <Text style={{ color: 'rgba(236,231,227,0.5)', flex: 1, fontSize: 13 }}>Custom days:</Text>
              <TextInput
                style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 17, textAlign: 'right', paddingVertical: 12 }}
                keyboardType="numeric"
                value={rescheduleDays}
                onChangeText={setRescheduleDays}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#161618', borderRadius: 12, paddingHorizontal: 14, marginBottom: 18, borderWidth: 1, borderColor: '#2A2B2F' }}>
              <Text style={{ color: 'rgba(236,231,227,0.5)', flex: 1, fontSize: 13 }}>Time (HH:MM):</Text>
              <TextInput
                style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 17, textAlign: 'right', paddingVertical: 12 }}
                placeholder="Optional"
                placeholderTextColor="rgba(236,231,227,0.3)"
                value={rescheduleTime}
                onChangeText={setRescheduleTime}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setRescheduleTask(null)}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#161618', alignItems: 'center', borderWidth: 1, borderColor: '#2A2B2F' }}
              >
                <Text style={{ color: 'rgba(236,231,227,0.6)', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleReschedule}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#E8414A', alignItems: 'center' }}
              >
                <Text style={{ color: '#FFFDFC', fontWeight: '700' }}>Delay Task</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
