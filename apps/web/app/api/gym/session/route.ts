import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { gymEngine } from "@/features/gym/engine/gymEngine";

export async function GET() {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sessions = await WorkoutSession.find({
      userId: (session.user as any).id,
      status: { $ne: "archived" },
    })
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

    const result = await gymEngine.logSession(userId, body);

    if (!result.success || !result.session) {
      return NextResponse.json({ error: "Failed to log workout session" }, { status: 500 });
    }

    return NextResponse.json(result.session, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
