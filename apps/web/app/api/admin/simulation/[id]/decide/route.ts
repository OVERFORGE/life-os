import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { SimulationRun, mapDocToSnapshot } from "@/server/db/models/SimulationRun";
import { SimulationPersona } from "@/server/db/models/SimulationPersona";
import { DecisionEngine } from "@/simulation/decision/engine/decisionEngine";
import { MockLLMProvider } from "@/simulation/decision/providers/llmProvider";
import mongoose from "mongoose";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/simulation/[id]/decide — Evaluate Decision Engine on a run snapshot
// IMPORTANT: Zero state mutation. Pure read-only decision evaluation.
export async function POST(req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    await connectDB();

    const body = await req.json().catch(() => ({}));

    let query: Record<string, unknown> = { runUid: id };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { $or: [{ _id: id }, { runUid: id }] };
    }

    const doc = await SimulationRun.findOne(query).lean();
    if (!doc) {
      return NextResponse.json({ error: "Simulation run not found" }, { status: 404 });
    }

    const snapshot = mapDocToSnapshot(doc);

    // Fetch associated persona
    const personaDoc = await SimulationPersona.findById(snapshot.context.personaId).lean();
    if (!personaDoc) {
      return NextResponse.json({ error: "Associated simulation persona not found" }, { status: 404 });
    }

    const personaDTO = {
      id: (personaDoc as any)._id.toString(),
      personaUid: (personaDoc as any).personaUid,
      code: (personaDoc as any).code,
      name: (personaDoc as any).name,
      description: (personaDoc as any).description ?? "",
      archetype: (personaDoc as any).archetype ?? "custom",
      identity: (personaDoc as any).identity ?? {},
      traits: (personaDoc as any).traits ?? {},
      lifestyle: (personaDoc as any).lifestyle ?? {},
      motivation: (personaDoc as any).motivation ?? {},
      capabilities: (personaDoc as any).capabilities ?? {},
      personaVersion: (personaDoc as any).personaVersion ?? "1.0.0",
    } as any;

    // Optional provider mock configuration override from request body
    const mockConfig = body.mockConfig ?? undefined;
    const provider = new MockLLMProvider(mockConfig);
    const engine = new DecisionEngine(provider);

    const result = await engine.evaluate(snapshot, personaDTO);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          prompt: result.prompt,
          response: result.response,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      decision: result.decision,
      prompt: result.prompt,
      response: result.response,
      trace: result.trace,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Decision evaluation error" },
      { status: 500 }
    );
  }
}
