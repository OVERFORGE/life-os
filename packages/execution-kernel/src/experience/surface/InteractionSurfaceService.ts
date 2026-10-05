/**
 * LifeOS Ambient Interaction Layer — Surface Projection Engine
 * Version 2.1.1 (Implementation Blueprint)
 * 
 * Responsibilities:
 * 1. Derives authoritative, lightweight `IInteractionSurfaceProjection` for any user.
 * 2. Strictly enforces the <= 250 token budget constraint (~1000 bytes JSON).
 * 3. Enforces monotonic projection versioning per user.
 * 4. Resolves ambient interaction modes: SILENT, GLANCE, ATTENTION, ACTIVE_EXECUTION, CONVERSATION, PROACTIVE.
 * 5. Provides an event pub-sub mechanism for cross-device broadcast.
 * 
 * Invariants:
 * - Read-only derived view. No direct mutation of authoritative database models.
 * - Zero TypeScript escape hatches (`any`, `Record<string, any>`).
 */

import {
  IInteractionSurfaceProjection,
  IActiveExecutionProjection,
  IUpcomingCommitmentProjection,
  IPendingInterventionProjection,
  IConversationContextProjection,
  AmbientInteractionMode,
  CommitmentCategory,
  SurfaceExecutionStatus,
} from "./contracts/InteractionSurfaceContracts";
import {
  TemporalOccurrence,
  ExecutionChronicleEntry,
} from "../../temporal/contracts/TemporalContracts";
import {
  IWidgetPresentationDTO,
  mapProjectionToWidgetDTO,
} from "./contracts/WidgetPresentationDTO";

export interface SurfaceProjectionOptions {
  referenceTimeMs?: number;
  occurrences?: TemporalOccurrence[];
  chronicles?: ExecutionChronicleEntry[];
  pendingIntervention?: IPendingInterventionProjection | null;
  activeConversationId?: string;
  latestBriefingSnippet?: string;
}

export type SurfaceProjectionSubscriber = (projection: IInteractionSurfaceProjection) => void;

export class InteractionSurfaceService {
  private static instance: InteractionSurfaceService;
  private userVersions: Map<string, number> = new Map();
  private subscribers: Map<string, Set<SurfaceProjectionSubscriber>> = new Map();

  private constructor() {}

  public static getInstance(): InteractionSurfaceService {
    if (!InteractionSurfaceService.instance) {
      InteractionSurfaceService.instance = new InteractionSurfaceService();
    }
    return InteractionSurfaceService.instance;
  }

  /**
   * Clears in-memory caches and versions (useful for tests).
   */
  public reset(): void {
    this.userVersions.clear();
    this.subscribers.clear();
  }

