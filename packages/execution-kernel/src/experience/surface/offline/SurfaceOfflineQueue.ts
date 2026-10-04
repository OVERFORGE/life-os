/**
 * LifeOS Ambient Interaction Layer — Surface Offline Queue & Truthful Reconciler (Phase 8)
 * 
 * Strict Invariants:
 * 1. Truthful Offline State: Never tells user "Done" until authoritative kernel confirmation.
 * 2. Deterministic FIFO Replay: Replayed in original creation order upon reconnection.
 * 3. Idempotent Safe Replay: Exact original idempotencyKey preserved across retries.
 * 4. Conflict Handling: When server flags RECONCILIATION_REQUIRED, notifies client honestly.
 */

import {
  ISurfaceActionEnvelope,
  IKernelExecutionResult,
  KernelExecutionOutcome,
} from "../contracts/InteractionSurfaceContracts";

export interface ISurfaceStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class InMemorySurfaceStorageAdapter implements ISurfaceStorageAdapter {
  private store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

export type QueueItemStatus =
  | "PENDING_OFFLINE"
  | "IN_FLIGHT"
  | "COMMITTED"
  | "CONFLICT_NEEDS_ATTENTION"
  | "FAILED";

export interface QueuedSurfaceAction {
  queueId: string;
  envelope: ISurfaceActionEnvelope;
  queuedAtMs: number;
  attempts: number;
  status: QueueItemStatus;
  lastAttemptAtMs?: number;
  errorMessage?: string;
}

export type DispatchHandler = (envelope: ISurfaceActionEnvelope) => Promise<IKernelExecutionResult>;

export class SurfaceOfflineQueue {
  private storage: ISurfaceStorageAdapter;
  private storageKey: string;
  private queue: QueuedSurfaceAction[] = [];
  private isFlushing = false;
  private dispatchHandler: DispatchHandler | null = null;

  constructor(
    storage: ISurfaceStorageAdapter = new InMemorySurfaceStorageAdapter(),
    storageKey: string = "lifeos_surface_offline_queue"
  ) {
    this.storage = storage;
    this.storageKey = storageKey;
  }

  public setDispatchHandler(handler: DispatchHandler): void {
    this.dispatchHandler = handler;
  }

  /**
   * Hydrates durable queue from storage on app boot.
   */
  public async initialize(): Promise<void> {
    const raw = await this.storage.getItem(this.storageKey);
    if (raw) {
      try {
        this.queue = JSON.parse(raw);
        // Reset in-flight items back to PENDING_OFFLINE after crash or reboot
        for (const item of this.queue) {
          if (item.status === "IN_FLIGHT") {
            item.status = "PENDING_OFFLINE";
          }
        }
      } catch {
        this.queue = [];
      }
    }
  }

  /**
   * Persists queue to durable storage.
   */
  private async persist(): Promise<void> {
    await this.storage.setItem(this.storageKey, JSON.stringify(this.queue));
  }

  /**
   * Enqueues a surface action for durable offline persistence.
   */
  public async enqueue(envelope: ISurfaceActionEnvelope): Promise<QueuedSurfaceAction> {
    const item: QueuedSurfaceAction = {
      queueId: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      envelope,
      queuedAtMs: Date.now(),
      attempts: 0,
      status: "PENDING_OFFLINE",
    };

    this.queue.push(item);
    await this.persist();
    return item;
  }

  public getPendingCount(): number {
    return this.queue.filter(
      (item) => item.status === "PENDING_OFFLINE" || item.status === "IN_FLIGHT"
    ).length;
  }

  public getItems(): QueuedSurfaceAction[] {
    return [...this.queue];
  }

  /**
   * Flushes pending actions in FIFO order over network to dispatch handler.
   */
  public async flush(): Promise<{
    committed: number;
    conflicted: number;
    failed: number;
  }> {
    if (this.isFlushing || !this.dispatchHandler) {
      return { committed: 0, conflicted: 0, failed: 0 };
    }

    this.isFlushing = true;
    let committed = 0;
    let conflicted = 0;
    let failed = 0;

    try {
      const pendingItems = this.queue.filter(
        (item) => item.status === "PENDING_OFFLINE"
      );

      for (const item of pendingItems) {
        item.status = "IN_FLIGHT";
        item.attempts += 1;
        item.lastAttemptAtMs = Date.now();
        await this.persist();

        try {
          const result = await this.dispatchHandler(item.envelope);

          if (
            result.outcome === "EXECUTE_COMMITTED" ||
            result.outcome === "EXECUTE_WITH_UNDO" ||
            result.outcome === "REJECTED_IDEMPOTENT_DUPLICATE"
          ) {
            item.status = "COMMITTED";
            committed++;
          } else if (
            result.outcome === "RECONCILIATION_REQUIRED" ||
            result.outcome === "CONFIRMATION_REQUIRED" ||
            result.outcome === "UNKNOWN_EXTERNAL_STATE"
          ) {
            item.status = "CONFLICT_NEEDS_ATTENTION";
            item.errorMessage = result.errorMessage || "State conflict requires attention";
            conflicted++;
          } else {
            item.status = "FAILED";
            item.errorMessage = result.errorMessage || "Execution rejected";
            failed++;
          }
        } catch (err: any) {
          // Network dropped mid-flush: leave as PENDING_OFFLINE for next reconnection
          item.status = "PENDING_OFFLINE";
          item.errorMessage = err.message;
          failed++;
          break; // Stop flushing until network recovers
        }

        await this.persist();
      }

      // Prune successfully committed items from queue
      this.queue = this.queue.filter((item) => item.status !== "COMMITTED");
      await this.persist();

      return { committed, conflicted, failed };
    } finally {
      this.isFlushing = false;
    }
  }

  public async clear(): Promise<void> {
    this.queue = [];
    await this.persist();
  }
}
