import { inngest } from "../client";
import { connectDB } from "@/server/db/connect";
import {
  DurableMemoryJobQueue,
  createTraceContext,
  runWithTraceContext,
  recordTraceStep,
  TracePersistenceService,
} from "@life-os/execution-kernel";

export const memoryExtractionFunction = inngest.createFunction(
  {
    id: "memory-turn-extraction",
    name: "Durable Personal Memory Extraction Worker",
    retries: 2,
    triggers: [{ event: "lifeos/memory.turn_committed" }],
  },
  async ({ event, step }: { event: any; step: any }) => {
    const jobId = event?.data?.jobId;
    const parentTraceId = event?.data?.traceId;
    if (!jobId) {
      return { skipped: true, reason: "Missing jobId" };
    }

    const traceCtx = createTraceContext({
      parentTraceId,
      requestId: event?.data?.requestId || `req_mem_${jobId}`,
      executionId: event?.data?.executionId || `exec_mem_${jobId}`,
      userId: String(event?.data?.userId || "system"),
      surface: "inngest_worker",
    });

    return await runWithTraceContext(traceCtx, async () => {
      const start = Date.now();
      const result = await step.run("process-memory-job", async () => {
        await connectDB();
        const job = await DurableMemoryJobQueue.getInstance().processJob(jobId);
        return {
          jobId: job.jobId,
          status: job.status,
          storedCount: job.result?.storedCount ?? 0,
          supersededCount: job.result?.supersededCount ?? 0,
        };
      });
      recordTraceStep({
        layer: "outbox",
        component: "memoryExtractionFunction",
        operation: "process-memory-job",
        status: "COMPLETED",
        startedAtMs: start,
        durationMs: Date.now() - start,
        inputs: { jobId, parentTraceId },
        outputs: result,
      });
      void TracePersistenceService.getInstance().persistTrace({
        ctx: traceCtx,
        status: "COMPLETED",
        terminationReason: "MEMORY_EXTRACTION_COMPLETED",
        finalFrontendPayload: result,
      });
      return result;
    });
  }
);

export const memorySweeperFunction = inngest.createFunction(
  {
    id: "memory-sweeper-cron",
    name: "Durable Memory Job Sweeper Recovery",
    retries: 2,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }: { step: any }) => {
    return await step.run("sweep-due-memory-jobs", async () => {
      await connectDB();
      return await DurableMemoryJobQueue.getInstance().sweepAndProcessDueJobs({
        maxJobs: 20,
        staleTimeoutMs: 30000,
      });
    });
  }
);
