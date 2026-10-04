/**
 * CognitiveStateEngine.ts
 * Probabilistic Cognitive & Mental State Estimation Engine (Phase 3).
 * 
 * Computes stress, energy, cognitive load, and focus readiness from multi-factor evidence bundles.
 * Enforces Constitutional Rule 8: Probabilistic evidence, confidence, provenance, and freshness.
 * Latency budget: < 10ms.
 */

import { Observation } from "../telemetry/Observation";
import {
  CognitiveStateEstimate,
  CognitiveDimension,
  UserMicroCheckinInput,
  CognitiveProvenanceType,
} from "./contracts/CognitiveStateContracts";
import { IEvidenceProvenance } from "../telemetry/contracts/ObservationEventContracts";

export interface EvaluateCognitiveStateInput {
  userId: string;
  observations: Observation[];
  currentTime?: number;
  recentMicroCheckin?: UserMicroCheckinInput | null;
}

export class CognitiveStateEngine {
  private static instance: CognitiveStateEngine;
  private static readonly VALIDITY_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 Hours TTL [POLICY DEFAULT]
  private static readonly CONFIDENCE_THRESHOLD_CHECKIN = 0.70; // [POLICY DEFAULT]

  static getInstance(): CognitiveStateEngine {
    if (!CognitiveStateEngine.instance) {
      CognitiveStateEngine.instance = new CognitiveStateEngine();
    }
    return CognitiveStateEngine.instance;
  }

