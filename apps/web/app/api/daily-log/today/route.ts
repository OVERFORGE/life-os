import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";
import { getTodayDateString } from "@/utils/date";

import { getAuthSession } from "@/lib/auth";

import { DailyLogSchema } from "@/features/daily-log/schema";
import { upsertDailyLogWithOutbox } from "@/features/daily-log/services/dailyLogEngine";
import { NextResponse } from "next/server";

/* ===================================================== */
/* GET — Fetch Today's Log                               */
/* ===================================================== */

export async function GET() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  await connectDB();

  const today = getTodayDateString();

  const log = await DailyLog.findOne({ userId, date: today }).lean();

  return NextResponse.json(log || {});
}

/* ===================================================== */
/* POST — Save Today's Log                               */
/* ===================================================== */

export async function POST(req: Request) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const body: any = await req.json();

  /* ---------------- Validate ---------------- */

  const parsed = DailyLogSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await connectDB();

  const today = getTodayDateString();
  const result = await upsertDailyLogWithOutbox({
    userId,
    date: today,
    sections: parsed.data,
    preserveSignals: true,
    options: {
      clientMutationId: typeof body?.clientMutationId === "string" ? body.clientMutationId : undefined,
      expectedVersion: typeof body?.expectedVersion === "number" ? body.expectedVersion : undefined,
      source: "web.daily_log.today",
    },
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.statusCode || 500 }
    );
  }

  return NextResponse.json(result.log);
}
