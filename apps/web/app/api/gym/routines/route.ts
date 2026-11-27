import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { WorkoutRoutine } from "@/server/db/models/WorkoutRoutine";
import { createCatalogDocWithOutbox } from "@/features/catalog/services/catalogMutationEngine";

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
    const res = await createCatalogDocWithOutbox({
      userId: session.user.id,
      model: WorkoutRoutine,
      aggregateType: "workout_routine",
      eventType: "domain.catalog.updated",
      domain: "gym",
      docFields: {
        userId: session.user.id,
        ...body,
      },
      options: { source: "web.gym.routines.create" },
    });

    return NextResponse.json(res.doc);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
