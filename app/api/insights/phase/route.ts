import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { DailyLog } from "@/server/db/models/DailyLog";
import { detectPhase } from "@/features/insights/phaseEngine";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const logs = await DailyLog.find({ userId: session.user.id })
    .sort({ date: -1 })
    .limit(30)
    .lean();

  const phase = detectPhase(logs);

  return NextResponse.json({ phase });
}
