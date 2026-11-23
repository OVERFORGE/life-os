import { NextRequest, NextResponse } from "next/server";
import { OutboxEventModel } from "@/server/db/models/OutboxEventModel";
import { inngest } from "@/lib/inngest/client";
import { connectDB } from "@/server/db/connect";

/**
 * Outbox Sweeper Cron Recovery Route.
 * Invoked by Vercel Cron or an external monitor with Bearer CRON_SECRET.
 * In accordance with V3.2:
 * Strictly triggers HTTP dispatch to Inngest; never executes sagas directly.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const pendingEvents = await OutboxEventModel.find({
      deliveryStatus: { $in: ["PENDING", "PENDING_COMMIT"] },
    })
      .sort({ occurredAt: 1 })
      .limit(50);

    if (pendingEvents.length > 0) {
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
    }

    return NextResponse.json({
      ok: true,
      recoveredCount: pendingEvents.length,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
