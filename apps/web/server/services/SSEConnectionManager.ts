/**
 * SSEConnectionManager.ts
 * 
 * LifeOS Step 3 V2.2 — Application Delivery Integration
 * Hardened SSE Connection Registry, Governance & Transport Manager.
 * Enforces:
 * - 3 active streams per user process limit
 * - 500 active sockets process-wide capacity limit
 * - 10 reconnects/min per IP rate limiting
 * - Reverse proxy 1024-byte comment flush padding
 * - Slow consumer buffer drop threshold (50 frames)
 * - Safe stream cleanup on socket abort
 */

import { IWireDeliveryFrame } from "@life-os/execution-kernel";

export interface ActiveClientStream {
  streamId: string;
  userId: string;
  clientIp: string;
  controller: ReadableStreamDefaultController;
  seqConn: number;
  unacknowledgedFrames: number;
  connectedAt: Date;
}

export class SSEConnectionManager {
  private static instance: SSEConnectionManager;

  public readonly MAX_STREAMS_PER_USER = 3;
  public readonly MAX_PROCESS_CONNECTIONS = 500;
  public readonly MAX_RECONNECT_RATE_PER_MIN = 10;
  public readonly SLOW_CONSUMER_THRESHOLD = 50;

  private userStreams: Map<string, Map<string, ActiveClientStream>> = new Map();
  private ipRateLimits: Map<string, { count: number; resetAt: number }> = new Map();
  private totalConnections = 0;

  private constructor() {}

  public static getInstance(): SSEConnectionManager {
    if (!SSEConnectionManager.instance) {
      SSEConnectionManager.instance = new SSEConnectionManager();
    }
    return SSEConnectionManager.instance;
  }

  public reset(): void {
    this.userStreams.clear();
    this.ipRateLimits.clear();
    this.totalConnections = 0;
  }

  /**
   * Evaluates client IP rate limit (10 requests per minute).
   */
  public checkRateLimit(clientIp: string): boolean {
    if (!clientIp) return true;
    const now = Date.now();
    const entry = this.ipRateLimits.get(clientIp);

    if (!entry || entry.resetAt <= now) {
      this.ipRateLimits.set(clientIp, { count: 1, resetAt: now + 60000 });
      return true;
    }

    if (entry.count >= this.MAX_RECONNECT_RATE_PER_MIN) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Registers a new SSE client connection under strict governance quotas.
   */
  public registerConnection(
    userId: string,
    clientIp: string,
    controller: ReadableStreamDefaultController
  ): {
    allowed: boolean;
    streamId?: string;
    reason?: string;
    statusCode?: number;
  } {
    // 1. IP Rate Limiting Check
    if (!this.checkRateLimit(clientIp)) {
      return {
        allowed: false,
        reason: "RECONNECTION_RATE_LIMIT_EXCEEDED",
        statusCode: 429,
      };
    }

    // 2. Global Process Capacity Check
    if (this.totalConnections >= this.MAX_PROCESS_CONNECTIONS) {
      return {
        allowed: false,
        reason: "SERVER_CAPACITY_EXCEEDED",
        statusCode: 503,
      };
    }

    // 3. User Concurrency Quota Check
    if (!this.userStreams.has(userId)) {
      this.userStreams.set(userId, new Map());
    }
    const streams = this.userStreams.get(userId)!;

    if (streams.size >= this.MAX_STREAMS_PER_USER) {
      return {
        allowed: false,
        reason: `USER_STREAM_QUOTA_EXCEEDED: maximum ${this.MAX_STREAMS_PER_USER} active streams`,
        statusCode: 429,
      };
    }

    // 4. Register Active Stream
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const clientStream: ActiveClientStream = {
      streamId,
      userId,
      clientIp,
      controller,
      seqConn: 1,
      unacknowledgedFrames: 0,
      connectedAt: new Date(),
    };

    streams.set(streamId, clientStream);
    this.totalConnections++;

    return {
      allowed: true,
      streamId,
    };
  }

  /**
   * Unregisters an SSE client connection on disconnect or abort.
   */
  public unregisterConnection(userId: string, streamId: string): void {
    const streams = this.userStreams.get(userId);
    if (streams && streams.has(streamId)) {
      streams.delete(streamId);
      this.totalConnections = Math.max(0, this.totalConnections - 1);
      if (streams.size === 0) {
        this.userStreams.delete(userId);
      }
    }
  }

  /**
   * Broadcasts an invalidation frame to all active streams for a given user.
   */
  public broadcastToUser(userId: string, frame: IWireDeliveryFrame): number {
    const streams = this.userStreams.get(userId);
    if (!streams || streams.size === 0) {
      return 0;
    }

    const encoder = new TextEncoder();
    let sentCount = 0;
    const streamsToClose: string[] = [];

    for (const [sId, stream] of streams.entries()) {
      if (stream.unacknowledgedFrames >= this.SLOW_CONSUMER_THRESHOLD) {
        // Slow consumer backpressure threshold exceeded: schedule termination
        streamsToClose.push(sId);
        continue;
      }

      try {
        const payload = JSON.stringify({
          type: "INVALIDATE",
          tags: frame.invalidationTags,
          deliverySeq: frame.deliverySeq,
          seqConn: stream.seqConn++,
          eventId: frame.eventId,
          eventType: frame.eventType,
          occurredAt: frame.occurredAt,
        });

        const sseMessage = `id: ${frame.deliverySeq}\nevent: message\ndata: ${payload}\n\n`;
        stream.controller.enqueue(encoder.encode(sseMessage));
        stream.unacknowledgedFrames++;
        sentCount++;
      } catch {
        streamsToClose.push(sId);
      }
    }

    for (const sId of streamsToClose) {
      try {
        const target = streams.get(sId);
        target?.controller.close();
      } catch {}
      this.unregisterConnection(userId, sId);
    }

    return sentCount;
  }

  /**
   * Generates the 1024-byte comment flush padding to bypass reverse proxy buffering.
   */
  public getInitialFlushPadding(): string {
    const base = ": LifeOS SSE Stream Connected; Reverse Proxy Buffer Flush Padding ";
    const targetLength = 1024;
    const repeatCount = Math.max(0, targetLength - base.length - 2);
    return `${base}${".".repeat(repeatCount)}\n\n`;
  }

  /**
   * Formats a structured SSE message.
   */
  public formatSSEMessage(event: string, id: string | number, data: any): string {
    return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  public getTotalConnections(): number {
    return this.totalConnections;
  }

  public getUserStreamCount(userId: string): number {
    return this.userStreams.get(userId)?.size ?? 0;
  }
}

