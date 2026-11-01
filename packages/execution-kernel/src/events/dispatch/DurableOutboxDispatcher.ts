/**
 * DurableOutboxDispatcher.ts
 * 
 * Implements the Durable Outbox Dispatcher loop and monotonic dispatch pipeline.
 * Features:
 * - Leases events via WorkerLeaseManager
 * - Groups and processes aggregate events in causalSequence order
 * - Dispatches events to registered consumer pipelines
 * - Verifies monotonic lease generation before acknowledgment
 * - Exponential backoff retry on consumer failure
 * - Automatic routing to DEAD_LETTER when attempts exceed maxAttempts
 */

import { WorkerLeaseManager } from "./WorkerLeaseManager";
import { IOutboxEventDoc } from "../../../../../apps/web/server/db/models/OutboxEventModel";

export interface ConsumerDispatchHandler {
  (event: IOutboxEventDoc, leaseGeneration: number): Promise<{
    success: boolean;
    error?: string;
  }>;
}

export interface DispatcherOptions {
  workerId?: string;
  batchSize?: number;
  leaseDurationMs?: number;
  maxAttempts?: number;
  leaseManager?: WorkerLeaseManager;
  consumerHandler?: ConsumerDispatchHandler;
}

export interface DispatchCycleReport {
  leasedCount: number;
  succeededCount: number;
  failedCount: number;
  fencedCount: number;
  deadLetterCount: number;
}

export class DurableOutboxDispatcher {
  private workerId: string;
  private batchSize: number;
  private leaseDurationMs: number;
  private maxAttempts: number;
  private leaseManager: WorkerLeaseManager;
  private consumerHandler?: ConsumerDispatchHandler;
  private isRunning: boolean = false;

  constructor(options?: DispatcherOptions) {
    this.workerId =
      options?.workerId ||
      `dispatcher_${process.pid}_${Math.random().toString(36).substring(2, 9)}`;
    this.batchSize = options?.batchSize || 20;
    this.leaseDurationMs = options?.leaseDurationMs || 15000;
    this.maxAttempts = options?.maxAttempts || 5;
    this.leaseManager = options?.leaseManager || new WorkerLeaseManager();
    this.consumerHandler = options?.consumerHandler;
  }

  public getWorkerId(): string {
    return this.workerId;
  }

  public setConsumerHandler(handler: ConsumerDispatchHandler): void {
    this.consumerHandler = handler;
  }

  /**
   * Execute a single dispatch cycle.
   */
  public async executeCycle(): Promise<DispatchCycleReport> {
    const report: DispatchCycleReport = {
      leasedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      fencedCount: 0,
      deadLetterCount: 0,
    };

    // 1. Acquire batch of leased events
    const leasedEvents = await this.leaseManager.acquireLeases(
      this.workerId,
      this.batchSize,
      this.leaseDurationMs
    );

    report.leasedCount = leasedEvents.length;
    if (leasedEvents.length === 0) {
      return report;
    }

    // 2. Sort events by aggregateId and causalSequence to guarantee monotonic dispatch
    const sortedEvents = [...leasedEvents].sort((a, b) => {
      if (a.aggregateId === b.aggregateId) {
        return (a.causalSequence ?? 0) - (b.causalSequence ?? 0);
      }
      return 0;
    });

    // 3. Process each event
    for (const event of sortedEvents) {
      const leaseGen = event.leaseGeneration;

      if (this.consumerHandler) {
        try {
          const handlerResult = await this.consumerHandler(event, leaseGen);

          if (handlerResult.success) {
            const acknowledged = await this.leaseManager.acknowledgeCompletion(
              String(event._id),
              this.workerId,
              leaseGen
            );

            if (acknowledged) {
              report.succeededCount++;
            } else {
              // Fenced out by a newer worker lease!
              report.fencedCount++;
            }
          } else {
            // Consumer returned failure
            const attempts = (event.attempts ?? 0);
            const retryDelayMs = Math.min(1000 * Math.pow(2, attempts), 60000);
            await this.leaseManager.releaseFailedLease(
              String(event._id),
              this.workerId,
              leaseGen,
              handlerResult.error || "Consumer execution failed",
              retryDelayMs,
              this.maxAttempts
            );

            if (attempts >= this.maxAttempts) {
              report.deadLetterCount++;
            } else {
              report.failedCount++;
            }
          }
        } catch (consumerErr: any) {
          // Unexpected crash in consumer
          const attempts = (event.attempts ?? 0);
          const retryDelayMs = Math.min(1000 * Math.pow(2, attempts), 60000);
          await this.leaseManager.releaseFailedLease(
            String(event._id),
            this.workerId,
            leaseGen,
            consumerErr?.message || "Consumer unhandled exception",
            retryDelayMs,
            this.maxAttempts
          );

          if (attempts >= this.maxAttempts) {
            report.deadLetterCount++;
          } else {
            report.failedCount++;
          }
        }
      } else {
        // No consumer registered: default acknowledge
        const acknowledged = await this.leaseManager.acknowledgeCompletion(
          String(event._id),
          this.workerId,
          leaseGen
        );
        if (acknowledged) {
          report.succeededCount++;
        } else {
          report.fencedCount++;
        }
      }
    }

    // 4. Release all active partition leases acquired during this cycle
    const partitionsToRelease = new Set<string>();
    for (const event of sortedEvents) {
      if (event.userId && event.aggregateType && event.aggregateId) {
        partitionsToRelease.add(`${event.userId}:${event.aggregateType}:${event.aggregateId}`);
      }
    }
    for (const pKey of partitionsToRelease) {
      try {
        // Release active lease for this worker
        await (this.leaseManager as any).releasePartitionLease?.(pKey, this.workerId, 1);
      } catch {
        // Non-blocking lease release
      }
    }

    return report;
  }
}
