import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, Alert, Animated, PanResponder, Dimensions, TextInput
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ArrowLeft, Plus, CheckCircle2, Circle, Clock, Flame, Zap, Target,
  Trash2, Edit3, X, ChevronRight, AlertCircle, Calendar, RefreshCw,
  MoreHorizontal, AlarmClock
} from 'lucide-react-native';
import { fetchWithAuth } from '../../../../utils/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const PRIORITY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  high:   { color: '#f87171', bg: '#7f1d1d22', border: '#7f1d1d66', label: 'High' },
  medium: { color: '#fb923c', bg: '#7c2d1222', border: '#7c2d1266', label: 'Medium' },
  low:    { color: '#34d399', bg: '#0647380',   border: '#06473855', label: 'Low'  },
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
    Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 280, useNativeDriver: true }).start(() => {
      setSelectedTask(null);
    });
  };

  const toggleComplete = async (task: any) => {
    const action = task.status === 'completed' ? 'uncomplete' : 'complete';
    const newStatus = action === 'complete' ? 'completed' : 'pending';

    // Optimistic
    if (tasksData) {
      const upd = (list: any[]) => list?.map(t => t._id === task._id ? { ...t, status: newStatus } : t);
      setTasksData({ today: upd(tasksData.today), upcoming: upd(tasksData.upcoming), overdue: upd(tasksData.overdue) });
    }
    if (selectedTask?._id === task._id) setSelectedTask({ ...selectedTask, status: newStatus });

    try {
      const res = await fetchWithAuth('/tasks/complete', { method: 'POST', body: JSON.stringify({ taskId: task._id, action }) });
      loadTasks(true);
    } catch (e) { loadTasks(true); }
  };

  const handleDelete = async (taskId: string) => {
    Alert.alert('Delete Task', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          if (tasksData) {
            const upd = (list: any[]) => list?.filter(t => t._id !== taskId);
            setTasksData({ today: upd(tasksData.today), upcoming: upd(tasksData.upcoming), overdue: upd(tasksData.overdue) });
          }
          closeModal();
          try {
            await fetchWithAuth('/tasks/delete', { method: 'POST', body: JSON.stringify({ taskId }) });
            loadTasks(true);
          } catch (e) { console.error(e); loadTasks(true); }
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

    if (tasksData) {
      const upd = (list: any[]) => list?.filter(t => t._id !== rescheduleTask._id);
      setTasksData({ today: upd(tasksData.today), upcoming: upd(tasksData.upcoming), overdue: upd(tasksData.overdue) });
    }
    
    const targetTask = rescheduleTask;
    setRescheduleTask(null);
    closeModal();

    try {
      await fetchWithAuth('/tasks/update', {
        method: 'POST',
        body: JSON.stringify({ taskId: targetTask._id, dueDate: dateStr, dueTime: rescheduleTime || null })
      });
      loadTasks(true);
    } catch (e) { console.error(e); loadTasks(true); }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#0a0b0e] items-center justify-center">
        <ActivityIndicator color="#8b5cf6" size="large" />
      </View>
    );
  }

  const allCount = (tasksData?.today?.length || 0) + (tasksData?.overdue?.length || 0);
  const doneCount = [
    ...(tasksData?.today || []),
    ...(tasksData?.overdue || []),
  ].filter((t: any) => t.status === 'completed').length;

  const renderTask = (task: any, isOverdue = false) => {
    const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
    const isDone = task.status === 'completed';

    return (
      <TouchableOpacity
        key={task._id}
        onPress={() => openModal(task)}
        activeOpacity={0.75}
        style={{
          backgroundColor: '#12141a',
          borderRadius: 16,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: isDone ? '#1e2029' : (isOverdue ? '#3f1c1c' : '#1e2029'),
          overflow: 'hidden',
        }}
      >
        {/* Priority stripe removed as per user request */}

        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
          {/* Checkbox */}
          <TouchableOpacity
            onPress={() => toggleComplete(task)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ marginRight: 14 }}
          >
            {isDone
              ? <CheckCircle2 size={24} color="#8b5cf6" />
              : <Circle size={24} color={isOverdue ? '#ef4444' : '#3a3d4a'} />
            }
          </TouchableOpacity>

          {/* Content */}
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={2}
              style={{
                color: isDone ? '#4b5563' : '#e5e7eb',
                fontWeight: '600',
                fontSize: 15,
                textDecorationLine: isDone ? 'line-through' : 'none',
              }}
            >
              {task.title}
            </Text>

            <View style={{ flexDirection: 'row', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
              {task.dueTime && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} color="#6b7280" />
                  <Text style={{ color: '#6b7280', fontSize: 12 }}>{task.dueTime}</Text>
                </View>
              )}
              {!isDone && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: p.bg, paddingHorizontal: 8, paddingVertical: 3,
                  borderRadius: 99, borderWidth: 1, borderColor: p.border
                }}>
                  <Flame size={11} color={p.color} />
                  <Text style={{ color: p.color, fontSize: 11, fontWeight: '700' }}>{p.label}</Text>
                </View>
              )}
              {isOverdue && !isDone && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={11} color="#ef4444" />
                  <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '600' }}>Overdue</Text>
                </View>
              )}
              {task.metadata?.energyCost && !isDone && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Zap size={11} color="#fbbf24" />
                  <Text style={{ color: '#6b7280', fontSize: 11 }}>{task.metadata.energyCost}/10</Text>
                </View>
              )}
            </View>

            {/* Sub-tasks progress */}
            {task.subtasks?.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: '#6b7280', fontSize: 11 }}>
                    {task.subtasks.filter((s: any) => s.done).length}/{task.subtasks.length} subtasks
                  </Text>
                </View>
                <View style={{ height: 3, backgroundColor: '#1e2029', borderRadius: 99 }}>
                  <View style={{
                    height: 3,
                    width: `${(task.subtasks.filter((s: any) => s.done).length / task.subtasks.length) * 100}%`,
                    backgroundColor: '#8b5cf6', borderRadius: 99
                  }} />
                </View>
              </View>
            )}
          </View>

          <ChevronRight size={18} color="#3a3d4a" style={{ marginLeft: 8 }} />
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
    <View style={{ flex: 1, backgroundColor: '#0a0b0e' }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#12141a' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#12141a', borderWidth: 1, borderColor: '#1e2029', alignItems: 'center', justifyContent: 'center' }}
          >
            <ArrowLeft color="#9ca3af" size={18} />
          </TouchableOpacity>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#f9fafb', fontWeight: '700', fontSize: 18 }}>Tasks</Text>
            {allCount > 0 && (
              <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{doneCount}/{allCount} done today</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={() => router.push('/(dashboard)/tools/tasks/new')}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#3b1d8a', borderWidth: 1, borderColor: '#5b21b6', alignItems: 'center', justifyContent: 'center' }}
          >
            <Plus color="#a78bfa" size={20} />
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        {allCount > 0 && (
          <View style={{ marginTop: 12, height: 3, backgroundColor: '#1e2029', borderRadius: 99 }}>
            <View style={{ height: 3, width: `${(doneCount / allCount) * 100}%`, backgroundColor: '#8b5cf6', borderRadius: 99 }} />
          </View>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* Overdue */}
        {tasksData?.overdue?.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <AlertCircle size={13} color="#ef4444" />
              <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' }}>Overdue</Text>
            </View>
            {tasksData.overdue.map((t: any) => renderTask(t, true))}
          </View>
        )}

        {/* Today */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Calendar size={13} color="#8b5cf6" />
            <Text style={{ color: '#8b5cf6', fontWeight: '700', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' }}>Today</Text>
          </View>
          {tasksData?.today?.length > 0
            ? tasksData.today.map((t: any) => renderTask(t))
            : (
              <View style={{ backgroundColor: '#12141a', borderRadius: 16, borderWidth: 1, borderColor: '#1e2029', padding: 28, alignItems: 'center' }}>
                <CheckCircle2 size={32} color="#1e2029" />
                <Text style={{ color: '#4b5563', marginTop: 12, fontSize: 14 }}>All clear for today!</Text>
              </View>
            )
          }
        </View>

        {/* Upcoming */}
        {tasksData?.upcoming?.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            {(() => {
              // Group upcoming tasks by date
              const grouped = tasksData.upcoming.reduce((acc: any, task: any) => {
                const date = task.dueDate || 'No Date';
                if (!acc[date]) acc[date] = [];
                acc[date].push(task);
                return acc;
              }, {});

              return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([dateStr, tasks]: any) => {
                let formattedDate = dateStr;
                if (dateStr !== 'No Date') {
                  const d = new Date(dateStr);
                  // Quick timezone-safe tomorrow check
                  const today = new Date();
                  const diffTime = Math.abs(d.getTime() - today.getTime());
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                  
                  if (diffDays === 1 || diffDays === 0) { // Can be 0 or 1 depending on time differences
                    // Actually, let's just do a reliable offset
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    if (d.toISOString().split('T')[0] === tomorrow.toISOString().split('T')[0]) {
                      formattedDate = `Tomorrow, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                    } else {
                      formattedDate = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                    }
                  } else {
                    formattedDate = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                  }
                }

                return (
                  <View key={dateStr} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                      <Calendar size={13} color="#60a5fa" />
                      <Text style={{ color: '#60a5fa', fontWeight: '700', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' }}>{formattedDate}</Text>
                    </View>
                    {tasks.map((t: any) => renderTask(t))}
                  </View>
                );
              });
            })()}
          </View>
        )}
      </ScrollView>

      {/* Task Detail Modal */}
      <Modal visible={!!selectedTask} transparent animationType="none" onRequestClose={closeModal}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeModal} />
          <Animated.View
            style={{ transform: [{ translateY: slideAnim }] }}
            {...panResponder.panHandlers}
          >
            <View style={{
              backgroundColor: '#12141a',
              borderTopLeftRadius: 28, borderTopRightRadius: 28,
              borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
              borderColor: '#1e2029',
              paddingBottom: 40,
            }}>
              {/* Drag handle */}
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
                <View style={{ width: 36, height: 4, backgroundColor: '#2a2d3a', borderRadius: 99 }} />
              </View>

              {selectedTask && (() => {
                const p = PRIORITY_CONFIG[selectedTask.priority] || PRIORITY_CONFIG.medium;
                const isDone = selectedTask.status === 'completed';

                return (
                  <View style={{ paddingHorizontal: 24 }}>
                    {/* Title row */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 }}>
                      <TouchableOpacity onPress={() => toggleComplete(selectedTask)} style={{ marginTop: 2, marginRight: 12 }}>
                        {isDone
                          ? <CheckCircle2 size={26} color="#8b5cf6" />
                          : <Circle size={26} color="#3a3d4a" />
                        }
                      </TouchableOpacity>
                      <Text style={{
                        flex: 1, color: isDone ? '#6b7280' : '#f9fafb',
                        fontWeight: '700', fontSize: 20, lineHeight: 28,
                        textDecorationLine: isDone ? 'line-through' : 'none'
                      }}>
                        {selectedTask.title}
                      </Text>
                      <TouchableOpacity onPress={closeModal} style={{ marginLeft: 8, marginTop: 2 }}>
                        <X size={20} color="#6b7280" />
                      </TouchableOpacity>
                    </View>

                    {/* Description */}
                    {selectedTask.description && (
                      <Text style={{ color: '#9ca3af', fontSize: 14, lineHeight: 22, marginBottom: 16, backgroundColor: '#0a0b0e', padding: 12, borderRadius: 12 }}>
                        {selectedTask.description}
                      </Text>
                    )}

                    {/* Meta chips */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                      {selectedTask.dueDate && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e2029', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99 }}>
                          <Calendar size={13} color="#9ca3af" />
                          <Text style={{ color: '#d1d5db', fontSize: 13 }}>
                            {selectedTask.dueDate} {selectedTask.dueTime || ''}
                          </Text>
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: p.bg, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: p.border }}>
                        <Flame size={13} color={p.color} />
                        <Text style={{ color: p.color, fontSize: 13, fontWeight: '600' }}>{p.label} Priority</Text>
                      </View>
                      {selectedTask.metadata?.energyCost && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e2029', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99 }}>
                          <Zap size={13} color="#fbbf24" />
                          <Text style={{ color: '#d1d5db', fontSize: 13 }}>{selectedTask.metadata.energyCost}/10 energy</Text>
                        </View>
                      )}
                      {selectedTask.goalId && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1c1a2e', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: '#3b1d8a' }}>
                          <Target size={13} color="#a78bfa" />
                          <Text style={{ color: '#a78bfa', fontSize: 13 }}>Goal linked</Text>
                        </View>
                      )}
                    </View>

                    {/* Sub-tasks */}
                    {selectedTask.subtasks?.length > 0 && (
                      <View style={{ marginBottom: 20 }}>
                        <Text style={{ color: '#6b7280', fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Subtasks</Text>
                        {selectedTask.subtasks.map((sub: any, idx: number) => (
                          <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            {sub.done
                              ? <CheckCircle2 size={18} color="#8b5cf6" />
                              : <Circle size={18} color="#3a3d4a" />
                            }
                            <Text style={{ color: sub.done ? '#6b7280' : '#d1d5db', fontSize: 14, textDecorationLine: sub.done ? 'line-through' : 'none' }}>
                              {sub.title}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Actions */}
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                      <TouchableOpacity
                        onPress={() => { const id = selectedTask._id; closeModal(); router.push(`/tools/tasks/${id}`); }}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1e2029', paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: '#2a2d3a' }}
                      >
                        <Edit3 size={16} color="#9ca3af" />
                        <Text style={{ color: '#d1d5db', fontWeight: '600', fontSize: 15 }}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setRescheduleTask(selectedTask);
                          setRescheduleTime(selectedTask.dueTime || '');
                        }}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1c1a2e', paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: '#3b1d8a' }}
                      >
                        <AlarmClock size={16} color="#a78bfa" />
                        <Text style={{ color: '#a78bfa', fontWeight: '600', fontSize: 15 }}>Delay</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleDelete(selectedTask._id)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1a0a0a', paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: '#3f1c1c' }}
                    >
                      <Trash2 size={16} color="#ef4444" />
                      <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 15 }}>Delete Task</Text>
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
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: '#12141a', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#1e2029' }}>
            <Text style={{ color: '#f9fafb', fontWeight: '700', fontSize: 18, marginBottom: 8 }}>Delay Task</Text>
            <Text style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>Push "{rescheduleTask?.title}" by how many days?</Text>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              {[1, 2, 3, 7].map(d => (
                <TouchableOpacity
                  key={d}
                  onPress={() => setRescheduleDays(d.toString())}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: rescheduleDays === d.toString() ? '#3b1d8a' : '#1e2029', borderWidth: 1, borderColor: rescheduleDays === d.toString() ? '#8b5cf6' : '#2a2d3a' }}
                >
                  <Text style={{ color: rescheduleDays === d.toString() ? '#a78bfa' : '#9ca3af', fontWeight: '700', fontSize: 15 }}>{d}d</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e2029', borderRadius: 12, paddingHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#2a2d3a' }}>
              <Text style={{ color: '#6b7280', flex: 1 }}>Custom days:</Text>
              <TextInput
                style={{ color: '#f9fafb', fontWeight: '700', fontSize: 18, textAlign: 'right', paddingVertical: 12 }}
                keyboardType="numeric"
                value={rescheduleDays}
                onChangeText={setRescheduleDays}
              />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e2029', borderRadius: 12, paddingHorizontal: 16, marginBottom: 20, borderWidth: 1, borderColor: '#2a2d3a' }}>
              <Text style={{ color: '#6b7280', flex: 1 }}>Time (e.g. 14:30):</Text>
              <TextInput
                style={{ color: '#f9fafb', fontWeight: '700', fontSize: 18, textAlign: 'right', paddingVertical: 12 }}
                placeholder="Optional"
                placeholderTextColor="#4b5563"
                value={rescheduleTime}
                onChangeText={setRescheduleTime}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setRescheduleTask(null)} style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#1e2029', alignItems: 'center', borderWidth: 1, borderColor: '#2a2d3a' }}>
                <Text style={{ color: '#9ca3af', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleReschedule} style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#3b1d8a', alignItems: 'center' }}>
                <Text style={{ color: '#a78bfa', fontWeight: '700' }}>Delay Task</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
