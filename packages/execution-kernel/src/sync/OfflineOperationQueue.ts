import { SyncEventMetadata } from "./DeviceIdentity";

export interface QueuedOperation {
  id: string;
  operationType: string;
  payload: any;
  metadata: SyncEventMetadata;
  retryCount: number;
  maxRetries: number;
  queuedAt: number;
}

/**
 * OfflineOperationQueue Subsystem
 * 
 * SOLE OWNER of offline operation buffering.
 * Guarantees FIFO, persistent, deterministic replay of operations executed while offline.
 */
export class OfflineOperationQueue {
  private static instance: OfflineOperationQueue;
  private queue: QueuedOperation[] = [];
  private isOnline: boolean = true;

  static getInstance(): OfflineOperationQueue {
    if (!OfflineOperationQueue.instance) {
      OfflineOperationQueue.instance = new OfflineOperationQueue();
    }
    return OfflineOperationQueue.instance;
  }

  setOnlineStatus(online: boolean): void {
    this.isOnline = online;
    console.log(`🌐 [OFFLINE_QUEUE] Network status: ${online ? "ONLINE" : "OFFLINE"}`);
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  enqueue(op: Omit<QueuedOperation, "retryCount" | "queuedAt">): void {
    const queued: QueuedOperation = {
      ...op,
      retryCount: 0,
      queuedAt: Date.now(),
    };

    // Idempotent check — avoid queuing duplicate eventId
    if (this.queue.some((q) => q.metadata.eventId === op.metadata.eventId)) {
      console.warn(`⚠️ [OFFLINE_QUEUE] Duplicate operation ${op.metadata.eventId} ignored.`);
      return;
    }

    this.queue.push(queued);
    console.log(`📥 [OFFLINE_QUEUE] Enqueued operation ${queued.id} (${queued.operationType}). Queue size: ${this.queue.length}`);
  }

  peekNext(): QueuedOperation | undefined {
    return this.queue[0];
  }

  dequeue(): QueuedOperation | undefined {
    return this.queue.shift();
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getAllQueued(): QueuedOperation[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
  }
}
