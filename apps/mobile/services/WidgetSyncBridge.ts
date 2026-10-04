/**
 * LifeOS Mobile Widget Sync Bridge (Phase 5)
 * 
 * Bridges the canonical IInteractionSurfaceProjection into the native
 * Android Glance Widget and Quick Settings surfaces.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';

export interface WidgetSyncData {
  title: string;
  subtitle: string;
  mode: string;
  meta: string;
  updatedAtMs: number;
}

export class WidgetSyncBridge {
  private static instance: WidgetSyncBridge;

  private constructor() {}

  public static getInstance(): WidgetSyncBridge {
    if (!WidgetSyncBridge.instance) {
      WidgetSyncBridge.instance = new WidgetSyncBridge();
    }
    return WidgetSyncBridge.instance;
  }

  /**
   * Translates canonical surface projection into widget presentation model.
   */
  public extractWidgetData(projection: any): WidgetSyncData {
    const active = projection?.activeExecution;
    const upcoming = projection?.upcomingCommitment;

    if (active && active.status === 'ACTIVE') {
      return {
        title: active.title,
        subtitle: "Just tell me when you're done.",
        mode: 'ACTIVE',
        meta: `Active • ${active.plannedDurationMinutes}m planned`,
        updatedAtMs: Date.now(),
      };
    }

    if (active && active.status === 'PROPOSAL_PENDING') {
      return {
        title: active.title,
        subtitle: 'Ready to start?',
        mode: 'PROPOSAL',
        meta: `Due now • ${active.plannedDurationMinutes}m`,
        updatedAtMs: Date.now(),
      };
    }

    if (upcoming) {
      const mins = upcoming.minutesUntilStart;
      return {
        title: upcoming.title,
        subtitle: mins <= 0 ? 'Starts now' : `Starts in ${mins}m`,
        mode: mins <= 30 ? 'GLANCE' : 'SILENT',
        meta: upcoming.category,
        updatedAtMs: Date.now(),
      };
    }

    // Silence Invariant: Calm empty state
    return {
      title: 'All commitments clear',
      subtitle: 'Silence is a successful state',
      mode: 'SILENT',
      meta: 'Up to date',
      updatedAtMs: Date.now(),
    };
  }

  /**
   * Persists widget data to native Android SharedPreferences and broadcasts update.
   */
  public async syncProjectionToWidget(projection: any): Promise<void> {
    const data = this.extractWidgetData(projection);

    try {
      // 1. Android Native Bridge
      if (Platform.OS === 'android' && NativeModules.LifeOsWidgetBridge) {
        await NativeModules.LifeOsWidgetBridge.updateWidgetState(
          data.title,
          data.subtitle,
          data.mode,
          0
        );
      }

      // 2. React Native local storage backup
      await AsyncStorage.setItem('widget_title', data.title);
      await AsyncStorage.setItem('widget_subtitle', data.subtitle);
      await AsyncStorage.setItem('widget_mode', data.mode);
      await AsyncStorage.setItem('widget_meta', data.meta);
      await AsyncStorage.setItem('widget_updated_at', String(data.updatedAtMs));

      console.log('[WidgetSyncBridge] Widget state synchronized to Android native preferences:', data.mode, data.title);
    } catch (e) {
      console.warn('[WidgetSyncBridge] Failed to sync widget state:', e);
    }
  }
}
