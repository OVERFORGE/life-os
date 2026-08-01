import { SubsystemName, PerformanceMetricSummary, PerformanceSummary } from "./DiagnosticSnapshot";
import { PerformanceBudgetManager } from "./PerformanceBudgetManager";
import { KERNEL_CONFIG } from "../shared/KernelConfig";

/**
 * KernelProfiler Subsystem
 * 
 * SOLE OWNER of execution latency profiling and statistical analysis.
 * Accumulates subsystem latencies and computes min, max, avg, p95, and p99 metrics over time.
 */
export class KernelProfiler {
  private static instance: KernelProfiler;
  private samples: Map<SubsystemName, number[]> = new Map();

  static getInstance(): KernelProfiler {
    if (!KernelProfiler.instance) {
      KernelProfiler.instance = new KernelProfiler();
    }
    return KernelProfiler.instance;
  }

  recordExecution(subsystem: SubsystemName, durationMs: number): void {
    if (!this.samples.has(subsystem)) {
      this.samples.set(subsystem, []);
    }
    const history = this.samples.get(subsystem)!;
    history.push(durationMs);
    if (history.length > KERNEL_CONFIG.PROFILER_WINDOW_SIZE) {
      history.shift(); // Keep rolling window of samples
    }
  }

  getMetricSummary(subsystem: SubsystemName): PerformanceMetricSummary {
    const history = this.samples.get(subsystem) || [];
    if (history.length === 0) {
      return {
        subsystem,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        executionCount: 0,
        lastExecutionMs: 0,
      };
    }

    const sorted = [...history].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const count = sorted.length;
    const avg = Number((sum / count).toFixed(2));
    const p95Idx = Math.min(count - 1, Math.floor(count * 0.95));
    const p99Idx = Math.min(count - 1, Math.floor(count * 0.99));

    return {
      subsystem,
      minLatencyMs: sorted[0],
      maxLatencyMs: sorted[count - 1],
      avgLatencyMs: avg,
      p95LatencyMs: sorted[p95Idx],
      p99LatencyMs: sorted[p99Idx],
      executionCount: count,
      lastExecutionMs: history[history.length - 1],
    };
  }

  getPerformanceSummary(totalDurationMs: number): PerformanceSummary {
    const budgetManager = PerformanceBudgetManager.getInstance();
    const subsystemMetrics: PerformanceMetricSummary[] = [];
    const budgetViolations: string[] = [];

    const subsystems = KERNEL_CONFIG.SUBSYSTEMS;

    for (const sub of subsystems) {
      const metric = this.getMetricSummary(sub);
      subsystemMetrics.push(metric);

      if (metric.lastExecutionMs > 0) {
        const violation = budgetManager.evaluateDuration(sub, metric.lastExecutionMs);
        if (violation) budgetViolations.push(violation);
      }
    }

    return {
      totalDurationMs,
      subsystemMetrics,
      budgetViolations,
    };
  }
}
