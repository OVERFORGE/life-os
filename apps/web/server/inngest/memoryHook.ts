import { DurableMemoryJobQueue } from "@life-os/execution-kernel";
import { inngest } from "@/lib/inngest/client";

let registered = false;

export function registerMemoryInngestHook(): void {
  if (registered) return;
  registered = true;

  DurableMemoryJobQueue.getInstance().setEventDispatcher(async (job) => {
    await inngest.send({
      name: "lifeos/memory.turn_committed",
      data: {
        jobId: job.jobId,
        userId: job.userId,
        conversationId: job.conversationId,
      },
    });
  });
}
