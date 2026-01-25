import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;

  await connectDB();

  const logs = await DailyLog.find({ userId })
    .sort({ date: 1 }) // oldest → newest
    .limit(60)
    .lean();

  return NextResponse.json(logs);
}
