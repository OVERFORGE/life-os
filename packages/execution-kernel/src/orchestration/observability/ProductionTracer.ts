/**
 * Production Observability & Traceability System
 * 
 * Invariant: Allows complete engineering reconstruction of decisions through correlated IDs:
 * requestId, executionId, actionIds, eventIds, memorySnapshotId, jobId, latency, failureCode
 * WITHOUT logging sensitive private user messages or chain-of-thought (Requirement 8).
 */

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
  timestamp: number;
}

export class ProductionTracer {
  private static instance: ProductionTracer;
  private traces: Map<string, ProductionTraceContext> = new Map();

  static getInstance(): ProductionTracer {
    if (!ProductionTracer.instance) {
      ProductionTracer.instance = new ProductionTracer();
    }
    return ProductionTracer.instance;
  }

  clear(): void {
    this.traces.clear();
  }

  recordTrace(trace: ProductionTraceContext): ProductionTraceContext {
    this.traces.set(trace.executionId, { ...trace });
    
    // Emit structured correlation log (Sanitized of sensitive private CoT and raw messages)
    const structuredLog = JSON.stringify({
      logType: "PRODUCTION_AUDIT_TRACE",
      requestId: trace.requestId,
      executionId: trace.executionId,
      userId: trace.userId,
      memorySnapshotId: trace.memorySnapshotId || "none",
      actionCount: trace.actionIds.length,
      actionIds: trace.actionIds,
      eventCount: trace.eventIds.length,
      eventIds: trace.eventIds,
      jobId: trace.jobId || "none",
      durationMs: trace.durationMs,
      routingStrategy: trace.routingStrategy,
      terminationReason: trace.terminationReason,
      failureCode: trace.failureCode || "NONE",
      timestamp: trace.timestamp,
    });

    if (process.env.NODE_ENV !== "test" || process.env.LIFEOS_LOG_TRACES === "true") {
      console.log(structuredLog);
    }

    return trace;
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
}
