import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";

export async function GET() {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sessions = await WorkoutSession.find({ userId: (session.user as any).id })
      .sort({ date: -1 })
      .lean();
    return NextResponse.json(sessions);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = (session.user as any).id;
    const body: any = await req.json();
    const log = await WorkoutSession.create({
      userId,
      ...body
    });

    // Cross-module sync: Update DailyLog
    import("@/server/db/models/DailyLog").then(async ({ DailyLog }) => {
      const dateStr = new Date(body.date || Date.now()).toISOString().split('T')[0];
      await DailyLog.findOneAndUpdate(
        { userId, date: dateStr },
        { 
          $set: { "physical.gym": true },
          $setOnInsert: { signals: {}, sleep: {}, mental: {}, work: {} }
        },
        { upsert: true }
      );
    });

    return NextResponse.json(log);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

