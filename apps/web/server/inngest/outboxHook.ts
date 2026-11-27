import { inngest } from "@/lib/inngest/client";
import { OutboxStorageService, runOutboxDispatchBatch } from "@life-os/execution-kernel";
import type { IOutboxEventDoc } from "@/server/db/models/OutboxEventModel";
import { SSEConnectionManager } from "@/server/services/SSEConnectionManager";

let isHookRegistered = false;

/**
 * Decision D3: Strictly guarded opt-in local development fallback.
 * All 6 guards must hold simultaneously:
 * 1. Explicit local development (`NODE_ENV === "development"`)
 * 2. Non-production & non-serverless (`!VERCEL`, `!AWS_LAMBDA_FUNCTION_NAME`, `!K_SERVICE`)
 * 3. Explicit opt-in (`LIFEOS_LOCAL_OUTBOX_FALLBACK === "true"`)
 * 4. Primary Inngest credentials absent (`!INNGEST_EVENT_KEY`)
 * 5. Lease + ledger protected (via `runOutboxDispatchBatch`)
 * 6. Bounded, non-blocking single batch without timers/intervals
 */
export function shouldRunLocalOutboxFallback(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.NODE_ENV !== "development") return false;
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.K_SERVICE) return false;
  if (env.LIFEOS_LOCAL_OUTBOX_FALLBACK !== "true") return false;
  if (env.INNGEST_EVENT_KEY) return false;
  return true;
}

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
    const distinctUsers = Array.from(
      new Set(events.map((e) => e.userId).filter((u): u is string => Boolean(u)))
    );

    if (shouldRunLocalOutboxFallback()) {
      const targetUserId = distinctUsers[0];
      void Promise.resolve()
        .then(async () => {
          await runOutboxDispatchBatch(10, {
            userId: targetUserId,
            onEmitFrame: async (uid, frame) => {
              SSEConnectionManager.getInstance().broadcastToUser(uid, frame);
            },
          });
        })
        .catch((err) => {
          console.warn("[outboxHook] Local dev outbox fallback failed:", err);
        });
      return;
    }

    try {
      const inngestEvents = events.map((event) => ({
        name: "lifeos/outbox.dispatched" as const,
        data: {
          eventId: event.eventId,
          userId: event.userId,
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
