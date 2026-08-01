import { EventBus } from "../events/EventBus";
import { KernelEvent, createKernelEvent } from "../events/Event";
import { DeviceIdentity } from "./DeviceIdentity";

export interface EventBatch {
  batchId: string;
  deviceId: string;
  sessionId: string;
  events: KernelEvent[];
  createdAt: number;
}

/**
 * ReplicationManager Subsystem
 * 
 * SOLE OWNER of immutable event replication across client devices.
 * Preserves strict causal ordering during event batching and transmission.
 */
export class ReplicationManager {
  private static instance: ReplicationManager;
  private pendingBatch: KernelEvent[] = [];

  static getInstance(): ReplicationManager {
    if (!ReplicationManager.instance) {
      ReplicationManager.instance = new ReplicationManager();
    }
    return ReplicationManager.instance;
  }

  trackEvent(event: KernelEvent): void {
    this.pendingBatch.push(event);
  }

  createBatch(): EventBatch | null {
    if (this.pendingBatch.length === 0) return null;

    const deviceIdentity = DeviceIdentity.getInstance().getDeviceMetadata();
    const batch: EventBatch = {
      batchId: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      deviceId: deviceIdentity.deviceId,
      sessionId: deviceIdentity.sessionId,
      events: [...this.pendingBatch],
      createdAt: Date.now(),
    };

    this.pendingBatch = [];
    console.log(`📦 [REPLICATION_MANAGER] Created EventBatch ${batch.batchId} with ${batch.events.length} event(s).`);
    return batch;
  }

  applyBatch(batch: EventBatch): number {
    const eventBus = EventBus.getInstance();
    let appliedCount = 0;

    console.log(`📥 [REPLICATION_MANAGER] Replicating EventBatch ${batch.batchId} from device ${batch.deviceId}...`);

    for (const event of batch.events) {
      eventBus.publish(event);
      appliedCount++;
    }

    eventBus.publish(
      createKernelEvent("EventBatchReplicated", "ReplicationManager", {
        batchId: batch.batchId,
        eventsApplied: appliedCount,
        deviceId: batch.deviceId,
      })
    );

    return appliedCount;
  }
}
