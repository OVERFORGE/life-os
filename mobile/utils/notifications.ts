import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
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

/**
 * Schedules local push notifications for a single task's reminder timestamps.
 * Cancels any previously scheduled notifications for this task first.
 * Only schedules reminders that are in the future.
 */
export async function scheduleTaskReminders(task: {
  _id: string;
  title: string;
  reminders?: string[];
}) {
  if (!task.reminders || task.reminders.length === 0) return;

  const now = new Date();

  for (let i = 0; i < task.reminders.length; i++) {
    const reminderDate = new Date(task.reminders[i]);
    if (reminderDate <= now) continue; // skip past reminders

    const minutesUntil = Math.round((reminderDate.getTime() - now.getTime()) / 60000);
    const timeLabel = reminderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    await Notifications.scheduleNotificationAsync({
      identifier: `task-${task._id}-reminder-${i}`,
      content: {
        title: `⏰ Reminder: ${task.title}`,
        body: minutesUntil <= 5
          ? `This task is due now!`
          : `Due at ${timeLabel} — don't forget!`,
        data: { route: '/(dashboard)/tools/tasks', taskId: task._id },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
      },
    });
  }
}

/**
 * Fetches all pending tasks from the backend and re-schedules
 * all future task reminders as local Expo notifications.
 * Call this on app boot and after any task is created/updated.
 */
export async function scheduleAllTaskReminders() {
  try {
    const res = await fetchWithAuth('/tasks/list');
    if (!res.ok) return;
    const data = await res.json();
    const allTasks = [
      ...(data.today || []),
      ...(data.upcoming || []),
      ...(data.overdue || []),
    ];

    // Cancel existing task reminder notifications
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier.startsWith('task-')) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    // Re-schedule for each task
    for (const task of allTasks) {
      if (task.status !== 'pending') continue;
      await scheduleTaskReminders(task);
    }
  } catch (e) {
    console.error('Failed to schedule task reminders', e);
  }
}

