import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { SimulationPersona } from "@/server/db/models/SimulationPersona";
import { updatePersonaSchema } from "@/simulation/personas/validation";
import mongoose from "mongoose";

function serializePersona(doc: any) {
  return {
    id: doc._id.toString(),
    personaUid: doc.personaUid,
    code: doc.code,
    name: doc.name,
    description: doc.description ?? "",
    archetype: doc.metadata?.archetype ?? "CUSTOM",

    templateId: doc.templateId ?? null,
    templateVersion: doc.templateVersion ?? "1.0.0",
    isTemplate: doc.isTemplate ?? false,

    identity: doc.identity ?? {},
    traits: doc.traits ?? {},
    initialState: doc.initialState ?? {},
    lifestyle: doc.lifestyle ?? {},
    motivation: doc.motivation ?? {},

    capabilities: doc.capabilities ?? {},
    memoryProfile: doc.memoryProfile ?? {},
    supportedScenarioTypes: doc.supportedScenarioTypes ?? [],

    metadata: doc.metadata ?? {},
    behaviorPolicy: doc.behaviorPolicy ?? {},

    promptVersion: doc.promptVersion ?? "v1.0.0",
    personaVersion: doc.personaVersion ?? "1.0.0",
    schemaVersion: doc.schemaVersion ?? "1.0.0",
    isLatest: doc.isLatest ?? true,
    previousVersionId: doc.previousVersionId?.toString() ?? null,

    analytics: {
      simulationCount: doc.analytics?.simulationCount ?? 0,
      lastSimulationAt: doc.analytics?.lastSimulationAt?.toISOString() ?? null,
      averageOutcomeScore: doc.analytics?.averageOutcomeScore ?? null,
    },
    validation: {
      passed: doc.validation?.passed ?? true,
      checksum: doc.validation?.checksum ?? "",
      validatedAt: doc.validation?.validatedAt?.toISOString() ?? null,
    },

    isActive: doc.isActive,
    isDeleted: doc.isDeleted ?? false,
    deletedAt: doc.deletedAt?.toISOString() ?? null,
    tags: doc.tags ?? [],
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/admin/personas/[id]
export async function GET(_req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    await connectDB();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }
    const doc = await SimulationPersona.findById(id).lean();
    if (!doc) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    return NextResponse.json({ persona: serializePersona(doc) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

// PUT /api/admin/personas/[id] — Full update
export async function PUT(req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    await connectDB();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const rawBody = await req.json();

    // Refinement 7: Zod Payload Validation
    const parsed = updatePersonaSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const body = parsed.data;

    // Check code uniqueness if code is changing
    if (body.code) {
      const normalized = body.code.trim().toUpperCase();
      const clash = await SimulationPersona.findOne({
        code: normalized,
        _id: { $ne: id },
        isDeleted: { $ne: true },
      });
      if (clash) {
        return NextResponse.json({ error: `Code "${normalized}" is already in use.` }, { status: 409 });
      }
    }

    const update: Record<string, unknown> = {};
    if (body.code !== undefined) update.code = body.code.trim().toUpperCase();
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.description !== undefined) update.description = body.description.trim();
    if (body.templateId !== undefined) update.templateId = body.templateId;
    if (body.templateVersion !== undefined) update.templateVersion = body.templateVersion;
    if (body.isTemplate !== undefined) update.isTemplate = body.isTemplate;

    if (body.identity !== undefined) update.identity = body.identity;
    if (body.traits !== undefined) update.traits = body.traits;
    if (body.initialState !== undefined) update.initialState = body.initialState;
    if (body.lifestyle !== undefined) update.lifestyle = body.lifestyle;
    if (body.motivation !== undefined) update.motivation = body.motivation;

    if (body.capabilities !== undefined) update.capabilities = body.capabilities;
    if (body.memoryProfile !== undefined) update.memoryProfile = body.memoryProfile;
    if (body.supportedScenarioTypes !== undefined) update.supportedScenarioTypes = body.supportedScenarioTypes;

    if (body.promptVersion !== undefined) update.promptVersion = body.promptVersion;
    if (body.personaVersion !== undefined) update.personaVersion = body.personaVersion;
    if (body.schemaVersion !== undefined) update.schemaVersion = body.schemaVersion;
    if (body.tags !== undefined) update.tags = body.tags;
    if (body.isActive !== undefined) update.isActive = body.isActive;

    // Merge archetype into metadata
    if (body.archetype !== undefined || body.metadata !== undefined) {
      const doc = await SimulationPersona.findById(id).lean();
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
      update.metadata = { ...(doc as any).metadata, ...(body.metadata ?? {}), ...(body.archetype ? { archetype: body.archetype } : {}) };
    }

    // Refinement 2 & 6: personaUid, analytics, and executionMetadata are strictly IMMUTABLE & READ-ONLY via API updates

    const updated = await SimulationPersona.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    ).lean();

    if (!updated) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    return NextResponse.json({ persona: serializePersona(updated) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

// PATCH /api/admin/personas/[id] — Partial action (archive, restore, soft-delete, recover)
export async function PATCH(req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    await connectDB();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const { action } = await req.json();

    let update: Record<string, unknown> = {};

    if (action === "archive") {
      update = { isActive: false };
    } else if (action === "restore") {
      update = { isActive: true, isDeleted: false, deletedAt: null };
    } else if (action === "soft-delete") {
      update = { isDeleted: true, deletedAt: new Date(), isActive: false };
    } else if (action === "recover") {
      update = { isDeleted: false, deletedAt: null, isActive: false };
    } else {
      return NextResponse.json({ error: "Invalid action. Use: archive, restore, soft-delete, recover" }, { status: 400 });
    }

    const updated = await SimulationPersona.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    ).lean();

    if (!updated) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    return NextResponse.json({ persona: serializePersona(updated) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

// DELETE /api/admin/personas/[id] — Permanent delete (admin only)
export async function DELETE(_req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    await connectDB();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }
    const deleted = await SimulationPersona.findByIdAndDelete(id);
    if (!deleted) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
