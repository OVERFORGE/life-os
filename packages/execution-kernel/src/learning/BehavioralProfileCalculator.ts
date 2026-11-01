/**
 * BehavioralProfileCalculator.ts
 * 
 * Milestone B — Phase B3: Work Package 2
 * Pure functional mathematical calculation of MECE behavioral metrics.
 * 
 * Strict Invariants:
 * 1. Mutually Exclusive, Collectively Exhaustive commitment partitions: C, S, D, O.
 * 2. Unbiased Task Completion Rate: C / (C + S + D + O).
 * 3. Procrastination Tendency: (D + O) / (C + S + D + O).
 * 4. 21-day exponential decay weighting: w = exp(- (dt / halfLifeMs) * ln(2)).
 * 5. Deterministic bit-for-bit convergence: identical journal inputs yield identical metrics.
 */

export interface RawObservationInput {
  observationId: string;
  source: string;
  category: "EXECUTION" | "PHYSICAL" | "COGNITIVE" | "ROUTINE" | "TEMPORAL";
  type: string;
  causalSequence: number;
  observedAt: Date;
  data: Record<string, any>;
}

export type ConfidenceTier = "LOW" | "MODERATE" | "HIGH";

export interface CalculatedBehavioralMetrics {
  taskCompletionRate: number | null;
  procrastinationTendency: number | null;
  burnoutRiskIndex: number;
  deepWorkConsistency: number;
  totalWeightedFinalizedCommitments: number;
  decayHalfLifeDays: number;
  confidenceTier: ConfidenceTier;
}

export interface RebuildCalculationResult {
  metrics: CalculatedBehavioralMetrics;
  sourceCursors: Record<string, number>;
  recentObservationIds: string[];
}

const HALF_LIFE_DAYS = 21;
const HALF_LIFE_MS = HALF_LIFE_DAYS * 86400 * 1000;
const LN2 = Math.LN2;

/**
 * Calculates exponential time-decay weight for an observation timestamp.
 */
export function calculateDecayWeight(
  observedAt: Date | number | string,
  snapshotTime: Date | number | string = Date.now()
): number {
  const obsMs = typeof observedAt === "number" ? observedAt : new Date(observedAt).getTime();
  const snapMs = typeof snapshotTime === "number" ? snapshotTime : new Date(snapshotTime).getTime();
  const deltaMs = Math.max(0, snapMs - obsMs);
  return Math.exp(-(deltaMs / HALF_LIFE_MS) * LN2);
}

/**
 * Pure calculation of behavioral metrics and cursors from authoritative journal entries.
 */
export function calculateBehavioralMetrics(
  observations: RawObservationInput[],
  snapshotTime: Date = new Date()
): RebuildCalculationResult {
  let weightedCompleted = 0;
  let weightedSkipped = 0;
  let weightedDeferred = 0;
  let weightedOverdue = 0;

  let totalDeepWorkHours = 0;
  let deepWorkDaysCount = 0;
  let stressSum = 0;
  let stressCount = 0;

  const sourceCursors: Record<string, number> = {};
  const recentObservationIds: string[] = [];

  // Sort chronological
  const sorted = [...observations].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()
  );

  for (const obs of sorted) {
    const cursorKey = `${obs.source}:${obs.data?.aggregateId || obs.source}`;
    sourceCursors[cursorKey] = Math.max(sourceCursors[cursorKey] || 0, obs.causalSequence);

    recentObservationIds.push(obs.observationId);
    if (recentObservationIds.length > 50) {
      recentObservationIds.shift(); // FIFO 50 ring buffer
    }

    const weight = calculateDecayWeight(obs.observedAt, snapshotTime);

    // MECE Commitment Partitions
    if (obs.category === "EXECUTION" || obs.type.startsWith("domain.task.")) {
      const status = obs.data?.status || (obs.type === "domain.task.completed" ? "completed" : "pending");
      const isDeferred = obs.data?.isDeferred || obs.data?.rescheduleCount > 0;
      const isOverdue = obs.data?.isOverdue;

      if (status === "completed") {
        weightedCompleted += weight;
      } else if (status === "skipped") {
        weightedSkipped += weight;
      } else if (isDeferred) {
        weightedDeferred += weight;
      } else if (isOverdue) {
        weightedOverdue += weight;
      }
    }

    // Cognitive / Stress telemetry
    if (obs.category === "COGNITIVE" || obs.type === "domain.signal.logged") {
      if (obs.data?.key === "stress" && typeof obs.data?.value === "number") {
        stressSum += obs.data.value * weight;
        stressCount += weight;
      }
      if (obs.data?.key === "deepWorkHours" && typeof obs.data?.value === "number") {
        totalDeepWorkHours += obs.data.value * weight;
        deepWorkDaysCount += weight;
      }
    }
  }

  // Denominator: Omega = C + S + D + O
  const omega = weightedCompleted + weightedSkipped + weightedDeferred + weightedOverdue;

  let taskCompletionRate: number | null = null;
  let procrastinationTendency: number | null = null;

  // Threshold: at least ~1 weighted finalized commitment (allowing small millisecond decay tolerance)
  if (omega >= 0.90) {
    taskCompletionRate = Math.min(1.0, Math.max(0.0, weightedCompleted / omega));
    procrastinationTendency = Math.min(1.0, Math.max(0.0, (weightedDeferred + weightedOverdue) / omega));
  }

  // Burnout risk index (0.0 to 1.0 based on stress and completion pressure)
  let burnoutRiskIndex = 0.0;
  if (stressCount > 0) {
    const avgStress = stressSum / stressCount; // 1-10 scale
    burnoutRiskIndex = Math.min(1.0, Math.max(0.0, (avgStress - 1) / 9));
  }

  // Deep work consistency (0.0 to 1.0 based on avg hours vs 4-hour target)
  let deepWorkConsistency = 0.0;
  if (deepWorkDaysCount > 0) {
    const avgHours = totalDeepWorkHours / deepWorkDaysCount;
    deepWorkConsistency = Math.min(1.0, Math.max(0.0, avgHours / 4.0));
  }

  // Confidence Tier
  let confidenceTier: ConfidenceTier = "LOW";
  if (omega >= 15.0) {
    confidenceTier = "HIGH";
  } else if (omega >= 5.0) {
    confidenceTier = "MODERATE";
  }

  return {
    metrics: {
      taskCompletionRate,
      procrastinationTendency,
      burnoutRiskIndex,
      deepWorkConsistency,
      totalWeightedFinalizedCommitments: Number(omega.toFixed(3)),
      decayHalfLifeDays: HALF_LIFE_DAYS,
      confidenceTier,
    },
    sourceCursors,
    recentObservationIds,
  };
}
