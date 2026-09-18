import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { SimulationRun, mapDocToSnapshot, mapSnapshotToDoc } from "@/server/db/models/SimulationRun";
import { SimulationRuntimeEngine } from "@/simulation/engine/runtime";
import { serializeRun } from "../../route";
import mongoose from "mongoose";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/simulation/[id]/advance
export async function POST(req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const ticksToAdvance = Math.max(1, body.ticks ?? 1);

    let query: Record<string, unknown> = { runUid: id };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { $or: [{ _id: id }, { runUid: id }] };
    }

    const doc = await SimulationRun.findOne(query);
    if (!doc) {
      return NextResponse.json({ error: "Simulation run not found" }, { status: 404 });
    }

    // Requirement 14: Load -> map to RuntimeSnapshot -> restore -> execute -> snapshot -> persist
    const snapshot = mapDocToSnapshot(doc.toObject());
    const engine = SimulationRuntimeEngine.restore(snapshot);

    engine.advance(ticksToAdvance);

    const updatedSnapshot = engine.snapshot();
    const docPayload = mapSnapshotToDoc(updatedSnapshot);

    Object.assign(doc, docPayload);
    await doc.save();

    return NextResponse.json({ run: serializeRun(doc.toObject()) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
