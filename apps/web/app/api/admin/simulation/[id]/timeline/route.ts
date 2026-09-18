import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { TimelineService } from "@/simulation/execution/services/timelineService";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/simulation/[id]/timeline
 *
 * Returns ordered TimelineEntryDTO[] for a simulation run.
 * Reads ONLY from sim_run_journal — never snapshots or artifacts.
 */
export async function GET(_req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    await connectDB();

    const service = new TimelineService();
    const timeline = await service.getTimeline(id);

    return NextResponse.json({ timeline, count: timeline.length });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to retrieve timeline" },
      { status: 500 }
    );
  }
}
