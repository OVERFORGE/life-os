import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { requireAdminSession } from "@/lib/adminAuth";
import { ExecutionTraceRecordModel } from "@/server/db/models/ExecutionTraceRecordModel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const surface = searchParams.get("surface");
    const status = searchParams.get("status");
    const routingStrategy = searchParams.get("routingStrategy");
    const q = searchParams.get("q")?.trim();
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 40)));

    const filter: Record<string, any> = {};
    if (surface && surface !== "ALL") filter.surface = surface;
    if (status && status !== "ALL") filter.status = status;
    if (routingStrategy && routingStrategy !== "ALL") filter.routingStrategy = routingStrategy;
    if (q) {
      filter.$or = [
        { traceId: { $regex: q, $options: "i" } },
        { requestId: { $regex: q, $options: "i" } },
        { executionId: { $regex: q, $options: "i" } },
        { userMessagePreview: { $regex: q, $options: "i" } },
      ];
    }

    const traces = await ExecutionTraceRecordModel.find(filter)
      .sort({ startedAt: -1 })
      .limit(limit)
      .select(
        "traceId parentTraceId requestId executionId conversationId userId surface status routingStrategy terminationReason startedAt endedAt durationMs userMessagePreview finalResponsePreview kernelActionIds outboxEventIds langsmithRunId langsmithUrl"
      )
      .lean();

    const stepCountDocs = await ExecutionTraceRecordModel.aggregate([
      { $match: { traceId: { $in: traces.map((t: any) => t.traceId) } } },
      {
        $project: {
          traceId: 1,
          stepCount: { $size: { $ifNull: ["$steps", []] } },
          llmCallCount: { $size: { $ifNull: ["$llmCalls", []] } },
        },
      },
    ]);
    const countsByTrace = new Map(stepCountDocs.map((d: any) => [d.traceId, d]));

    return NextResponse.json({
      traces: traces.map((t: any) => ({
        ...t,
        stepCount: countsByTrace.get(t.traceId)?.stepCount ?? 0,
        llmCallCount: countsByTrace.get(t.traceId)?.llmCallCount ?? 0,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load observability traces" },
      { status: 500 }
    );
  }
}
