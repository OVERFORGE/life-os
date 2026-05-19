import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';
import { useEffect } from 'react';
import { ToastProvider } from '../components/ui/Toast';
import { registerForPushNotificationsAsync, scheduleDailyReminder } from '../utils/notifications';
import { setupPersistentNotification, handleNotificationResponse } from '../utils/persistentNotification';
import * as Notifications from 'expo-notifications';

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotificationsAsync().then(() => {
      scheduleDailyReminder();
      setupPersistentNotification();
    });
    // Handle chat replies sent from the notification shade
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => sub.remove();
  }, []);

  return (
    <ThemeProvider value={DarkTheme}>
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#161618' } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="light" />
      </ToastProvider>
    </ThemeProvider>
  );
}
