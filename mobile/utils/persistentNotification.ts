import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHANNEL_ID = 'lifeos-exe-v6';
const NOTIF_ID = 'lifeos-executioner-notif';
export const ACTION_CHAT_ID = 'LIFEOS_CHAT_ACTION';
export const ACTION_MIC_ID = 'LIFEOS_MIC_ACTION';

let currentTaskIndex = 0;
let isAssistantResponding = false;
let assistantRevertTimer: ReturnType<typeof setTimeout> | null = null;
let fgServiceInterval: ReturnType<typeof setInterval> | null = null;

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'LifeOS Command Center',
    importance: AndroidImportance.DEFAULT,
    visibility: AndroidVisibility.PUBLIC,
  });
}

// Global foreground service runner — keeps the notification alive
if (Platform.OS === 'android') {
  try {
    notifee.registerForegroundService((_notification) => {
      return new Promise(() => {
        // Runs forever until notifee.stopForegroundService()
      });
    });
  } catch (e) {
    console.log('Notifee FG service registration failed', e);
  }
}

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
        const task = allPending[currentTaskIndex % allPending.length];
        currentTaskIndex++;
        const timeStr = task.dueTime || '';
        return {
          title: `PENDING: ${allPending.length}`,
          text: `${task.title.toUpperCase()}${timeStr ? `  |  ${timeStr}` : ''}`,
        };
      }
    }
  } catch {}
  return { title: 'ALL CLEAR', text: 'No pending targets.' };
}

/**
 * Send a chat command to the API and return the assistant's response.
 */
async function sendChatCommand(message: string): Promise<string> {
  try {
    const { fetchWithAuth } = await import('./api');
    const res = await fetchWithAuth('/conversation', {
      method: 'POST',
      body: JSON.stringify({
        message: message.trim(),
        model: 'llama-3.3-70b-versatile',
        mode: 'general',
      }),
    });
    if (res.ok) {
      const text = await res.text();
      // Strip <think> tags that some models produce
      return text.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();
    }
    return 'Request failed. Try again.';
  } catch {
    return 'Network error.';
  }
}

export async function displayExecutionerNotification(title?: string, body?: string) {
  if (Platform.OS !== 'android') return;
  await ensureChannel();

  let finalTitle = title;
  let finalBody = body;

  if (!finalTitle || !finalBody) {
    const summary = await getNextTaskSummary();
    finalTitle = summary.title;
    finalBody = summary.text;
  }

  const notifConfig: any = {
    id: NOTIF_ID,
    title: finalTitle,
    body: finalBody,
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      colorized: true,
      color: '#B71C1C', // Darker red so Android forces white text
      ongoing: true,
      autoCancel: false,
      onlyAlertOnce: true,
      visibility: AndroidVisibility.PUBLIC,
      smallIcon: 'ic_launcher',
      actions: [
        {
          title: '[ CHAT ]',
          pressAction: {
            id: ACTION_CHAT_ID,
          },
          input: {
            allowFreeFormInput: true,
            placeholder: 'Type a command...',
          },
        },
        {
          title: '[ MIC ]',
          pressAction: {
            id: ACTION_MIC_ID,
          },
        },
      ],
    },
  };

  await notifee.displayNotification(notifConfig);
}

export async function setupPersistentNotification() {
  if (Platform.OS !== 'android') return;
  const enabled = await AsyncStorage.getItem('@persistent_notif_enabled');
  if (enabled === 'false') {
    await stopTaskRotation();
    return;
  }

  await displayExecutionerNotification();
  startTaskRotation();
}

export function startTaskRotation() {
  if (fgServiceInterval) clearInterval(fgServiceInterval);
  fgServiceInterval = setInterval(async () => {
    if (isAssistantResponding) return;
    await displayExecutionerNotification();
  }, 15_000);
}

export async function stopTaskRotation() {
  if (fgServiceInterval) clearInterval(fgServiceInterval);
  if (Platform.OS === 'android') {
    await notifee.stopForegroundService();
    await notifee.cancelNotification(NOTIF_ID);
  }
}

/**
 * Handle a chat command typed inline in the notification.
 */
async function handleChatInput(inputText: string) {
  if (!inputText || !inputText.trim()) return;

  isAssistantResponding = true;
  if (assistantRevertTimer) clearTimeout(assistantRevertTimer);

  // Show processing state
  await displayExecutionerNotification(
    'PROCESSING...',
    `"${inputText.trim().toUpperCase()}"`
  );

  // Call the API
  const response = await sendChatCommand(inputText);

  // Truncate for notification display (max ~300 chars)
  const truncated = response.length > 300 ? response.slice(0, 297) + '...' : response;

  // Show the response
  await displayExecutionerNotification(
    'RESPONSE',
    truncated
  );

  // Revert back to task rotation after 60 seconds
  assistantRevertTimer = setTimeout(async () => {
    isAssistantResponding = false;
    await displayExecutionerNotification();
    assistantRevertTimer = null;
  }, 60_000);
}

export async function updateNotificationWithResponse(response: string) {
  isAssistantResponding = true;
  if (assistantRevertTimer) clearTimeout(assistantRevertTimer);

  const cleanResponse = response.slice(0, 200) + (response.length > 200 ? '...' : '');
  await displayExecutionerNotification('RESPONSE', cleanResponse);

  assistantRevertTimer = setTimeout(async () => {
    isAssistantResponding = false;
    await displayExecutionerNotification();
    assistantRevertTimer = null;
  }, 60_000);
}

// ─── Event Handlers ────────────────────────────────────────────────────────────

async function handleEvent(type: number, detail: any) {
  if (type === EventType.ACTION_PRESS && detail.pressAction) {
    const actionId = detail.pressAction.id;

    if (actionId === ACTION_CHAT_ID && detail.input) {
      // User typed a command in the notification's inline input
      await handleChatInput(detail.input);
    } else if (actionId === ACTION_MIC_ID) {
      // MIC pressed — for now just acknowledge
      console.log('Mic pressed from notification');
    }
  } else if (type === EventType.DISMISSED) {
    // Respawn the notification if it gets dismissed
    const enabled = await AsyncStorage.getItem('@persistent_notif_enabled');
    if (enabled !== 'false') {
      setTimeout(() => displayExecutionerNotification(), 1000);
    }
  }
}

// Foreground: app is open
notifee.onForegroundEvent(({ type, detail }) => {
  handleEvent(type, detail);
});

// Background: app is in background or killed
notifee.onBackgroundEvent(async ({ type, detail }) => {
  await handleEvent(type, detail);
});
