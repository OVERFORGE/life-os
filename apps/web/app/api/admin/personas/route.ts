import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { SimulationPersona } from "@/server/db/models/SimulationPersona";
import { createPersonaSchema } from "@/simulation/personas/validation";
import { generatePersonaUid } from "@/simulation/personas";

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

// GET /api/admin/personas
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const sort = searchParams.get("sort") ?? "createdAt";
    const order = searchParams.get("order") === "asc" ? 1 : -1;
    const status = searchParams.get("status") ?? "active"; // "active" | "archived" | "deleted" | "all"

    const filter: Record<string, unknown> = {};

    if (status === "active") {
      filter.isDeleted = { $ne: true };
      filter.isActive = true;
    } else if (status === "archived") {
      filter.isDeleted = { $ne: true };
      filter.isActive = false;
    } else if (status === "deleted") {
      filter.isDeleted = true;
    }

    // Refinement 5: Expanded Search
    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { promptVersion: { $regex: search, $options: "i" } },
        { personaUid: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
        { "metadata.archetype": { $regex: search, $options: "i" } },
      ];
    }

    const allowedSorts: Record<string, string> = {
      name: "name",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      code: "code",
      personaUid: "personaUid",
    };
    const sortField = allowedSorts[sort] ?? "createdAt";

    const docs = await SimulationPersona.find(filter).sort({ [sortField]: order }).lean();

    return NextResponse.json({ personas: docs.map(serializePersona) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/admin/personas
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const rawBody = await req.json();

    // Refinement 7: Type-Safe Zod Payload Validation
    const parsed = createPersonaSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      return NextResponse.json(
        { error: "Validation failed", details: fieldErrors },
        { status: 400 }
      );
    }

    const body = parsed.data;

    // Check code uniqueness
    const existingCode = await SimulationPersona.findOne({
      code: body.code.toUpperCase(),
      isDeleted: { $ne: true },
    });
    if (existingCode) {
      return NextResponse.json({ error: `Code "${body.code}" is already in use.` }, { status: 409 });
    }

    // Refinement 2: Immutable personaUid generation (PER_ARCHETYPE_XXXX)
    const personaUid = generatePersonaUid(body.archetype);

    const doc = await SimulationPersona.create({
      personaUid,
      code: body.code.toUpperCase(),
      name: body.name,
      description: body.description ?? "",

      templateId: body.templateId ?? null,
      templateVersion: body.templateVersion ?? "1.0.0",
      isTemplate: body.isTemplate ?? false,

      identity: body.identity ?? {},
      traits: body.traits ?? {},
      initialState: body.initialState ?? {},
      lifestyle: body.lifestyle ?? {},
      motivation: body.motivation ?? {},

      capabilities: body.capabilities ?? {},
      memoryProfile: body.memoryProfile ?? {},
      supportedScenarioTypes: body.supportedScenarioTypes ?? [],

      metadata: { ...(body.metadata ?? {}), archetype: body.archetype ?? "CUSTOM" },
      behaviorPolicy: body.behaviorPolicy ?? {},

      promptVersion: body.promptVersion ?? "v1.0.0",
      personaVersion: body.personaVersion ?? "1.0.0",
      schemaVersion: body.schemaVersion ?? "1.0.0",

      tags: body.tags ?? [],
      isActive: true,
      isDeleted: false,
    });

    return NextResponse.json({ persona: serializePersona(doc.toObject()) }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
