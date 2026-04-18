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
}
