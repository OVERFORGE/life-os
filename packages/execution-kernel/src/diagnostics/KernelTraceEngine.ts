import { SubsystemName, TraceSpan } from "./DiagnosticSnapshot";

/**
 * KernelTraceEngine Subsystem
 * 
 * SOLE OWNER of request execution timeline tracing.
 * Records precise start/end timestamps, input/output summaries, and warnings for every pipeline span.
 */
export class KernelTraceEngine {
  private spans: TraceSpan[] = [];

  recordSpan(params: {
    stage: SubsystemName;
    startTimestamp: number;
    durationMs: number;
    inputSummary: string;
    outputSummary: string;
    diagnosticMessages?: string[];
    warnings?: string[];
  }): TraceSpan {
    const span: TraceSpan = {
      stage: params.stage,
      timestamp: params.startTimestamp,
      durationMs: params.durationMs,
      inputSummary: params.inputSummary,
      outputSummary: params.outputSummary,
      diagnosticMessages: params.diagnosticMessages || [],
      warnings: params.warnings || [],
    };

    this.spans.push(span);
    return span;
  }

  getTraceSpans(): TraceSpan[] {
    return [...this.spans];
  }
}
