import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { SimulationRun } from "@/server/db/models/SimulationRun";
import { serializeRun } from "../route";
import mongoose from "mongoose";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/admin/simulation/[id]
export async function GET(_req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    await connectDB();

    let query: Record<string, unknown> = { runUid: id };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { $or: [{ _id: id }, { runUid: id }] };
    }

    const doc = await SimulationRun.findOne(query).lean();
    if (!doc) {
      return NextResponse.json({ error: "Simulation run not found" }, { status: 404 });
    }

    return NextResponse.json({ run: serializeRun(doc) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
