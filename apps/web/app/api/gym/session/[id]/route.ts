import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { gymEngine } from "@/features/gym/engine/gymEngine";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const workout = await WorkoutSession.findOne({
      _id: id,
      userId: (session.user as any).id,
      status: { $ne: "archived" },
    }).lean();

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
    const { expectedVersion, ...updates } = body;

    const result = await gymEngine.updateSession(
      (session.user as any).id,
      id,
      updates,
      typeof expectedVersion === "number" ? expectedVersion : undefined
    );

    if (!result.success) {
      const status = result.statusCode || (result.code === "AGGREGATE_CONFLICT" ? 409 : 500);
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }

    return NextResponse.json(result.session);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const result = await gymEngine.deleteSession((session.user as any).id, id);

    if (!result.success) {
      const status = result.statusCode || 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ success: true, archived: true, session: result.session });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
