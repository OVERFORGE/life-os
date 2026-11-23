import { inngest } from "@/lib/inngest/client";
import { OutboxStorageService } from "@life-os/execution-kernel";
import type { IOutboxEventDoc } from "@/server/db/models/OutboxEventModel";

let isHookRegistered = false;

/**
 * Registers the post-commit outbox trigger hook to dispatch events to Inngest.
 * In accordance with V3.2 architecture:
 * - Trigger is non-blocking and post-commit.
 * - Sagas are executed by Inngest.
 * - Outbox persistence remains the durable source of truth.
 */
export function registerOutboxInngestHook(): void {
  if (isHookRegistered) return;

  const storageService = OutboxStorageService.getInstance();
  storageService.setPostCommitHook(async (events: IOutboxEventDoc[]) => {
    try {
      const inngestEvents = events.map((event) => ({
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

      // Detect goal events that require background decomposition
      const goalDecomposeEvents = events
        .filter(
          (e) =>
            e.aggregateType === "goal" &&
            (e.type === "GOAL_CREATED" || e.type.toLowerCase().includes("created"))
        )
        .map((e) => ({
          name: "lifeos/goal.decompose" as const,
          data: {
            goalId: e.aggregateId,
            userId: e.userId,
            expectedEpoch: e.mutationIntent?.fencingEpoch ?? 0,
            correlationId: e.correlationId,
          },
        }));

      const allDispatches = [...inngestEvents, ...goalDecomposeEvents];
      if (allDispatches.length > 0) {
        await inngest.send(allDispatches);
      }
    } catch (err) {
      console.warn("[outboxHook] Failed to forward outbox events to Inngest:", err);
    }
  });

  isHookRegistered = true;
}

