import { DiagnosticSnapshot } from "../../diagnostics/DiagnosticSnapshot";
import { DiagnosticsDTO } from "../dto/DiagnosticsDTO";

export class DiagnosticsDTOMapper {
  static toDiagnosticsDTO(snapshot: DiagnosticSnapshot): DiagnosticsDTO {
    return {
      schemaVersion: 1,
      snapshotId: snapshot.snapshotId,
      timestamp: snapshot.timestamp,
      health: {
        status: snapshot.healthSummary.status,
        score: snapshot.healthSummary.score,
        evidence: snapshot.healthSummary.evidence,
      },
      performance: {
        totalDurationMs: snapshot.performanceSummary.totalDurationMs,
        subsystemLatencies: snapshot.performanceSummary.subsystemMetrics.map((m) => ({
          subsystem: m.subsystem,
          avgLatencyMs: m.avgLatencyMs,
          p95LatencyMs: m.p95LatencyMs,
          executionCount: m.executionCount,
        })),
        budgetViolations: snapshot.performanceSummary.budgetViolations,
      },
      metrics: {
        totalRequests: snapshot.metricSummary.totalRequests,
        totalRepairs: snapshot.metricSummary.totalRepairs,
        totalPredictions: snapshot.metricSummary.totalPredictions,
        avgStabilityScore: snapshot.metricSummary.avgStabilityScore,
        avgContextSize: snapshot.metricSummary.avgContextSize,
      },
      warnings: snapshot.warnings,
    };
  }
}
