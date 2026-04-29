import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { generateDailyPlan } from "@/features/tasks/engine/dailyPlanner";
import { User } from "@/server/db/models/User";

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const userId = (session.user as any).id;

  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  const plan = await generateDailyPlan(userId, timezone);
  return NextResponse.json({ ok: true, plan });
}
