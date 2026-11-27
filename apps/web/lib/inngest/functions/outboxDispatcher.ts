import { inngest } from "../client";
import { connectDB } from "@/server/db/connect";
import {
  runOutboxDispatchBatch,
  createTraceContext,
  runWithTraceContext,
  recordTraceStep,
  startDirectLangSmithRun,
  TracePersistenceService,
} from "@life-os/execution-kernel";
import { SSEConnectionManager } from "@/server/services/SSEConnectionManager";

export const outboxDispatcherFunction = inngest.createFunction(
  {
    id: "outbox-event-dispatcher",
    name: "Durable Outbox Event Dispatcher",
    retries: 3,
    triggers: [{ event: "lifeos/outbox.dispatched" }],
  },
  async ({ event, step }: { event: any; step: any }) => {
    const userId = event?.data?.userId;
    const eventId = event?.data?.eventId;
    const parentTraceId = event?.data?.traceId || event?.data?.metadata?.traceId;
    const executionId = event?.data?.executionId || event?.data?.metadata?.executionId || `exec_inngest_${Date.now()}`;
    const requestId = event?.data?.requestId || event?.data?.metadata?.requestId || `req_inngest_${Date.now()}`;

    if (!userId || typeof userId !== "string") {
      return {
        skipped: true,
        reason: "MISSING_USER_ID",
        eventId: eventId ?? null,
      };
    }

    const lsRun = await startDirectLangSmithRun({
      name: "inngest:outbox_dispatcher",
      runType: "chain",
      inputs: { userId, eventId, parentTraceId },
      metadata: { parentTraceId, executionId, requestId },
      tags: ["lifeos:inngest", "lifeos:outbox"],
    });
    const traceCtx = createTraceContext({
      parentTraceId,
      requestId,
      executionId,
      userId,
      surface: "inngest_worker",
      langsmithRunId: lsRun.runId,
      langsmithUrl: lsRun.url,
    });

    return await runWithTraceContext(traceCtx, async () => {
      const start = Date.now();
      const dispatchReport = await step.run("dispatch-and-sequence-outbox", async () => {
        await connectDB();
        return await runOutboxDispatchBatch(20, {
          userId,
          onEmitFrame: async (uid, frame) => {
            SSEConnectionManager.getInstance().broadcastToUser(uid, frame);
          },
        });
      });

      recordTraceStep({
        layer: "outbox",
        component: "outboxDispatcherFunction",
        operation: "dispatch-and-sequence-outbox",
        status: "COMPLETED",
        startedAtMs: start,
        durationMs: Date.now() - start,
        inputs: { userId, eventId, parentTraceId },
        outputs: dispatchReport,
      });

      await lsRun.finish({ report: dispatchReport });
      void TracePersistenceService.getInstance().persistTrace({
        ctx: traceCtx,
        status: "COMPLETED",
        terminationReason: "OUTBOX_BATCH_DISPATCHED",
        finalFrontendPayload: dispatchReport,
      });

      return {
        ok: true,
        userId,
        eventId: eventId ?? null,
        report: dispatchReport,
      };
    });
  }
);
