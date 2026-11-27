import { NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { apiError } from "@/lib/apiResponse";
import { SSEConnectionManager } from "@/server/services/SSEConnectionManager";
import { UserDeliverySequencer } from "@life-os/execution-kernel";
import { UserDeliveryJournalModel } from "@/server/db/models/UserDeliveryJournalModel";
import { UserDeliverySequenceModel } from "@/server/db/models/UserDeliverySequenceModel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const userId = (session?.user as any)?.id;

    if (!userId) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    await connectDB();

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
    let journalPollTimer: NodeJS.Timeout | null = null;
    let changeStream: any = null;
    let streamId: string | null = null;
    let closeTimer: NodeJS.Timeout | null = null;
    let isClosed = false;

    const cleanupStream = () => {
      if (isClosed) return;
      isClosed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (journalPollTimer) clearInterval(journalPollTimer);
      if (closeTimer) clearTimeout(closeTimer);
      if (changeStream && typeof changeStream.close === "function") {
        Promise.resolve(changeStream.close()).catch(() => {});
        changeStream = null;
      }
      if (streamId) {
        connManager.unregisterConnection(userId, streamId);
      }
    };

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
        let highWaterSeq = 0;

        // 3. Bypass Reverse Proxy Buffering via 1024-byte comment flush
        controller.enqueue(encoder.encode(connManager.getInitialFlushPadding()));

        // 4. Replay Completeness Verification (5-Point Exact Interval Coverage)
        if (lastAckSeq !== null && !isNaN(lastAckSeq)) {
          highWaterSeq = lastAckSeq;
          connManager.advanceStreamHighWaterSeq(userId, streamId, highWaterSeq);
          const replayResult = await sequencer.verifyReplayInterval(userId, lastAckSeq);

          if (replayResult.resyncRequired) {
            highWaterSeq = replayResult.currentSeq;
            connManager.advanceStreamHighWaterSeq(userId, streamId, highWaterSeq);
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
              if (r.deliverySeq <= highWaterSeq) continue;
              highWaterSeq = r.deliverySeq;
              connManager.advanceStreamHighWaterSeq(userId, streamId, highWaterSeq);
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
          // Cold Connection: establish baseline sequence and emit connected baseline
          const seqDoc = await UserDeliverySequenceModel.findOne({ userId }).lean();
          highWaterSeq = (seqDoc as any)?.currentSequence ?? 0;
          connManager.advanceStreamHighWaterSeq(userId, streamId, highWaterSeq);
          const baselineMsg = connManager.formatSSEMessage("system.connected", highWaterSeq, {
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

        // 5b. Durable Cross-Process Delivery Journal Bridge (ChangeStream + bounded polling fallback)
        const emitJournalDoc = (doc: any) => {
          if (isClosed || !doc || typeof doc.deliverySeq !== "number") return;
          if (doc.deliverySeq <= highWaterSeq) return;
          highWaterSeq = doc.deliverySeq;
          if (streamId) {
            connManager.advanceStreamHighWaterSeq(userId, streamId, highWaterSeq);
          }
          try {
            const liveMsg = connManager.formatSSEMessage("message", doc.deliverySeq, {
              type: "INVALIDATE",
              tags: doc.invalidationTags || [],
              deliverySeq: doc.deliverySeq,
              eventId: doc.eventId,
              eventType: doc.eventType,
              occurredAt: doc.occurredAt,
            });
            controller.enqueue(encoder.encode(liveMsg));
          } catch {
            cleanupStream();
          }
        };

        const pollJournal = async () => {
          if (isClosed) return;
          try {
            const newDocs = await UserDeliveryJournalModel.find({
              userId,
              deliverySeq: { $gt: highWaterSeq },
            })
              .sort({ deliverySeq: 1 })
              .limit(50)
              .lean();
            for (const doc of newDocs) {
              emitJournalDoc(doc);
            }
          } catch {
            // Non-fatal transient poll error
          }
        };

        let changeStreamActive = false;
        if (typeof (UserDeliveryJournalModel as any).watch === "function") {
          try {
            changeStream = (UserDeliveryJournalModel as any).watch(
              [
                {
                  $match: {
                    "fullDocument.userId": userId,
                    operationType: { $in: ["insert", "update", "replace"] },
                  },
                },
              ],
              { fullDocument: "updateLookup" }
            );
            changeStream.on("change", (change: any) => {
              if (change?.fullDocument) {
                emitJournalDoc(change.fullDocument);
              }
            });
            changeStream.on("error", () => {
              if (changeStream && typeof changeStream.close === "function") {
                Promise.resolve(changeStream.close()).catch(() => {});
                changeStream = null;
              }
              if (!isClosed && !journalPollTimer) {
                journalPollTimer = setInterval(pollJournal, 1500);
              }
            });
            changeStreamActive = true;
          } catch {
            changeStreamActive = false;
          }
        }

        // Always keep bounded cursor polling when ChangeStreams aren't active (or at a slower 5s safety interval)
        journalPollTimer = setInterval(pollJournal, changeStreamActive ? 5000 : 1500);

        // 6. Keep-Alive Heartbeat every 15 seconds
        heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            cleanupStream();
          }
        }, 15000);

        // 7. Graceful Serverless Lifecycle Timeout (55s, safely under maxDuration 60s)
        closeTimer = setTimeout(() => {
          try {
            controller.enqueue(encoder.encode(": closing\n\n"));
            controller.close();
          } catch {}
          cleanupStream();
        }, 55000);
      },
      cancel() {
        cleanupStream();
      },
    });

    req.signal.addEventListener("abort", () => {
      cleanupStream();
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
