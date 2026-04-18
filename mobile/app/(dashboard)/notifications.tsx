import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
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
    <View className="flex-1 bg-[#0f1115]">
      {/* Header */}
      <BlurView
        intensity={40}
        tint="dark"
        className="flex-row justify-between items-center pt-16 pb-4 px-6 border-b border-[#232632] z-10 w-full"
        style={{ backgroundColor: 'rgba(15, 17, 21, 0.8)' }}
      >
        <TouchableOpacity 
          onPress={() => router.back()} 
          className="p-2 rounded-[20px] border border-[#232632] bg-[#161922]"
        >
          <ArrowLeft color="#f3f4f6" size={20} />
        </TouchableOpacity>
        <Text className="text-[17px] font-bold text-gray-100 tracking-wide">Notifications</Text>
        <View className="w-10 h-10" />
      </BlurView>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View className="items-center mt-20">
            <ActivityIndicator color="#fbbf24" size="large" />
            <Text className="text-gray-500 mt-4 text-sm font-medium">Loading...</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View className="items-center mt-12 bg-[#161922] p-8 rounded-3xl border border-[#232632]">
            <CheckCircle2 color="#10b981" size={48} className="mb-4" />
            <Text className="text-gray-100 text-lg font-bold mb-2">All caught up!</Text>
            <Text className="text-gray-400 text-center text-sm leading-5">You have no new notifications.</Text>
          </View>
        ) : (
          <View className="space-y-4">
            {notifications.map((n) => (
              <View 
                key={n._id}
                className={`flex-row p-4 rounded-2xl border ${!n.read ? 'bg-[#1c202a] border-amber-500/30' : 'bg-[#161922] border-[#232632]'}`}
              >
                <View className="mt-1 mr-4">
                  {n.type === 'alert' ? <AlertCircle color="#ef4444" size={20} /> : <Bell color="#fbbf24" size={20} />}
                </View>
                <View className="flex-1">
                  <Text className={`font-bold text-[15px] ${!n.read ? 'text-gray-100' : 'text-gray-300'}`}>{n.title}</Text>
                  <Text className="text-gray-400 text-sm mt-1 leading-5">{n.body}</Text>
                  <Text className="text-gray-500 text-xs mt-3 font-medium">
                    {new Date(n.createdAt).toLocaleDateString()} at {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
