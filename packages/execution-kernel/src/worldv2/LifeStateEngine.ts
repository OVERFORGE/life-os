import { ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";
import { RepairDiagnostics } from "../kernel/AdaptiveRepairEngine";
import { UserBehavioralProfile } from "../learning/BehaviorProfile";
import { LearningSignal } from "../learning/LearningSignal";
import { Observation, ObservationType } from "../telemetry/Observation";
import { TelemetryQuality } from "../telemetry/TelemetryQuality";
import { LIFE_STATE_WEIGHTS } from "./LifeStateWeights";
import { ContextModeRecord } from "../context/ContextModeContracts";

export type LifeState =
  | "Burnout"
  | "Recovery"
  | "HighMomentum"
  | "FocusedExecution"
  | "Stagnant"
  | "Stable";

export interface MentalState {
  stressLevel: number | null;     // 0.0 to 1.0 (null if unobserved)
  energyLevel: number | null;     // 0.0 to 1.0 (null if unobserved)
  sleepDebtHours: number | null;  // Accumulated hours (null if unobserved)
  focusIndex: number | null;      // 0.0 to 1.0 (null if unobserved)
}

export interface EngineEvidence {
  metric: string;
  value: number | string;
  weight: number;
  reason: string;
  observationIds: string[];
  confidenceContribution: number;
  candidateStatesInfluenced?: LifeState[];
}

export interface LifeStateDiagnostics {
  observationsConsumed: number;
  missingObservationTypes: ObservationType[];
  candidateScores: Record<LifeState, number>;
  selectedState: LifeState;
  telemetryConfidence: number;
  finalConfidence: number;
  physiologyBreakdown: {
    stressContribution: number | null;
    energyContribution: number | null;
    sleepContribution: number | null;
  };
  executionBreakdown: {
    velocityContribution: number | null;
    habitDecayContribution: number | null;
  };
  confidenceBreakdown: {
    baseConfidence: number;
    telemetryQualityPenalty: number;
    missingTelemetryPenalty: number;
    sparsityPenalty: number;
    finalConfidence: number;
  };
}

export interface LifeStateResult {
  algorithmVersion: "2.0.0";
  state: LifeState;
  stabilityScore: number;         // 0 to 100
  physiologicalScore: number | null; // 0 to 100 (null if insufficient telemetry)
  executionScore: number | null;     // 0 to 100 (null if insufficient telemetry)
  mentalState: MentalState;
  confidence: number;             // 0.0 to 1.0 (Attenuated by TelemetryQuality & missing data)
  structuredEvidence: EngineEvidence[];
  evidence: string[];             // String representations for backward compatibility
  explanation: string;
  diagnostics: LifeStateDiagnostics;
}

export interface LifeStateInput {
  graphSnapshot?: ExecutionGraphSnapshot | null;
  repairDiagnostics?: RepairDiagnostics | null;
  profile?: UserBehavioralProfile | null;
  learningSignals?: LearningSignal[];
  observations?: Observation[];
  telemetryQuality?: TelemetryQuality | null;
  stabilityScore?: number | null;
  contextMode?: ContextModeRecord | null;
}

/**
 * Deterministic Candidate Tie-Breaking Priority Policy
 * 
 * When two candidate states produce identical mathematical scores, tie-breaking
 * resolves deterministically according to this canonical risk-prioritized order:
 * 1. Burnout (Highest risk - immediate intervention)
 * 2. Recovery (Physiological restoration)
 * 3. HighMomentum (Peak performance state)
 * 4. FocusedExecution (High throughput state)
 * 5. Stable (Balanced steady-state routine)
 * 6. Stagnant (Lowest priority fallback)
 */
export const STATE_TIE_BREAKING_PRIORITY: LifeState[] = Object.freeze([
  "Burnout",
  "Recovery",
  "HighMomentum",
  "FocusedExecution",
  "Stable",
  "Stagnant",
]) as LifeState[];

/**
 * LifeStateEngine V2.1 Subsystem (Constitutional Clean Baseline)
 * 
 * SOLE CONSTITUTIONAL OWNER of macro human state inference inside LifeOS Kernel V1.
 * 
 * Key V2.1 Features:
 * - Zero fabricated telemetry fallbacks (computes presence-normalized scores for available metrics).
 * - Deterministic candidate tie-breaking policy (STATE_TIE_BREAKING_PRIORITY).
 * - Strongly typed ObservationType[] for missing observation tracking.
 * - Comprehensive diagnostic score & confidence breakdown objects.
 * - Enriched EngineEvidence with candidateStatesInfluenced metadata.
 * - Pure functional execution: 100% Deterministic, Replayable, Deeply Frozen outputs.
 */
export class LifeStateEngine {
  private static instance: LifeStateEngine;

  static getInstance(): LifeStateEngine {
    if (!LifeStateEngine.instance) {
      LifeStateEngine.instance = new LifeStateEngine();
    }
    return LifeStateEngine.instance;
  }

  evaluate(input: LifeStateInput): LifeStateResult {
    const {
      graphSnapshot,
      profile,
      observations = [],
      telemetryQuality,
      contextMode,
    } = input;

    const structuredEvidence: EngineEvidence[] = [];
    const missingObservationTypes: ObservationType[] = [];

    if (contextMode && contextMode.isActive && contextMode.mode !== "standard") {
      structuredEvidence.push({
        metric: "ContextMode",
        value: contextMode.mode,
        weight: 0.30,
        reason: `Active operational season is ${contextMode.mode} ("${contextMode.title}")`,
        observationIds: [],
        confidenceContribution: 0.15,
        candidateStatesInfluenced: ["Burnout", "Recovery", "FocusedExecution", "Stagnant", "Stable"],
      });
    }

    // 1. Ingest Observations (Zero Fabricated Telemetry Defaults)
    const stressObs = observations.filter((o) => o.type === "HighPhysiologicalStress");
    const energyObs = observations.filter((o) => o.type === "EnergyDeficit");
    const sleepObs = observations.filter((o) => o.type === "SleepDeprivation");
    const velocityObs = observations.filter((o) => o.type === "TaskExecutionVelocity");
    const habitObs = observations.filter((o) => o.type === "HabitDecay");

    let stressLevel: number | null = null;
    let energyLevel: number | null = null;
    let sleepDeprivation: number | null = null;
    let sleepDebtHours: number | null = null;
    let velocityRatio: number | null = null;
    let habitDecayRatio: number | null = null;

    // Physiological Observations Extraction
    if (stressObs.length > 0) {
      stressLevel = Number((stressObs.reduce((sum, o) => sum + o.normalizedValue, 0) / stressObs.length).toFixed(2));
      structuredEvidence.push({
        metric: "PhysiologicalStress",
        value: stressLevel,
        weight: LIFE_STATE_WEIGHTS.PHYSIOLOGICAL.STRESS_WEIGHT,
        reason: `Physiological stress level observed at ${(stressLevel * 100).toFixed(0)}%`,
        observationIds: stressObs.map((o) => o.id),
        confidenceContribution: 1.0,
        candidateStatesInfluenced: ["Burnout", "Recovery", "HighMomentum", "Stagnant"],
      });
    } else {
      missingObservationTypes.push("HighPhysiologicalStress");
    }

    if (energyObs.length > 0) {
      const deficit = energyObs.reduce((sum, o) => sum + o.normalizedValue, 0) / energyObs.length;
      energyLevel = Number((1.0 - deficit).toFixed(2));
      structuredEvidence.push({
        metric: "EnergyLevel",
        value: energyLevel,
        weight: LIFE_STATE_WEIGHTS.PHYSIOLOGICAL.ENERGY_WEIGHT,
        reason: `Energy reserve level observed at ${(energyLevel * 100).toFixed(0)}%`,
        observationIds: energyObs.map((o) => o.id),
        confidenceContribution: 1.0,
        candidateStatesInfluenced: ["Burnout", "HighMomentum", "Stable"],
      });
    } else {
      missingObservationTypes.push("EnergyDeficit");
    }

    if (sleepObs.length > 0) {
      sleepDeprivation = sleepObs.reduce((sum, o) => sum + o.normalizedValue, 0) / sleepObs.length;
      sleepDebtHours = Number((sleepDeprivation * 8.0).toFixed(1));
      structuredEvidence.push({
        metric: "SleepDebt",
        value: `${sleepDebtHours}h`,
        weight: LIFE_STATE_WEIGHTS.PHYSIOLOGICAL.SLEEP_WEIGHT,
        reason: `Accumulated sleep debt observed at ${sleepDebtHours} hours`,
        observationIds: sleepObs.map((o) => o.id),
        confidenceContribution: 1.0,
        candidateStatesInfluenced: ["Burnout", "Recovery"],
      });
    } else {
      missingObservationTypes.push("SleepDeprivation");
    }

    // Execution Observations Extraction
    if (velocityObs.length > 0) {
      velocityRatio = velocityObs[0].normalizedValue;
      structuredEvidence.push({
        metric: "ExecutionVelocity",
        value: velocityRatio,
        weight: LIFE_STATE_WEIGHTS.EXECUTION.VELOCITY_WEIGHT,
        reason: `Task execution velocity observed at ${(velocityRatio * 100).toFixed(0)}%`,
        observationIds: velocityObs.map((o) => o.id),
        confidenceContribution: 1.0,
        candidateStatesInfluenced: ["HighMomentum", "FocusedExecution", "Stagnant"],
      });
    } else if (profile?.taskCompletionRate !== undefined) {
      velocityRatio = profile.taskCompletionRate;
      structuredEvidence.push({
        metric: "BehavioralProfileCompletionRate",
        value: velocityRatio,
        weight: 0.30,
        reason: `Task completion rate loaded from behavioral profile at ${(velocityRatio * 100).toFixed(0)}%`,
        observationIds: [],
        confidenceContribution: 0.70,
        candidateStatesInfluenced: ["HighMomentum", "Stagnant"],
      });
    } else {
      missingObservationTypes.push("TaskExecutionVelocity");
    }

    if (habitObs.length > 0) {
      habitDecayRatio = habitObs.reduce((sum, o) => sum + o.normalizedValue, 0) / habitObs.length;
      structuredEvidence.push({
        metric: "HabitDecay",
        value: habitDecayRatio,
        weight: LIFE_STATE_WEIGHTS.EXECUTION.HABIT_DECAY_WEIGHT,
        reason: `Habit decay magnitude observed at ${(habitDecayRatio * 100).toFixed(0)}%`,
        observationIds: habitObs.map((o) => o.id),
        confidenceContribution: 1.0,
        candidateStatesInfluenced: ["HighMomentum", "Stable"],
      });
    } else {
      missingObservationTypes.push("HabitDecay");
    }

    // Record missing telemetry evidence
    if (missingObservationTypes.length > 0) {
      structuredEvidence.push({
        metric: "MissingTelemetry",
        value: missingObservationTypes.length,
        weight: 0.0,
        reason: `Missing ${missingObservationTypes.length} telemetry type(s): ${missingObservationTypes.join(", ")}`,
        observationIds: [],
        confidenceContribution: -0.10 * missingObservationTypes.length,
      });
    }

    // 2. Compute Presence-Normalized Mathematical Scores (Without inventing numbers)
    let physiologicalScore: number | null = null;
    let physioStressContrib: number | null = null;
    let physioEnergyContrib: number | null = null;
    let physioSleepContrib: number | null = null;

    let physioTotalWeight = 0;
    let physioWeightedSum = 0;

    if (stressLevel !== null) {
      physioTotalWeight += LIFE_STATE_WEIGHTS.PHYSIOLOGICAL.STRESS_WEIGHT;
      physioStressContrib = Number((LIFE_STATE_WEIGHTS.PHYSIOLOGICAL.STRESS_WEIGHT * (1.0 - stressLevel)).toFixed(4));
      physioWeightedSum += physioStressContrib;
    }
    if (energyLevel !== null) {
      physioTotalWeight += LIFE_STATE_WEIGHTS.PHYSIOLOGICAL.ENERGY_WEIGHT;
      physioEnergyContrib = Number((LIFE_STATE_WEIGHTS.PHYSIOLOGICAL.ENERGY_WEIGHT * energyLevel).toFixed(4));
      physioWeightedSum += physioEnergyContrib;
    }
    if (sleepDeprivation !== null) {
      physioTotalWeight += LIFE_STATE_WEIGHTS.PHYSIOLOGICAL.SLEEP_WEIGHT;
      physioSleepContrib = Number((LIFE_STATE_WEIGHTS.PHYSIOLOGICAL.SLEEP_WEIGHT * (1.0 - sleepDeprivation)).toFixed(4));
      physioWeightedSum += physioSleepContrib;
    }

    if (physioTotalWeight > 0) {
      physiologicalScore = Math.round(100 * (physioWeightedSum / physioTotalWeight));
    }

    let executionScore: number | null = null;
    let execVelocityContrib: number | null = null;
    let execHabitContrib: number | null = null;
    let execTotalWeight = 0;
    let execWeightedSum = 0;

    if (velocityRatio !== null) {
      execTotalWeight += LIFE_STATE_WEIGHTS.EXECUTION.VELOCITY_WEIGHT;
      execVelocityContrib = Number((LIFE_STATE_WEIGHTS.EXECUTION.VELOCITY_WEIGHT * velocityRatio).toFixed(4));
      execWeightedSum += execVelocityContrib;
    }
    if (habitDecayRatio !== null) {
      execTotalWeight += LIFE_STATE_WEIGHTS.EXECUTION.HABIT_DECAY_WEIGHT;
      execHabitContrib = Number((LIFE_STATE_WEIGHTS.EXECUTION.HABIT_DECAY_WEIGHT * (1.0 - habitDecayRatio)).toFixed(4));
      execWeightedSum += execHabitContrib;
    }

    if (execTotalWeight > 0) {
      executionScore = Math.round(100 * (execWeightedSum / execTotalWeight));
    }

    const pScore = physiologicalScore ?? 50;
    const eScore = executionScore ?? 50;
    const stabilityScore = Math.round(
      LIFE_STATE_WEIGHTS.STABILITY.PHYSIO_WEIGHT * pScore +
      LIFE_STATE_WEIGHTS.STABILITY.EXECUTION_WEIGHT * eScore
    );

    // DAG Blockage Computation
    const nodeCount = graphSnapshot?.nodeCount || 0;
    const blockedCount = graphSnapshot?.blockedNodes.length || 0;
    const blockedRatio = nodeCount > 0 ? blockedCount / nodeCount : 0.0;

    // 3. Mathematical Candidate Scoring Matrix (Presence-Normalized Features)
    const sVal = stressLevel ?? 0.0;
    const eVal = energyLevel ?? 1.0;
    const slVal = sleepDeprivation ?? 0.0;
    const vVal = velocityRatio ?? 0.50;

    /**
     * Candidate Scoring Formulations (Phase D Calibration)
     *
     * D-2: Recovery uses eScoreForRecovery (null → 50 neutral) to avoid silent
     *      fabrication of maximum Low-Execution contribution when eScore is null.
     *
     * D-5: Stagnant score is multiplied by a coverage discount derived from the
     *      count of observed (non-null) features. Prevents missing telemetry from
     *      being misread as behavioral evidence of stagnation.
     *      coverageDiscount = min(1.0, availableFeatureCount/4 + 0.25)
     *
     * D-6: FocusedExecution is gated by physiologicalScore. A degraded physiology
     *      (pScore < 60) suppresses the FocusedExecution candidate score proportionally.
     *      physiologicalGate = pScore !== null ? min(1.0, pScore / 60) : 1.0
     */

    // D-2: Null-safe eScore for Recovery scoring (null → conservative neutral 50)
    const eScoreForRecovery = executionScore !== null ? executionScore : 50;

    // D-5: Stagnant coverage discount — count of available (non-null) telemetry features.
    // Five primary telemetry dimensions are tracked:
    //   • stressLevel      (physiological — STRESS_WEIGHT: 0.40)
    //   • energyLevel      (physiological — ENERGY_WEIGHT: 0.35)
    //   • sleepDeprivation (physiological — SLEEP_WEIGHT: 0.25)
    //   • velocityRatio    (execution     — VELOCITY_WEIGHT: 0.60)
    //   • habitDecayRatio  (execution     — HABIT_DECAY_WEIGHT: 0.40)
    //
    // habitDecayRatio is included because it is a first-class execution signal with
    // its own weight (0.40) in the execution sub-score. Excluding it would undercount
    // available evidence when only velocity is observed (velocityRatio present but
    // habitDecayRatio absent), producing an artificially low coverage discount.
    const availableFeatureCount = [
      stressLevel, energyLevel, sleepDeprivation, velocityRatio, habitDecayRatio
    ].filter((v) => v !== null).length;
    const coverageDiscount = Math.min(1.0, availableFeatureCount / 5 + 0.20);

    // D-6: FocusedExecution physiological gate
    const physiologicalGate = physiologicalScore !== null
      ? Math.min(1.0, physiologicalScore / LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.FOCUSED_EXECUTION.PHYSIO_GATE_THRESHOLD)
      : 1.0;

    const candidateScores: Record<LifeState, number> = {
      Burnout: Number((
        LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.BURNOUT.STRESS_WEIGHT * sVal +
        LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.BURNOUT.ENERGY_DEFICIT_WEIGHT * (1.0 - eVal) +
        LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.BURNOUT.SLEEP_DEFICIT_WEIGHT * slVal
      ).toFixed(4)),

      // D-2: Uses eScoreForRecovery instead of raw eScore (null-safe)
      Recovery: Number((
        LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.RECOVERY.LOW_STRESS_WEIGHT * (1.0 - sVal) +
        LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.RECOVERY.ADEQUATE_SLEEP_WEIGHT * (1.0 - slVal) +
        LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.RECOVERY.LOW_EXECUTION_WEIGHT * (1.0 - (eScoreForRecovery / 100))
      ).toFixed(4)),

      HighMomentum: Number((
        LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.HIGH_MOMENTUM.VELOCITY_WEIGHT * vVal +
        LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.HIGH_MOMENTUM.EXECUTION_SCORE_WEIGHT * ((executionScore ?? 50) / 100) +
        LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.HIGH_MOMENTUM.STRESS_CONTROL_WEIGHT * (1.0 - sVal)
      ).toFixed(4)),

      // D-6: Gated by physiological health — suppressed when physiology is degraded
      FocusedExecution: Number((
        (
          LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.FOCUSED_EXECUTION.VELOCITY_WEIGHT * vVal +
          LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.FOCUSED_EXECUTION.LOW_BLOCKAGE_WEIGHT * (1.0 - blockedRatio)
        ) * physiologicalGate
      ).toFixed(4)),

      // D-5: Multiplied by coverage discount to prevent sparse-telemetry Stagnant inflation
      Stagnant: Number((
        (
          LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.STAGNANT.LOW_VELOCITY_WEIGHT * (1.0 - vVal) +
          LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.STAGNANT.LOW_STRESS_WEIGHT * (1.0 - sVal)
        ) * coverageDiscount
      ).toFixed(4)),

      Stable: Number((
        LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.STABLE.BALANCED_PHYSIO_WEIGHT * ((physiologicalScore ?? 50) / 100) +
        LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.STABLE.BALANCED_EXECUTION_WEIGHT * ((executionScore ?? 50) / 100)
      ).toFixed(4)),
    };

    // 3.5 Context Mode Multiplier Masks (Seasons of Life Calibration)
    if (contextMode && contextMode.isActive) {
      const mode = contextMode.mode;
      const config = contextMode.config;

      if (mode === "sprint") {
        // High execution season: Boost FocusedExecution & HighMomentum
        candidateScores.FocusedExecution = Number((candidateScores.FocusedExecution * 1.20).toFixed(4));
        candidateScores.HighMomentum = Number((candidateScores.HighMomentum * 1.15).toFixed(4));
        // Stagnant is suppressed because user is in high-velocity focus
        candidateScores.Stagnant = Number((candidateScores.Stagnant * 0.40).toFixed(4));
        // Burnout alarm suppression unless sleep debt breaches minSleepProtectionHours floor
        const sleepDebtBreached = sleepDebtHours !== null && sleepDebtHours > (8.0 - (config?.minSleepProtectionHours ?? 5.5) + 1.0);
        if (config?.suppressBurnoutAlarms && !sleepDebtBreached) {
          candidateScores.Burnout = Number((candidateScores.Burnout * (1.0 / (config?.stressToleranceMultiplier || 1.4))).toFixed(4));
        }
      } else if (mode === "sanctuary") {
        // Deliberate restorative sanctuary: Zero velocity expected.
        // Stagnant candidate score is suppressed entirely (0 tasks is intentional rest, not apathy)
        candidateScores.Stagnant = Number((candidateScores.Stagnant * 0.05).toFixed(4));
        // Recovery candidate score is boosted
        candidateScores.Recovery = Number((candidateScores.Recovery * 1.35).toFixed(4));
        // Burnout alarm is dampened and converted to recovery focus if sleep debt is stabilizing
        if (config?.suppressBurnoutAlarms && (sleepDeprivation === null || sleepDeprivation < 0.60)) {
          candidateScores.Burnout = Number((candidateScores.Burnout * 0.60).toFixed(4));
        }
      } else if (mode === "sabbatical") {
        // Deliberate sabbatical: Habits frozen without decay, zero velocity expected
        candidateScores.Stagnant = Number((candidateScores.Stagnant * 0.05).toFixed(4));
        // Stable and Recovery are boosted baseline states
        candidateScores.Stable = Number((candidateScores.Stable * 1.25).toFixed(4));
        candidateScores.Recovery = Number((candidateScores.Recovery * 1.20).toFixed(4));
        if (config?.suppressBurnoutAlarms) {
          candidateScores.Burnout = Number((candidateScores.Burnout * 0.70).toFixed(4));
        }
      }
    }

    // 4. Deterministic Candidate Selection & Tie-Breaking
    let selectedState: LifeState = "Stable";
    let highestScore = -1;

    // Iterate through priority list to ensure deterministic tie-breaking
    for (const candidate of STATE_TIE_BREAKING_PRIORITY) {
      const scoreVal = candidateScores[candidate];
      if (scoreVal > highestScore) {
        highestScore = scoreVal;
        selectedState = candidate;
      }
    }

    // 5. Compute Attenuated Final Confidence & Confidence Breakdown
    const baseConfidence = LIFE_STATE_WEIGHTS.CONFIDENCE.BASE_CONFIDENCE;
    const qualityConfidence = telemetryQuality?.overallConfidence ?? 1.0;
    const isSparse = telemetryQuality?.defects?.isSparse ?? false;

    const telemetryQualityPenalty = Number(((1.0 - qualityConfidence) * baseConfidence).toFixed(4));
    const missingTelemetryPenalty = Number((missingObservationTypes.length * LIFE_STATE_WEIGHTS.CONFIDENCE.MISSING_TELEMETRY_PENALTY_PER_TYPE).toFixed(4));
    const sparsityPenalty = isSparse ? LIFE_STATE_WEIGHTS.CONFIDENCE.SPARSITY_PENALTY : 0.0;

    const finalConfidence = Number(Math.max(
      LIFE_STATE_WEIGHTS.CONFIDENCE.MIN_CONFIDENCE,
      baseConfidence - telemetryQualityPenalty - missingTelemetryPenalty - sparsityPenalty
    ).toFixed(2));

    // 6. Evidence-Driven Explanation Derivation
    const topEvidence = structuredEvidence.slice(0, 3).map((e) => e.reason);
    const explanation = topEvidence.length > 0
      ? `LifeState [${selectedState}] resolved with candidate score ${(highestScore * 100).toFixed(0)}%. ${topEvidence.join("; ")}.`
      : `LifeState [${selectedState}] resolved based on steady-state routine baseline parameters.`;

    const focusIndex = (stressLevel !== null && sleepDeprivation !== null)
      ? Number(Math.min(1.0, Math.max(0.0, 1.0 - (stressLevel * 0.5 + sleepDeprivation * 0.5))).toFixed(2))
      : null;

    const mentalState: MentalState = Object.freeze({
      stressLevel,
      energyLevel,
      sleepDebtHours,
      focusIndex,
    });

    const diagnostics: LifeStateDiagnostics = Object.freeze({
      observationsConsumed: observations.length,
      missingObservationTypes: Object.freeze(missingObservationTypes) as unknown as ObservationType[],
      candidateScores: Object.freeze(candidateScores),
      selectedState,
      telemetryConfidence: qualityConfidence,
      finalConfidence,
      physiologyBreakdown: Object.freeze({
        stressContribution: physioStressContrib,
        energyContribution: physioEnergyContrib,
        sleepContribution: physioSleepContrib,
      }),
      executionBreakdown: Object.freeze({
        velocityContribution: execVelocityContrib,
        habitDecayContribution: execHabitContrib,
      }),
      confidenceBreakdown: Object.freeze({
        baseConfidence,
        telemetryQualityPenalty,
        missingTelemetryPenalty,
        sparsityPenalty,
        finalConfidence,
      }),
    });

    const evidenceStrings = structuredEvidence.map((e) => e.reason);

    return Object.freeze({
      algorithmVersion: "2.0.0",
      state: selectedState,
      stabilityScore,
      physiologicalScore,
      executionScore,
      mentalState,
      confidence: finalConfidence,
      structuredEvidence: Object.freeze(structuredEvidence) as unknown as EngineEvidence[],
      evidence: Object.freeze(evidenceStrings) as unknown as string[],
      explanation,
      diagnostics,
    });
  }
}
