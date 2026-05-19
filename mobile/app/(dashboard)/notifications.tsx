import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bell, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { fetchWithAuth } from '../../utils/api';

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth('/notifications')
      .then((res) => res.json())
      .then((data) => {
        setNotifications(data.notifications || []);
        // Mark as read
        if (data.notifications?.some((n: any) => !n.read)) {
          fetchWithAuth('/notifications', { method: 'PUT' });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#161618' }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#2A2B2F', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft color="rgba(236,231,227,0.7)" size={17} />
        </TouchableOpacity>
        <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 16 }}>Notifications</Text>
        <View style={{ width: 38, height: 38 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <ActivityIndicator color="#E8414A" size="large" />
            <Text style={{ color: 'rgba(236,231,227,0.4)', marginTop: 16, fontSize: 13, fontWeight: '600' }}>Loading logs...</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 40, backgroundColor: '#1F2023', padding: 32, borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F' }}>
            <CheckCircle2 color="#ECE7E3" size={40} style={{ marginBottom: 16, opacity: 0.3 }} />
            <Text style={{ color: '#FFFDFC', fontSize: 18, fontWeight: '800', marginBottom: 8 }}>All caught up!</Text>
            <Text style={{ color: 'rgba(236,231,227,0.5)', textAlign: 'center', fontSize: 13, lineHeight: 20 }}>You have no new notifications.</Text>
          </View>
        ) : (
          <View>
            {notifications.map((n) => {
              const isUnread = !n.read;
              return (
                <TouchableOpacity 
                  key={n._id}
                  onPress={() => router.push('/(dashboard)/brain')}
                  style={{
                    flexDirection: 'row',
                    padding: 18,
                    marginBottom: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    backgroundColor: isUnread ? 'rgba(232,65,74,0.05)' : '#1F2023',
                    borderColor: isUnread ? 'rgba(232,65,74,0.25)' : '#2A2B2F'
                  }}
                >
                  <View style={{ marginRight: 14, marginTop: 2 }}>
                    {n.type === 'alert' ? <AlertCircle color="#E8414A" size={18} /> : <Bell color={isUnread ? '#E8414A' : 'rgba(236,231,227,0.4)'} size={18} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', fontSize: 15, color: isUnread ? '#FFFDFC' : 'rgba(236,231,227,0.7)', marginBottom: 4 }}>{n.title}</Text>
                    <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 13, lineHeight: 18, marginBottom: 10 }}>{n.body}</Text>
                    <Text style={{ color: 'rgba(236,231,227,0.35)', fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>
                      {new Date(n.createdAt).toLocaleDateString()} • {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
