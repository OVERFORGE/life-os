import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";
import { getTodayDateString } from "@/utils/date";

import { getAuthSession } from "@/lib/auth";

import { DailyLogSchema } from "@/features/daily-log/schema";
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

  /* ---------------- Preserve Signals ---------------- */

  const existing = await DailyLog.findOne({ userId, date: today }).lean();
  const existingSignals = existing?.signals || {};

  /* ---------------- Merge Core + Signals ---------------- */

  const merged = {
    ...parsed.data,
    signals: existingSignals,
  };

  // ✅ CRITICAL FIX: Remove forbidden fields
  delete (merged as any).userId;
  delete (merged as any).date;

  /* ---------------- Save ---------------- */

  const log = await DailyLog.findOneAndUpdate(
    { userId, date: today },
    {
      $set: merged,
      $setOnInsert: {
        userId,
        date: today,
      },
    },
    { upsert: true, new: true }
  );

  return NextResponse.json(log);
}
