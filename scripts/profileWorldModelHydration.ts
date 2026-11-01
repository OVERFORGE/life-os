/**
 * profileWorldModelHydration.ts
 *
 * Performance profiler for Phase B1 Canonical Personal World Model:
 * Measures cold hydration vs warm cache hit latencies across 100 iterations.
 * Computes P50, P95, P99 percentile distributions.
 */

import { WorldModelBridge } from "../packages/execution-kernel/src/worldv2/WorldModelBridge";
import { createFrozenObservation, generateDeterministicObservationId } from "../packages/execution-kernel/src/telemetry/Observation";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return Number(sorted[Math.max(0, Math.min(sorted.length - 1, index))].toFixed(3));
}

async function runProfiler() {
  console.log("============================================================");
  console.log("LIFEOS PHASE B1: WORLD MODEL HYDRATION LATENCY PROFILER");
  console.log("============================================================");

  const bridge = WorldModelBridge.getInstance();
  const iterations = 100;

  // Warmup run
  const warmupUser = "profiler_warmup_user";
  await bridge.getProjection(warmupUser);

  // 1. Profile Cold Hydrations (Forced cache misses with unique users)
  console.log(`\n[1] Profiling ${iterations} Cold Hydrations...`);
  const coldLatencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const userId = `profiler_cold_user_${i}_${Date.now()}`;
    const start = process.hrtime.bigint();
    await bridge.getProjection(userId, { forceRefresh: true });
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    coldLatencies.push(durationMs);
  }

  // 2. Profile Warm Cache Hits
  console.log(`[2] Profiling ${iterations} Warm Cache Hits...`);
  const warmLatencies: number[] = [];
  const warmUserId = `profiler_warm_user_${Date.now()}`;
  // Seed the cache
  await bridge.getProjection(warmUserId);

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    await bridge.getProjection(warmUserId);
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    warmLatencies.push(durationMs);
  }

  // Percentiles
  const coldP50 = percentile(coldLatencies, 50);
  const coldP95 = percentile(coldLatencies, 95);
  const coldP99 = percentile(coldLatencies, 99);

  const warmP50 = percentile(warmLatencies, 50);
  const warmP95 = percentile(warmLatencies, 95);
  const warmP99 = percentile(warmLatencies, 99);

  console.log("\n============================================================");
  console.log("BENCHMARK RESULTS SUMMARY:");
  console.log("------------------------------------------------------------");
  console.log(`Cold Hydration Latency (Target: P50 < 15ms, P95 < 50ms):`);
  console.log(`  P50: ${coldP50} ms`);
  console.log(`  P95: ${coldP95} ms`);
  console.log(`  P99: ${coldP99} ms`);
  console.log(`Warm Cache Hit Latency (Target: P50 < 0.5ms, P95 < 2ms):`);
  console.log(`  P50: ${warmP50} ms`);
  console.log(`  P95: ${warmP95} ms`);
  console.log(`  P99: ${warmP99} ms`);
  console.log("============================================================\n");
}

runProfiler().catch((err) => {
  console.error("Profiler failed:", err);
  process.exit(1);
});

