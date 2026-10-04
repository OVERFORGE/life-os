/**
 * CrossDomainIntelligenceEngine.ts
 * Cross-Domain Intelligence & Causal State Reasoning Engine (Phase 6).
 * 
 * Synthesizes evidence across Health, Calendar, Cognition, Tasks, Goals, and Relationships.
 * Strictly distinguishes correlation from causal evidence.
 * Latency budget: < 15ms.
 */

import {
  CrossDomainInsight,
  CrossDomainFactor,
  CrossDomainEvaluationInput,
} from "./contracts/CrossDomainContracts";
import { Observation } from "../telemetry/Observation";

export class CrossDomainIntelligenceEngine {
  private static instance: CrossDomainIntelligenceEngine;
  private static readonly MIN_TENSION_SURFACE_THRESHOLD = 0.40; // [POLICY DEFAULT]
  private static readonly MAX_ACTIVE_INSIGHTS = 3; // [POLICY DEFAULT]
  private static readonly VALIDITY_TTL_MS = 12 * 60 * 60 * 1000; // 12 Hours TTL [POLICY DEFAULT]

  static getInstance(): CrossDomainIntelligenceEngine {
    if (!CrossDomainIntelligenceEngine.instance) {
      CrossDomainIntelligenceEngine.instance = new CrossDomainIntelligenceEngine();
    }
    return CrossDomainIntelligenceEngine.instance;
  }

