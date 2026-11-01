/**
 * AutonomousExecutionDaemon.ts
 * 
 * Milestone B — Phase B4: Work Package 2 / Loop 3
 * Leased Autonomous Execution Daemon
 */

import { AutonomousLeaseManager } from "./AutonomousLeaseManager";
import { FencingToken, isFencingTokenActive } from "./FencingToken";

export interface AutonomousDaemonConfig {
  workerId: string;
  pollIntervalMs?: number; // default: 15000ms
  leaseDurationMs?: number; // default: 30000ms
  maxUsersPerTick?: number; // default: 5
  shutdownTimeoutMs?: number; // default: 5000ms
}

export interface UserLifecycleContext {
  userId: string;
  userTimezone: string | null;
  timezoneValid: boolean;
  userLocalDate: string; // YYYY-MM-DD
  userLocalHour: number;
}

export interface UserTickResult {
  userId: string;
  executed: boolean;
  token?: FencingToken;
  categoryAExecuted: boolean;
  categoryBExecuted: boolean;
  categoryBDeferred: boolean;
  reason?: string;
  elapsedMs?: number;
}

/**
 * Validates whether a given timezone string conforms to an official IANA identifier.
 */
export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== "string" || tz.trim() === "") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Derives user-local lifecycle context.
 * Invariant 5.3: Zero silent UTC fallback when timezone is invalid or missing.
 */
export function getUserLifecycleContext(
  userId: string,
  userTimezone: string | null | undefined,
  now: Date = new Date()
): UserLifecycleContext {
  if (!isValidTimezone(userTimezone)) {
    return {
      userId,
      userTimezone: null,
      timezoneValid: false,
      userLocalDate: "",
      userLocalHour: -1,
    };
  }

  const cleanTz = userTimezone!.trim();
  const formatterDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: cleanTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const userLocalDate = formatterDate.format(now);

  const formatterHour = new Intl.DateTimeFormat("en-US", {
    timeZone: cleanTz,
    hour: "numeric",
    hour12: false,
  });
  const hourPart = formatterHour.format(now);
  const userLocalHour = parseInt(hourPart, 10) % 24;

  return {
    userId,
    userTimezone: cleanTz,
    timezoneValid: true,
    userLocalDate,
    userLocalHour,
  };
}

export interface AutonomousExecutionDaemonOptions {
  userId: string;
  workerId: string;
  leaseManager: AutonomousLeaseManager;
  leaseTtlMs?: number;
  heartbeatIntervalMs?: number;
  pollIntervalMs?: number;
  onCycle?: (token: FencingToken) => Promise<any>;
}

export class AutonomousExecutionDaemon {
  private userId: string;
  private workerId: string;
  private leaseManager: AutonomousLeaseManager;
  private leaseTtlMs: number;
  private heartbeatIntervalMs: number;
  private pollIntervalMs: number;
  private onCycle?: (token: FencingToken) => Promise<any>;

  private currentToken: FencingToken | null = null;
  private isDaemonRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(options: AutonomousExecutionDaemonOptions) {
    this.userId = options.userId;
    this.workerId = options.workerId;
    this.leaseManager = options.leaseManager;
    this.leaseTtlMs = options.leaseTtlMs || 30000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 10000;
    this.pollIntervalMs = options.pollIntervalMs || 5000;
    this.onCycle = options.onCycle;
  }

  public getActiveToken(): FencingToken | null {
    if (!this.currentToken) return null;
    if (!isFencingTokenActive(this.currentToken)) {
      this.currentToken = null;
      return null;
    }
    return this.currentToken;
  }

  public isRunning(): boolean {
    return this.isDaemonRunning;
  }

  /**
   * Run a single discrete tick of the autonomous daemon.
   * Useful for deterministic testing and cron triggers.
   */
  public async step(): Promise<{ executed: boolean; token?: FencingToken; reason?: string }> {
    // 1. If we hold an active lease, attempt renewal
    if (this.currentToken && isFencingTokenActive(this.currentToken)) {
      const renewed = await this.leaseManager.renewLease(
        this.userId,
        this.workerId,
        this.currentToken.epoch,
        this.leaseTtlMs
      );
      if (renewed) {
        this.currentToken = renewed;
      } else {
        this.currentToken = null;
      }
    }

    // 2. If no active lease, attempt acquisition
    if (!this.currentToken) {
      const acquired = await this.leaseManager.acquireLease(
        this.userId,
        this.workerId,
        this.leaseTtlMs
      );
      if (acquired) {
        this.currentToken = acquired;
      } else {
        return { executed: false, reason: "LEASE_HELD_BY_ANOTHER_WORKER" };
      }
    }

    // 3. Lease is held; verify it is still active before executing cycle
    const token = this.currentToken;
    if (!token || !isFencingTokenActive(token)) {
      return { executed: false, reason: "LEASE_EXPIRED" };
    }

    if (this.onCycle) {
      try {
        await this.onCycle(token);
        return { executed: true, token };
      } catch (err: any) {
        return { executed: false, token, reason: `CYCLE_ERROR: ${err.message}` };
      }
    }

    return { executed: true, token };
  }

