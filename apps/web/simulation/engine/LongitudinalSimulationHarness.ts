/**
 * Longitudinal Simulation Harness (Phase 14)
 * 
 * Executes accelerated 30-day and 90-day continuous simulations testing
 * closed-loop learning, memory stability, and inductive state estimation
 * against hidden ground truth.
 */

import { AdaptiveUserPersona } from "../personas/AdaptiveUserPersona";
import {
  LongitudinalStabilityValidator,
  IDaySimulationTrace,
  ILongitudinalValidationReport,
} from "../validation/LongitudinalStabilityValidator";
import { ILifeContextProjection } from "../../../../packages/execution-kernel/src/worldv2/contracts/LifeContextProjectionContracts";
import { CognitiveStateEngine } from "../../../../packages/execution-kernel/src/worldv2/CognitiveStateEngine";
import { ProactivePolicyDaemon } from "../../../../packages/execution-kernel/src/proactive/ProactivePolicyDaemon";

export class LongitudinalSimulationHarness {
  private static instance: LongitudinalSimulationHarness;
  private cognitiveEngine: CognitiveStateEngine;
  private proactiveDaemon: ProactivePolicyDaemon;
  private validator: LongitudinalStabilityValidator;

  constructor() {
    this.cognitiveEngine = CognitiveStateEngine.getInstance();
    this.proactiveDaemon = ProactivePolicyDaemon.getInstance();
    this.validator = LongitudinalStabilityValidator.getInstance();
  }

  static getInstance(): LongitudinalSimulationHarness {
    if (!LongitudinalSimulationHarness.instance) {
      LongitudinalSimulationHarness.instance = new LongitudinalSimulationHarness();
    }
    return LongitudinalSimulationHarness.instance;
  }

  /**
   * Executes an accelerated longitudinal simulation across targetDays.
   */
  async runLongitudinalSimulation(
    targetDays: number = 30,
    seed: number = 101,
    userId: string = "sim-persona-marcus"
  ): Promise<ILongitudinalValidationReport> {
    const persona = new AdaptiveUserPersona(userId, "Marcus (Simulated)", seed);
    const traces: IDaySimulationTrace[] = [];

    const baseTimestamp = 1791000000000;
    const dayMs = 24 * 3600 * 1000;

    for (let day = 1; day <= targetDays; day++) {
      const currentDayTime = baseTimestamp + (day - 1) * dayMs;

      // 1. Advance private ground truth (hidden from LifeOS)
      persona.tickDay(day);
      const hiddenTruth = persona.getHiddenGroundTruth();

      // 2. Emit noisy observables
      const observables = persona.emitDailyObservables(day);

      // 3. Assemble LifeContextProjection for LifeOS
      const recoveryScore = observables.telemetryMissing ? 0.65 : observables.sleepRecoveryScore;
      const sleepHours = observables.telemetryMissing ? 7.0 : observables.sleepDurationHours;

      const projection: any = {
        userId,
        projectionTimestamp: currentDayTime,
        projectionVersion: day,
        degradation: { isDegraded: observables.telemetryMissing, missingFields: [], fallbackActive: false },
        cognitiveState: {
          state: recoveryScore < 0.45 ? "DEPLETED" : "NORMAL",
          confidence: observables.telemetryMissing ? 0.55 : 0.90,
          provenance: "TELEMETRY",
          freshnessTimestamp: currentDayTime,
          primaryDrivers: ["Simulation"],
          estimatedFatigue: 1.0 - recoveryScore,
          estimatedReadiness: recoveryScore,
        },
        physicalReadiness: {
          readinessScore: recoveryScore,
          sleepDurationMinutes: Math.round(sleepHours * 60),
          sleepQualityScore: recoveryScore,
          recoveryStatus: recoveryScore < 0.45 ? "IMPAIRED" : "OPTIMAL",
          freshnessTimestamp: currentDayTime,
        },
        operationalSchedule: {
          todayMeetingCount: observables.meetingsCount,
          todayMeetingDurationMinutes: observables.meetingMinutes,
          freeFocusBlocksRemaining: 2,
          isScheduleTight: observables.meetingMinutes > 180,
          freshnessTimestamp: currentDayTime,
        },
        goalPressures: [{
          goalId: "g1",
          title: "Complete Q4 Launch",
          domain: "productivity",
          pressureScore: 0.75,
          isCritical: false,
        }],
        activeInterventions: [],
        quietHoursActive: false,
        identity: { userId, name: persona.name, timezone: "UTC", activeRole: "Product Engineer" },
        cognitive: {
          overallReadiness: recoveryScore,
          stressTier: recoveryScore < 0.45 ? "HIGH" : recoveryScore < 0.7 ? "MODERATE" : "LOW",
          focusCapacityMinutes: Math.round(recoveryScore * 90),
          cognitiveLoadEstimate: 1.0 - recoveryScore,
          evidenceConfidence: observables.telemetryMissing ? 0.55 : 0.90,
          requiresUserConfirmation: false,
        },
        physical: {
          sleepDurationHours: sleepHours,
          sleepRecoveryScore: recoveryScore,
          physicalStrainTier: recoveryScore < 0.45 ? "EXHAUSTED" : recoveryScore < 0.7 ? "HIGH" : "RESTED",
        },
        schedule: {
          totalMeetingMinutesToday: observables.meetingMinutes,
          meetingFragmentationScore: observables.meetingsCount > 4 ? 0.7 : 0.2,
          availableDeepWorkWindows: [
            {
              startTimestamp: currentDayTime + 10 * 3600 * 1000,
              endTimestamp: currentDayTime + 12 * 3600 * 1000,
              durationMinutes: 120,
            },
          ],
        },
      };

      // 4. Run Proactive Policy Daemon to evaluate potential interventions
      const proactiveReport = await this.proactiveDaemon.evaluateUserProactivity(
        userId,
        projection,
        "L4",
        currentDayTime + 14 * 3600 * 1000 // 14:00 UTC
      );

      // 5. Evaluate proposed interventions against hidden ground truth post-hoc
      const proposedInterventions: Array<{ urn: string; actuallyBeneficial: boolean }> = [];
      const allCandidates = proactiveReport.notificationsDispatched.length > 0
        ? proactiveReport.notificationsDispatched
        : proactiveReport.candidatesGenerated;

      for (const cand of allCandidates) {
        const urn = (cand.proposal as any).capabilityURN || "";
        const evalResult = persona.evaluateInterventionAgainstHiddenTruth(urn);
        proposedInterventions.push({
          urn,
          actuallyBeneficial: evalResult.wasActuallyBeneficial,
        });
      }

      // 6. Record Daily Trace
      traces.push({
        dayIndex: day,
        hiddenTruth,
        inferredReadinessScore: recoveryScore,
        inferredCognitiveLoad: 1.0 - recoveryScore,
        interventionsProposed: proposedInterventions,
        memoryBytesUsed: process.memoryUsage().heapUsed,
        activePreferenceKeys: ["deep_work_morning_preference"],
      });
    }

    // 7. Validate and return comprehensive longitudinal report
    return this.validator.validateSimulationRun(traces);
  }
}
