import { BehaviorPattern, ConfidenceTier } from "./BehaviorPattern";
import { BehaviorPatternLibrary } from "./BehaviorPatternLibrary";
import { BehavioralProfile, UserBehavioralProfile } from "./BehaviorProfile";
import { LearningSignal } from "./LearningSignal";
import { HabitLearningEngine } from "./HabitLearningEngine";
import { Observation } from "../telemetry/Observation";
import { ExecutionOutcome } from "../reflection/ExecutionOutcome";

export interface LearningEngineOutput {
  /**
   * The active behavioral profile at the time of learning engine execution.
   * Nullable: when no profile has been populated yet (fresh user, no observations ingested).
   * Consumers must guard for null before reading profile fields.
   */
  activeProfile: UserBehavioralProfile | null;
  learnedPatterns: BehaviorPattern[];
  emittedSignals: LearningSignal[];
}

/**
 * LearningEngine Subsystem
 *
 * SOLE OWNER of observing telemetry observations / execution history and deriving
 * deterministic behavioral learning signals.
 *
 * ARCHITECTURAL RULES:
 * - Consumes canonical Observation[] array directly (with fallback for legacy ExecutionOutcome[]).
 * - 100% deterministic, replayable, explainable, incremental, causal.
 * - NO AI, NO Neural Networks, NO Embeddings, NO Randomness.
 * - NEVER executes tasks directly — only emits LearningSignals for downstream components.
 *
 * Phase D Calibration (D-10 & D-11):
 *
 * D-10: Exponential decay recency weighting replaces fixed 72-hour window.
 *   Decay formula: weight(obs) = e^(-λ × ageDays)
 *   STRESS_DECAY_LAMBDA = ln(2) / STRESS_HALF_LIFE_DAYS ≈ 0.2310 per day
 *   (Half-life = 3 days: observations 3 days old carry 50% of their weight)
 *   Signal fires when weightedStressCount >= STRESS_SIGNAL_THRESHOLD (1.80)
 *   Signal confidence = min(0.95, 0.50 + 0.20 × weightedStressCount)
 *
 * D-11: Removed arbitrary +0.10 fabrication from executionConsistency.
 *   executionConsistency is now set to avgVelocity directly (honest proxy until
 *   a dedicated ScheduleAdherence observation type is introduced).
 */
export class LearningEngine {
  private static instance: LearningEngine;

  // D-10: Exponential decay constants for stress signal recency weighting
  private static readonly STRESS_HALF_LIFE_DAYS  = 3.0;
  private static readonly STRESS_DECAY_LAMBDA    = Math.log(2) / LearningEngine.STRESS_HALF_LIFE_DAYS;
  private static readonly STRESS_SIGNAL_THRESHOLD = 1.80;  // Equivalent to ~2 fresh observations
  private static readonly MS_PER_DAY             = 86_400_000;

  static getInstance(): LearningEngine {
    if (!LearningEngine.instance) {
      LearningEngine.instance = new LearningEngine();
    }
    return LearningEngine.instance;
  }

  processObservations(
    inputs: Observation[] | ExecutionOutcome[],
    generationTimestamp?: number
  ): LearningEngineOutput {
    console.log(`🧠 [LEARNING_ENGINE] Processing ${inputs.length} input(s) for behavioral learning...`);

    const patternLibrary = BehaviorPatternLibrary.getInstance();
    const profileEngine  = BehavioralProfile.getInstance();

    // Check if inputs are Observation[] or ExecutionOutcome[]
    const observations = inputs.filter((i): i is Observation => "schemaVersion" in i);
    const outcomes     = inputs.filter((i): i is ExecutionOutcome => "outcomeId" in i);

    if (observations.length > 0) {
      const taskVelocityObs = observations.filter((o) => o.type === "TaskExecutionVelocity");
      if (taskVelocityObs.length > 0) {
        const avgVelocity = taskVelocityObs.reduce((sum, o) => sum + o.normalizedValue, 0) / taskVelocityObs.length;
        profileEngine.updateProfile({
          taskCompletionRate:    Number(avgVelocity.toFixed(2)),
          // D-11: Removed fabricated +0.10 offset — executionConsistency is set to avgVelocity
          // until a dedicated ScheduleAdherence observation type is available.
          executionConsistency:  Number(avgVelocity.toFixed(2)),
        });
      }
    }

    if (outcomes.length > 0) {
      HabitLearningEngine.getInstance().observeExecutionOutcomes(outcomes);
    }

    // D-10: Exponential decay recency weighting for stress signal detection
    const emittedSignals: LearningSignal[] = [];
    const stressObs = observations.filter((o) => o.type === "HighPhysiologicalStress");

    // Use generationTimestamp from KernelSnapshotMetadata for deterministic age calculation.
    // If not provided (legacy call), fall back to latest observation timestamp.
    const refTimestamp = generationTimestamp
      ?? (observations.length > 0 ? Math.max(...observations.map((o) => o.timestamp)) : 0);

    // Compute exponential decay weighted stress sum
    const weightedStressCount = stressObs
      .filter((o) => o.normalizedValue > 0.70)
      .reduce((sum, o) => {
        const ageDays = (refTimestamp - o.timestamp) / LearningEngine.MS_PER_DAY;
        const weight  = Math.exp(-LearningEngine.STRESS_DECAY_LAMBDA * Math.max(0, ageDays));
        return sum + weight;
      }, 0);

    if (weightedStressCount >= LearningEngine.STRESS_SIGNAL_THRESHOLD) {
      // D-10: Evidence-proportional confidence: min(0.95, 0.50 + 0.20 × weightedSum)
      const signalConfidenceScore = Number(Math.min(0.95, 0.50 + 0.20 * weightedStressCount).toFixed(2));
      const signalUserId = observations[0]?.userId || "default";
      emittedSignals.push({
        // Cleanup D-2: signalId is now deterministic AND unique across snapshots.
        // Format: sig-{signalType}-{userId}-{generationTimestamp}
        // - signalType ensures IDs differ across signal categories.
        // - userId scopes the signal to the user.
        // - generationTimestamp makes each KernelSnapshot generation produce a unique ID.
        // Identical inputs still produce identical IDs (replay-safe).
        signalId: `sig-IncreaseBreakFrequency-${signalUserId}-${refTimestamp}`,
        type: "IncreaseBreakFrequency",
        title: "High Stress Recovery Signal",
        message: `Recency-weighted stress count ${weightedStressCount.toFixed(2)} exceeds threshold ${LearningEngine.STRESS_SIGNAL_THRESHOLD} (exponential decay half-life: ${LearningEngine.STRESS_HALF_LIFE_DAYS} days).`,
        confidence: "high" as ConfidenceTier,
        confidenceScore: signalConfidenceScore,
        evidenceCount: stressObs.length,
        sourcePatternId: "pat-stress-recovery-v1",
        // D-10: Use generationTimestamp as signal timestamp for determinism
        createdAt: refTimestamp,
      });
    }

    const allPatterns  = patternLibrary.getAllPatterns();
    const activeProfile = profileEngine.getProfile();

    return Object.freeze({
      activeProfile,
      learnedPatterns: allPatterns,
      emittedSignals,
    });
  }
}
