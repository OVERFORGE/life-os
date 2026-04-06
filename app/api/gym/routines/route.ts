import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { WorkoutRoutine } from "@/server/db/models/WorkoutRoutine";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const routines = await WorkoutRoutine.find({ userId: session.user.id });
    return NextResponse.json(routines);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: any = await req.json();
    const routine = await WorkoutRoutine.create({
      userId: session.user.id,
      ...body
    });

    return NextResponse.json(routine);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
