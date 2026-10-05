/**
 * LifeOS Ambient Interaction Layer — Typed Widget Presentation DTO
 * Version 2.2.2-PRODUCTION-HARDENED
 * 
 * Invariants:
 * 1. Decoupled from Raw Hex Colors: Semantic visual intent ('CALM' | 'UPCOMING' | 'ACTIVE' | 'PROPOSAL')
 *    is emitted; RemoteViews membrane handles palette mapping.
 * 2. Deterministic Client Formatting: Raw UTC epoch milliseconds are transmitted;
 *    zero server-side locale-dependent string formatting.
 * 3. Zero Client-Side Intelligence: All modes and allowed actions are pre-resolved by the kernel.
 */

import { IInteractionSurfaceProjection } from "./InteractionSurfaceContracts";

export type WidgetDisplayState = 'CLEAR' | 'UPCOMING' | 'ACTIVE' | 'PROPOSAL';
export type WidgetVisualIntent = 'CALM' | 'UPCOMING' | 'ACTIVE' | 'PROPOSAL';

export interface IWidgetPresentationDTO {
  schemaVersion: 1;
  projectionVersion: number;              // Monotonic server counter
  generatedAtMs: number;                  // Server epoch timestamp (UTC)
  displayState: WidgetDisplayState;       // Pre-resolved presentation state
  visualIntent: WidgetVisualIntent;       // Semantic intent for palette mapping
  
  // Header Presentation
  headerLabel: string;                    // "LIFEOS"
  badgeText: string;                      // "CLEAR", "IN 12M", "PROPOSAL", or empty for Chronometer
  
  // Primary Content
  primaryTitle: string;                   // Clean headline ("You're clear.", task title, etc.)
  secondaryText: string;                  // Context subline
  
  // Time Metadata for Deterministic Client Formatting (Raw UTC Epoch)
  temporalContext: {
    nextCommitmentStartMs?: number;       // Raw start timestamp (formatted locally by device)
    nextCommitmentTitle?: string;         // Clean next title (e.g. "Gym", "Architecture Review")
    minutesUntilStart?: number;           // Pre-calculated relative offset
  } | null;

  // Active Execution Telemetry (Null if not ACTIVE)
  activeContext: {
    entityId: string;                     // taskId or occurrenceId
    startedAtMs: number;                  // Raw epoch start for Chronometer base calculation
    plannedDurationMinutes: number;       // Target duration
    elapsedSeconds: number;               // Elapsed at generation time
    idempotencySeed: string;              // Unique seed for action hash
  } | null;

  // Upcoming Commitment Telemetry (Null if not UPCOMING)
  upcomingContext: {
    entityId: string;                     // occurrenceId
    startsAtMs: number;                   // Scheduled epoch start
    categoryLabel: string;                // "Deep Work", "Routine", etc.
    idempotencySeed: string;              // Unique seed for action hash
  } | null;

  // Action Control Allowlist (Enables/disables buttons in layout)
  allowedActions: {
    canStart: boolean;                    // Shows [Start] button (Obsidian/Amber-accented)
    canComplete: boolean;                 // Shows [Done] button (Crimson affirm)
    canPause: boolean;                    // Shows [Pause] button (Neutral)
    canExtend: boolean;                   // Shows [+15m] button (Neutral)
  };
}

/**
 * Pure projection mapper that transforms an authoritative IInteractionSurfaceProjection
 * into the strict, typed IWidgetPresentationDTO required by the native Android widget membrane.
 */
export function mapProjectionToWidgetDTO(p: IInteractionSurfaceProjection): IWidgetPresentationDTO {
  // 1. ACTIVE EXECUTION
  if (p.activeExecution && p.activeExecution.status === 'ACTIVE') {
    return {
      schemaVersion: 1,
      projectionVersion: p.projectionVersion,
      generatedAtMs: p.generatedAtMs,
      displayState: 'ACTIVE',
      visualIntent: 'ACTIVE',
      headerLabel: 'LIFEOS',
      badgeText: '', // Controlled natively by Chronometer
      primaryTitle: p.activeExecution.title,
      secondaryText: `Target: ${p.activeExecution.plannedDurationMinutes}m • Tap when done`,
      temporalContext: null,
      activeContext: {
        entityId: p.activeExecution.occurrenceId || p.activeExecution.taskId || 'active_entity',
        startedAtMs: p.activeExecution.startedAtMs || p.generatedAtMs,
        plannedDurationMinutes: p.activeExecution.plannedDurationMinutes,
        elapsedSeconds: p.activeExecution.elapsedSeconds,
        idempotencySeed: p.activeExecution.idempotencySeed,
      },
      upcomingContext: null,
      allowedActions: {
        canStart: false,
        canComplete: p.activeExecution.canComplete,
        canPause: p.activeExecution.canPause,
        canExtend: p.activeExecution.canExtend,
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
      projectionVersion: p.projectionVersion,
      generatedAtMs: p.generatedAtMs,
      displayState: 'PROPOSAL',
      visualIntent: 'PROPOSAL',
      headerLabel: 'LIFEOS',
      badgeText: 'PROPOSAL',
      primaryTitle: title,
      secondaryText: 'Ready to start?',
      temporalContext: null,
      activeContext: {
        entityId,
        startedAtMs: p.activeExecution?.startedAtMs || p.generatedAtMs,
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

  // 3. UPCOMING COMMITMENT (When Server places mode in GLANCE or commitment is upcoming)
  if ((p.interactionMode === 'GLANCE' || (!p.activeExecution && !p.pendingIntervention)) && p.upcomingCommitment) {
    const mins = p.upcomingCommitment.minutesUntilStart;
    return {
      schemaVersion: 1,
      projectionVersion: p.projectionVersion,
      generatedAtMs: p.generatedAtMs,
      displayState: 'UPCOMING',
      visualIntent: 'UPCOMING',
      headerLabel: 'LIFEOS',
      badgeText: mins <= 0 ? 'STARTING NOW' : `IN ${mins}M`,
      primaryTitle: p.upcomingCommitment.title,
      secondaryText: `${p.upcomingCommitment.category} • Scheduled focus block`,
      temporalContext: {
        nextCommitmentStartMs: p.upcomingCommitment.startsAtMs,
        nextCommitmentTitle: p.upcomingCommitment.title,
        minutesUntilStart: mins,
      },
      activeContext: null,
      upcomingContext: {
        entityId: p.upcomingCommitment.commitmentId,
        startsAtMs: p.upcomingCommitment.startsAtMs,
        categoryLabel: p.upcomingCommitment.category,
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

  // 4. CLEAR (The Restrained Ambient Experience)
  return {
    schemaVersion: 1,
    projectionVersion: p.projectionVersion,
    generatedAtMs: p.generatedAtMs,
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
