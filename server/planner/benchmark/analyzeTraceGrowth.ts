// ─────────────────────────────────────────────────────────────────────────────
// analyzeTraceGrowth
//
// Measures trace footprint growth to identify operational limits BEFORE
// multi-day orchestration begins.
//
// METRICS:
//   - snapshot count
//   - event count
//   - total serialized payload size
//   - repair-chain amplification
// ─────────────────────────────────────────────────────────────────────────────

import { simulateExecutionDay } from "../simulation/simulateExecutionDay";
import { PlannerEvent } from "../types/PlannerEventTypes";
import { CandidateSchedule } from "../types/ScheduleGraphTypes";
import { PlacementAnalysisContext, SchedulableUnit } from "../types/SchedulingTypes";
import { createTemporalWindow } from "../utils/TemporalWindow";

// ─── Setup Mocks ──────────────────────────────────────────────────────────────

const context: PlacementAnalysisContext = {
  availabilityWindows: [{ window: createTemporalWindow(480, 1440), daysOfWeek: [1, 2, 3], score: 1.0, confidence: 1.0 }],
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

function makePlacement(taskId: string, start: number, end: number, day: number): any {
  return {
    taskId, placementType: "optimal",
    temporalWindow: createTemporalWindow(start, end),
    dayOfWeek: day, placementScore: 0.9, confidence: 0.9, stabilityScore: 0.9,
    penaltiesApplied: [], boostsApplied: [], blockingReasons: [], reasoning: [],
    metadata: { fragmentationRisk: 0, focusAlignment: 0.8, recoveryConflict: 0, chronotypeAlignment: 0.7, deepWorkScore: 0.3 },
  };
}

// ─── Analysis Runner ─────────────────────────────────────────────────────────

async function runAnalysis(days: number) {
  const numChunks = 30 * days;
  const units = Array.from({ length: numChunks }, (_, i) => makeUnit(`chunk-${i}`));
  const placements = Array.from({ length: numChunks }, (_, i) => {
    const day = Math.floor(i / 30) + 1;
    const offset = i % 30;
    return makePlacement(`chunk-${i}`, 480 + (offset * 30), 480 + ((offset + 1) * 30), day);
  });

  const schedule: CandidateSchedule = {
    scheduleId: `bench-schedule-${days}d`,
    scheduledPlacements: placements.map((p, i) => ({ task: units[i] as any, placement: p })),
    unscheduledTaskIds: [], conflicts: [],
    scheduleScore: 0.85, stabilityScore: 0.85, focusScore: 0.8,
    fragmentationScore: 0.2, recoverySafetyScore: 0.9, coverageRatio: 1.0,
    confidence: 0.9, seedStrategy: "urgency_first",
    penaltiesApplied: [], boostsApplied: [], reasoning: [],
  };

  const events: PlannerEvent[] = [];
  for (let i = 0; i < numChunks - 5; i++) {
    const day = Math.floor(i / 30) + 1;
    const offset = i % 30;
    events.push({ type: "chunk_started", chunkId: `chunk-${i}`, tick: 480 + (offset * 30) + (day * 1440) });
    if (i % 8 === 0) {
      events.push({ type: "chunk_overran", chunkId: `chunk-${i}`, overrunMinutes: 10, tick: 480 + ((offset + 1) * 30) + (day * 1440) });
    } else {
      events.push({ type: "chunk_completed", chunkId: `chunk-${i}`, actualDurationMinutes: 30, tick: 480 + ((offset + 1) * 30) + (day * 1440) });
    }
  }

  const startMs = performance.now();
  const trace = simulateExecutionDay(schedule, units, context, events, { maxRepairCycles: Math.max(20, days * 10), snapshotStrategy: "repair_boundaries" });
  const endMs = performance.now();

  const serializedSizeMb = Buffer.byteLength(JSON.stringify(trace), 'utf8') / 1024 / 1024;

  console.log(`\n=== ${days}-Day Horizon Analysis ===`);
  console.log(`Events Logged      : ${trace.events.length}`);
  console.log(`Repair Cycles      : ${trace.totalRepairCycles}`);
  console.log(`Snapshots Retained : ${trace.snapshots.length}`);
  console.log(`Simulation Time    : ${(endMs - startMs).toFixed(2)} ms`);
  console.log(`Payload Size       : ${serializedSizeMb.toFixed(3)} MB`);
}

async function main() {
  console.log("Starting Trace Growth Analysis...\n");
  await runAnalysis(1);
  await runAnalysis(3);
  await runAnalysis(7);
}

main().catch(console.error);
