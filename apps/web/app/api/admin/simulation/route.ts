import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { SimulationRun, mapDocToSnapshot, mapSnapshotToDoc } from "@/server/db/models/SimulationRun";
import { SimulationPersona } from "@/server/db/models/SimulationPersona";
import { SimulationRuntimeEngine } from "@/simulation/engine/runtime";
import { deriveRuntimeState } from "@/simulation/engine/state";
import { SimulationRunDTO } from "@/simulation/types";

export function serializeRun(doc: any): SimulationRunDTO {
  const snapshot = mapDocToSnapshot(doc);
  const state = deriveRuntimeState(snapshot.status, snapshot.tick, snapshot.configuration);

  return {
    id: doc._id?.toString() ?? doc.id ?? "",
    runUid: snapshot.context.runUid,
    personaId: snapshot.context.personaId,
    status: snapshot.status,
    startedAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    completedAt: snapshot.status === "COMPLETED" && doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    seed: snapshot.seed,
    configuration: snapshot.configuration,
    context: snapshot.context,
    state,
    metrics: snapshot.metrics,
    logs: snapshot.logs,
    error: snapshot.error,
    kernelVersion: snapshot.context.kernelVersion,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}

// GET /api/admin/simulation — List simulation runs
export async function GET() {
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