  /**
   * Evaluates multi-domain operational tensions from structured indicators or observations.
   */
  public evaluate(input: CrossDomainEvaluationInput, observations: Observation[] = []): CrossDomainInsight[] {
    const {
      userId,
      currentTime = Date.now(),
      goalPressureScore = 0.3,
      trainingStrainScore = 0.2,
      activeCommitmentsCount = 0,
    } = input;

    // Extract metrics from observations if not explicitly passed
    const sleepObs = observations.find((o) => o.type === "SleepDurationHours");
    const densityObs = observations.find((o) => o.type === "ScheduleDensity");
    const fragObs = observations.find((o) => o.type === "CalendarFragmentation");
    const deepWorkObs = observations.find((o) => o.type === "DeepWorkWindow");
    const taskVelocityObs = observations.find((o) => o.type === "TaskExecutionVelocity");

    const sleepHours = input.sleepHours ?? (sleepObs ? Number(sleepObs.rawValue) : 7.0);
    const scheduleDensity = input.scheduleDensity ?? (densityObs ? Number(densityObs.normalizedValue) : 0.25);
    const calendarFrag = input.calendarFragmentation ?? (fragObs ? Number(fragObs.normalizedValue) : 0.20);
    const deepWorkHours = input.deepWorkHours ?? (deepWorkObs ? Number(deepWorkObs.rawValue) : 4.0);
    const taskVelocity = input.taskVelocity ?? (taskVelocityObs ? Number(taskVelocityObs.normalizedValue) : 0.50);

    const cognitiveLoad = input.cognitiveLoadEstimate ?? Number(((scheduleDensity * 0.5) + (calendarFrag * 0.3) + (taskVelocity * 0.2)).toFixed(2));
    const stress = input.stressEstimate ?? Number(((scheduleDensity * 0.4) + (Math.max(0, 8.0 - sleepHours) / 8.0 * 0.6)).toFixed(2));
    const energy = input.energyEstimate ?? Number((Math.min(1.0, sleepHours / 8.0) * 0.8).toFixed(2));

    const candidateInsights: CrossDomainInsight[] = [];

    // --- HYPOTHESIS 1: Cognitive Load & Sleep Deficit Depletion ---
    if ((scheduleDensity > 0.45 || cognitiveLoad > 0.55) && (sleepHours < 6.5 || energy < 0.45)) {
      const tension = Number(
        (Math.min(1.0, (scheduleDensity * 0.4) + ((8.0 - Math.min(8.0, sleepHours)) / 8.0 * 0.4) + (cognitiveLoad * 0.2))).toFixed(2)
      );

      const factors: CrossDomainFactor[] = [
        {
          domain: "calendar",
          metric: "ScheduleDensity",
          observedValue: `${(scheduleDensity * 100).toFixed(0)}%`,
          baselineValue: "30%",
          epistemicStatus: "ASSOCIATION",
        },
        {
          domain: "health",
          metric: "SleepDurationHours",
          observedValue: `${sleepHours}h`,
          baselineValue: "8.0h",
          epistemicStatus: "EVIDENCE_SUPPORTED_HYPOTHESIS",
        },
        {
          domain: "cognition",
          metric: "EstimatedCognitiveLoad",
          observedValue: cognitiveLoad,
          baselineValue: 0.35,
          epistemicStatus: "ASSOCIATION",
        },
      ];

      candidateInsights.push({
        insightId: `insight-overload-${userId}-${currentTime}`,
        title: "Cognitive Load & Energy Depletion Risk",
        description: "Heavy schedule density is associated with elevated cognitive fatigue given recent sleep deficit.",
        contributingFactors: factors,
        tensionScore: tension,
        causalConfidence: 0.85,
        recommendedActionURN: "urn:lifeos:action:protect_afternoon_focus",
        proposedParameters: { bufferDurationMinutes: 45 },
        temporalValidity: {
          validFrom: currentTime,
          validUntil: currentTime + CrossDomainIntelligenceEngine.VALIDITY_TTL_MS,
          freshnessTimestamp: currentTime,
        },
      });
    }

    // --- HYPOTHESIS 2: Meeting Fragmentation Constraining High-Pressure Goals ---
    if ((calendarFrag > 0.35 || deepWorkHours < 2.5) && goalPressureScore > 0.50) {
      const tension = Number(
        (Math.min(1.0, (calendarFrag * 0.5) + (goalPressureScore * 0.5))).toFixed(2)
      );

      const factors: CrossDomainFactor[] = [
        {
          domain: "calendar",
          metric: "CalendarFragmentation",
          observedValue: `${(calendarFrag * 100).toFixed(0)}%`,
          baselineValue: "20%",
          epistemicStatus: "CORRELATION",
        },
        {
          domain: "calendar",
          metric: "DeepWorkWindowHours",
          observedValue: `${deepWorkHours}h`,
          baselineValue: "4.0h",
          epistemicStatus: "ASSOCIATION",
        },
        {
          domain: "goals",
          metric: "GoalPressureScore",
          observedValue: goalPressureScore,
          baselineValue: 0.30,
          epistemicStatus: "EVIDENCE_SUPPORTED_HYPOTHESIS",
        },
      ];

      candidateInsights.push({
        insightId: `insight-goal-bottleneck-${userId}-${currentTime}`,
        title: "Goal Execution Bottleneck",
        description: "Fragmented meeting blocks appear to be constraining contiguous focus required for active high-pressure goals.",
        contributingFactors: factors,
        tensionScore: tension,
        causalConfidence: 0.80,
        recommendedActionURN: "urn:lifeos:action:consolidate_calendar_blocks",
        proposedParameters: { targetBlockHours: 3 },
        temporalValidity: {
          validFrom: currentTime,
          validUntil: currentTime + CrossDomainIntelligenceEngine.VALIDITY_TTL_MS,
          freshnessTimestamp: currentTime,
        },
      });
    }

    // --- HYPOTHESIS 3: Physical Training Strain Coinciding With Mental Workload ---
    if (trainingStrainScore > 0.50 && (cognitiveLoad > 0.55 || stress > 0.60)) {
      const tension = Number(
        (Math.min(1.0, (trainingStrainScore * 0.5) + (cognitiveLoad * 0.5))).toFixed(2)
      );

      const factors: CrossDomainFactor[] = [
        {
          domain: "health",
          metric: "TrainingStrainScore",
          observedValue: trainingStrainScore,
          baselineValue: 0.25,
          epistemicStatus: "EVIDENCE_SUPPORTED_HYPOTHESIS",
        },
        {
          domain: "cognition",
          metric: "EstimatedCognitiveLoad",
          observedValue: cognitiveLoad,
          baselineValue: 0.35,
          epistemicStatus: "ASSOCIATION",
        },
      ];

      candidateInsights.push({
        insightId: `insight-physical-workload-${userId}-${currentTime}`,
        title: "Systemic Recovery & Workload Tension",
        description: "High physical training strain is coinciding with elevated mental workload, which is likely dampening focus capacity.",
        contributingFactors: factors,
        tensionScore: tension,
        causalConfidence: 0.78,
        recommendedActionURN: "urn:lifeos:action:defer_non_critical_tasks",
        proposedParameters: { priorityFilter: "p3_and_lower" },
        temporalValidity: {
          validFrom: currentTime,
          validUntil: currentTime + CrossDomainIntelligenceEngine.VALIDITY_TTL_MS,
          freshnessTimestamp: currentTime,
        },
      });
    }

    // --- HYPOTHESIS 4: Active Commitments & Collaborator Network Attention ---
    if (activeCommitmentsCount >= 2) {
      candidateInsights.push({
        insightId: `insight-commitments-${userId}-${currentTime}`,
        title: "Collaborator Commitments Requiring Attention",
        description: `You have ${activeCommitmentsCount} active commitments with key contacts in your network directory.`,
        contributingFactors: [
          {
            domain: "relationships",
            metric: "ActiveCommitmentsCount",
            observedValue: activeCommitmentsCount,
            baselineValue: 0,
            epistemicStatus: "EVIDENCE_SUPPORTED_HYPOTHESIS",
          },
        ],
        tensionScore: 0.50,
        causalConfidence: 0.90,
        recommendedActionURN: "urn:lifeos:action:review_collaborator_commitments",
        temporalValidity: {
          validFrom: currentTime,
          validUntil: currentTime + CrossDomainIntelligenceEngine.VALIDITY_TTL_MS,
          freshnessTimestamp: currentTime,
        },
      });
    }

    // Filter by minimum tension surface threshold and sort descending by tension
    return candidateInsights
      .filter((i) => i.tensionScore >= CrossDomainIntelligenceEngine.MIN_TENSION_SURFACE_THRESHOLD)
      .sort((a, b) => b.tensionScore - a.tensionScore)
      .slice(0, CrossDomainIntelligenceEngine.MAX_ACTIVE_INSIGHTS);
  }
}
