import { DiagnosticSnapshot, SubsystemDiagnostic } from "./DiagnosticSnapshot";
import { KernelProfiler } from "./KernelProfiler";
import { KernelMetricsRegistry } from "./KernelMetricsRegistry";
import { KernelHealthEngine } from "./KernelHealthEngine";
import { KernelTraceEngine } from "./KernelTraceEngine";
import { KERNEL_CONFIG } from "../shared/KernelConfig";
import { generateId } from "../shared/ids";

/**
 * KernelDiagnosticsEngine Subsystem
 * 
 * SOLE OWNER of runtime kernel diagnostics snapshot generation.
 * Collects metrics, health, execution traces, and performance data from all kernel subsystems.
 */
export class KernelDiagnosticsEngine {
  private static instance: KernelDiagnosticsEngine;

  static getInstance(): KernelDiagnosticsEngine {
    if (!KernelDiagnosticsEngine.instance) {
      KernelDiagnosticsEngine.instance = new KernelDiagnosticsEngine();
    }
    return KernelDiagnosticsEngine.instance;
  }

  generateSnapshot(params: {
    requestId: string;
    totalDurationMs: number;
    traceEngine: KernelTraceEngine;
    stabilityScore?: number | null;
    deadNodeCount?: number;
    blockedNodeCount?: number;
    subsystemDiagnostics?: SubsystemDiagnostic[];
  }): DiagnosticSnapshot {
    const {
      requestId,
      totalDurationMs,
      traceEngine,
      stabilityScore = 100,
      deadNodeCount = 0,
      blockedNodeCount = 0,
      subsystemDiagnostics = [],
    } = params;

    const profiler = KernelProfiler.getInstance();
    const metricsRegistry = KernelMetricsRegistry.getInstance();
    const healthEngine = KernelHealthEngine.getInstance();

    const performanceSummary = profiler.getPerformanceSummary(totalDurationMs);

    const healthSummary = healthEngine.evaluateHealth({
      stabilityScore,
      deadNodeCount,
      blockedNodeCount,
      budgetViolations: performanceSummary.budgetViolations,
    });

    const metricSummary = metricsRegistry.getMetricSummary();
    const executionTrace = traceEngine.getTraceSpans();

    const warnings = [...performanceSummary.budgetViolations, ...healthSummary.warnings];

    const snapshot: DiagnosticSnapshot = {
      snapshotId: generateId("diag"),
      requestId,
      timestamp: Date.now(),
      kernelVersion: KERNEL_CONFIG.VERSION,
      healthSummary,
      performanceSummary,
      metricSummary,
      warnings,
      executionTrace,
      subsystemDiagnostics,
      resourceUsage: {
        memoryHeapUsedBytes: process.memoryUsage ? process.memoryUsage().heapUsed : 0,
        memoryHeapTotalBytes: process.memoryUsage ? process.memoryUsage().heapTotal : 0,
      },
    };

    console.log(
      `${KERNEL_CONFIG.LOG_TAGS.DIAGNOSTICS} Snapshot ${snapshot.snapshotId} generated for Request ${requestId} (${healthSummary.status}, Score: ${healthSummary.score}/100, ${executionTrace.length} spans)`
    );

    return snapshot;
  }
}