  /**
   * Start long-running daemon loop with background polling and heartbeat.
   */
  public async start(): Promise<void> {
    if (this.isDaemonRunning) return;
    this.isDaemonRunning = true;

    // Run first step immediately
    await this.step();

    // Setup heartbeat timer
    this.heartbeatTimer = setInterval(async () => {
      if (!this.isDaemonRunning) return;
      if (this.currentToken && isFencingTokenActive(this.currentToken)) {
        const renewed = await this.leaseManager.renewLease(
          this.userId,
          this.workerId,
          this.currentToken.epoch,
          this.leaseTtlMs
        );
        if (renewed) {
          this.currentToken = renewed;
        } else {
          this.currentToken = null;
        }
      }
    }, this.heartbeatIntervalMs);

    // Setup cycle poll timer
    this.pollTimer = setInterval(async () => {
      if (!this.isDaemonRunning) return;
      await this.step();
    }, this.pollIntervalMs);
  }

  /**
   * Gracefully stop the daemon and release held lease.
   */
  public async stop(): Promise<void> {
    this.isDaemonRunning = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.currentToken) {
      try {
        await this.leaseManager.releaseLease(
          this.userId,
          this.workerId,
          this.currentToken.epoch
        );
      } finally {
        this.currentToken = null;
      }
    }
  }

  /**
   * Executes a leased lifecycle tick for a user with Two-Tier Timezone Safety.
   * - Category A (Timezone-Agnostic): Always executed under UTC.
   * - Category B (Timezone-Sensitive): Requires valid user timezone; otherwise DEFERRED.
   */
  public async tickUser(
    user: { userId: string; timezone?: string | null },
    handlers?: {
      categoryA?: (token: FencingToken) => Promise<any>;
      categoryB?: (context: UserLifecycleContext, token: FencingToken) => Promise<any>;
    }
  ): Promise<UserTickResult> {
    const startTime = Date.now();
    const partitionKey = `${user.userId}:autonomous:daemon`;
    const token = await this.leaseManager.acquireLease(partitionKey, this.workerId, this.leaseTtlMs);

    if (!token) {
      return {
        userId: user.userId,
        executed: false,
        categoryAExecuted: false,
        categoryBExecuted: false,
        categoryBDeferred: false,
        reason: "LEASE_HELD_BY_ANOTHER_WORKER",
        elapsedMs: Date.now() - startTime,
      };
    }

    try {
      let categoryAExecuted = false;
      let categoryBExecuted = false;
      let categoryBDeferred = false;

      // 1. Run Category A (Timezone-Agnostic: DWCP sweeps, schedule sweeps)
      if (handlers?.categoryA) {
        await handlers.categoryA(token);
        categoryAExecuted = true;
      }

      // 2. Evaluate User Lifecycle Context for Category B
      const context = getUserLifecycleContext(user.userId, user.timezone);

      if (!context.timezoneValid) {
        // Invariant 5.3: MUST BE DEFERRED/SUPPRESSED with operational audit warning
        categoryBDeferred = true;
      } else {
        if (handlers?.categoryB) {
          await handlers.categoryB(context, token);
          categoryBExecuted = true;
        }
      }

      return {
        userId: user.userId,
        executed: true,
        token,
        categoryAExecuted,
        categoryBExecuted,
        categoryBDeferred,
        reason: categoryBDeferred ? "TIMEZONE_RESOLUTION_REQUIRED" : undefined,
        elapsedMs: Date.now() - startTime,
      };
    } finally {
      await this.leaseManager.releaseLease(partitionKey, this.workerId, token.epoch);
    }
  }

  /**
   * Fair round-robin batch executor across active users.
   */
  public static async executeTickForUsers(
    users: Array<{ userId: string; timezone?: string | null }>,
    workerId: string,
    leaseManager: AutonomousLeaseManager,
    options?: {
      maxUsersPerTick?: number;
      leaseDurationMs?: number;
      handlers?: {
        categoryA?: (token: FencingToken) => Promise<any>;
        categoryB?: (context: UserLifecycleContext, token: FencingToken) => Promise<any>;
      };
    }
  ): Promise<UserTickResult[]> {
    const limit = options?.maxUsersPerTick || 5;
    const batch = users.slice(0, limit);
    const results: UserTickResult[] = [];

    const daemon = new AutonomousExecutionDaemon({
      userId: "batch-runner",
      workerId,
      leaseManager,
      leaseTtlMs: options?.leaseDurationMs || 30000,
    });

    for (const user of batch) {
      const result = await daemon.tickUser(user, options?.handlers);
      results.push(result);
    }

    return results;
  }
}

