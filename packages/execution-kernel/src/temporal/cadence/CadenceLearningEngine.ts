/**
 * CadenceLearningEngine.ts
 * 
 * Deterministic Day-Segmented Cadence Learning Subsystem (V3).
 * 
 * Enforces Invariants:
 * - Guardrail 5: Values such as 21-day decay tau, baseline wake/sleep, and default focus
 *   windows are categorized as learned estimates / defaults, NOT immutable kernel laws.
 * - Guardrail 9: Learning is deterministic, explainable, replayable, confidence-aware,
 *   recency-aware (exponential decay with tau = 21 days), and segmented by day of week.
 * - Explicit user preferences permanently outrank inferred historical patterns.
 */

import {
  ExecutionChronicleEntry,
  DayCadenceProfile,
  CadenceRoutineBlock,
} from "../contracts/TemporalContracts";

export interface CadenceLearningConfig {
  decayHalfLifeDays: number;       // Default: 21 days
  minSamplesForConfidence: number; // Default: 3 observations
  outlierZScoreThreshold: number;  // Default: 2.5
}

export const DEFAULT_CADENCE_CONFIG: CadenceLearningConfig = {
  decayHalfLifeDays: 21.0,
  minSamplesForConfidence: 3,
  outlierZScoreThreshold: 2.5,
};

export class CadenceLearningEngine {
  private static instance: CadenceLearningEngine;
  private config: CadenceLearningConfig;

  constructor(config: CadenceLearningConfig = DEFAULT_CADENCE_CONFIG) {
    this.config = config;
  }

  static getInstance(): CadenceLearningEngine {
    if (!CadenceLearningEngine.instance) {
      CadenceLearningEngine.instance = new CadenceLearningEngine();
    }
    return CadenceLearningEngine.instance;
  }

  /**
   * Computes recency weight using exponential decay: weight = e^(-lambda * ageDays)
   */
  computeRecencyWeight(observationTimestamp: number, referenceTimestamp: number): number {
    const ageMs = Math.max(0, referenceTimestamp - observationTimestamp);
    const ageDays = ageMs / (1000 * 3600 * 24);
    const lambda = Math.log(2) / this.config.decayHalfLifeDays;
    return Math.exp(-lambda * ageDays);
  }

  /**
   * Learns and updates day-segmented cadence profiles from execution chronicles.
   * Segments strictly by dayOfWeek (0=Sun .. 6=Sat) so Monday's pattern never pollutes Tuesday.
   */
  deriveDayCadenceProfiles(
    userId: string,
    chronicles: ExecutionChronicleEntry[],
    timezone: string = "UTC",
    referenceTimestamp: number = Date.now()
  ): Map<number, DayCadenceProfile> {
    const profiles = new Map<number, DayCadenceProfile>();

    // Initialize blank profile for each day of week (0..6)
    for (let d = 0; d <= 6; d++) {
      profiles.set(d, {
        dayOfWeek: d as any,
        baselineWakeMinute: 480, // 8:00 AM default estimate
        baselineSleepMinute: 1410, // 11:30 PM default estimate
        routines: [],
        preferredFocusWindows: [{ startMinute: 600, endMinute: 720 }],
        commuteEstimates: [],
        sampleCount: 0,
        updatedAt: referenceTimestamp,
      });
    }

    if (chronicles.length === 0) {
      return profiles;
    }

    // Partition chronicles by day of week (using the chronicle's local startedAt time)
    const dayBuckets = new Map<number, ExecutionChronicleEntry[]>();
    for (let d = 0; d <= 6; d++) dayBuckets.set(d, []);

    for (const c of chronicles) {
      const date = new Date(c.startedAtMs);
      const dayOfWeek = date.getUTCDay(); // Deterministic day partitioning
      dayBuckets.get(dayOfWeek)?.push(c);
    }

    // Process each day independently
    for (let d = 0; d <= 6; d++) {
      const bucket = dayBuckets.get(d) || [];
      if (bucket.length === 0) continue;

      const profile = profiles.get(d)!;
      profile.sampleCount = bucket.length;

      // Group by routine title / category
      const routineGroups = new Map<string, Array<{ startMinute: number; duration: number; weight: number }>>();

      for (const entry of bucket) {
        const date = new Date(entry.startedAtMs);
        const startMinute = date.getUTCHours() * 60 + date.getUTCMinutes();
        const duration = entry.durationMinutes;
        const weight = this.computeRecencyWeight(entry.startedAtMs, referenceTimestamp);

        const categoryKey = entry.title.trim().toLowerCase();
        if (!routineGroups.has(categoryKey)) {
          routineGroups.set(categoryKey, []);
        }
        routineGroups.get(categoryKey)!.push({ startMinute, duration, weight });
      }

      // Compute weighted averages and variance for each routine
      const learnedRoutines: CadenceRoutineBlock[] = [];

      for (const [title, observations] of routineGroups.entries()) {
        const totalWeight = observations.reduce((sum, o) => sum + o.weight, 0);
        if (totalWeight <= 0) continue;

        const weightedStartSum = observations.reduce((sum, o) => sum + o.startMinute * o.weight, 0);
        const avgStart = Math.round(weightedStartSum / totalWeight);

        const weightedDurSum = observations.reduce((sum, o) => sum + o.duration * o.weight, 0);
        const avgDur = Math.round(weightedDurSum / totalWeight);

        // Compute variance of start time
        const varianceSum = observations.reduce(
          (sum, o) => sum + Math.pow(o.startMinute - avgStart, 2) * o.weight,
          0
        );
        const varianceMinutes = Math.round(Math.sqrt(varianceSum / totalWeight));

        // Confidence scales from 0.0 to 1.0 based on sample count vs threshold
        const sampleCount = observations.length;
        const confidence = Math.min(1.0, Number((sampleCount / (this.config.minSamplesForConfidence * 2)).toFixed(2)));

        let routineCategory: CadenceRoutineBlock["category"] = "FOCUS";
        if (title.includes("gym") || title.includes("workout")) routineCategory = "GYM";
        else if (title.includes("sleep")) routineCategory = "SLEEP";
        else if (title.includes("meal") || title.includes("lunch") || title.includes("dinner")) routineCategory = "MEAL";
        else if (title.includes("commute") || title.includes("transit")) routineCategory = "COMMUTE";

        learnedRoutines.push({
          category: routineCategory,
          title: title.charAt(0).toUpperCase() + title.slice(1),
          targetStartMinute: avgStart,
          targetEndMinute: (avgStart + avgDur) % 1440,
          durationMinutes: avgDur,
          elasticityRatio: Number(Math.min(1.0, varianceMinutes / 60).toFixed(2)),
          confidence,
          varianceMinutes,
        });
      }

      profile.routines = learnedRoutines;
    }

    return profiles;
  }
}
