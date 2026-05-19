/**
 * persistentNotification.ts
 *
 * Manages a persistent "foreground task reminder" notification.
 * Shows the user's next upcoming task and provides a text-input action
 * so they can send a message to the LifeOS chatbot directly from the
 * notification shade.
 *
 * Architecture:
 *  - A single persistent notification channel ("lifeos-persistent")
 *  - The notification body shows the next upcoming task + due time
 *  - A text-input notification action lets the user type a prompt
 *  - The notification response handler sends the text to /conversation
 *  - The response updates the notification body for 60s, then reverts
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHANNEL_ID = 'lifeos-persistent';
const NOTIF_ID = 'lifeos-persistent-notif';
const ACTION_REPLY_ID = 'LIFEOS_CHAT_REPLY';
let revertTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Channel & category setup ─────────────────────────────────────────────────

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'LifeOS Assistant',
    importance: Notifications.AndroidImportance.LOW,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
    enableVibrate: false,
    sound: null,
  });
}

async function registerCategories() {
  await Notifications.setNotificationCategoryAsync('lifeos-persistent', [
    {
      identifier: ACTION_REPLY_ID,
      buttonTitle: 'Chat',
      textInput: {
        submitButtonTitle: 'Send',
        placeholder: 'Ask LifeOS...',
      },
      options: {
        opensAppToForeground: false,
      },
    },
  ]);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Call once on app boot (after permissions granted). */
export async function setupPersistentNotification() {
  const enabled = await AsyncStorage.getItem('@persistent_notif_enabled');
  if (enabled === 'false') return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    if (newStatus !== 'granted') return;
  }

  await ensureChannel();
  await registerCategories();
  await refreshPersistentNotification();
}

/** Dismiss + reschedule the notification with the latest task data. */
export async function refreshPersistentNotification(taskText?: string, customTitle?: string) {
  // Check if disabled by user
  const enabled = await AsyncStorage.getItem('@persistent_notif_enabled');
  if (enabled === 'false') {
    await Notifications.dismissNotificationAsync(NOTIF_ID);
    return;
  }

  let body = taskText;
  let title = customTitle || 'Upcoming Task';

  if (!body) {
    const summary = await getNextTaskSummary();
    body = summary.text;
    title = summary.title;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_ID, // Use fixed identifier to update in place
    content: {
      title,
      body,
      categoryIdentifier: 'lifeos-persistent',
      sticky: true,
      autoDismiss: false,
      data: { type: 'persistent' },
    },
    trigger: null, // show immediately
  });
}

/**
 * Replace notification body with the bot's response for 60s,
 * then revert to the task summary.
 */
export async function updateNotificationWithResponse(response: string) {
  if (revertTimer) clearTimeout(revertTimer);

  const cleanResponse = response.slice(0, 150) + (response.length > 150 ? '…' : '');
  await refreshPersistentNotification(cleanResponse, 'Assistant Response');

  revertTimer = setTimeout(async () => {
    await refreshPersistentNotification();
    revertTimer = null;
  }, 60_000);
}

// ─── Notification response handler ───────────────────────────────────────────

/**
 * Wire this up in your root _layout.tsx:
 *   Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
 */
export async function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const { actionIdentifier, userText } = response as any;
  if (actionIdentifier !== ACTION_REPLY_ID || !userText?.trim()) return;

  const prompt = userText.trim();

  // Optimistic update
  await refreshPersistentNotification('Thinking...', 'Assistant');

  try {
    const { fetchWithAuth } = await import('./api');
    const res = await fetchWithAuth('/conversation', {
      method: 'POST',
      body: JSON.stringify({ message: prompt, model: 'llama-3.3-70b-versatile', mode: 'general' }),
    });

    if (res.ok) {
      const text = await res.text();
      const clean = text.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();
      await updateNotificationWithResponse(clean);
    } else {
      await updateNotificationWithResponse('Sorry, something went wrong. Try again.');
    }
  } catch (e) {
    await updateNotificationWithResponse('Network error. Make sure the app is running.');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getNextTaskSummary(): Promise<{ title: string; text: string }> {
  try {
    const { fetchWithAuth } = await import('./api');
    const res = await fetchWithAuth('/tasks/list');
    if (res.ok) {
      const data = await res.json();
      const pendingToday = data.today?.filter((t: any) => t.status === 'pending') || [];
      const pendingOverdue = data.overdue?.filter((t: any) => t.status === 'pending') || [];
      const pendingUpcoming = data.upcoming?.filter((t: any) => t.status === 'pending') || [];
      
      const allPending = [...pendingOverdue, ...pendingToday, ...pendingUpcoming];
      
      if (allPending.length > 0) {
        const task = allPending[0];
        const timeStr = task.dueTime || '';
        return {
          title: 'Upcoming Task',
          text: `${task.title}${timeStr ? `  ·  ${timeStr}` : ''}`
        };
      }
    }
  } catch {}
  return { title: 'LifeOS Assistant', text: 'No upcoming tasks. Tap Chat to talk.' };
}
