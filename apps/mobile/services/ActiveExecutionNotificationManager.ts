/**
 * LifeOS Mobile Active Execution Notification Manager (Phase 4)
 * 
 * Drives the Class B Active Execution Loop:
 * DUE -> "Ready to start?" [Start] [Later]
 * START -> "Title" "Just tell me when you're done." [Done] [Pause] [+15m]
 * DONE -> auto-dismiss -> SILENCE.
 * 
 * Replaces legacy 15s polling with event-driven Notifee updates.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { fetchWithAuth, API_URL } from '../utils/api';
import {
  ACTION_START,
  ACTION_DONE,
  ACTION_LATER,
  ACTION_PAUSE,
  ACTION_EXTEND,
  handleHeadlessNotificationAction,
} from './HeadlessActionReceiver';

let notifee: any = null;
let AndroidImportance: any, AndroidVisibility: any;

try {
  const notifeeModule = require('@notifee/react-native');
  notifee = notifeeModule.default;
  AndroidImportance = notifeeModule.AndroidImportance;
  AndroidVisibility = notifeeModule.AndroidVisibility;
} catch {
  // Silent fallback for Expo Go
}

const isExpoGo = Constants.appOwnership === 'expo';

const CHANNEL_ACTIVE = 'lifeos_active_execution';
const CHANNEL_PROPOSAL = 'lifeos_proposal_channel';
export const ACTIVE_NOTIF_ID = 'lifeos-active-execution-notif';

// Design System Red for Active Execution Surface
const EXECUTION_RED = '#E8414A';

export class ActiveExecutionNotificationManager {
  private static instance: ActiveExecutionNotificationManager;
  private isStarted = false;
  private eventTransport: any = null;

  private constructor() {}

  public static getInstance(): ActiveExecutionNotificationManager {
    if (!ActiveExecutionNotificationManager.instance) {
      ActiveExecutionNotificationManager.instance = new ActiveExecutionNotificationManager();
    }
    return ActiveExecutionNotificationManager.instance;
  }

  /**
   * Prompts user for Android 13+ POST_NOTIFICATIONS runtime permission.
   */
  public async requestPermissions(): Promise<boolean> {
    if (!notifee || Platform.OS !== 'android' || isExpoGo) return false;
    try {
      const settings = await notifee.requestPermission();
      return settings.authorizationStatus >= 1;
    } catch (err) {
      console.warn('[ActiveExecutionNotificationManager] Permission request error:', err);
      return false;
    }
  }

  /**
   * Initializes notification channels, permissions, and background receivers.
   */
  public async start(): Promise<void> {
    if (this.isStarted || isExpoGo || Platform.OS !== 'android') return;
    this.isStarted = true;

    // Explicit runtime permission prompt
    await this.requestPermissions();

    await this.ensureChannels();

    // Register Background & Foreground event handlers with Notifee
    if (notifee) {
      try {
        notifee.onBackgroundEvent(handleHeadlessNotificationAction);
        notifee.onForegroundEvent(handleHeadlessNotificationAction);
      } catch (err) {
        console.warn('[ActiveExecutionNotificationManager] Notifee listener error:', err);
      }
    }

    // Initial state hydration
    await this.refreshState();

    // Connect to native-compatible SSE stream for cross-device updates
    this.connectSseStream();
  }

  /**
   * Ensures high-priority notification channels exist.
   */
  private async ensureChannels(): Promise<void> {
    if (!notifee || Platform.OS !== 'android') return;

    try {
      await notifee.createChannel({
        id: CHANNEL_ACTIVE,
        name: 'LifeOS Active Execution',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        vibration: false,
        sound: undefined,
      });

      await notifee.createChannel({
        id: CHANNEL_PROPOSAL,
        name: 'LifeOS Schedule Proposals',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        vibration: true,
        sound: 'default',
      });
    } catch (e) {
      console.warn('[ActiveExecutionNotificationManager] Channel creation failed:', e);
    }
  }

  /**
   * Fetches latest surface projection from the sovereign backend.
   */
  public async refreshState(): Promise<void> {
    try {
      const res = await fetchWithAuth('/surface/state');
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          await this.syncWithProjection(json.data);
        }
      }
    } catch (err) {
      console.warn('[ActiveExecutionNotificationManager] State refresh failed:', err);
    }
  }

  /**
   * Connects to /api/surface/events using React Native compatible transport.
   */
  private async connectSseStream(): Promise<void> {
    if (this.eventTransport) {
      this.eventTransport.disconnect();
    }

    const { InteractionEventTransport } = await import('./InteractionEventTransport');
    this.eventTransport = new InteractionEventTransport();
    this.eventTransport
      .onProjection(async (projection: any) => {
        await this.syncWithProjection(projection);
      })
      .onStatus((status: string) => {
        console.log('[ActiveExecutionNotificationManager] Transport status:', status);
      });

    this.eventTransport.connect();
  }

  /**
   * Synchronizes mobile notification surface with authoritative projection.
   * Enforces the Silence Invariant: when dormant, cancel notification!
   */
  public async syncWithProjection(projection: any): Promise<void> {
    // 1. Sync Native Android Widget
    try {
      const { WidgetSyncBridge } = await import('./WidgetSyncBridge');
      await WidgetSyncBridge.getInstance().syncProjectionToWidget(projection);
    } catch (e) {
      console.warn('[ActiveExecutionNotificationManager] Widget sync error:', e);
    }

    if (!notifee || Platform.OS !== 'android' || isExpoGo) return;

    const active = projection?.activeExecution;

    // Condition 1: SILENCE Invariant (Nothing active or pending)
    if (!active || projection?.interactionMode === 'SILENT') {
      await this.cancelNotification();
      return;
    }

    const entityId = active.occurrenceId || active.taskId || 'active_entity';
    const seed = active.idempotencySeed || entityId;
    const version = projection.projectionVersion || 1;

    // Condition 2: PROPOSAL_PENDING ("Ready to start?")
    if (active.status === 'PROPOSAL_PENDING') {
      await notifee.displayNotification({
        id: ACTIVE_NOTIF_ID,
        title: 'Ready to start?',
        body: `${active.title} (${active.plannedDurationMinutes}m)`,
        android: {
          channelId: CHANNEL_PROPOSAL,
          color: EXECUTION_RED,
          visibility: AndroidVisibility ? AndroidVisibility.PRIVATE : undefined,
          pressAction: { id: 'default' },
          actions: [
            {
              title: 'Start',
              pressAction: { id: ACTION_START },
            },
            {
              title: 'Later (+15m)',
              pressAction: { id: ACTION_LATER },
            },
          ],
        },
        data: {
          entityId,
          idempotencySeed: seed,
          observedProjectionVersion: version,
          plannedDurationMinutes: active.plannedDurationMinutes,
        },
      });
      return;
    }

    // Condition 3: ACTIVE ("Just tell me when you're done.")
    if (active.status === 'ACTIVE') {
      const startedAt = active.startedAtMs || Date.now();

      await notifee.displayNotification({
        id: ACTIVE_NOTIF_ID,
        title: active.title,
        body: "Just tell me when you're done.",
        android: {
          channelId: CHANNEL_ACTIVE,
          color: EXECUTION_RED,
          ongoing: true,
          showChronometer: true,
          timestamp: startedAt,
          visibility: AndroidVisibility ? AndroidVisibility.PRIVATE : undefined,
          pressAction: { id: 'default' },
          actions: [
            {
              title: 'Done',
              pressAction: { id: ACTION_DONE },
            },
            {
              title: 'Pause',
              pressAction: { id: ACTION_PAUSE },
            },
            {
              title: '+15m',
              pressAction: { id: ACTION_EXTEND },
            },
          ],
        },
        data: {
          entityId,
          idempotencySeed: seed,
          observedProjectionVersion: version,
        },
      });
      return;
    }

    // Default fallback: silence
    await this.cancelNotification();
  }

  /**
   * Dismisses the active notification and returns the device to silence.
   */
  public async cancelNotification(): Promise<void> {
    try {
      const { WidgetSyncBridge } = await import('./WidgetSyncBridge');
      await WidgetSyncBridge.getInstance().syncProjectionToWidget({ interactionMode: 'SILENT' });
    } catch {}

    if (!notifee || Platform.OS !== 'android') return;
    try {
      await notifee.cancelNotification(ACTIVE_NOTIF_ID);
    } catch {
      // Ignore
    }
  }

  /**
   * Clean shutdown of SSE transport.
   */
  public stop(): void {
    if (this.eventTransport) {
      this.eventTransport.disconnect();
      this.eventTransport = null;
    }
    this.isStarted = false;
  }
}
