import { NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { apiError } from "@/lib/apiResponse";
import { InteractionSurfaceService } from "@life-os/execution-kernel";

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

    const surfaceService = InteractionSurfaceService.getInstance();
    const encoder = new TextEncoder();

    let heartbeatTimer: NodeJS.Timeout | null = null;
    let unsubscribe: (() => void) | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        // 1. Immediately send initial projection state
        try {
          const { fetchAuthoritativeSurfaceProjection } = await import(
            "@/server/services/surfaceProjection.service"
          );
          const initialProjection = await fetchAuthoritativeSurfaceProjection(
            userId,
            req.headers.get("x-timezone") || undefined
          );
          const initialEvent = `data: ${JSON.stringify({
            type: "PROJECTION_SYNC",
            projection: initialProjection,
          })}\n\n`;
          controller.enqueue(encoder.encode(initialEvent));
        } catch (err) {
          console.warn("[Surface SSE] Initial projection error:", err);
        }

        // 2. Subscribe to live surface updates
        unsubscribe = surfaceService.subscribe(userId, (projection) => {
          try {
            const eventPayload = `data: ${JSON.stringify({
              type: "PROJECTION_UPDATE",
              projection,
            })}\n\n`;
            controller.enqueue(encoder.encode(eventPayload));
          } catch (err) {
            console.error("[Surface SSE] Error enqueueing projection update:", err);
          }
        });

        // 3. Keep-alive heartbeat ping every 15 seconds
        heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
          }
        }, 15000);
      },
      cancel() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (unsubscribe) unsubscribe();
      },
    });

    req.signal.addEventListener("abort", () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (unsubscribe) unsubscribe();
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    console.error("GET /api/surface/events Error:", err);
    return apiError(err.message || "Failed to establish surface event stream", "INTERNAL_ERROR", 500);
  }
}
