import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { SimulationRun, mapDocToSnapshot, mapSnapshotToDoc } from "@/server/db/models/SimulationRun";
import { SimulationPersona } from "@/server/db/models/SimulationPersona";
import { SimulationRuntimeEngine } from "@/simulation/engine/runtime";
import { SimulationStepEngine } from "@/simulation/orchestrators/simulationStepEngine";
import { ExecutionRecorder } from "@/simulation/execution/services/executionRecorder";
import { SnapshotRepository } from "@/simulation/execution/repositories/snapshotRepository";
import { ArtifactRepository } from "@/simulation/execution/repositories/artifactRepository";
import { serializeRun } from "../../route";
import mongoose from "mongoose";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/simulation/[id]/step — Pure step orchestration API route
export async function POST(req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    console.log("[STEP API] Entered POST for run:", id);
    await connectDB();

    const body = await req.json().catch(() => ({}));

    let query: Record<string, unknown> = { runUid: id };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { $or: [{ _id: id }, { runUid: id }] };
    }

    const runDoc = await SimulationRun.findOne(query);
    if (!runDoc) {
      console.warn("[STEP API] Simulation run not found:", id);
      return NextResponse.json({ error: "Simulation run not found" }, { status: 404 });
    }

    // 1. Map to RuntimeSnapshot
    const snapshot = mapDocToSnapshot(runDoc.toObject());

    // 2. Fetch associated Persona DTO
    const personaDoc = await SimulationPersona.findById(snapshot.context.personaId).lean();
    if (!personaDoc) {
      console.warn("[STEP API] Associated persona not found:", snapshot.context.personaId);
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

    // 3. Execute pure simulation step (Decision Engine -> Kernel Adapter -> Kernel.handle())
    const useMockProvider = body.useMockProvider ?? false;
    console.log("[STEP API] executeStep starting (useMockProvider:", useMockProvider, ")");
    const stepEngine = new SimulationStepEngine(
      useMockProvider ? new (require("@/simulation/decision/providers/llmProvider").MockLLMProvider)() : undefined
    );

    const stepResult = await stepEngine.executeStep({
      snapshot,
      persona: personaDTO,
    });
    console.log("[STEP API] executeStep finished successfully. Decision intent:", stepResult.decision.intent);

    // 4. Fetch previous world snapshot for exact World Before + World Diff generation
    const stepNumber = snapshot.tick + 1; // 1-based step counter
    let previousWorldSnapshot: Record<string, unknown> | null = null;
    if (stepNumber > 1) {
      try {
        const snapshotRepo = new SnapshotRepository();
        const artifactRepo = new ArtifactRepository();
        const prevStepSnapshot = await snapshotRepo.findByRunAndStep(snapshot.context.runUid, stepNumber - 1);
        if (prevStepSnapshot?.worldAfterArtifactId) {
          const prevWorldArt = await artifactRepo.findById(prevStepSnapshot.worldAfterArtifactId);
          previousWorldSnapshot = prevWorldArt?.payload ?? null;
        }
      } catch (_prevErr) {
        previousWorldSnapshot = null;
      }
    }

    // 5. Record Execution Observability Artifacts via ExecutionRecorder
    console.log("[STEP API] recorder starting for stepNumber:", stepNumber);
    const recorder = new ExecutionRecorder();
    const recordResult = await recorder.record({
      snapshot,
      persona: personaDTO,
      stepNumber,
      promptDocument: stepResult.promptDocument,
      llmResponse: stepResult.llmResponse,
      decision: stepResult.decision,
      virtualUserRequest: stepResult.virtualUserRequest,
      handleInput: stepResult.handleInput,
      kernelResult: stepResult.kernelResult,
      previousWorldSnapshot,
    });
    console.log("[STEP API] recorder finished successfully. Results:", recordResult);

    // 6. Time Ownership: Runtime engine advances its own clock via public API
    const runtimeEngine = SimulationRuntimeEngine.restore(snapshot);
    runtimeEngine.advance(1);
    console.log("[STEP API] runtime advanced clock to tick:", runtimeEngine.tick);

    // 7. Persist updated canonical snapshot and return step result
    const updatedSnapshot = runtimeEngine.snapshot();
    const docPayload = mapSnapshotToDoc(updatedSnapshot);

    Object.assign(runDoc, docPayload);
    await runDoc.save();
    console.log("[STEP API] save complete for runDoc:", runDoc._id.toString());

    return NextResponse.json({
      success: true,
      stepSnapshot: stepResult,
      recordResult,
      run: serializeRun(runDoc.toObject()),
    });
  } catch (err: unknown) {
    console.error("[STEP API] Exception in POST:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Simulation step execution error" },
      { status: 500 }
    );
  }
}
