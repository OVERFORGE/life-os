import { NextRequest } from "next/server";
import { connectDB } from "@/server/db/connect";
import { requireAdminSession } from "@/lib/adminAuth";
import { ExecutionTraceRecordModel } from "@/server/db/models/ExecutionTraceRecordModel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  await connectDB();

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSeenIso = new Date(Date.now() - 5000).toISOString();

  const stream = new ReadableStream({
    async start(controller) {
      const pushBatch = async () => {
        try {
          const docs = await ExecutionTraceRecordModel.find({
            updatedAt: { $gt: new Date(lastSeenIso) },
          })
            .sort({ startedAt: -1 })
            .limit(20)
            .select(
              "traceId parentTraceId requestId executionId userId surface status routingStrategy terminationReason startedAt durationMs userMessagePreview langsmithUrl updatedAt"
            )
            .lean();

          if (docs.length > 0) {
            const newest = docs.reduce((max: Date, d: any) => {
              const dt = new Date(d.updatedAt || d.startedAt);
              return dt > max ? dt : max;
            }, new Date(lastSeenIso));
            lastSeenIso = newest.toISOString();
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "traces_update", traces: docs })}\n\n`)
            );
          } else {
            controller.enqueue(encoder.encode(`: keepalive\n\n`));
          }
        } catch (_) {}
      };

      await pushBatch();
      timer = setInterval(pushBatch, 2000);

      req.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch (_) {}
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
