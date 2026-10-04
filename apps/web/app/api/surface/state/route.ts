import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { apiSuccess, apiError } from "@/lib/apiResponse";
import { InteractionSurfaceService, TemporalOccurrence, ExecutionChronicleEntry } from "@life-os/execution-kernel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    let userId = (session?.user as any)?.id;

    await connectDB();

    if (!userId && process.env.NODE_ENV !== "production") {
      const { User } = await import("@/server/db/models/User");
      const firstUser = await User.findOne().lean();
      if (firstUser) {
        userId = (firstUser as any)._id.toString();
      }
    }

    if (!userId) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const now = Date.now();
    const todayDateOnly = new Date(now).toISOString().slice(0, 10);

    // Query today's temporal occurrences and recent chronicles
    const { TemporalOccurrence: TemporalOccModel } = await import("@/server/db/models/TemporalOccurrence");
    const { ExecutionChronicle: ChronicleModel } = await import("@/server/db/models/ExecutionChronicle");

    const [occurrencesDocs, chroniclesDocs] = await Promise.all([
      TemporalOccModel.find({
        userId,
        dateOnly: todayDateOnly,
      }).lean(),
      ChronicleModel.find({
        userId,
        startedAtMs: { $gte: now - 24 * 60 * 60 * 1000 },
      })
        .sort({ startedAtMs: -1 })
        .limit(20)
        .lean(),
    ]);

    const occurrences: TemporalOccurrence[] = (occurrencesDocs as any[]).map((doc) => ({
      occurrenceId: doc.occurrenceId,
      userId: doc.userId,
      seriesId: doc.seriesId,
      title: doc.title,
      kind: doc.kind,
      dateOnly: doc.dateOnly,
      plannedInterval: doc.plannedInterval,
      locationContext: doc.locationContext,
      rigidity: doc.rigidity,
      status: doc.status,
      linkedEntity: doc.linkedEntity,
      version: doc.version,
      overrideType: doc.overrideType,
      createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : now,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).getTime() : now,
    }));

    const chronicles: ExecutionChronicleEntry[] = (chroniclesDocs as any[]).map((doc) => ({
      chronicleId: doc.chronicleId,
      userId: doc.userId,
      occurrenceId: doc.occurrenceId,
      entityType: doc.entityType,
      entityId: doc.entityId,
      title: doc.title,
      startedAtMs: doc.startedAtMs,
      endedAtMs: doc.endedAtMs,
      durationMinutes: doc.durationMinutes,
      interruptionsCount: doc.interruptionsCount || 0,
      completedWorkUnits: doc.completedWorkUnits,
      notes: doc.notes,
      source: doc.source || "web_manual",
      createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : now,
    }));

    const surfaceService = InteractionSurfaceService.getInstance();
    const projection = await surfaceService.computeSurfaceProjection(userId, {
      referenceTimeMs: now,
      occurrences,
      chronicles,
    });

    const response = apiSuccess(projection);
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return response;
  } catch (err: any) {
    console.error("GET /api/surface/state Error:", err);
    return apiError(err.message || "Failed to retrieve surface projection", "INTERNAL_ERROR", 500);
  }
}
