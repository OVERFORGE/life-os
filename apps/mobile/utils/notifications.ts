import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

let notifee: any = null;
let TriggerType: any = null;
let AndroidImportance: any = null;
let AndroidVisibility: any = null;
let AlarmType: any = null;

try {
  const notifeeModule = require('@notifee/react-native');
  notifee = notifeeModule.default;
  TriggerType = notifeeModule.TriggerType;
  AndroidImportance = notifeeModule.AndroidImportance;
  AndroidVisibility = notifeeModule.AndroidVisibility;
  AlarmType = notifeeModule.AlarmType;
} catch (_) {}

export const REMINDER_CHANNEL_ID = 'lifeos_reminder_channel';

export async function ensureReminderChannel() {
  if (!notifee || Platform.OS !== 'android') return;
  try {
    await notifee.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'LifeOS Task Reminders',
      importance: AndroidImportance ? AndroidImportance.HIGH : 4,
      visibility: AndroidVisibility ? AndroidVisibility.PUBLIC : 1,
      vibration: true,
      vibrationPattern: [0, 300, 200, 300],
      sound: 'default',
      lights: true,
      lightColor: '#00F0FF',
    });
  } catch (e) {
    console.warn('[notifications] Failed to create reminder channel:', e);
  }
}

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
      lightColor: '#E8414A',
    });
    await ensureReminderChannel();
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (notifee) {
      try {
        await notifee.requestPermission();
      } catch (_) {}
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
            title: "Time for a Weigh-in",
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
 * Schedules high-priority exact push notifications for a single task's reminder timestamps.
 * Uses Notifee exact alarm triggers on Android to guarantee delivery even during Doze/Idle.
 * Only schedules reminders that are in the future.
 */
export async function scheduleTaskReminders(task: {
  _id: string;
  title: string;
  dueDate?: string;
  dueTime?: string | null;
  reminders?: string[];
}) {
  const reminderList: string[] = [...(task.reminders || [])];

  // If no explicit reminders, but task has dueDate and dueTime, derive reminder timestamp
  if (reminderList.length === 0 && task.dueDate && task.dueTime) {
    try {
      const dueMatch = String(task.dueTime).match(/^(\d{1,2}):(\d{2})$/);
      if (dueMatch) {
        const localDate = new Date(`${task.dueDate}T${task.dueTime}:00`);
        if (!isNaN(localDate.getTime())) {
          reminderList.push(localDate.toISOString());
        }
      }
    } catch (_) {}
  }

  if (reminderList.length === 0) return;

  const now = new Date();

  // Cancel any existing Notifee triggers for this task
  if (notifee && Platform.OS === 'android') {
    try {
      for (let i = 0; i < 10; i++) {
        await notifee.cancelNotification(`task-${task._id}-reminder-${i}`);
      }
    } catch (_) {}
  }

  for (let i = 0; i < reminderList.length; i++) {
    const reminderDate = new Date(reminderList[i]);
    if (reminderDate <= now) continue; // skip past reminders

    const minutesUntil = Math.round((reminderDate.getTime() - now.getTime()) / 60000);
    const timeLabel = reminderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Primary Android Delivery: Notifee Exact Alarm Trigger
    if (notifee && Platform.OS === 'android') {
      try {
        await ensureReminderChannel();
        await notifee.createTriggerNotification(
          {
            id: `task-${task._id}-reminder-${i}`,
            title: task.title,
            body: minutesUntil <= 2
              ? `Scheduled focus time — ready to start?`
              : `Due at ${timeLabel} — scheduled focus block`,
            android: {
              channelId: REMINDER_CHANNEL_ID,
              importance: AndroidImportance ? AndroidImportance.HIGH : 4,
              priority: 'high',
              smallIcon: 'notification_icon',
              color: '#00F0FF',
              pressAction: {
                id: 'default',
                launchActivity: 'default',
              },
              actions: [
                {
                  title: 'Start',
                  pressAction: {
                    id: 'ACTION_START',
                  },
                },
                {
                  title: '+15m',
                  pressAction: {
                    id: 'ACTION_EXTEND',
                  },
                },
              ],
              sound: 'default',
              vibrationPattern: [0, 300, 200, 300],
              lightColor: '#00F0FF',
            },
            data: {
              route: '/(dashboard)/tools/tasks',
              taskId: task._id,
              entityId: task._id,
              idempotencySeed: task._id,
              plannedDurationMinutes: String((task as any).metadata?.estimatedDuration || 15),
            },
          },
          {
            type: TriggerType ? TriggerType.TIMESTAMP : 0,
            timestamp: reminderDate.getTime(),
            alarmManager: {
              type: AlarmType ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE : 3,
            },
          }
        );
      } catch (err) {
        console.warn('[notifications] Notifee trigger scheduling failed:', err);
      }
    }

    // 2. Secondary / Fallback Delivery: Expo Notifications
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `task-${task._id}-reminder-${i}`,
        content: {
          title: task.title,
          body: minutesUntil <= 2
            ? `Scheduled focus time — ready to start?`
            : `Due at ${timeLabel} — scheduled focus block`,
          data: {
            route: '/(dashboard)/tools/tasks',
            taskId: task._id,
            entityId: task._id,
            idempotencySeed: task._id,
          },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderDate,
        },
      });
    } catch (_) {}
  }
}

/**
 * Fetches all pending tasks from the backend and re-schedules
 * all future task reminders as local high-priority exact triggers.
 * Call this on app boot and after any task is created/updated.
 */
export async function scheduleAllTaskReminders() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const res = await fetchWithAuth('/tasks/list', {
      headers: {
        'x-timezone': tz,
      },
    });
    if (!res.ok) return;
    const data = await res.json();
    const allTasks = [
      ...(data.today || []),
      ...(data.upcoming || []),
      ...(data.overdue || []),
    ];

    // Cancel existing Notifee task triggers
    if (notifee && Platform.OS === 'android') {
      try {
        const triggerIds = await notifee.getTriggerNotificationIds();
        for (const id of triggerIds) {
          if (id.startsWith('task-')) {
            await notifee.cancelNotification(id);
          }
        }
      } catch (err) {
        console.warn('[notifications] Error clearing Notifee triggers:', err);
      }
    }

    // Cancel existing Expo task notifications
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of scheduled) {
        if (n.identifier.startsWith('task-')) {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
        }
      }
    } catch (_) {}

    // Re-schedule for each pending task
    for (const task of allTasks) {
      if (task.status !== 'pending') continue;
      await scheduleTaskReminders(task);
    }
  } catch (e) {
    console.error('Failed to schedule task reminders', e);
  }
}


