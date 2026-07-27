// CACHE BUST 
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
import { Alert } from 'react-native';

// Global Error Handler to catch fatal crashes
const defaultErrorHandler = (global as any).ErrorUtils?.getGlobalHandler();
(global as any).ErrorUtils?.setGlobalHandler((error: Error, isFatal: boolean) => {
  if (isFatal) {
    Alert.alert(
      'Fatal Error Captured',
      `Message: ${error.message}\n\nStack: ${error.stack?.substring(0, 500)}`,
      [{ text: 'OK' }]
    );
  }
  if (defaultErrorHandler) {
    defaultErrorHandler(error, isFatal);
  }
});

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotificationsAsync().then(() => {
      scheduleDailyReminder();
    });
    
    // Clean up the old persistent notification if it exists
    Notifications.dismissNotificationAsync('lifeos-persistent-notif').catch(() => {});

    // Polling for real-time remote logout
    const interval = setInterval(async () => {
      try {
        const token = await AsyncStorage.getItem('user_token');
        if (!token) return;

        // Using fetch directly because we can't easily import router into fetchWithAuth
        const { API_URL } = require('../utils/api');
        const res = await fetch(`${API_URL}/user`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
          await AsyncStorage.removeItem('user_token');
          const { router } = require('expo-router');
          router.replace('/login');
        }
      } catch (e) {
        // Network error, ignore
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
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

import { View, Text, Button } from 'react-native';
export function ErrorBoundary(props: any) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#660000', padding: 20 }}>
      <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>UI CRASH!</Text>
      <Text style={{ color: 'white', marginVertical: 20, textAlign: 'center' }}>{props.error?.message || 'Unknown Error'}</Text>
      <Button title="Try Again" onPress={props.retry} color="white" />
    </View>
  );
}
