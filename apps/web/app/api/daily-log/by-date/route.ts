import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";
import { DailyLogSchema } from "@/features/daily-log/schema";
import { upsertDailyLogWithOutbox } from "@/features/daily-log/services/dailyLogEngine";

export async function GET(req: Request) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "Date required" }, { status: 400 });
  }

  await connectDB();

  const log = await DailyLog.findOne({ userId, date }).lean();

  if (!log) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(log);
}

export async function POST(req: Request) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "Date required" }, { status: 400 });
  }

  const body: any = await req.json();

  const parsed = DailyLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();

  const result = await upsertDailyLogWithOutbox({
    userId,
    date,
    sections: parsed.data,
    preserveSignals: true,
    options: {
      clientMutationId: typeof body?.clientMutationId === "string" ? body.clientMutationId : undefined,
      expectedVersion: typeof body?.expectedVersion === "number" ? body.expectedVersion : undefined,
      source: "web.daily_log.by_date",
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
