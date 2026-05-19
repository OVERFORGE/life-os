import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { CheckCircle2, Circle, ChevronRight, AlertCircle, ArrowRight } from 'lucide-react-native';
import { fetchWithAuth } from '../../utils/api';
import { scheduleAllTaskReminders } from '../../utils/notifications';

export function DashboardTaskCard() {
  const router = useRouter();
  const [tasksData, setTasksData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    loadTasks();
  }, []));

  const loadTasks = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetchWithAuth('/tasks/list');
      if (res.ok) setTasksData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggleComplete = async (task: any) => {
    const action = task.status === 'completed' ? 'uncomplete' : 'complete';
    const newStatus = action === 'complete' ? 'completed' : 'pending';

    // Optimistic update
    if (tasksData) {
      const upd = (list: any[]) => list?.map(t => t._id === task._id ? { ...t, status: newStatus } : t);
      setTasksData((prev: any) => ({
        ...prev,
        today: upd(prev.today),
        overdue: upd(prev.overdue),
      }));
    }

    // Fire & forget background call
    fetchWithAuth('/tasks/complete', {
      method: 'POST',
      body: JSON.stringify({ taskId: task._id, action }),
    }).then(() => {
      scheduleAllTaskReminders().catch(() => {});
    }).catch(() => loadTasks(true));
  };

  const today = tasksData?.today || [];
  const overdue = tasksData?.overdue || [];
  const allVisible = [...overdue, ...today].slice(0, 5);
  const totalToday = today.length + overdue.length;
  const doneToday = allVisible.filter((t: any) => t.status === 'completed').length;
  const pct = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;

  return (
    <View style={{ backgroundColor: '#1F2023', borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F', marginBottom: 20, overflow: 'hidden' }}>
      {/* Header */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => router.push('/(dashboard)/tools/tasks')}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 }}
      >
        <View>
          <Text style={{ fontSize: 10, color: '#ECE7E3', opacity: 0.5, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' }}>Today's Tasks</Text>
          {totalToday > 0 && (
            <Text style={{ fontSize: 13, color: '#ECE7E3', opacity: 0.7, marginTop: 2 }}>{doneToday}/{totalToday} complete</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 10, color: '#E8414A', fontWeight: '700' }}>{pct}%</Text>
          <ArrowRight size={14} color="rgba(236,231,227,0.4)" />
        </View>
      </TouchableOpacity>

      {/* Progress bar */}
      {totalToday > 0 && (
        <View style={{ marginHorizontal: 20, height: 2, backgroundColor: '#2A2B2F', borderRadius: 2, marginBottom: 14 }}>
          <View style={{ height: 2, width: `${pct}%`, backgroundColor: pct === 100 ? '#ECE7E3' : '#E8414A', borderRadius: 2 }} />
        </View>
      )}

      {/* Task list */}
      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color="#E8414A" />
        </View>
      ) : allVisible.length === 0 ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 20, alignItems: 'center', paddingTop: 8 }}>
          <CheckCircle2 size={28} color="#2A2B2F" />
          <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 13, marginTop: 10 }}>No tasks for today</Text>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          {allVisible.map((task: any, idx: number) => {
            const isDone = task.status === 'completed';
            const isOverdue = overdue.some((o: any) => o._id === task._id);
            return (
              <TouchableOpacity
                key={task._id}
                activeOpacity={0.7}
                onPress={() => router.push('/(dashboard)/tools/tasks')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderBottomWidth: idx < allVisible.length - 1 ? 1 : 0,
                  borderBottomColor: '#2A2B2F',
                }}
              >
                <TouchableOpacity
                  onPress={() => toggleComplete(task)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ marginRight: 12 }}
                >
                  {isDone
                    ? <CheckCircle2 size={20} color="#E8414A" />
                    : <Circle size={20} color={isOverdue ? '#E8414A' : 'rgba(236,231,227,0.3)'} />
                  }
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: isDone ? 'rgba(236,231,227,0.35)' : '#FFFDFC',
                      fontSize: 14,
                      fontWeight: '500',
                      textDecorationLine: isDone ? 'line-through' : 'none',
                    }}
                  >
                    {task.title}
                  </Text>
                  {task.dueTime && (
                    <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 11, marginTop: 2 }}>{task.dueTime}</Text>
                  )}
                </View>
                {isOverdue && !isDone && (
                  <AlertCircle size={14} color="#E8414A" style={{ marginLeft: 6 }} />
                )}
              </TouchableOpacity>
            );
          })}
          {totalToday > 5 && (
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/tools/tasks')}
              style={{ paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ color: '#E8414A', fontSize: 12, fontWeight: '600' }}>+{totalToday - 5} more</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