  /**
   * Evaluates current cognitive and mental state from available passive observations
   * and optional user micro-checkins.
   */
  public evaluate(input: EvaluateCognitiveStateInput): CognitiveStateEstimate {
    const { userId, observations = [], currentTime = Date.now(), recentMicroCheckin } = input;

    // Filter observations within 24-hour observation lookback window
    const lookback24h = currentTime - 24 * 60 * 60 * 1000;
    const recentObs = observations.filter((o) => o.timestamp >= lookback24h && o.timestamp <= currentTime);

    // 1. Separate evidence by domain
    const sleepObs = recentObs.filter((o) =>
      o.type === "SleepDurationHours" || o.type === "SleepDeprivation" || o.type === "SleepRecoveryScore"
    );
    const scheduleObs = recentObs.filter((o) =>
      o.type === "ScheduleDensity" || o.type === "CalendarFragmentation" || o.type === "DeepWorkWindow"
    );
    const stressObs = recentObs.filter((o) =>
      o.type === "HighPhysiologicalStress" || o.type === "EnergyDeficit"
    );
    const taskObs = recentObs.filter((o) =>
      o.type === "TaskExecutionVelocity" || o.type === "CadenceDrift"
    );

    // Detect distinct observational sources present
    const hasWearableEvidence = sleepObs.length > 0 || stressObs.some((o) => o.ownership?.sourceCollection === "wearable_telemetry");
    const hasCalendarEvidence = scheduleObs.length > 0;
    const hasTaskEvidence = taskObs.length > 0;

    // Domain presence count (0 to 3)
    let domainCount = 0;
    if (hasWearableEvidence) domainCount++;
    if (hasCalendarEvidence) domainCount++;
    if (hasTaskEvidence) domainCount++;

    // Calculate base epistemic confidence
    let baseConfidence = 0.10; // Default when zero passive evidence
    if (domainCount === 3) baseConfidence = 0.90;
    else if (domainCount === 2) baseConfidence = 0.78;
    else if (domainCount === 1) baseConfidence = 0.60;

    // Outlier rejection for wearable sleep data (e.g. watch left on charger reporting >16h sleep)
    let validSleepDuration: number | null = null;
    let sleepRecoveryScore: number | null = null;
    for (const obs of sleepObs) {
      if (obs.type === "SleepDurationHours") {
        if (obs.rawValue >= 1.0 && obs.rawValue <= 16.0) {
          validSleepDuration = obs.rawValue;
        } else {
          // Anomaly detected: discard outlier reading
          baseConfidence = Math.max(0.20, baseConfidence - 0.20);
        }
      } else if (obs.type === "SleepRecoveryScore") {
        sleepRecoveryScore = obs.normalizedValue;
      }
    }

    // Schedule metrics
    const densityObs = scheduleObs.find((o) => o.type === "ScheduleDensity");
    const fragObs = scheduleObs.find((o) => o.type === "CalendarFragmentation");
    const deepWorkObs = scheduleObs.find((o) => o.type === "DeepWorkWindow");

    const scheduleDensity = densityObs ? densityObs.normalizedValue : 0.25;
    const calendarFrag = fragObs ? fragObs.normalizedValue : 0.20;
    const deepWorkCapacity = deepWorkObs ? deepWorkObs.normalizedValue : 0.50;

    // Task velocity metric
    const taskVelocity = taskObs.find((o) => o.type === "TaskExecutionVelocity")?.normalizedValue ?? 0.50;

    // Physiological stress
    const physStress = stressObs.find((o) => o.type === "HighPhysiologicalStress")?.normalizedValue ?? 0.30;

    // --- ESTIMATE COMPUTATIONS ---

    // 1. Cognitive Load
    // High meetings + fragmented schedule + task velocity drive cognitive load
    const rawCognitiveLoad = (scheduleDensity * 0.45) + (calendarFrag * 0.35) + (taskVelocity * 0.20);
    const cognitiveLoadEstimate = Number(Math.min(1.0, Math.max(0.0, rawCognitiveLoad)).toFixed(3));
    const cognitiveLoadFactors = [];
    if (scheduleDensity > 0.5) cognitiveLoadFactors.push("High Meeting Density");
    if (calendarFrag > 0.4) cognitiveLoadFactors.push("Fragmented Schedule");
    if (taskVelocity > 0.7) cognitiveLoadFactors.push("High Task Volume");

    // 2. Stress
    // Blend of physiological telemetry, schedule load, and negative sleep recovery
    const sleepDeficitFactor = validSleepDuration !== null ? Math.max(0.0, (8.0 - validSleepDuration) / 8.0) : 0.3;
    const rawStress = (physStress * 0.45) + (scheduleDensity * 0.30) + (sleepDeficitFactor * 0.25);
    let stressEstimate = Number(Math.min(1.0, Math.max(0.0, rawStress)).toFixed(3));
    const stressFactors = [];
    if (physStress > 0.5) stressFactors.push("Elevated Heart Rate / Strain");
    if (scheduleDensity > 0.5) stressFactors.push("Heavy Schedule");
    if (sleepDeficitFactor > 0.3) stressFactors.push("Sleep Deficit");

    // 3. Energy
    // Rested sleep + recovery score minus fatigue
    let energyBase = 0.5; // Baseline
    if (validSleepDuration !== null) {
      const sleepRatio = Math.min(1.0, validSleepDuration / 8.0);
      const recoveryRatio = sleepRecoveryScore !== null ? sleepRecoveryScore : sleepRatio;
      energyBase = (sleepRatio * 0.6) + (recoveryRatio * 0.4);
    }
    const energyPenalty = (scheduleDensity * 0.2) + (physStress * 0.1);
    let energyEstimate = Number(Math.min(1.0, Math.max(0.0, energyBase - energyPenalty)).toFixed(3));
    const energyFactors = [];
    if (validSleepDuration !== null && validSleepDuration >= 7.0) energyFactors.push("Sufficient Sleep");
    if (validSleepDuration !== null && validSleepDuration < 6.0) energyFactors.push("Short Sleep");
    if (sleepRecoveryScore !== null && sleepRecoveryScore > 0.7) energyFactors.push("High Sleep Quality");

    // 4. Focus Readiness
    // Synergistic composite: Energy + Free Blocks - Cognitive Load - Stress
    const rawFocus = (energyEstimate * 0.45) + (deepWorkCapacity * 0.25) + ((1.0 - cognitiveLoadEstimate) * 0.15) + ((1.0 - stressEstimate) * 0.15);
    const focusReadinessEstimate = Number(Math.min(1.0, Math.max(0.0, rawFocus)).toFixed(3));
    const focusFactors = [];
    if (energyEstimate > 0.65) focusFactors.push("High Energy");
    if (deepWorkCapacity > 0.6) focusFactors.push("Available Deep Work Blocks");
    if (cognitiveLoadEstimate > 0.6) focusFactors.push("Limited by Cognitive Load");

    // Incorporate User Micro-Checkin if active and fresh (< 6 hours old)
    let provenance: CognitiveProvenanceType = "PASSIVE_INFERENCE";
    if (recentMicroCheckin && (currentTime - recentMicroCheckin.timestamp) < 6 * 3600 * 1000) {
      provenance = "HYBRID";
      if (recentMicroCheckin.perceivedEnergy !== undefined) {
        energyEstimate = Number((energyEstimate * 0.3 + recentMicroCheckin.perceivedEnergy * 0.7).toFixed(3));
        energyFactors.push("User Micro-Checkin Calibration");
      }
      if (recentMicroCheckin.perceivedStress !== undefined) {
        stressEstimate = Number((stressEstimate * 0.3 + recentMicroCheckin.perceivedStress * 0.7).toFixed(3));
        stressFactors.push("User Micro-Checkin Calibration");
      }
      // Micro check-in boosts epistemic confidence
      baseConfidence = Math.min(1.0, baseConfidence + 0.20);
    }

    // Assemble evidence provenance list
    const evidenceBundle: IEvidenceProvenance[] = recentObs.map((o) => ({
      source: (o.ownership?.sourceCollection === "calendar_events"
        ? "calendar"
        : o.ownership?.sourceCollection === "wearable_telemetry"
        ? "wearable"
        : o.ownership?.sourceCollection === "tasks"
        ? "tasks"
        : "manual") as any,
      sourceId: o.ownership?.sourceEntityId || o.id,
      subsystem: o.ownership?.originatingSubsystem || "CognitiveStateEngine",
      extractedAt: o.generatedAt,
      fingerprint: o.id,
    }));

    const buildDimension = (est: number, factors: string[]): CognitiveDimension => ({
      estimate: est,
      confidence: Number(baseConfidence.toFixed(2)),
      evidenceBundle,
      primaryFactors: factors,
    });

    const requiresMicroCheckin = baseConfidence < CognitiveStateEngine.CONFIDENCE_THRESHOLD_CHECKIN;

    let checkinPrompt: string | undefined;
    if (requiresMicroCheckin) {
      checkinPrompt = energyEstimate < 0.4
        ? "You might be feeling fatigued today based on available data. How is your energy right now?"
        : "How is your focus capacity feeling today?";
    }

    return {
      userId,
      timestamp: currentTime,
      stress: buildDimension(stressEstimate, stressFactors),
      energy: buildDimension(energyEstimate, energyFactors),
      cognitiveLoad: buildDimension(cognitiveLoadEstimate, cognitiveLoadFactors),
      focusReadiness: buildDimension(focusReadinessEstimate, focusFactors),
      provenance,
      temporalValidity: {
        validFrom: currentTime,
        validUntil: currentTime + CognitiveStateEngine.VALIDITY_WINDOW_MS,
        freshnessTimestamp: currentTime,
      },
      requiresMicroCheckin,
      checkinPrompt,
      disclaimer: "Operational readiness estimate only; not a medical assessment.",
    };
  }
}
