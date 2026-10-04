/**
 * LatencyProfiler.ts
 * High-resolution empirical latency profiler for LifeOS execution paths.
 * Part of Phase 0 Reality Baseline.
 */

export interface IBaselineLatencyMetrics {
  fastPathP50Ms: number;
  fastPathP95Ms: number;
  fastPathP99Ms: number;
  specialistP50Ms: number;
  specialistP95Ms: number;
  specialistP99Ms: number;
  kernelMutationP50Ms: number;
  kernelMutationP95Ms: number;
  kernelMutationP99Ms: number;
  recordedAt: number;
}

export type LatencyCategory = 'fastPath' | 'specialist' | 'kernelMutation';

export class LatencyProfiler {
  private timings: Map<LatencyCategory, number[]> = new Map([
    ['fastPath', []],
    ['specialist', []],
    ['kernelMutation', []],
  ]);

  public startTimer(): () => number {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      return Number(end - start) / 1_000_000; // milliseconds
    };
  }

  public record(category: LatencyCategory, durationMs: number): void {
    const list = this.timings.get(category);
    if (list) {
      list.push(durationMs);
    }
  }

  public async measure<T>(category: LatencyCategory, fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const stop = this.startTimer();
    try {
      const result = await fn();
      const durationMs = stop();
      this.record(category, durationMs);
      return { result, durationMs };
    } catch (error) {
      const durationMs = stop();
      this.record(category, durationMs);
      throw error;
    }
  }

  public computePercentile(category: LatencyCategory, p: number): number {
    const values = this.timings.get(category) ?? [];
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return Math.round(sorted[Math.max(0, Math.min(index, sorted.length - 1))] * 100) / 100;
  }

  public getSummary(): IBaselineLatencyMetrics {
    return {
      fastPathP50Ms: this.computePercentile('fastPath', 50),
      fastPathP95Ms: this.computePercentile('fastPath', 95),
      fastPathP99Ms: this.computePercentile('fastPath', 99),
      specialistP50Ms: this.computePercentile('specialist', 50),
      specialistP95Ms: this.computePercentile('specialist', 95),
      specialistP99Ms: this.computePercentile('specialist', 99),
      kernelMutationP50Ms: this.computePercentile('kernelMutation', 50),
      kernelMutationP95Ms: this.computePercentile('kernelMutation', 95),
      kernelMutationP99Ms: this.computePercentile('kernelMutation', 99),
      recordedAt: Date.now(),
    };
  }

  public reset(): void {
    this.timings.set('fastPath', []);
    this.timings.set('specialist', []);
    this.timings.set('kernelMutation', []);
  }
}
