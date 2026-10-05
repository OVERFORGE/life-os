/**
 * LifeOS Mobile Widget Sync Bridge (Phase 2 & Phase 5)
 * Version 2.2.2-PRODUCTION-HARDENED
 * 
 * Bridges canonical server projections into native Android Glance Widget
 * via typed IWidgetPresentationDTO, and synchronizes session credentials
 * to the hardware-backed Android Keystore vault.
 */

import { Platform, NativeModules } from 'react-native';
import { fetchWithAuth } from '../utils/api';

export type WidgetDisplayState = 'CLEAR' | 'UPCOMING' | 'ACTIVE' | 'PROPOSAL';
export type WidgetVisualIntent = 'CALM' | 'UPCOMING' | 'ACTIVE' | 'PROPOSAL';

export interface IWidgetPresentationDTO {
  schemaVersion: 1;
  projectionVersion: number;
  generatedAtMs: number;
  displayState: WidgetDisplayState;
  visualIntent: WidgetVisualIntent;
  headerLabel: string;
  badgeText: string;
  primaryTitle: string;
  secondaryText: string;
  temporalContext: {
    nextCommitmentStartMs?: number;
    nextCommitmentTitle?: string;
    minutesUntilStart?: number;
  } | null;
  activeContext: {
    entityId: string;
    startedAtMs: number;
    plannedDurationMinutes: number;
    elapsedSeconds: number;
    idempotencySeed: string;
  } | null;
  upcomingContext: {
    entityId: string;
    startsAtMs: number;
    categoryLabel: string;
    idempotencySeed: string;
  } | null;
  allowedActions: {
    canStart: boolean;
    canComplete: boolean;
    canPause: boolean;
    canExtend: boolean;
  };
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
   * Synchronizes an authoritative server projection to the native Android widget.
   * If the input is already a typed IWidgetPresentationDTO, it forwards it directly.
   * If it is a raw IInteractionSurfaceProjection, it translates it deterministically.
   */
  public async syncProjectionToWidget(projectionOrDto: any): Promise<void> {
    if (!projectionOrDto) return;

    let dto: IWidgetPresentationDTO;

    if (projectionOrDto.schemaVersion === 1 && projectionOrDto.displayState) {
      dto = projectionOrDto as IWidgetPresentationDTO;
    } else {
      dto = this.mapProjectionToDTO(projectionOrDto);
    }

    try {
      if (Platform.OS === 'android' && NativeModules.LifeOsWidgetBridge?.updateWidgetPresentation) {
        await NativeModules.LifeOsWidgetBridge.updateWidgetPresentation(JSON.stringify(dto));
        console.log('[WidgetSyncBridge] Widget state synchronized to Android native preferences:', dto.displayState, dto.primaryTitle);
      }
    } catch (e) {
      console.warn('[WidgetSyncBridge] Failed to sync widget presentation:', e);
    }
  }

  /**
   * Fetches latest surface projection from backend passing local timezone,
   * then immediately synchronizes the native Android widget.
   */
  public async syncSurfaceStateWithBackend(): Promise<void> {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
      const res = await fetchWithAuth('/surface/state', {
        headers: {
          'x-timezone': tz,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          await this.syncProjectionToWidget(json.data);
          console.log('[WidgetSyncBridge] Successfully refreshed and synced widget with backend projection');
        }
      } else {
        console.warn('[WidgetSyncBridge] /surface/state returned status:', res.status);
      }
    } catch (e) {
      console.warn('[WidgetSyncBridge] Failed to sync surface state with backend:', e);
    }
  }

  /**
   * Synchronizes user authentication credentials to the Android Keystore vault.
   */
  public async syncSessionTokenToVault(token: string, userId: string, expiresAtMs: number): Promise<boolean> {
    try {
      if (Platform.OS === 'android' && NativeModules.LifeOsWidgetBridge?.storeSecureSession) {
        return await NativeModules.LifeOsWidgetBridge.storeSecureSession(token, userId, expiresAtMs);
      }
      return false;
    } catch (e) {
      console.warn('[WidgetSyncBridge] Failed to store secure session in vault:', e);
      return false;
    }
  }

