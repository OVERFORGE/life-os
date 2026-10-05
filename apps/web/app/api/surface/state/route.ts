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

    const timezoneHint = req.headers.get("x-timezone") || undefined;
    const { fetchAuthoritativeSurfaceProjection } = await import(
      "@/server/services/surfaceProjection.service"
    );
    const projection = await fetchAuthoritativeSurfaceProjection(userId, timezoneHint);

    const response = apiSuccess(projection);
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return response;
  } catch (err: any) {
    console.error("GET /api/surface/state Error:", err);
    return apiError(err.message || "Failed to retrieve surface projection", "INTERNAL_ERROR", 500);
  }
}
