import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#fbbf24',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get notification permissions');
      return false;
    }
    return true;
  }
  return false;
}

import { fetchWithAuth } from './api';

export async function scheduleDailyReminder() {
  // Clear existings to prevent duplicates
  await Notifications.cancelAllScheduledNotificationsAsync();
  
  // Schedule 12 AM daily reminder
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Daily Log Reminder 🌙",
      body: "Did you hit your goals today? Open LifeOS to log your progress before you sleep.",
      data: { route: '/checkin' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 0,
      minute: 0,
    },
  });

  // Fetch user preferences for weight reminder
  try {
    const res = await fetchWithAuth('/user');
    if (res.ok) {
      const data = await res.json();
      const prefs = data.preferences || {};
      
      if (prefs.weightReminderEnabled !== false) {
        // Weekday starts from 1 (Sunday) in Expo Notifications
        const day = (prefs.weightReminderDay ?? 0) + 1; 
        const hour = prefs.weightReminderHour ?? 9;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Time for a Weigh-in ⚖️",
            body: "Consistent tracking helps LifeOS adapt your maintenance calories. Log your weight now!",
            data: { route: '/(dashboard)/health' },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: day,
            hour: hour,
            minute: 0,
          },
        });
      }
    }
  } catch (e) {
    console.error('Failed to schedule weight reminder', e);
  }
}
