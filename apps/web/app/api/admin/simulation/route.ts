import { requireAdminSession } from "@/lib/adminAuth";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { SimulationRun, mapSnapshotToDoc } from "@/server/db/models/SimulationRun";
import { SimulationPersona } from "@/server/db/models/SimulationPersona";
import { SimulationRuntimeEngine } from "@/simulation/engine/runtime";
import { serializeRun } from "./serializeRun";

// GET /api/admin/simulation — List simulation runs
export async function GET() {
  const adminAuth = await requireAdminSession();
  if (!adminAuth.ok) return adminAuth.response;
  try {
    await connectDB();
    const docs = await SimulationRun.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ runs: docs.map(serializeRun) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

// POST /api/admin/simulation — Start a new simulation run
export async function POST(req: NextRequest) {
  const adminAuth = await requireAdminSession();
  if (!adminAuth.ok) return adminAuth.response;
  try {
    await connectDB();
    const body = await req.json();
    const { personaId, seed = 42, configuration } = body;

    if (!personaId) {
      return NextResponse.json({ error: "personaId is required." }, { status: 400 });
    }

    const persona = await SimulationPersona.findById(personaId).lean();
    if (!persona) {
      return NextResponse.json({ error: "Persona not found." }, { status: 404 });
    }

    const personaDTO = {
      id: (persona as any)._id.toString(),
      personaUid: (persona as any).personaUid,
      code: (persona as any).code,
      name: (persona as any).name,
      personaVersion: (persona as any).personaVersion ?? "1.0.0",
    } as any;

    // Count existing runs for this persona to derive sequence number deterministically
    const runCount = await SimulationRun.countDocuments({ personaId });
    const sequenceNumber = runCount + 1;

    // Instantiate and execute runtime engine (CREATED -> INITIALIZING -> RUNNING)
    const engine = new SimulationRuntimeEngine(personaDTO, undefined, seed, configuration, sequenceNumber);
    engine.start();

    // Map snapshot to document payload
    const snapshot = engine.snapshot();
    const docPayload = mapSnapshotToDoc(snapshot);

    const doc = await SimulationRun.create({
      runUid: snapshot.context.runUid,
      personaId,
      ...docPayload,
    });

    return NextResponse.json({ run: serializeRun(doc.toObject()) }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
