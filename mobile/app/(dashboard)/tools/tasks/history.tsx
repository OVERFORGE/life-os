import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Calendar, Clock } from 'lucide-react-native';
import { fetchWithAuth } from '../../../../utils/api';

export default function TaskHistoryScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetchWithAuth('/tasks/list');
        if (res.ok) {
          const data = await res.json();
          // Merge all lists, filter completed ones, sort by most recent
          const all = [
            ...(data.today || []),
            ...(data.overdue || []),
            ...(data.upcoming || []),
          ].filter((t: any) => t.status === 'completed');
          all.sort((a: any, b: any) => {
            const da = a.completedAt || a.updatedAt || a.dueDate || '';
            const db = b.completedAt || b.updatedAt || b.dueDate || '';
            return db.localeCompare(da);
          });
          setTasks(all);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#161618' }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#2A2B2F', flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}
        >
          <ArrowLeft color="rgba(236,231,227,0.7)" size={17} />
        </TouchableOpacity>
        <View>
          <Text style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 16 }}>Task History</Text>
          <Text style={{ color: 'rgba(236,231,227,0.45)', fontSize: 11, marginTop: 2 }}>{tasks.length} completed tasks</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#E8414A" size="large" />
        </View>
      ) : tasks.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <CheckCircle2 size={40} color="#2A2B2F" />
          <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 14, marginTop: 14, textAlign: 'center' }}>
            No completed tasks yet.{'\n'}Start completing tasks to build history.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          {tasks.map((task: any, idx: number) => (
            <View
              key={task._id || idx}
              style={{
                backgroundColor: '#1F2023',
                borderRadius: 12,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: '#2A2B2F',
                flexDirection: 'row',
                alignItems: 'center',
                padding: 14,
              }}
            >
              <CheckCircle2 size={20} color="#E8414A" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 14, fontWeight: '500', textDecorationLine: 'line-through' }} numberOfLines={1}>
                  {task.title}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  {task.dueDate && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Calendar size={10} color="rgba(236,231,227,0.3)" />
                      <Text style={{ color: 'rgba(236,231,227,0.3)', fontSize: 11 }}>{task.dueDate}</Text>
                    </View>
                  )}
                  {task.dueTime && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Clock size={10} color="rgba(236,231,227,0.3)" />
                      <Text style={{ color: 'rgba(236,231,227,0.3)', fontSize: 11 }}>{task.dueTime}</Text>
                    </View>
                  )}
                  <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99, backgroundColor: 'rgba(232,65,74,0.1)', borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)' }}>
                    <Text style={{ color: '#E8414A', fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>{task.priority || 'medium'}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