  /**
   * Clears the Android Keystore vault on user logout.
   */
  public async clearSessionVault(): Promise<boolean> {
    try {
      if (Platform.OS === 'android' && NativeModules.LifeOsWidgetBridge?.clearSecureSession) {
        return await NativeModules.LifeOsWidgetBridge.clearSecureSession();
      }
      return false;
    } catch (e) {
      console.warn('[WidgetSyncBridge] Failed to clear session vault:', e);
      return false;
    }
  }

  /**
   * Enqueues an action envelope into the single canonical offline store.
   */
  public async enqueueCanonicalOfflineAction(envelope: any): Promise<boolean> {
    try {
      if (Platform.OS === 'android' && NativeModules.LifeOsWidgetBridge?.enqueueCanonicalOfflineAction) {
        return await NativeModules.LifeOsWidgetBridge.enqueueCanonicalOfflineAction(JSON.stringify(envelope));
      }
      return false;
    } catch (e) {
      console.warn('[WidgetSyncBridge] Failed to enqueue canonical offline action:', e);
      return false;
    }
  }

  /**
   * Triggers immediate WorkManager queue replay when network connectivity returns.
   */
  public async scheduleQueueReplay(): Promise<boolean> {
    try {
      if (Platform.OS === 'android' && NativeModules.LifeOsWidgetBridge?.scheduleQueueReplay) {
        return await NativeModules.LifeOsWidgetBridge.scheduleQueueReplay();
      }
      return false;
    } catch (e) {
      console.warn('[WidgetSyncBridge] Failed to schedule queue replay:', e);
      return false;
    }
  }

  /**
   * Returns the count of pending offline actions in the canonical queue.
   */
  public async getCanonicalOfflineQueueCount(): Promise<number> {
    try {
      if (Platform.OS === 'android' && NativeModules.LifeOsWidgetBridge?.getCanonicalOfflineQueueCount) {
        return await NativeModules.LifeOsWidgetBridge.getCanonicalOfflineQueueCount();
      }
      return 0;
    } catch (e) {
      console.warn('[WidgetSyncBridge] Failed to get offline queue count:', e);
      return 0;
    }
  }

  /**
   * Smoothly dismisses the dedicated AvenActivity transparent surface.
   */
  public async dismissAvenSurface(): Promise<boolean> {
    try {
      if (Platform.OS === 'android' && NativeModules.LifeOsWidgetBridge?.dismissAvenSurface) {
        return await NativeModules.LifeOsWidgetBridge.dismissAvenSurface();
      }
      return false;
    } catch (e) {
      console.warn('[WidgetSyncBridge] Failed to dismiss Aven surface:', e);
      return false;
    }
  }

  /**
   * Retrieves the summon mode ("voice" | "text") for the ambient session.
   */
  public async getAvenSessionMode(): Promise<'voice' | 'text'> {
    try {
      if (Platform.OS === 'android' && NativeModules.LifeOsWidgetBridge?.getAvenSessionMode) {
        const mode = await NativeModules.LifeOsWidgetBridge.getAvenSessionMode();
        return mode === 'text' ? 'text' : 'voice';
      }
      return 'voice';
    } catch (e) {
      console.warn('[WidgetSyncBridge] Failed to get Aven session mode:', e);
      return 'voice';
    }
  }

