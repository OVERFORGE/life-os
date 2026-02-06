// app/api/daily-log/today/route.ts

import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";
import { getTodayDateString } from "@/utils/date";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { DailyLogSchema } from "@/features/daily-log/schema";
import { NextResponse } from "next/server";

/* ===================================================== */
/* GET — Fetch Today's Log                               */
/* ===================================================== */

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;

  await connectDB();

  const today = getTodayDateString();

  const log = await DailyLog.findOne({ userId, date: today }).lean();

  return NextResponse.json(log);
}

/* ===================================================== */
/* POST — Save Today's Log (Preserve Signals)             */
/* ===================================================== */

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;

  const body = await req.json();

  /* ----------------------------- */
  /* Validate Core Form            */
  /* ----------------------------- */

  const parsed = DailyLogSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await connectDB();

  const today = getTodayDateString();

  /* ----------------------------- */
  /* Preserve Existing Signals     */
  /* ----------------------------- */

  const existing = await DailyLog.findOne({
    userId,
    date: today,
  }).lean();

  const existingSignals = existing?.signals || {};

  /* ----------------------------- */
  /* Merge Signals + Core Form     */
  /* ----------------------------- */

  const mergedData = {
    ...parsed.data,
    signals: existingSignals, // ✅ keep custom signals safe
  };

  /* ----------------------------- */
  /* Save Document                 */
  /* ----------------------------- */

  const log = await DailyLog.findOneAndUpdate(
    { userId, date: today },
    {
      $set: mergedData,
      $setOnInsert: {
        userId,
        date: today,
      },
    },
    { upsert: true, new: true }
  );

  return NextResponse.json(log);
}