  /**
   * Subscribes a listener to projection updates for a given user.
   * Returns an unsubscribe function.
   */
  public subscribe(userId: string, callback: SurfaceProjectionSubscriber): () => void {
    if (!this.subscribers.has(userId)) {
      this.subscribers.set(userId, new Set());
    }
    const set = this.subscribers.get(userId)!;
    set.add(callback);
    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this.subscribers.delete(userId);
      }
    };
  }

  /**
   * Broadcasts a projection to all registered subscribers.
   */
  private notifySubscribers(projection: IInteractionSurfaceProjection): void {
    const set = this.subscribers.get(projection.userId);
    if (set) {
      for (const subscriber of set) {
        try {
          subscriber(projection);
        } catch (err) {
          console.error(`[InteractionSurfaceService] Subscriber error for user ${projection.userId}:`, err);
        }
      }
    }
  }

  /**
   * Derives the next monotonic projection version for a user.
   */
  public getNextProjectionVersion(userId: string): number {
    const current = this.userVersions.get(userId) || 0;
    const next = current + 1;
    this.userVersions.set(userId, next);
    return next;
  }

  /**
   * Returns the current projection version for a user without incrementing.
   */
  public getCurrentProjectionVersion(userId: string): number {
    return this.userVersions.get(userId) || 1;
  }

  /**
   * Derives the complete canonical surface projection for a user.
   */
  public async computeSurfaceProjection(
    userId: string,
    options: SurfaceProjectionOptions = {}
  ): Promise<IInteractionSurfaceProjection> {
    const now = options.referenceTimeMs ?? Date.now();
    const version = this.getNextProjectionVersion(userId);

    const occurrences = options.occurrences ?? [];
    const chronicles = options.chronicles ?? [];

    // 1. Resolve Active Execution Projection
    const activeExecution = this.resolveActiveExecution(occurrences, chronicles, now);

    // 2. Resolve Next Upcoming Commitment Projection
    const upcomingCommitment = this.resolveUpcomingCommitment(occurrences, now);

    // 3. Resolve Pending Intervention
    const pendingIntervention = options.pendingIntervention ?? null;

    // 4. Resolve Conversation Reference
    const conversationContext: IConversationContextProjection = {
      activeConversationId: options.activeConversationId || `conv_${userId}_default`,
      latestBriefingSnippet: options.latestBriefingSnippet,
    };

    // 5. Determine Interaction Mode
    const interactionMode = this.resolveInteractionMode(
      activeExecution,
      pendingIntervention,
      upcomingCommitment
    );

    let projection: IInteractionSurfaceProjection = {
      schemaVersion: 2,
      projectionVersion: version,
      generatedAtMs: now,
      userId,
      interactionMode,
      activeExecution,
      upcomingCommitment,
      pendingIntervention,
      conversationContext,
    };

    // 6. Enforce Token Budget (<= 250 tokens ≈ 1000 characters)
    projection = this.enforceTokenBudget(projection);

    // Notify live subscribers
    this.notifySubscribers(projection);

    return projection;
  }

  /**
   * Derives the typed, presentation-ready IWidgetPresentationDTO for native widgets.
   */
  public async computeWidgetPresentationDTO(
    userId: string,
    options: SurfaceProjectionOptions = {}
  ): Promise<IWidgetPresentationDTO> {
    const projection = await this.computeSurfaceProjection(userId, options);
    return mapProjectionToWidgetDTO(projection);
  }

  /**
   * Resolves the current active execution or pending proposal.
   */
  private resolveActiveExecution(
    occurrences: TemporalOccurrence[],
    chronicles: ExecutionChronicleEntry[],
    nowMs: number
  ): IActiveExecutionProjection | null {
    // Check 1: Is there an in-progress occurrence?
    const inProgressOcc = occurrences.find(
      (occ) => occ.status === "IN_PROGRESS"
    );

    if (inProgressOcc) {
      const startMs = inProgressOcc.plannedInterval.startIsoUtc
        ? new Date(inProgressOcc.plannedInterval.startIsoUtc).getTime()
        : nowMs;
      const plannedMinutes = inProgressOcc.plannedInterval.durationMinutes || 30;
      const plannedEndMs = startMs + plannedMinutes * 60 * 1000;
      const elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      const remainingSeconds = Math.max(0, Math.floor((plannedEndMs - nowMs) / 1000));

      return {
        status: "ACTIVE",
        taskId: inProgressOcc.linkedEntity?.entityId,
        occurrenceId: inProgressOcc.occurrenceId,
        title: inProgressOcc.title,
        category: this.mapKindToCategory(inProgressOcc.kind),
        startedAtMs: startMs,
        plannedDurationMinutes: plannedMinutes,
        elapsedSeconds,
        remainingSeconds,
        canExtend: true,
        canPause: true,
        canComplete: true,
        undoToken: `undo_token_${inProgressOcc.occurrenceId}`,
        idempotencySeed: inProgressOcc.occurrenceId,
      };
    }

    // Check 2: Is there an active open chronicle entry (startedAt <= now, endedAt === 0)?
    const activeChronicle = chronicles.find(
      (chr) => chr.startedAtMs <= nowMs && (chr.endedAtMs === 0 || chr.endedAtMs > nowMs)
    );

    if (activeChronicle) {
      const plannedMinutes = activeChronicle.durationMinutes || 30;
      const elapsedSeconds = Math.max(0, Math.floor((nowMs - activeChronicle.startedAtMs) / 1000));
      const plannedEndMs = activeChronicle.startedAtMs + plannedMinutes * 60 * 1000;
      const remainingSeconds = Math.max(0, Math.floor((plannedEndMs - nowMs) / 1000));

      return {
        status: "ACTIVE",
        taskId: activeChronicle.entityId,
        occurrenceId: activeChronicle.occurrenceId,
        chronicleId: activeChronicle.chronicleId,
        title: activeChronicle.title,
        category: "DEEP_WORK",
        startedAtMs: activeChronicle.startedAtMs,
        plannedDurationMinutes: plannedMinutes,
        elapsedSeconds,
        remainingSeconds,
        canExtend: true,
        canPause: true,
        canComplete: true,
        undoToken: `undo_token_${activeChronicle.chronicleId}`,
        idempotencySeed: activeChronicle.chronicleId,
      };
    }

    // Check 3: Is there a scheduled occurrence due right now (or overdue by up to 60 minutes)?
    const scheduledDue = occurrences.find((occ) => {
      if (occ.status !== "SCHEDULED") return false;
      const startMs = occ.plannedInterval.startIsoUtc
        ? new Date(occ.plannedInterval.startIsoUtc).getTime()
        : 0;
      const diffMs = startMs - nowMs;
      // Due if at or past start time (or within 30s clock drift), and overdue by up to 60 minutes.
      // Future tasks (> 30s away) remain in upcomingCommitment (GLANCE mode) so notifications don't fire prematurely.
      return diffMs <= 30 * 1000 && diffMs >= -60 * 60 * 1000;
    });

    if (scheduledDue) {
      const plannedMinutes = scheduledDue.plannedInterval.durationMinutes || 30;
      return {
        status: "PROPOSAL_PENDING",
        taskId: scheduledDue.linkedEntity?.entityId,
        occurrenceId: scheduledDue.occurrenceId,
        title: scheduledDue.title,
        category: this.mapKindToCategory(scheduledDue.kind),
        plannedDurationMinutes: plannedMinutes,
        elapsedSeconds: 0,
        remainingSeconds: plannedMinutes * 60,
        canExtend: false,
        canPause: false,
        canComplete: false,
        idempotencySeed: scheduledDue.occurrenceId,
      };
    }

    return null;
  }

  /**
   * Resolves the next upcoming commitment after nowMs.
   */
  private resolveUpcomingCommitment(
    occurrences: TemporalOccurrence[],
    nowMs: number
  ): IUpcomingCommitmentProjection | null {
    const futureOccurrences = occurrences
      .filter((occ) => {
        if (occ.status !== "SCHEDULED") return false;
        const startMs = occ.plannedInterval.startIsoUtc
          ? new Date(occ.plannedInterval.startIsoUtc).getTime()
          : 0;
        return startMs > nowMs;
      })
      .sort((a, b) => {
        const timeA = new Date(a.plannedInterval.startIsoUtc).getTime();
        const timeB = new Date(b.plannedInterval.startIsoUtc).getTime();
        return timeA - timeB;
      });

    const next = futureOccurrences[0];
    if (!next) return null;

    const startsAtMs = new Date(next.plannedInterval.startIsoUtc).getTime();
    const minutesUntilStart = Math.max(0, Math.round((startsAtMs - nowMs) / (60 * 1000)));

    return {
      commitmentId: next.occurrenceId,
      title: next.title,
      category: this.mapKindToCategory(next.kind),
      startsAtMs,
      minutesUntilStart,
      isHardSchedule: next.rigidity === "UNMOVABLE" || next.kind === "HARD_EVENT",
      locationOrUrl: next.locationContext.label,
    };
  }

  /**
   * Maps temporal entity kinds to surface commitment categories.
   */
  private mapKindToCategory(kind: string): CommitmentCategory {
    switch (kind) {
      case "HARD_EVENT":
        return "MEETING";
      case "ROUTINE_BLOCK":
        return "ROUTINE";
      case "WORK_SESSION":
        return "DEEP_WORK";
      case "EPHEMERAL_PING":
        return "HABIT";
      default:
        return "GENERAL";
    }
  }

  /**
   * Resolves the primary ambient interaction mode.
   */
  private resolveInteractionMode(
    activeExecution: IActiveExecutionProjection | null,
    pendingIntervention: IPendingInterventionProjection | null,
    upcomingCommitment: IUpcomingCommitmentProjection | null
  ): AmbientInteractionMode {
    if (activeExecution && activeExecution.status === "ACTIVE") {
      return "ACTIVE_EXECUTION";
    }
    if (activeExecution && activeExecution.status === "PROPOSAL_PENDING") {
      return "ATTENTION";
    }
    if (pendingIntervention) {
      return pendingIntervention.type === "RECOVERY_NUDGE" ? "PROACTIVE" : "ATTENTION";
    }
    if (upcomingCommitment && upcomingCommitment.minutesUntilStart <= 30) {
      return "GLANCE";
    }
    return "SILENT";
  }

  /**
   * Enforces the <= 250 token budget by truncating non-critical descriptive strings
   * if the serialized JSON representation exceeds the target budget.
   */
  private enforceTokenBudget(
    projection: IInteractionSurfaceProjection
  ): IInteractionSurfaceProjection {
    const rawJson = JSON.stringify(projection);
    const estimatedTokens = Math.ceil(rawJson.length / 4);

    if (estimatedTokens <= 250) {
      return projection;
    }

    // Clone and prune long explanations/snippets
    const pruned = { ...projection };
    if (pruned.conversationContext?.latestBriefingSnippet) {
      pruned.conversationContext = {
        ...pruned.conversationContext,
        latestBriefingSnippet: pruned.conversationContext.latestBriefingSnippet.slice(0, 60),
      };
    }

    if (pruned.pendingIntervention?.explanation) {
      pruned.pendingIntervention = {
        ...pruned.pendingIntervention,
        explanation: pruned.pendingIntervention.explanation.slice(0, 60),
      };
    }

    if (pruned.activeExecution && pruned.activeExecution.title.length > 50) {
      pruned.activeExecution = {
        ...pruned.activeExecution,
        title: pruned.activeExecution.title.slice(0, 47) + "...",
      };
    }

    return pruned;
  }
}
