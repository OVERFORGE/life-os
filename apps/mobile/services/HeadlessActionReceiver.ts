/**
 * LifeOS Mobile Headless Action Receiver (Phase 4)
 * 
 * Intercepts background notification action button presses from Notifee.
 * Dispatches canonical ISurfaceActionEnvelope directly to POST /api/kernel/dispatch.
 * Never launches the UI; updates/dismisses the active notification directly in the background.
 */

import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithAuth } from '../utils/api';

let notifee: any = null;
let EventType: any = null;

try {
  const notifeeModule = require('@notifee/react-native');
  notifee = notifeeModule.default;
  EventType = notifeeModule.EventType;
} catch {
  // Silent fallback for Expo Go
}

export const ACTION_START = 'ACTION_START';
export const ACTION_DONE = 'ACTION_DONE';
export const ACTION_LATER = 'ACTION_LATER';
export const ACTION_PAUSE = 'ACTION_PAUSE';
export const ACTION_EXTEND = 'ACTION_EXTEND';

export async function computeMobileIdempotencyKey(
  userId: string,
  actionType: string,
  entityId: string,
  occurrenceOrSeed: string
): Promise<string> {
  const raw = `${userId}:${actionType}:${entityId}:${occurrenceOrSeed}`;
  try {
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  } catch {
    // Pure JS fallback if crypto module is not ready
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return `hash_fallback_${Math.abs(hash)}_${Date.now()}`;
  }
}

/**
 * Background notification event handler.
 * Registered with Notifee to process actions without waking the React Native UI.
 */
export async function handleHeadlessNotificationAction(event: any): Promise<void> {
  if (!EventType || event.type !== EventType.ACTION_PRESS) {
    return;
  }

  const { pressAction, notification } = event.detail;
  const actionId = pressAction?.id;
  if (!actionId) return;

  const data = notification?.data || {};
  const entityId = data.entityId;
  const seed = data.idempotencySeed || entityId || `seed_${Date.now()}`;
  const observedVersion = Number(data.observedProjectionVersion || 1);

  if (!entityId && actionId !== ACTION_DONE) {
    console.warn('[HeadlessActionReceiver] Missing entityId in notification data');
    return;
  }

  const token = await AsyncStorage.getItem('user_token');
  const userId = (await AsyncStorage.getItem('user_id')) || 'usr_mobile_active';

  let actionType: string;
  let payload: any;

  switch (actionId) {
    case ACTION_START:
      actionType = 'start_execution';
      payload = { startedAtMs: Date.now(), plannedDurationMinutes: Number(data.plannedDurationMinutes) || 30 };
      break;

    case ACTION_DONE:
      actionType = 'complete_task';
      payload = { completedAtMs: Date.now() };
      break;

    case ACTION_LATER:
      actionType = 'defer_execution';
      payload = { deferMinutes: 15, reason: 'Deferred 15m from notification' };
      break;

    case ACTION_PAUSE:
      actionType = 'pause_execution';
      payload = { pausedAtMs: Date.now() };
      break;

    case ACTION_EXTEND:
      actionType = 'defer_execution';
      payload = { deferMinutes: 15, reason: 'Extended 15m from active notification' };
      break;

    default:
      console.log('[HeadlessActionReceiver] Unhandled action id:', actionId);
      return;
  }

  const idempotencyKey = await computeMobileIdempotencyKey(userId, actionType, entityId || 'active_entity', seed);

  const envelope = {
    sourceSurface: 'ANDROID_NOTIFICATION',
    actionType,
    entityId: entityId || 'active_entity',
    timestampMs: Date.now(),
    idempotencyKey,
    observedProjectionVersion: observedVersion,
    payload,
    clientSessionToken: token || '',
  };

  try {
    console.log('[HeadlessActionReceiver] Dispatching action:', actionType, idempotencyKey);
    const res = await fetchWithAuth('/kernel/dispatch', {
      method: 'POST',
      body: JSON.stringify(envelope),
    });

    if (res.ok) {
      const responseData = await res.json();
      const executionResult = responseData?.data;

      // Update or dismiss notification based on authoritative reprojection
      const { ActiveExecutionNotificationManager } = await import('./ActiveExecutionNotificationManager');
      const manager = ActiveExecutionNotificationManager.getInstance();

      if (executionResult?.reprojection) {
        await manager.syncWithProjection(executionResult.reprojection);
      } else if (actionType === 'complete_task') {
        await manager.cancelNotification();
      }
    } else {
      console.warn('[HeadlessActionReceiver] Ingress returned non-ok:', res.status);
      await handleOfflineFallback(envelope, actionType);
    }
  } catch (err) {
    console.warn('[HeadlessActionReceiver] Network dispatch failed (offline):', err);
    await handleOfflineFallback(envelope, actionType);
  }
}

/**
 * Enqueues failed action into durable offline queue and updates notification
 * with truthful provisional state (never fakes authoritative completion).
 */
async function handleOfflineFallback(envelope: any, actionType: string): Promise<void> {
  try {
    const queueKey = '@lifeos_offline_action_queue';
    const existing = await AsyncStorage.getItem(queueKey);
    const queue: any[] = existing ? JSON.parse(existing) : [];
    queue.push({
      envelope,
      queuedAtMs: Date.now(),
      status: 'PENDING_OFFLINE',
    });
    await AsyncStorage.setItem(queueKey, JSON.stringify(queue));
    console.log('[HeadlessActionReceiver] Action queued offline:', actionType, envelope.idempotencyKey);

    // Update active notification to reflect truthful provisional state
    if (notifee) {
      const { ACTIVE_NOTIF_ID } = await import('./ActiveExecutionNotificationManager');
      await notifee.displayNotification({
        id: ACTIVE_NOTIF_ID,
        title: 'Syncing…',
        body: 'Waiting for connection to confirm execution…',
        android: {
          channelId: 'lifeos_active_execution',
          color: '#E8414A',
          ongoing: true,
          onlyAlertOnce: true,
        },
      });
    }
  } catch (queueErr) {
    console.error('[HeadlessActionReceiver] Failed to queue offline action:', queueErr);
  }
}

/**
 * Replays queued offline actions upon network reconnection.
 */
export async function flushOfflineActionQueue(): Promise<number> {
  const queueKey = '@lifeos_offline_action_queue';
  try {
    const existing = await AsyncStorage.getItem(queueKey);
    if (!existing) return 0;
    const queue: any[] = JSON.parse(existing);
    if (queue.length === 0) return 0;

    let committedCount = 0;
    const remaining: any[] = [];

    for (const item of queue) {
      try {
        const res = await fetchWithAuth('/kernel/dispatch', {
          method: 'POST',
          body: JSON.stringify(item.envelope),
        });
        if (res.ok) {
          committedCount++;
        } else {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    await AsyncStorage.setItem(queueKey, JSON.stringify(remaining));
    console.log(`[HeadlessActionReceiver] Flushed ${committedCount} offline actions, ${remaining.length} remaining`);
    return committedCount;
  } catch (err) {
    console.error('[HeadlessActionReceiver] Error flushing offline queue:', err);
    return 0;
  }
}
