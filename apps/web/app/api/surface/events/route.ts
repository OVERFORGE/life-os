import { NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { apiError } from "@/lib/apiResponse";
import { SSEConnectionManager } from "@/server/services/SSEConnectionManager";
import { UserDeliverySequencer } from "@life-os/execution-kernel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Mandatory Ban on URL Query Tokens (Security Safeguard 4.3)
    if (req.nextUrl.searchParams.has("token") || req.nextUrl.searchParams.has("auth")) {
      return apiError(
        "Authentication via query string tokens is prohibited. Use session cookies or Authorization header.",
        "FORBIDDEN_AUTH_METHOD",
        403
      );
    }

    const session = await getAuthSession();
    let userId = (session?.user as any)?.id;

    await connectDB();

    // Development fallback strictly barred in production
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

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    const lastEventIdHeader = req.headers.get("last-event-id");
    const lastAckSeq = lastEventIdHeader ? parseInt(lastEventIdHeader, 10) : null;

    const connManager = SSEConnectionManager.getInstance();
    const sequencer = new UserDeliverySequencer();
    const encoder = new TextEncoder();

    let heartbeatTimer: NodeJS.Timeout | null = null;
    let streamId: string | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        // 2. Register Active Stream & Enforce Concurrency Quotas
        const reg = connManager.registerConnection(userId, clientIp, controller);
        if (!reg.allowed) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: reg.reason })}\n\n`
            )
          );
          controller.close();
          return;
        }

        streamId = reg.streamId!;

        // 3. Bypass Reverse Proxy Buffering via 1024-byte comment flush
        controller.enqueue(encoder.encode(connManager.getInitialFlushPadding()));

        // 4. Replay Completeness Verification (5-Point Exact Interval Coverage)
        if (lastAckSeq !== null && !isNaN(lastAckSeq)) {
          const replayResult = await sequencer.verifyReplayInterval(userId, lastAckSeq);

          if (replayResult.resyncRequired) {
            // Emits system.resync_required if gap detected, buffer overflow, or cursor skew
            const resyncMsg = connManager.formatSSEMessage(
              "system.resync_required",
              replayResult.currentSeq,
              {
                action: "FULL_SNAPSHOT_REHYDRATION",
                reason: replayResult.reason,
                lastAckSeq,
                currentSeq: replayResult.currentSeq,
              }
            );
            controller.enqueue(encoder.encode(resyncMsg));
          } else if (replayResult.records && replayResult.records.length > 0) {
            // Replay missed frames sequentially
            for (const r of replayResult.records) {
              const replayMsg = connManager.formatSSEMessage("message", r.deliverySeq, {
                type: "INVALIDATE",
                tags: r.invalidationTags || [],
                deliverySeq: r.deliverySeq,
                eventId: r.eventId,
                eventType: r.eventType,
                occurredAt: r.occurredAt,
                isReplay: true,
              });
              controller.enqueue(encoder.encode(replayMsg));
            }
          }
        } else {
          // Cold Connection: emit connected baseline
          const baselineMsg = connManager.formatSSEMessage("system.connected", 0, {
            status: "CONNECTED",
            userId,
          });
          controller.enqueue(encoder.encode(baselineMsg));
        }

        // 5. Send initial projection snapshot for authoritative UI hydration
        try {
          const { fetchAuthoritativeSurfaceProjection } = await import(
            "@/server/services/surfaceProjection.service"
          );
          const initialProjection = await fetchAuthoritativeSurfaceProjection(
            userId,
            req.headers.get("x-timezone") || undefined
          );
          const projectionMsg = `event: projection_sync\ndata: ${JSON.stringify({
            type: "PROJECTION_SYNC",
            projection: initialProjection,
          })}\n\n`;
          controller.enqueue(encoder.encode(projectionMsg));
        } catch (err) {
          console.warn("[Surface SSE] Initial projection hydration error:", err);
        }

        // 6. Keep-Alive Heartbeat every 15 seconds
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
        if (streamId) {
          connManager.unregisterConnection(userId, streamId);
        }
      },
    });

    req.signal.addEventListener("abort", () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (streamId) {
        connManager.unregisterConnection(userId, streamId);
      }
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
    return apiError(
      err.message || "Failed to establish surface event stream",
      "INTERNAL_ERROR",
      500
    );
  }
}
