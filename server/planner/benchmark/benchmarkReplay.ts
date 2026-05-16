// ─────────────────────────────────────────────────────────────────────────────
// benchmarkReplay
//
// Measures the performance characteristics of the observability and simulation
// layer under deterministic replay conditions.
//
// METRICS:
//   - eventsProcessedPerSecond
//   - averageReplayStepCostMs
//   - peakMemoryUsageMb (rough JS heap estimate)
//   - topologyDiffAverageCostMs
// ─────────────────────────────────────────────────────────────────────────────

import { simulateExecutionDay } from "../simulation/simulateExecutionDay";
import { replayTrace, collectReplaySteps } from "../observability/replayTrace";
import { diffTopologies } from "../observability/diffTopologies";
import { PlannerEvent } from "../types/PlannerEventTypes";
import { CandidateSchedule } from "../types/ScheduleGraphTypes";
import { PlacementAnalysisContext, SchedulableUnit } from "../types/SchedulingTypes";
import { createTemporalWindow } from "../utils/TemporalWindow";

// ─── Setup Mocks ──────────────────────────────────────────────────────────────

const context: PlacementAnalysisContext = {
  availabilityWindows: [{ window: createTemporalWindow(480, 1000), daysOfWeek: [1], score: 1.0, confidence: 1.0 }],
  peakFocusWindows: [], recoveryWindows: [], recurringConstraints: [],
  sleepWindow: null, chronotype: null, fragmentationScore: 0, dataReliabilityScore: 1.0,
};

function makeUnit(id: string): SchedulableUnit {
  return {
    id, unitType: "chunk", parentTaskId: "task-root",
    estimatedDurationMinutes: 30, minimumChunkSize: 15,
    requiresDeepWork: false, cognitiveLoad: 0.4,
    priorityScore: 3, temporalFlexibility: 0.8, urgency: 0.5,
    hardConstraints: [], softConstraints: [],
  } as any;
}

function makePlacement(taskId: string, start: number, end: number): any {
  return {
    taskId, placementType: "optimal",
    temporalWindow: createTemporalWindow(start, end),
    dayOfWeek: 1, placementScore: 0.9, confidence: 0.9, stabilityScore: 0.9,
    penaltiesApplied: [], boostsApplied: [], blockingReasons: [], reasoning: [],
    metadata: { fragmentationRisk: 0, focusAlignment: 0.8, recoveryConflict: 0, chronotypeAlignment: 0.7, deepWorkScore: 0.3 },
  };
}

// Generate 30 chunks for a heavier schedule
const numChunks = 30;
const units = Array.from({ length: numChunks }, (_, i) => makeUnit(`chunk-${i}`));
const placements = Array.from({ length: numChunks }, (_, i) => makePlacement(`chunk-${i}`, 480 + (i * 30), 480 + ((i + 1) * 30)));

const schedule: CandidateSchedule = {
  scheduleId: "bench-schedule",
  scheduledPlacements: placements.map((p, i) => ({ task: units[i] as any, placement: p })),
  unscheduledTaskIds: [], conflicts: [],
  scheduleScore: 0.85, stabilityScore: 0.85, focusScore: 0.8,
  fragmentationScore: 0.2, recoverySafetyScore: 0.9, coverageRatio: 1.0,
  confidence: 0.9, seedStrategy: "urgency_first",
  penaltiesApplied: [], boostsApplied: [], reasoning: [],
};

// Generate events (interleaved starts, completes, and 3 overruns to trigger repairs)
const events: PlannerEvent[] = [];
for (let i = 0; i < numChunks - 3; i++) {
  events.push({ type: "chunk_started", chunkId: `chunk-${i}`, tick: 480 + (i * 30) });
  if (i % 9 === 0) {
    events.push({ type: "chunk_overran", chunkId: `chunk-${i}`, overrunMinutes: 15, tick: 480 + ((i + 1) * 30) });
  } else {
    events.push({ type: "chunk_completed", chunkId: `chunk-${i}`, actualDurationMinutes: 30, tick: 480 + ((i + 1) * 30) });
  }
}

// ─── Benchmark Runner ─────────────────────────────────────────────────────────

async function runBenchmark() {
  console.log("Generating base simulation trace...");
  const trace = simulateExecutionDay(schedule, units, context, events, { maxRepairCycles: 20 });
  console.log(`Trace generated: ${trace.events.length} events, ${trace.totalRepairCycles} repair cycles.`);

  // Measure memory before
  global.gc?.();
  const memBefore = process.memoryUsage().heapUsed;

  console.log("\nRunning Replay Benchmark...");
  const replayStart = performance.now();
  const steps = collectReplaySteps(trace);
  const replayEnd = performance.now();

  // Measure memory after
  const memAfter = process.memoryUsage().heapUsed;
  const peakMemoryUsageMb = Math.max(0, memAfter - memBefore) / 1024 / 1024;

  const totalReplayTimeMs = replayEnd - replayStart;
  const eventsProcessedPerSecond = (trace.events.length / totalReplayTimeMs) * 1000;
  const averageReplayStepCostMs = totalReplayTimeMs / trace.events.length;

  console.log("\nRunning Topology Diff Benchmark...");
  const diffStart = performance.now();
  let diffCount = 0;
  for (let i = 1; i < steps.length; i++) {
    diffTopologies(steps[i - 1].stateAfter, steps[i].stateAfter);
    diffCount++;
  }
  const diffEnd = performance.now();
  const topologyDiffAverageCostMs = (diffEnd - diffStart) / diffCount;

  console.log("\n=== BENCHMARK RESULTS ===");
  console.log(`Events Processed / sec : ${eventsProcessedPerSecond.toFixed(2)}`);
  console.log(`Average Replay Step    : ${averageReplayStepCostMs.toFixed(3)} ms`);
  console.log(`Average Topology Diff  : ${topologyDiffAverageCostMs.toFixed(3)} ms`);
  console.log(`Peak Memory Usage      : ~${peakMemoryUsageMb.toFixed(2)} MB`);
  
  if (averageReplayStepCostMs > 5.0) {
    console.warn("\nWARNING: Replay step cost is high. Optimization may be needed before multi-day rollout.");
  } else {
    console.log("\nPASS: Performance is within acceptable bounds for single-day operations.");
  }
}

runBenchmark().catch(console.error);
