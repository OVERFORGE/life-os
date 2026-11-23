import { inngest } from "../client";
import { OutboxEventModel } from "@/server/db/models/OutboxEventModel";
import { connectDB } from "@/server/db/connect";

export const outboxSweeperFunction = inngest.createFunction(
  {
    id: "outbox-sweeper-cron",
    name: "Durable Outbox Sweeper Recovery",
    retries: 2,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }: { step: any }) => {
    const sweepResult = await step.run("recover-pending-outbox-events", async () => {
      await connectDB();
      const pendingEvents = await OutboxEventModel.find({
        deliveryStatus: { $in: ["PENDING", "PENDING_COMMIT"] },
      })
        .sort({ occurredAt: 1 })
        .limit(50);

      if (pendingEvents.length === 0) {
        return { scannedCount: 0, dispatchedCount: 0 };
      }

      const dispatches = pendingEvents.map((event) => ({
        name: "lifeos/outbox.dispatched" as const,
        data: {
          eventId: event.eventId,
          category: event.category,
          type: event.type,
          aggregateId: event.aggregateId,
          aggregateType: event.aggregateType,
          aggregateVersion: event.aggregateVersion,
          payload: event.payload || {},
          occurredAt: (event.occurredAt || new Date()).toISOString(),
        },
      }));

      await inngest.send(dispatches);

      return {
        scannedCount: pendingEvents.length,
        dispatchedCount: dispatches.length,
      };
    });

    return sweepResult;
  }
);
