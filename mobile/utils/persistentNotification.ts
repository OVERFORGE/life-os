import notifee, { AndroidImportance, AndroidVisibility, EventType, AndroidForegroundServiceType } from '@notifee/react-native';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VoiceRecorder, transcribeAudio } from './audioCapture';
import { isVoiceAssistantEnabledAtCurrentLocation } from './locationManager';
import { playChime, speakAndListen } from './ttsManager';

const voiceRecorder = new VoiceRecorder();

const CHANNEL_ID = 'lifeos-exe-v8';
const NOTIF_ID = 'lifeos-executioner-notif';
export const ACTION_CHAT_ID = 'LIFEOS_CHAT_ACTION';
export const ACTION_MIC_ID = 'LIFEOS_MIC_ACTION';

let currentTaskIndex = 0;
let isAssistantResponding = false;
let assistantRevertTimer: ReturnType<typeof setTimeout> | null = null;
let isFgServiceRunning = false;
let fgTaskResolve: (() => void) | null = null;

let lastDisplayedText: string | null = null;
let noTasksCounter = 0;

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'LifeOS Command Center',
    importance: AndroidImportance.DEFAULT,
    visibility: AndroidVisibility.PUBLIC,
    vibration: false,
    sound: 'default', // Using default sound but setting vibration false; actually, let's omit sound to be fully silent. Wait, if it's DEFAULT importance, Android requires a sound setting or it assigns default.
  });
}

// Global foreground service runner — keeps the notification alive
if (Platform.OS === 'android') {
  try {
    notifee.registerForegroundService((_notification) => {
      return new Promise((resolve) => {
        isFgServiceRunning = true;
        fgTaskResolve = resolve;

        // Android suspends main thread setIntervals. By running the loop 
        // inside the headless task promise, it is guaranteed to stay awake!
        const interval = setInterval(async () => {
          if (!isFgServiceRunning) {
            clearInterval(interval);
            resolve();
            return;
          }
          if (isAssistantResponding) return;
          await displayExecutionerNotification();
        }, 15_000);
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
      
      // Check Reminders
      const now = Date.now();
      for (const task of allPending) {
        if (task.reminders && Array.isArray(task.reminders)) {
          for (const remStr of task.reminders) {
            const remTime = new Date(remStr).getTime();
            if (remTime <= now && now - remTime < 15000) {
              const isVoiceAllowed = await isVoiceAssistantEnabledAtCurrentLocation();
              if (isVoiceAllowed) {
                await playChime();
                speakAndListen(`Reminder: ${task.title}`, () => {
                  if (Platform.OS === 'android' || Platform.OS === 'ios') {
                    voiceRecorder.startRecording(async (uri: string) => {
                      const { transcribeAudio } = await import('./audioCapture');
                      const { text } = await transcribeAudio(uri);
                      if (text) handleChatInput(text);
                    });
                  }
                });
              }
            }
          }
        }
      }

      if (allPending.length > 0) {
        const task = allPending[currentTaskIndex % allPending.length];
        currentTaskIndex++;
        const timeStr = task.dueTime || '';
        noTasksCounter = 0;
        return {
          title: `PENDING: ${allPending.length}`,
          text: `${task.title.toUpperCase()}${timeStr ? `  |  ${timeStr}` : ''}`,
        };
      }
    }
  } catch {}
  
  noTasksCounter++;
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

  const newDisplayText = `${finalTitle}::${finalBody}`;

  // If there's no change, and we're not currently processing a chat command, do NOT update notification.
  // Also, if no tasks exist (ALL CLEAR) and we already showed it, skip refreshing.
  if (!isAssistantResponding && lastDisplayedText === newDisplayText && noTasksCounter > 1) {
    return;
  }

  // If the text is the exact same and it's just a rotation loop, don't flash the screen.
  // Wait, if it's identical text, Notifee might still trigger a system redraw. We skip it entirely.
  if (!isAssistantResponding && lastDisplayedText === newDisplayText) {
    return;
  }
  
  lastDisplayedText = newDisplayText;

  const notifConfig: any = {
    id: NOTIF_ID,
    title: finalTitle,
    body: finalBody,
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      foregroundServiceTypes: [
        AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
        AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MICROPHONE
      ],
      colorized: true,
      color: '#B71C1C', // Darker red so Android forces white text
      ongoing: true,
      autoCancel: false,
      onlyAlertOnce: true,
      visibility: AndroidVisibility.PUBLIC,
      smallIcon: 'notification_icon',
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

  try {
    await notifee.displayNotification(notifConfig);
  } catch (error: any) {
    console.log("NOTIFEE ERROR:", error);
  }
}

export async function setupPersistentNotification() {
  if (Platform.OS !== 'android') return;
  
  try {
    // Android 13+ absolutely requires requesting POST_NOTIFICATIONS at runtime
    const settings = await notifee.requestPermission();
    if (settings.authorizationStatus === 0) { // 0 = DENIED
      console.log('User denied notification permissions.');
      Alert.alert("Permissions Missing", "Please grant notification permissions in Android settings for the Command Center to work.");
      return;
    }

    const enabled = await AsyncStorage.getItem('@persistent_notif_enabled');
    // Default is false/null. Only start if explicitly 'true' to protect Expo Go users
    if (enabled !== 'true') {
      await stopTaskRotation();
      return;
    }

    await displayExecutionerNotification();
    startTaskRotation();
  } catch (error: any) {
    Alert.alert("Setup Error", error?.message || String(error));
  }
}

export function startTaskRotation() {
  isFgServiceRunning = true;
}

export async function stopTaskRotation() {
  isFgServiceRunning = false;
  if (fgTaskResolve) {
    fgTaskResolve();
    fgTaskResolve = null;
  }
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

  const isVoiceAllowed = await isVoiceAssistantEnabledAtCurrentLocation();
  if (isVoiceAllowed) {
    speakAndListen(response.trim(), () => {
       if (Platform.OS === 'android' || Platform.OS === 'ios') {
         voiceRecorder.startRecording(async (uri: string) => {
           const { transcribeAudio } = await import('./audioCapture');
           const { text } = await transcribeAudio(uri);
           if (text) handleChatInput(text);
         });
       }
    });
  }

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
      // MIC pressed — start headless background recording!
      await displayExecutionerNotification('LISTENING...', 'Speak your command now...');
      
      const success = await voiceRecorder.startRecording(async (uri) => {
        await displayExecutionerNotification('PROCESSING...', 'Transcribing voice...');
        const { text, error } = await transcribeAudio(uri);
        
        if (text) {
          await handleChatInput(text);
        } else {
          await displayExecutionerNotification('ERROR', error || 'Failed to hear command.');
          setTimeout(() => {
            lastDisplayedText = null;
            displayExecutionerNotification();
          }, 4000);
        }
      });

      if (!success) {
        await displayExecutionerNotification('ERROR', 'Mic permission denied or failed.');
        setTimeout(() => {
            lastDisplayedText = null;
            displayExecutionerNotification();
        }, 3000);
      }
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
