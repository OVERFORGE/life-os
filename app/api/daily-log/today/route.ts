import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";
import { getTodayDateString } from "@/utils/date";
import { getServerSession } from "next-auth";
import { DailyLogSchema } from "@/features/daily-log/schema";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;

  await connectDB();

  const today = getTodayDateString();

  const log = await DailyLog.findOne({ userId, date: today });

  return NextResponse.json(log);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;

  const body = await req.json();

  const parsed = DailyLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await connectDB();

  const today = getTodayDateString();

  const log = await DailyLog.findOneAndUpdate(
  { userId, date: today },
  {
    $set: parsed.data,
    $setOnInsert: {
      userId,
      date: today,
    },
  },
  { upsert: true, new: true }
);


  return NextResponse.json(log);
}
