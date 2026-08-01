import { SubsystemName } from "../diagnostics/DiagnosticSnapshot";
import { KernelTraceEngine } from "../diagnostics/KernelTraceEngine";
import { KernelProfiler } from "../diagnostics/KernelProfiler";

export interface MeasureOptions {
  subsystem: SubsystemName;
  inputSummary: string;
  getOutputSummary?: (result: any) => string;
  traceEngine: KernelTraceEngine;
  profiler?: KernelProfiler;
}

/**
 * PerformanceTimer Utility
 * 
 * Centralized, reusable execution latency measurement helper.
 * Measures start/end timestamps and registers trace spans and profile statistics deterministically.
 */
export class PerformanceTimer {
  static async measure<T>(
    options: MeasureOptions,
    fn: () => Promise<T> | T
  ): Promise<T> {
    const {
      subsystem,
      inputSummary,
      getOutputSummary,
      traceEngine,
      profiler = KernelProfiler.getInstance(),
    } = options;

    const startTimestamp = Date.now();
    const result = await fn();
    const durationMs = Date.now() - startTimestamp;

    const outputSummary = getOutputSummary
      ? getOutputSummary(result)
      : typeof result === "object" && result !== null
      ? `Completed ${subsystem}`
      : String(result);

    traceEngine.recordSpan({
      stage: subsystem,
      startTimestamp,
      durationMs,
      inputSummary,
      outputSummary,
    });

    profiler.recordExecution(subsystem, durationMs);

    return result;
  }
}
