import { MetricSummary } from "./DiagnosticSnapshot";

/**
 * KernelMetricsRegistry Subsystem
 * 
 * SOLE OWNER of kernel-wide cumulative metric counters and snapshots.
 */
export class KernelMetricsRegistry {
  private static instance: KernelMetricsRegistry;

  private totalRequests = 0;
  private totalRepairs = 0;
  private totalPredictions = 0;
  private totalWorldSnapshots = 0;
  private stabilityScores: number[] = [];
  private contextSizes: number[] = [];
  private graphNodeCounts: number[] = [];
  private learningConfidences: number[] = [];
  private checkpointCount = 0;
  private replayCount = 0;

  static getInstance(): KernelMetricsRegistry {
    if (!KernelMetricsRegistry.instance) {
      KernelMetricsRegistry.instance = new KernelMetricsRegistry();
    }
    return KernelMetricsRegistry.instance;
  }

  incrementRequests(): void {
    this.totalRequests++;
  }

  incrementRepairs(count: number = 1): void {
    this.totalRepairs += count;
  }

  incrementPredictions(count: number = 1): void {
    this.totalPredictions += count;
  }

  incrementWorldSnapshots(): void {
    this.totalWorldSnapshots++;
  }

  incrementCheckpoints(): void {
    this.checkpointCount++;
  }

  incrementReplays(): void {
    this.replayCount++;
  }

  recordStability(score: number): void {
    this.stabilityScores.push(score);
  }

  recordContextSize(size: number): void {
    this.contextSizes.push(size);
  }

  recordGraphNodeCount(count: number): void {
    this.graphNodeCounts.push(count);
  }

  recordLearningConfidence(confidence: number): void {
    this.learningConfidences.push(confidence);
  }

  getMetricSummary(): MetricSummary {
    const avg = (arr: number[]) => (arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0);

    return {
      totalRequests: this.totalRequests,
      totalRepairs: this.totalRepairs,
      totalPredictions: this.totalPredictions,
      totalWorldSnapshots: this.totalWorldSnapshots,
      avgStabilityScore: avg(this.stabilityScores),
      avgContextSize: avg(this.contextSizes),
      avgGraphNodeCount: avg(this.graphNodeCounts),
      avgLearningConfidence: avg(this.learningConfidences),
      checkpointCount: this.checkpointCount,
      replayCount: this.replayCount,
    };
  }
}
