import mongoose from "mongoose";
import { ExecutionTraceRecordModel } from "../../../../../apps/web/server/db/models/ExecutionTraceRecordModel";
import { ActiveTraceContext } from "./TraceContext";
import { sanitizeTracePayload } from "./TracePrivacy";

export interface FinalizeTraceInput {
  ctx: ActiveTraceContext;
  status: "COMPLETED" | "AWAITING_CONFIRMATION" | "AWAITING_CLARIFICATION" | "FAILED";
  routingStrategy?: string;
  terminationReason?: string;
  userMessage?: string;
  finalResponse?: string;
  finalFrontendPayload?: any;
  endedAtMs?: number;
}

/**
 * TracePersistenceService
 *
 * Non-blocking, fail-open persistence layer for ExecutionTraceRecord.
 * Preserves a bounded in-memory ring buffer fallback when MongoDB is offline.
 */
export class TracePersistenceService {
  private static instance: TracePersistenceService;
  private recentInMemory: any[] = [];
  private readonly MAX_IN_MEMORY = 100;

  static getInstance(): TracePersistenceService {
    if (!TracePersistenceService.instance) {
      TracePersistenceService.instance = new TracePersistenceService();
    }
    return TracePersistenceService.instance;
  }

  getRetentionDays(): number {
    const parsed = Number(process.env.LIFEOS_TRACE_RETENTION_DAYS || 14);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
  }

  getInMemoryTraces(): any[] {
    return [...this.recentInMemory];
  }

  async persistTrace(input: FinalizeTraceInput): Promise<void> {
    const { ctx } = input;
    const endedAtMs = input.endedAtMs ?? Date.now();
    const durationMs = Math.max(0, endedAtMs - ctx.startedAtMs);
    const retentionDays = this.getRetentionDays();
    const retentionExpiresAt = new Date(endedAtMs + retentionDays * 86400_000);

    const docPayload = {
      traceId: ctx.traceId,
      parentTraceId: ctx.parentTraceId,
      requestId: ctx.requestId,
      executionId: ctx.executionId,
      conversationId: ctx.conversationId,
      userId: ctx.userId,
      surface: ctx.surface,
      status: input.status,
      routingStrategy: input.routingStrategy,
      terminationReason: input.terminationReason,
      startedAt: new Date(ctx.startedAtMs),
      endedAt: new Date(endedAtMs),
      durationMs,
      userMessagePreview: input.userMessage
        ? String(sanitizeTracePayload(input.userMessage)).slice(0, 500)
        : undefined,
      finalResponsePreview: input.finalResponse
        ? String(sanitizeTracePayload(input.finalResponse)).slice(0, 1000)
        : undefined,
      finalFrontendPayload:
        input.finalFrontendPayload !== undefined
          ? sanitizeTracePayload(input.finalFrontendPayload)
          : undefined,
      steps: ctx.steps,
      llmCalls: ctx.llmCalls,
      kernelActionIds: ctx.kernelActionIds,
      outboxEventIds: ctx.outboxEventIds,
      langsmithRunId: ctx.langsmithRunId,
      langsmithUrl: ctx.langsmithUrl,
      retentionExpiresAt,
    };

    this.recentInMemory.unshift(docPayload);
    if (this.recentInMemory.length > this.MAX_IN_MEMORY) {
      this.recentInMemory.length = this.MAX_IN_MEMORY;
    }

    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        await ExecutionTraceRecordModel.findOneAndUpdate(
          { traceId: ctx.traceId },
          { $set: docPayload },
          { upsert: true, returnDocument: "after" }
        );
      } catch (err) {
        if (process.env.NODE_ENV !== "test") {
          console.warn("[TRACE_PERSISTENCE] Non-blocking trace write failed:", err);
        }
      }
    }
  }
}
