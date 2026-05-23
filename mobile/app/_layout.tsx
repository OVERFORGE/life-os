import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';
import '../utils/persistentNotification';
import { useEffect } from 'react';
import { ToastProvider } from '../components/ui/Toast';
import { registerForPushNotificationsAsync, scheduleDailyReminder } from '../utils/notifications';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotificationsAsync().then(() => {
      scheduleDailyReminder();
    });
    
    // Clean up the old persistent notification if it exists
    Notifications.dismissNotificationAsync('lifeos-persistent-notif').catch(() => {});
  }, []);

  return (
    <ThemeProvider value={DarkTheme}>
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#161618' } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
          <Stack.Screen name="chat-modal" options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }} />
        </Stack>
        <StatusBar style="light" />
      </ToastProvider>
    </ThemeProvider>
  );
}
