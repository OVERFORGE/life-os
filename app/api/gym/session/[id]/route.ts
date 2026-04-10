import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await WorkoutSession.findOneAndDelete({ _id: id, userId: (session.user as any).id });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const workout = await WorkoutSession.findOne({ _id: id, userId: (session.user as any).id }).lean();
    if (!workout) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(workout);
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
    const { exercises, durationSeconds, splitDayName } = body;

    const updated = await WorkoutSession.findOneAndUpdate(
      { _id: id, userId: (session.user as any).id },
      { $set: { exercises, durationSeconds, splitDayName } },
      { new: true }
    );
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
