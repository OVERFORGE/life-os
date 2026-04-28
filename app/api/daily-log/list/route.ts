import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";

export async function GET(req: Request) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  await connectDB();

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || 30);

  const logs = await DailyLog.find({ userId })
    .sort({ date: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json(logs);
}
