import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { requireAdminSession } from "@/lib/adminAuth";
import { ExecutionTraceRecordModel } from "@/server/db/models/ExecutionTraceRecordModel";
import { ExecutionWorkspaceModel } from "@/server/db/models/ExecutionWorkspaceModel";
import { ActionAuditRecordModel } from "@/server/db/models/ActionAuditRecordModel";
import { ExecutionEventRecordModel } from "@/server/db/models/ExecutionEventRecordModel";
import { ExecutionEvidenceRecordModel } from "@/server/db/models/ExecutionEvidenceRecordModel";
import { OutboxEventModel } from "@/server/db/models/OutboxEventModel";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, props: RouteParams) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    await connectDB();
    const { id } = await props.params;

    const trace = (await ExecutionTraceRecordModel.findOne({
      $or: [{ traceId: id }, { executionId: id }, { requestId: id }],
    }).lean()) as any;

    if (!trace) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 });
    }

    const [
      workspace,
      audits,
      events,
      evidence,
      outboxEvents,
      linkedTraces,
    ] = await Promise.all([
      ExecutionWorkspaceModel.findOne({ executionId: trace.executionId }).lean(),
      ActionAuditRecordModel.find({
        $or: [
          { executionId: trace.executionId },
          ...(trace.kernelActionIds?.length ? [{ actionId: { $in: trace.kernelActionIds } }] : []),
        ],
      })
        .sort({ timestamp: 1 })
        .limit(50)
        .lean(),
      ExecutionEventRecordModel.find({ executionId: trace.executionId })
        .sort({ seq: 1 })
        .limit(100)
        .lean(),
      ExecutionEvidenceRecordModel.find({ executionId: trace.executionId })
        .sort({ observedAt: 1 })
        .limit(50)
        .lean(),
      OutboxEventModel.find({
        $or: [
          { "metadata.traceId": trace.traceId },
          { "metadata.executionId": trace.executionId },
          ...(trace.outboxEventIds?.length ? [{ eventId: { $in: trace.outboxEventIds } }] : []),
        ],
      })
        .sort({ recordedAt: 1 })
        .limit(50)
        .lean(),
      ExecutionTraceRecordModel.find({ parentTraceId: trace.traceId })
        .sort({ startedAt: 1 })
        .limit(20)
        .select("traceId surface status terminationReason startedAt durationMs steps")
        .lean(),
    ]);

    return NextResponse.json({
      trace,
      correlated: {
        workspace: workspace || null,
        audits,
        executionEvents: events,
        evidence,
        outboxEvents,
        linkedWorkerTraces: linkedTraces,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load trace detail" },
      { status: 500 }
    );
  }
}
