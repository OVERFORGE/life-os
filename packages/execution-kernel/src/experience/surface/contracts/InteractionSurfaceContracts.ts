/**
 * LifeOS Ambient Interaction Layer — Canonical Surface State & Action Contracts
 * Version 2.1.1 (Implementation Blueprint)
 * 
 * Strict Invariants:
 * 1. Read-Only Projection: Clients receive projections; they do NOT compute domain logic or mutate state.
 * 2. Logical Idempotency Law: Logical action identity is decoupled from observed projection version.
 *    idempotencyKey = SHA-256(userId + actionType + entityId + (occurrenceId || idempotencySeed))
 * 3. Zero TypeScript Escape Hatches: No `any`, no `Record<string, any>`, no lazy types.
 * 4. Membrane Model: Surfaces are projections and action ingress points, not a second brain.
 */

import { createHash } from "crypto";

// ============================================================================
// 1. Projection Enums & Discriminators
// ============================================================================

export type SurfaceExecutionStatus = "DORMANT" | "PROPOSAL_PENDING" | "ACTIVE" | "PAUSED";
export type CommitmentCategory = "DEEP_WORK" | "MEETING" | "HABIT" | "ROUTINE" | "GENERAL";
export type AmbientInteractionMode = "SILENT" | "GLANCE" | "ATTENTION" | "ACTIVE_EXECUTION" | "CONVERSATION" | "PROACTIVE";

// Strongly-typed discriminated intervention action proposal
export type InterventionActionProposal =
  | {
      actionType: "start_execution";
      label: string;
      entityId: string;
      parameters: { plannedDurationMinutes?: number };
    }
  | {
      actionType: "defer_execution";
      label: string;
      entityId: string;
      parameters: { deferMinutes: number; reason?: string };
    }
  | {
      actionType: "accept_intervention";
      label: string;
      entityId: string;
      parameters: { targetSlotStartMs?: number; resolutionAction?: string };
    }
  | {
      actionType: "dismiss_intervention";
      label: string;
      entityId: string;
      parameters: { dismissalReason?: "busy" | "not_relevant" | "already_handled" };
    };

// ============================================================================
// 2. Canonical Surface Projection Contract
// ============================================================================

export interface IActiveExecutionProjection {
  status: SurfaceExecutionStatus;
  taskId?: string;
  occurrenceId?: string;
  chronicleId?: string;
  title: string;
  category: CommitmentCategory;
  startedAtMs?: number;
  plannedDurationMinutes: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  canExtend: boolean;
  canPause: boolean;
  canComplete: boolean;
  undoToken?: string;                      // Populated ONLY if capability supports reversibility
  idempotencySeed: string;                 // Base identity seed for logical action construction
}

export interface IUpcomingCommitmentProjection {
  commitmentId: string;
  title: string;
  category: CommitmentCategory;
  startsAtMs: number;
  minutesUntilStart: number;
  isHardSchedule: boolean;
  locationOrUrl?: string;
}

export interface IPendingInterventionProjection {
  interventionId: string;
  type: "PROPOSAL_START" | "RECOVERY_NUDGE" | "SCHEDULE_CONFLICT";
  headline: string;
  explanation: string;
  primaryAction: InterventionActionProposal;
  secondaryAction?: InterventionActionProposal;
}

export interface IConversationContextProjection {
  activeConversationId: string;
  latestBriefingSnippet?: string;
}

export interface IInteractionSurfaceProjection {
  schemaVersion: 2;
  projectionVersion: number;                 // Monotonic integer counter
  generatedAtMs: number;                     // Server epoch timestamp
  userId: string;
  interactionMode: AmbientInteractionMode;

  // 1. Current Active Execution (Drives Class B Active Surfaces)
  activeExecution: IActiveExecutionProjection | null;

  // 2. Next Upcoming Commitment (Drives Class A Glance Surfaces)
  upcomingCommitment: IUpcomingCommitmentProjection | null;

  // 3. Pending Proactive Intervention (Gated by InterruptionCostEvaluator)
  pendingIntervention: IPendingInterventionProjection | null;

