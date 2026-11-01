/**
 * DualTierScheduler.ts
 * 
 * Milestone B — Phase B4: Work Package 3 / Loop 5
 * Two-Tier Autonomous Evaluation Scheduler with Adaptive Backoff
 * 
 * - Tier 1: Sub-5ms fast in-memory gate (dirty flags, quiet hours, cooldowns, elapsed backoff)
 * - Tier 2: Deep evaluation gate (World Model & Behavioral Profile exploration)
 * - Adaptive Backoff: 15m -> 30m -> 60m -> 120m on idle cycles, instant reset on high-priority events
 */

export interface DualTierSchedulerConfig {
  tier1BudgetMs?: number;
  minBackoffMinutes?: number;
  maxBackoffMinutes?: number;
  backoffMultiplier?: number;
}

export interface UserSchedulerState {
  userId: string;
  lastEvaluationAt: number;
  currentBackoffMinutes: number;
  isDirty: boolean;
  highPriorityPending: boolean;
}

export interface Tier1EvaluationContext {
  isQuietHours?: boolean;
  inMeeting?: boolean;
  inDeepWork?: boolean;
  lastActionAt?: number;
  now?: number;
}

export interface Tier1Result {
  shouldRunTier2: boolean;
  reason: string;
  nextEvaluationDelayMs: number;
  executionDurationMs: number;
}

export class DualTierScheduler {
  private config: Required<DualTierSchedulerConfig>;
  private userStates: Map<string, UserSchedulerState> = new Map();

  constructor(config?: DualTierSchedulerConfig) {
    this.config = {
      tier1BudgetMs: config?.tier1BudgetMs ?? 5,
      minBackoffMinutes: config?.minBackoffMinutes ?? 15,
      maxBackoffMinutes: config?.maxBackoffMinutes ?? 120,
      backoffMultiplier: config?.backoffMultiplier ?? 2.0,
    };
  }

  private getOrCreateState(userId: string): UserSchedulerState {
    let state = this.userStates.get(userId);
    if (!state) {
      state = {
        userId,
        lastEvaluationAt: 0,
        currentBackoffMinutes: this.config.minBackoffMinutes,
        isDirty: true,
        highPriorityPending: false,
      };
      this.userStates.set(userId, state);
    }
    return state;
  }

  /**
   * Signal an event arrival for a user.
   * If highPriority is true, immediately resets backoff to baseline (15 min).
   */
  public notifyEvent(userId: string, highPriority: boolean = false): void {
    const state = this.getOrCreateState(userId);
    state.isDirty = true;
    if (highPriority) {
      state.highPriorityPending = true;
      state.currentBackoffMinutes = this.config.minBackoffMinutes;
    }
  }

  /**
   * Tier 1 evaluation pass: must complete in <5ms budget.
   * In-memory analysis determining whether expensive Tier 2 deep evaluation is justified.
   */
  public evaluateTier1(userId: string, context?: Tier1EvaluationContext): Tier1Result {
    const startTime = performance.now();
    const now = context?.now ?? Date.now();
    const state = this.getOrCreateState(userId);

    const backoffMs = state.currentBackoffMinutes * 60 * 1000;
    const elapsedSinceLastEval = now - state.lastEvaluationAt;
    const isDueByTime = elapsedSinceLastEval >= backoffMs;

    // Check Quiet Hours suppression
    if (context?.isQuietHours && !state.highPriorityPending) {
      const duration = performance.now() - startTime;
      return {
        shouldRunTier2: false,
        reason: "QUIET_HOURS_ACTIVE_AND_NO_HIGH_PRIORITY_EVENT",
        nextEvaluationDelayMs: Math.max(60000, backoffMs - elapsedSinceLastEval),
        executionDurationMs: duration,
      };
    }

    // Check if evaluation should run
    const shouldRun = state.highPriorityPending || state.isDirty || isDueByTime;

    let reason = "EVALUATION_DUE";
    if (state.highPriorityPending) {
      reason = "HIGH_PRIORITY_EVENT_PENDING";
    } else if (state.isDirty) {
      reason = "DIRTY_STATE_NOTIFICATION";
    } else if (isDueByTime) {
      reason = `BACKOFF_INTERVAL_ELAPSED_${state.currentBackoffMinutes}M`;
    } else {
      reason = "IDLE_AWAITING_SCHEDULE";
    }

    const duration = performance.now() - startTime;

    return {
      shouldRunTier2: shouldRun,
      reason,
      nextEvaluationDelayMs: shouldRun ? 0 : Math.max(1000, backoffMs - elapsedSinceLastEval),
      executionDurationMs: duration,
    };
  }

  /**
   * Record the outcome of an autonomous evaluation cycle.
   * If actions were generated/executed, reset backoff to baseline.
   * If cycle was idle (0 actions), apply exponential backoff (15m -> 30m -> 60m -> 120m).
   */
  public recordCycleOutcome(userId: string, actionsGenerated: number, now: number = Date.now()): void {
    const state = this.getOrCreateState(userId);
    state.lastEvaluationAt = now;
    state.isDirty = false;
    state.highPriorityPending = false;

    if (actionsGenerated > 0) {
      // Activity detected; maintain tight baseline cadence
      state.currentBackoffMinutes = this.config.minBackoffMinutes;
    } else {
      // Idle cycle; exponentially back off to reduce overhead
      state.currentBackoffMinutes = Math.min(
        this.config.maxBackoffMinutes,
        Math.round(state.currentBackoffMinutes * this.config.backoffMultiplier)
      );
    }
  }

  public getCurrentBackoffMinutes(userId: string): number {
    return this.getOrCreateState(userId).currentBackoffMinutes;
  }

  public getNextEvaluationTime(userId: string): number {
    const state = this.getOrCreateState(userId);
    return state.lastEvaluationAt + state.currentBackoffMinutes * 60 * 1000;
  }

  public resetUser(userId: string): void {
    this.userStates.delete(userId);
  }
}

