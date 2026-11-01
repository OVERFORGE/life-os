/**
 * SurfacePresenceManager.ts
 * 
 * Milestone B — Phase B4: Work Package 4 / Loop 7
 * Manages Multi-Surface Client Presence, Monotonic Stream Cursors, and Replay
 */

import { SurfaceDeliveryReceiptModel, ISurfaceDeliveryReceiptDoc } from "../../../../apps/web/server/db/models/SurfaceDeliveryReceiptModel";
import { OutboxEventModel } from "../../../../apps/web/server/db/models/OutboxEventModel";

export interface SurfacePresenceManagerDependencies {
  receiptModel?: any;
  outboxModel?: any;
}

export class SurfacePresenceManager {
  private receiptModel: any;
  private outboxModel: any;

  constructor(deps?: SurfacePresenceManagerDependencies) {
    this.receiptModel = deps?.receiptModel || SurfaceDeliveryReceiptModel;
    this.outboxModel = deps?.outboxModel || OutboxEventModel;
  }

  /**
   * Idempotently load or initialize surface delivery receipt.
   */
  public async getOrCreateReceipt(userId: string, surfaceId: string): Promise<any> {
    let receipt = await this.receiptModel.findOne({ userId, surfaceId });
    if (!receipt) {
      try {
        const created = await this.receiptModel.create({
          userId,
          surfaceId,
          lastAcknowledgedSeq: 0,
          acknowledgedAt: new Date(),
          activeChannel: "SSE",
          unacknowledgedEvents: [],
        });
        receipt = Array.isArray(created) ? created[0] : created;
      } catch (err: any) {
        if (err?.code !== 11000 && !String(err?.message).includes("duplicate")) {
          throw err;
        }
        receipt = await this.receiptModel.findOne({ userId, surfaceId });
      }
    }
    return receipt;
  }

  /**
   * Record dispatch of an event to a surface.
   */
  public async recordDispatch(
    userId: string,
    surfaceId: string,
    event: { eventId: string; causalSequence: number; type: string }
  ): Promise<void> {
    await this.getOrCreateReceipt(userId, surfaceId);

    await this.receiptModel.updateOne(
      { userId, surfaceId },
      {
        $push: {
          unacknowledgedEvents: {
            eventId: event.eventId,
            causalSequence: event.causalSequence,
            type: event.type,
            dispatchedAt: new Date(),
          },
        },
      }
    );
  }

  /**
   * Acknowledge delivery up to a monotonic causalSequence.
   * Cleans up acknowledged events from the unacknowledged list.
   */
  public async acknowledge(
    userId: string,
    surfaceId: string,
    acknowledgedSeq: number
  ): Promise<{ previousSeq: number; newSeq: number }> {
    const receipt = await this.getOrCreateReceipt(userId, surfaceId);
    const previousSeq = receipt.lastAcknowledgedSeq || 0;

    // Monotonic invariant: cannot move backwards
    const newSeq = Math.max(previousSeq, acknowledgedSeq);

    await this.receiptModel.updateOne(
      { userId, surfaceId },
      {
        $set: {
          lastAcknowledgedSeq: newSeq,
          acknowledgedAt: new Date(),
        },
        $pull: {
          unacknowledgedEvents: {
            causalSequence: { $lte: newSeq },
          },
        },
      }
    );

    return { previousSeq, newSeq };
  }

  /**
   * Replay events for a surface that reconnected.
   * If sinceSeq is provided, replays all events with causalSequence > sinceSeq.
   * Otherwise replays from lastAcknowledgedSeq.
   */
  public async getReplayEvents(
    userId: string,
    surfaceId: string,
    sinceSeq?: number,
    limit: number = 50
  ): Promise<any[]> {
    let cursor = sinceSeq;
    if (cursor === undefined) {
      const receipt = await this.getOrCreateReceipt(userId, surfaceId);
      cursor = receipt.lastAcknowledgedSeq || 0;
    }

    const query = {
      userId,
      deliveryStatus: "COMMITTED",
      causalSequence: { $gt: cursor },
    };

    const events = await this.outboxModel
      .find(query)
      .limit(limit);

    // Sort ascending by causalSequence for deterministic monotonic stream replay
    return events.sort((a: any, b: any) => a.causalSequence - b.causalSequence);
  }

  /**
   * Format a canonical event into a Server-Sent Events (SSE) compliant message string.
   */
  public formatSSEMessage(event: any): string {
    const eventId = event.causalSequence ?? event.eventId;
    const type = event.type || "message";
    const data = JSON.stringify(event);
    return `id: ${eventId}\nevent: ${type}\ndata: ${data}\n\n`;
  }
}

