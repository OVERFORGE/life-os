import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { WorkoutRoutine } from "@/server/db/models/WorkoutRoutine";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await WorkoutRoutine.findOneAndDelete({ _id: id, userId: (session.user as any).id });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body: any = await req.json();
    const { routineName, gymId, splitDays } = body;

    const routine = await WorkoutRoutine.findOneAndUpdate(
      { _id: id, userId: (session.user as any).id },
      { $set: { routineName, gymId, splitDays } },
      { new: true }
    );
    return NextResponse.json(routine);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
