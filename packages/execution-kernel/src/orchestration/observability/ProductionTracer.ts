/**
 * Production Observability & Traceability System
 * 
 * Invariant: Allows complete engineering reconstruction of decisions through correlated IDs:
 * requestId, executionId, actionIds, eventIds, memorySnapshotId, jobId, latency, failureCode
 * WITHOUT logging sensitive private user messages or chain-of-thought (Requirement 8).
 */

import mongoose from "mongoose";
import { getLastProviderTelemetry } from "../../shared/modelRegistry";

export interface ProductionTraceContext {
  requestId: string;
  executionId: string;
  userId: string;
  memorySnapshotId?: string;
  actionIds: string[];
  eventIds: string[];
  jobId?: string;
  durationMs: number;
  routingStrategy: string;
  terminationReason: string;
  failureCode?: string;
  requestedModel?: string;
  resolvedModel?: string;
  attemptedModels?: string[];
  providerFallbackCount?: number;
  quotaDegraded?: boolean;
  dbReadyState?: number;
  dbName?: string;
  worldModelInjected?: boolean;
  timestamp: number;
}

const MAX_RECENT_TRACES = 100;

export class ProductionTracer {
  private static instance: ProductionTracer;
  private traces: Map<string, ProductionTraceContext> = new Map();
  private recentOrder: string[] = [];

  static getInstance(): ProductionTracer {
    if (!ProductionTracer.instance) {
      ProductionTracer.instance = new ProductionTracer();
    }
    return ProductionTracer.instance;
  }

  clear(): void {
    this.traces.clear();
    this.recentOrder = [];
  }

  recordTrace(trace: ProductionTraceContext): ProductionTraceContext {
    const providerTelemetry = getLastProviderTelemetry();
    const dbReadyState =
      trace.dbReadyState ?? (typeof mongoose.connection?.readyState === "number" ? mongoose.connection.readyState : 0);
    const rawDbName = trace.dbName ?? mongoose.connection?.db?.databaseName;
    const sanitizedDbName = rawDbName ? String(rawDbName).split(/[/?@]/).pop() : undefined;

    const enrichedTrace: ProductionTraceContext = {
      ...trace,
      requestedModel: trace.requestedModel ?? providerTelemetry?.requestedModel,
      resolvedModel: trace.resolvedModel ?? providerTelemetry?.resolvedModel,
      attemptedModels: trace.attemptedModels ?? providerTelemetry?.attemptedModels,
      providerFallbackCount: trace.providerFallbackCount ?? providerTelemetry?.providerFallbackCount ?? 0,
      quotaDegraded: trace.quotaDegraded ?? providerTelemetry?.quotaDegraded ?? false,
      dbReadyState,
      dbName: sanitizedDbName,
      worldModelInjected: trace.worldModelInjected ?? true,
    };

    if (!this.traces.has(enrichedTrace.executionId)) {
      this.recentOrder.push(enrichedTrace.executionId);
      while (this.recentOrder.length > MAX_RECENT_TRACES) {
        const oldestId = this.recentOrder.shift();
        if (oldestId) this.traces.delete(oldestId);
      }
    }
    this.traces.set(enrichedTrace.executionId, enrichedTrace);
    
    // Emit structured correlation log (Sanitized of sensitive private CoT and raw messages)
    const structuredLog = JSON.stringify({
      logType: "PRODUCTION_AUDIT_TRACE",
      requestId: enrichedTrace.requestId,
      executionId: enrichedTrace.executionId,
      userId: enrichedTrace.userId,
      memorySnapshotId: enrichedTrace.memorySnapshotId || "none",
      actionCount: enrichedTrace.actionIds.length,
      actionIds: enrichedTrace.actionIds,
      eventCount: enrichedTrace.eventIds.length,
      eventIds: enrichedTrace.eventIds,
      jobId: enrichedTrace.jobId || "none",
      durationMs: enrichedTrace.durationMs,
      routingStrategy: enrichedTrace.routingStrategy,
      terminationReason: enrichedTrace.terminationReason,
      failureCode: enrichedTrace.failureCode || "NONE",
      resolvedModel: enrichedTrace.resolvedModel || "none",
      providerFallbackCount: enrichedTrace.providerFallbackCount || 0,
      quotaDegraded: Boolean(enrichedTrace.quotaDegraded),
      dbReadyState: enrichedTrace.dbReadyState,
      dbName: enrichedTrace.dbName || "disconnected",
      worldModelInjected: Boolean(enrichedTrace.worldModelInjected),
      timestamp: enrichedTrace.timestamp,
    });

    if (process.env.NODE_ENV !== "test" || process.env.LIFEOS_LOG_TRACES === "true") {
      console.log(structuredLog);
    }

    return enrichedTrace;
  }

  getTrace(executionId: string): ProductionTraceContext | undefined {
    return this.traces.get(executionId);
  }

  getTraceByRequestId(requestId: string): ProductionTraceContext | undefined {
    for (const trace of this.traces.values()) {
      if (trace.requestId === requestId) return trace;
    }
    return undefined;
  }

  getRecentTraces(limit: number = 20): ProductionTraceContext[] {
    const ids = this.recentOrder.slice(-Math.max(1, limit));
    return ids.map((id) => this.traces.get(id)).filter((t): t is ProductionTraceContext => Boolean(t));
  }
}
