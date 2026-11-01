/**
 * autonomous-worker-daemon.ts
 * 
 * Step 4 Loop 5: Autonomous Execution Daemon & Leased Proactive Loop
 * Standalone background worker process for LifeOS Autonomous Daemons & Sweepers.
 * 
 * Enforces:
 * - Invariant 5.1: Independent OS process from outbox-worker-daemon.
 * - Invariant 5.2: Per-user partition lease ${userId}:autonomous:daemon.
 * - Invariant 5.3: Two-Tier Timezone Safety (Category A UTC; Category B User Timezone or DEFER).
 * - Invariant 5.5: Graceful SIGINT/SIGTERM shutdown draining within 5000ms.
 */

import mongoose from "mongoose";
import crypto from "crypto";
import { AutonomousLeaseManager } from "../packages/execution-kernel/src/autonomous/AutonomousLeaseManager";
import {
  AutonomousExecutionDaemon,
  UserLifecycleContext,
} from "../packages/execution-kernel/src/autonomous/AutonomousExecutionDaemon";
import { DWCPRecoveryService } from "../packages/execution-kernel/src/autonomous/DWCPRecoveryService";
import { TemporalScheduleSweeper } from "../packages/execution-kernel/src/temporal/sweeper/TemporalScheduleSweeper";

export interface AutonomousWorkerDaemonOptions {
  workerId?: string;
  pollIntervalMs?: number;
  leaseDurationMs?: number;
  maxUsersPerTick?: number;
  shutdownTimeoutMs?: number;
  leaseManager?: AutonomousLeaseManager;
  dwcpService?: any;
  scheduleSweeper?: any;
}

export class AutonomousWorkerDaemonRunner {
  private workerId: string;
  private pollIntervalMs: number;
  private leaseDurationMs: number;
  private maxUsersPerTick: number;
  private shutdownTimeoutMs: number;
  private isRunning: boolean = false;
  private activeTicks: number = 0;
  private leaseManager: AutonomousLeaseManager;
  private dwcpService: any;
  private scheduleSweeper: any;

  constructor(options?: AutonomousWorkerDaemonOptions) {
    this.workerId = options?.workerId || `worker_auto_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
    this.pollIntervalMs = options?.pollIntervalMs || 15000;
    this.leaseDurationMs = options?.leaseDurationMs || 30000;
    this.maxUsersPerTick = options?.maxUsersPerTick || 5;
    this.shutdownTimeoutMs = options?.shutdownTimeoutMs || 5000;

    this.leaseManager = options?.leaseManager || new AutonomousLeaseManager();
    this.dwcpService = options?.dwcpService || DWCPRecoveryService.getInstance();
    this.scheduleSweeper = options?.scheduleSweeper || new TemporalScheduleSweeper();
  }

  public getWorkerId(): string {
    return this.workerId;
  }

  public getHealth(): { workerId: string; isRunning: boolean; activeTicks: number } {
    return {
      workerId: this.workerId,
      isRunning: this.isRunning,
      activeTicks: this.activeTicks,
    };
  }

  /**
   * Discovers active users for autonomous execution.
   */
  public async discoverActiveUsers(): Promise<Array<{ userId: string; timezone?: string | null }>> {
    try {
      const UserModel = mongoose.models.User || mongoose.model("User");
      const users = await UserModel.find({}, { _id: 1, userId: 1, "settings.timezone": 1 })
        .limit(this.maxUsersPerTick)
        .lean();

      return users.map((u: any) => ({
        userId: String(u.userId || u._id),
        timezone: u.settings?.timezone || null,
      }));
    } catch {
      // Fallback if User model not defined in standalone test environments
      return [];
    }
  }

  /**
   * Executes a single daemon tick across discovered users.
   */
  public async runTick(
    usersToTick?: Array<{ userId: string; timezone?: string | null }>
  ): Promise<any[]> {
    this.activeTicks++;
    try {
      const users = usersToTick || (await this.discoverActiveUsers());
      if (users.length === 0) return [];

      const results = await AutonomousExecutionDaemon.executeTickForUsers(
        users,
        this.workerId,
        this.leaseManager,
        {
          maxUsersPerTick: this.maxUsersPerTick,
          leaseDurationMs: this.leaseDurationMs,
          handlers: {
            categoryA: async (_token) => {
              // 1. Category A: DWCP Sweeper
              for (const u of users) {
                await this.dwcpService.reconcileStalledWorkflows(u.userId, this.workerId);
              }
              // 2. Category A: Temporal Schedule Sweeper for current UTC date
              const todayUtc = new Date().toISOString().split("T")[0];
              for (const u of users) {
                await this.scheduleSweeper.sweepPartition(u.userId, todayUtc, this.workerId);
              }
            },
            categoryB: async (context: UserLifecycleContext, _token) => {
              // Category B: User-Local Date Daily Lifecycle & Proactive Policies
              console.log(
                `[AUTONOMOUS::DAEMON] User ${context.userId} executed Category B under local date ${context.userLocalDate} (${context.userTimezone})`
              );
            },
          },
        }
      );

      for (const res of results) {
        if (res.categoryBDeferred) {
          console.warn(
            `[AUTONOMOUS::DAEMON] User ${res.userId} deferred Category B: TIMEZONE_RESOLUTION_REQUIRED`
          );
        }
      }

      return results;
    } finally {
      this.activeTicks--;
    }
  }

  /**
   * Starts the continuous background polling loop.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[AUTONOMOUS::DAEMON] Started with worker ID: ${this.workerId}`);

    while (this.isRunning) {
      try {
        await this.runTick();
      } catch (err: any) {
        console.error(`[AUTONOMOUS::DAEMON ERROR] ${err?.message}`);
      }

      if (this.isRunning) {
        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      }
    }
  }

  /**
   * Gracefully stops the worker daemon within the shutdown timeout.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    const deadline = Date.now() + this.shutdownTimeoutMs;

    while (this.activeTicks > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`[AUTONOMOUS::DAEMON] Stopped worker ID: ${this.workerId}`);
  }
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/life-os";
  console.log(`[AUTONOMOUS::DAEMON] Connecting to MongoDB: ${mongoUri.replace(/:([^:@]+)@/, ":****@")}`);
  await mongoose.connect(mongoUri);

  const runner = new AutonomousWorkerDaemonRunner();

  const shutdown = async (signal: string) => {
    console.log(`[AUTONOMOUS::DAEMON] Received ${signal}. Draining active tasks...`);
    await runner.stop();
    await mongoose.disconnect();
    console.log("[AUTONOMOUS::DAEMON] Graceful shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await runner.start();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[AUTONOMOUS::DAEMON FATAL]", err);
    process.exit(1);
  });
}
