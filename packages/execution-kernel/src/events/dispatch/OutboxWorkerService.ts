/**
 * OutboxWorkerService.ts
 * 
 * Production Outbox Worker Activation & Health Monitoring.
 * Milestone B — Step 2 V2.2 Canonical Worker Infrastructure.
 * 
 * Implements the Dual-Mode Worker Architecture:
 * - Mode 1: In-Band Automation Batch runner (for serverless/API execution)
 * - Mode 2: Standalone Worker Daemon (for continuous background processes)
 */

import { DurableOutboxDispatcher, DispatchCycleReport } from "./DurableOutboxDispatcher";
import { ConsumerRegistry } from "../consumers/ConsumerRegistry";
import { GoalIntelligenceConsumer } from "../consumers/GoalIntelligenceConsumer";
import { ExecutionGraphConsumer } from "../consumers/ExecutionGraphConsumer";
import { TemporalConflictConsumer } from "../consumers/TemporalConflictConsumer";
import { PhysicalReadinessConsumer } from "../consumers/PhysicalReadinessConsumer";
import { CadenceLearningConsumer } from "../consumers/CadenceLearningConsumer";
import { BehavioralIntelligenceConsumer } from "../consumers/BehavioralIntelligenceConsumer";
import { CognitiveHistoryConsumer } from "../consumers/CognitiveHistoryConsumer";
import { OutboxEventModel } from "../../../../../apps/web/server/db/models/OutboxEventModel";
import { UserDeliverySequencer } from "../delivery/UserDeliverySequencer";
import { IWireDeliveryFrame } from "../contracts/DeliveryContracts";

const DEFAULT_STAGE5_DELIVERY_CUTOFF_ISO = "2026-11-26T00:00:00.000Z";

export function getStage5DeliveryCutoff(): Date {
  const raw = process.env.LIFEOS_DELIVERY_CUTOFF_ISO;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(DEFAULT_STAGE5_DELIVERY_CUTOFF_ISO);
}

export interface OutboxDispatchBatchOptions {
  userId?: string;
  legacyCutoffAt?: Date;
  onEmitFrame?: (userId: string, frame: IWireDeliveryFrame) => Promise<void>;
}

async function sequenceDeliveredUsers(
  workerId: string,
  batchSize: number,
  options?: OutboxDispatchBatchOptions
): Promise<void> {
  const cutoff = options?.legacyCutoffAt ?? getStage5DeliveryCutoff();
  const userIds = new Set<string>();

  if (options?.userId) {
    userIds.add(options.userId);
  }

  try {
    const unsequenced = await OutboxEventModel.find({
      deliveryStatus: "DELIVERED",
      $or: [{ deliverySeq: null }, { deliverySeq: { $exists: false } }],
      occurredAt: { $gte: cutoff },
    })
      .select({ userId: 1 })
      .limit(batchSize)
      .lean();

    for (const doc of unsequenced as Array<{ userId?: string }>) {
      if (doc.userId) userIds.add(doc.userId);
    }
  } catch (err) {
    console.warn("[OutboxWorkerService] Failed to query unsequenced users:", err);
  }

  if (userIds.size === 0) return;

  const sequencer = new UserDeliverySequencer();
  for (const uid of userIds) {
    try {
      await sequencer.sequenceAndPublishUserBatch(uid, workerId, {
        maxBatchSize: batchSize,
        minOccurredAt: cutoff,
        onEmitFrame: options?.onEmitFrame
          ? async (frame) => {
            await options.onEmitFrame!(uid, frame);
          }
          : undefined,
      });
    } catch (err) {
      console.warn(`[OutboxWorkerService] Delivery sequencing failed for user ${uid}:`, err);
    }
  }
}

/**
 * Instantiates the Canonical Consumer Registry and registers all 7 canonical consumers.
 */
export function createCanonicalConsumerRegistry(): ConsumerRegistry {
  const registry = new ConsumerRegistry();
  registry.register(new GoalIntelligenceConsumer());
  registry.register(new ExecutionGraphConsumer());
  registry.register(new TemporalConflictConsumer());
  registry.register(new PhysicalReadinessConsumer());
  registry.register(new CadenceLearningConsumer());
  registry.register(new BehavioralIntelligenceConsumer());
  registry.register(new CognitiveHistoryConsumer());
  return registry;
}

/**
 * Mode 1: In-Band Automation Batch execution.
 * Executes a single bounded dispatch cycle for all ready events.
 */
