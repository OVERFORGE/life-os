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
  batchSize: number = 20
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
  return await dispatcher.executeCycle();
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
  private registry: ConsumerRegistry;
  private isRunning: boolean = false;
  private startTime: number = 0;
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
    this.registry = options?.registry || createCanonicalConsumerRegistry();
    this.dispatcher =
      options?.dispatcher ||
      new DurableOutboxDispatcher({
        batchSize: options?.batchSize || 20,
        consumerHandler: this.registry.createDispatchHandler(),
      });
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = Date.now();

    while (this.isRunning) {
      try {
        const isConnected = (OutboxEventModel.db?.readyState ?? 0) === 1;
        // If un-connected and using default dispatcher, skip to avoid buffer timeout
        let report: DispatchCycleReport;
        if (!isConnected && !this.dispatcher) {
          report = {
            leasedCount: 0,
            succeededCount: 0,
            failedCount: 0,
            fencedCount: 0,
            deadLetterCount: 0,
          };
        } else {
          report = await this.dispatcher.executeCycle();
        }

        this.metrics.totalLeased += report.leasedCount;
        this.metrics.totalSucceeded += report.succeededCount;
        this.metrics.totalFailed += report.failedCount;
        this.metrics.totalDeadLettered += report.deadLetterCount;
        this.metrics.totalFenced += report.fencedCount;
        this.lastHeartbeat = new Date();

        // If no events leased, idle sleep
        const delay = report.leasedCount === 0 ? this.pollIntervalMs : 50;
        await new Promise((r) => setTimeout(r, delay));
      } catch (err) {
        console.error("[OUTBOX WORKER ERROR]", err);
        await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      }
    }
  }

  public stop(): void {
    this.isRunning = false;
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