  // 4. Conversational Reference
  conversationContext: IConversationContextProjection;
}

// ============================================================================
// 3. Surface Ingress Action Payloads & Envelopes
// ============================================================================

export interface SurfaceStartExecutionPayload {
  startedAtMs: number;
  plannedDurationMinutes?: number;
}

export interface SurfaceCompleteTaskPayload {
  completedAtMs: number;
  completionNote?: string;
}

export interface SurfaceDeferExecutionPayload {
  deferMinutes: number;
  reason?: string;
}

export interface SurfacePauseExecutionPayload {
  pausedAtMs: number;
}

export interface SurfaceResumeExecutionPayload {
  resumedAtMs: number;
}

export interface SurfaceCancelExecutionPayload {
  cancelledAtMs: number;
  reason?: string;
}

export interface SurfaceCompensateLastActionPayload {
  undoToken: string;
  compensatedAtMs: number;
}

// Discriminated Payload Map
export interface SurfaceActionPayloadMap {
  start_execution: SurfaceStartExecutionPayload;
  complete_task: SurfaceCompleteTaskPayload;
  defer_execution: SurfaceDeferExecutionPayload;
  pause_execution: SurfacePauseExecutionPayload;
  resume_execution: SurfaceResumeExecutionPayload;
  cancel_execution: SurfaceCancelExecutionPayload;
  compensate_last_action: SurfaceCompensateLastActionPayload;
}

export type SurfaceActionType = keyof SurfaceActionPayloadMap;

export type SurfaceSourceType =
  | "ANDROID_NOTIFICATION"
  | "ANDROID_WIDGET"
  | "ANDROID_QUICK_SETTINGS"
  | "IOS_LIVE_ACTIVITY"
  | "IOS_WIDGET"
  | "DESKTOP_TRAY"
  | "DESKTOP_HUD"
  | "WEB_STICKY_BAR"
  | "WAKE_WORD_AVEN";

export interface ISurfaceActionEnvelope<T extends SurfaceActionType = SurfaceActionType> {
  sourceSurface: SurfaceSourceType;
  actionType: T;
  entityId: string;
  timestampMs: number;
  idempotencyKey: string;                    // Pure logical action identity (NO stateVersion hash)
  observedProjectionVersion: number;         // Optimistic concurrency context
  payload: SurfaceActionPayloadMap[T];
  clientSessionToken: string;
}

// ============================================================================
// 4. Kernel Execution Outcomes
// ============================================================================

export type KernelExecutionOutcome =
  | "EXECUTE_COMMITTED"
  | "EXECUTE_WITH_UNDO"
  | "CONFIRMATION_REQUIRED"
  | "COMPENSATED"
  | "RECONCILIATION_REQUIRED"
  | "UNKNOWN_EXTERNAL_STATE"
  | "REJECTED_STALE"
  | "REJECTED_IDEMPOTENT_DUPLICATE";

export interface IKernelExecutionResult {
  outcome: KernelExecutionOutcome;
  actionId: string;
  idempotencyKey: string;
  committedAtMs?: number;
  undoToken?: string;                        // Provided ONLY for EXECUTE_WITH_UNDO
  errorMessage?: string;
  reprojection?: IInteractionSurfaceProjection;
}

// ============================================================================
// 5. Canonical Logical Idempotency Generator
// ============================================================================

/**
 * Computes the pure logical idempotency key for surface action attempts.
 * 
 * LAW: Logical action identity must NOT include `observedProjectionVersion`.
 * If two devices (phone at version 4, desktop at version 5) both tap [Done]
 * on the same task, this function yields the identical hash, preventing double-commit.
 */
export function computeSurfaceActionIdempotencyKey(
  userId: string,
  actionType: SurfaceActionType,
  entityId: string,
  occurrenceOrSeed: string
): string {
  const rawIdentifier = `${userId}:${actionType}:${entityId}:${occurrenceOrSeed}`;
  return createHash("sha256").update(rawIdentifier).digest("hex");
}