export async function runOutboxDispatchBatch(
  batchSize: number = 20,
  options?: OutboxDispatchBatchOptions
): Promise<DispatchCycleReport> {
  const isConnected = (OutboxEventModel.db?.readyState ?? 0) === 1;
  if (!isConnected) {
    return {
      leasedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      fencedCount: 0,
      deadLetterCount: 0,
    };
  }

  const registry = createCanonicalConsumerRegistry();
  const dispatcher = new DurableOutboxDispatcher({
    batchSize,
    consumerHandler: registry.createDispatchHandler(),
  });
  const report = await dispatcher.executeCycle();
  await sequenceDeliveredUsers(dispatcher.getWorkerId(), batchSize, options);
  return report;
}

export interface WorkerHealthStatus {
  isHealthy: boolean;
  workerId: string;
  uptimeSeconds: number;
  totalLeased: number;
  totalSucceeded: number;
  totalFailed: number;
  totalDeadLettered: number;
  totalFenced: number;
  lastHeartbeat: Date;
}

export interface OutboxWorkerDaemonOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  dispatcher?: DurableOutboxDispatcher;
  registry?: ConsumerRegistry;
}

/**
 * Mode 2: Standalone Continuous Outbox Daemon.
 * Robust long-running daemon with graceful signal handling and health reporting.
 */
export class OutboxWorkerDaemon {
  private dispatcher: DurableOutboxDispatcher;
  private hasCustomDispatcher: boolean;
  private registry: ConsumerRegistry;
  private isRunning: boolean = false;
  private activeCyclePromise: Promise<void> | null = null;
  private startTime: number = 0;
  private batchSize: number;
  private metrics = {
    totalLeased: 0,
    totalSucceeded: 0,
    totalFailed: 0,
    totalDeadLettered: 0,
    totalFenced: 0,
  };
  private lastHeartbeat: Date = new Date();
  private pollIntervalMs: number;

  constructor(options?: OutboxWorkerDaemonOptions) {
    this.pollIntervalMs = options?.pollIntervalMs || 1000;
    this.batchSize = options?.batchSize || 20;
    this.hasCustomDispatcher = Boolean(options?.dispatcher);
    this.registry = options?.registry || createCanonicalConsumerRegistry();
    this.dispatcher =
      options?.dispatcher ||
      new DurableOutboxDispatcher({
        batchSize: this.batchSize,
        consumerHandler: this.registry.createDispatchHandler(),
      });
  }

  public async runOnce(): Promise<DispatchCycleReport> {
    const isConnected = (OutboxEventModel.db?.readyState ?? 0) === 1;
    if (!isConnected && !this.hasCustomDispatcher) {
      return {
        leasedCount: 0,
        succeededCount: 0,
        failedCount: 0,
        fencedCount: 0,
        deadLetterCount: 0,
      };
    }

    const report = await this.dispatcher.executeCycle();
    if (isConnected && report.succeededCount > 0) {
      await sequenceDeliveredUsers(this.dispatcher.getWorkerId(), this.batchSize);
    }

    this.metrics.totalLeased += report.leasedCount;
    this.metrics.totalSucceeded += report.succeededCount;
    this.metrics.totalFailed += report.failedCount;
    this.metrics.totalDeadLettered += report.deadLetterCount;
    this.metrics.totalFenced += report.fencedCount;
    this.lastHeartbeat = new Date();
    return report;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = Date.now();

    while (this.isRunning) {
      try {
        let report: DispatchCycleReport = {
          leasedCount: 0,
          succeededCount: 0,
          failedCount: 0,
          fencedCount: 0,
          deadLetterCount: 0,
        };
        const cycle = (async () => {
          report = await this.runOnce();
        })();
        this.activeCyclePromise = cycle;
        await cycle;
        this.activeCyclePromise = null;

        // If no events leased, idle sleep
        const delay = report.leasedCount === 0 ? this.pollIntervalMs : 50;
        await new Promise((r) => setTimeout(r, delay));
      } catch (err) {
        this.activeCyclePromise = null;
        console.error("[OUTBOX WORKER ERROR]", err);
        await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      }
    }
  }

  public stop(): void {
    this.isRunning = false;
  }

  public async stopAndDrain(timeoutMs: number = 5000): Promise<void> {
    this.isRunning = false;
    if (this.activeCyclePromise) {
      await Promise.race([
        this.activeCyclePromise.catch(() => { }),
        new Promise((r) => setTimeout(r, timeoutMs)),
      ]);
    }
  }

  public getHealth(): WorkerHealthStatus {
    const uptimeSeconds = this.startTime > 0 ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    return {
      isHealthy: this.isRunning,
      workerId: this.dispatcher.getWorkerId(),
      uptimeSeconds,
      ...this.metrics,
      lastHeartbeat: this.lastHeartbeat,
    };
  }
}