  /**
   * Pure mapper matching kernel specification for hermetic mobile bundle execution.
   */
  private mapProjectionToDTO(p: any): IWidgetPresentationDTO {
    // 1. ACTIVE EXECUTION
    if (p.activeExecution && p.activeExecution.status === 'ACTIVE') {
      return {
        schemaVersion: 1,
        projectionVersion: p.projectionVersion || 1,
        generatedAtMs: p.generatedAtMs || Date.now(),
        displayState: 'ACTIVE',
        visualIntent: 'ACTIVE',
        headerLabel: 'LIFEOS',
        badgeText: '',
        primaryTitle: p.activeExecution.title || 'Active Execution',
        secondaryText: `Target: ${p.activeExecution.plannedDurationMinutes || 30}m • Tap when done`,
        temporalContext: null,
        activeContext: {
          entityId: p.activeExecution.occurrenceId || p.activeExecution.taskId || 'active_entity',
          startedAtMs: p.activeExecution.startedAtMs || p.generatedAtMs || Date.now(),
          plannedDurationMinutes: p.activeExecution.plannedDurationMinutes || 30,
          elapsedSeconds: p.activeExecution.elapsedSeconds || 0,
          idempotencySeed: p.activeExecution.idempotencySeed || p.activeExecution.occurrenceId || 'seed_active',
        },
        upcomingContext: null,
        allowedActions: {
          canStart: false,
          canComplete: p.activeExecution.canComplete ?? true,
          canPause: p.activeExecution.canPause ?? true,
          canExtend: p.activeExecution.canExtend ?? true,
        },
      };
    }

    // 2. PROPOSAL / INTERVENTION
    if (p.interactionMode === 'ATTENTION' || p.activeExecution?.status === 'PROPOSAL_PENDING' || p.pendingIntervention) {
      const title = p.pendingIntervention?.headline || p.activeExecution?.title || 'Proposed Execution';
      const entityId = p.activeExecution?.occurrenceId || p.activeExecution?.taskId || p.pendingIntervention?.interventionId || 'proposed_entity';
      const seed = p.activeExecution?.idempotencySeed || entityId;
      return {
        schemaVersion: 1,
        projectionVersion: p.projectionVersion || 1,
        generatedAtMs: p.generatedAtMs || Date.now(),
        displayState: 'PROPOSAL',
        visualIntent: 'PROPOSAL',
        headerLabel: 'LIFEOS',
        badgeText: 'PROPOSAL',
        primaryTitle: title,
        secondaryText: 'Ready to start?',
        temporalContext: null,
        activeContext: {
          entityId,
          startedAtMs: p.activeExecution?.startedAtMs || p.generatedAtMs || Date.now(),
          plannedDurationMinutes: p.activeExecution?.plannedDurationMinutes || 15,
          elapsedSeconds: 0,
          idempotencySeed: seed,
        },
        upcomingContext: null,
        allowedActions: {
          canStart: true,
          canComplete: false,
          canPause: false,
          canExtend: true,
        },
      };
    }

    // 3. UPCOMING COMMITMENT
    if ((p.interactionMode === 'GLANCE' || (!p.activeExecution && !p.pendingIntervention)) && p.upcomingCommitment) {
      const mins = p.upcomingCommitment.minutesUntilStart;
      return {
        schemaVersion: 1,
        projectionVersion: p.projectionVersion || 1,
        generatedAtMs: p.generatedAtMs || Date.now(),
        displayState: 'UPCOMING',
        visualIntent: 'UPCOMING',
        headerLabel: 'LIFEOS',
        badgeText: mins <= 0 ? 'STARTING NOW' : `IN ${mins}M`,
        primaryTitle: p.upcomingCommitment.title,
        secondaryText: `${p.upcomingCommitment.category || 'Focus'} • Scheduled focus block`,
        temporalContext: {
          nextCommitmentStartMs: p.upcomingCommitment.startsAtMs,
          nextCommitmentTitle: p.upcomingCommitment.title,
          minutesUntilStart: mins,
        },
        activeContext: null,
        upcomingContext: {
          entityId: p.upcomingCommitment.commitmentId,
          startsAtMs: p.upcomingCommitment.startsAtMs,
          categoryLabel: p.upcomingCommitment.category || 'Focus',
          idempotencySeed: p.upcomingCommitment.commitmentId,
        },
        allowedActions: {
          canStart: true,
          canComplete: false,
          canPause: false,
          canExtend: true,
        },
      };
    }

    // 4. CLEAR (Restrained Ambient Experience)
    return {
      schemaVersion: 1,
      projectionVersion: p.projectionVersion || 1,
      generatedAtMs: p.generatedAtMs || Date.now(),
      displayState: 'CLEAR',
      visualIntent: 'CALM',
      headerLabel: 'LIFEOS',
      badgeText: 'CLEAR',
      primaryTitle: "You're clear.",
      secondaryText: p.upcomingCommitment ? '' : 'Nothing scheduled today',
      temporalContext: p.upcomingCommitment ? {
        nextCommitmentStartMs: p.upcomingCommitment.startsAtMs,
        nextCommitmentTitle: p.upcomingCommitment.title,
        minutesUntilStart: p.upcomingCommitment.minutesUntilStart,
      } : null,
      activeContext: null,
      upcomingContext: null,
      allowedActions: {
        canStart: false,
        canComplete: false,
        canPause: false,
        canExtend: false,
      },
    };
  }
}
