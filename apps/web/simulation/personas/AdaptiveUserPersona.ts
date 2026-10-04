/**
 * Adaptive User Persona with Hidden Ground Truth (Phase 14)
 * 
 * Simulates a virtual human maintaining private biological truth
 * that LifeOS CANNOT see during inference. Emits noisy, delayed,
 * and occasionally missing observations to test inductive reasoning.
 */

export interface IPrivateGroundTruth {
  trueFatigue: number;          // 0.0 (fresh) to 1.0 (exhausted)
  trueCognitiveLoad: number;    // 0.0 to 1.0
  hiddenIllness: boolean;       // Unannounced sickness or life disruption
  trueMotivation: number;       // 0.0 to 1.0
  actualFocusCapacityMinutes: number;
}

export interface IObservableDayData {
  dayIndex: number;
  sleepDurationHours: number;
  sleepRecoveryScore: number;   // Injected with noise
  telemetryMissing: boolean;    // Simulates dead battery or forgot to wear
  meetingsCount: number;
  meetingMinutes: number;
  tasksCompleted: number;
  tasksDeferred: number;
}

export class AdaptiveUserPersona {
  private groundTruth: IPrivateGroundTruth;
  private rngSeed: number;

  constructor(
    public readonly personaId: string,
    public readonly name: string,
    seed: number = 42
  ) {
    this.rngSeed = seed;
    this.groundTruth = {
      trueFatigue: 0.25,
      trueCognitiveLoad: 0.35,
      hiddenIllness: false,
      trueMotivation: 0.85,
      actualFocusCapacityMinutes: 90,
    };
  }

  private pseudoRandom(): number {
    this.rngSeed = (this.rngSeed * 9301 + 49297) % 233280;
    return this.rngSeed / 233280;
  }

  /**
   * Advances the persona's private physiological state by 1 day.
   */
  tickDay(dayIndex: number): void {
    // Inject realistic hidden life events:
    // e.g. Days 12-16: Hidden illness / flu
    if (dayIndex >= 12 && dayIndex <= 16) {
      this.groundTruth.hiddenIllness = true;
      this.groundTruth.trueFatigue = Math.min(0.95, this.groundTruth.trueFatigue + 0.35);
      this.groundTruth.actualFocusCapacityMinutes = 20;
    } else {
      this.groundTruth.hiddenIllness = false;
      // Normal cyclical fatigue variation
      const variance = (this.pseudoRandom() - 0.5) * 0.15;
      this.groundTruth.trueFatigue = Math.max(0.1, Math.min(0.9, this.groundTruth.trueFatigue + variance));
      this.groundTruth.actualFocusCapacityMinutes = Math.round(120 * (1.0 - this.groundTruth.trueFatigue));
    }
  }

  /**
   * Generates noisy observations emitted to LifeOS.
   * LifeOS only sees this returned payload, NEVER the private ground truth!
   */
  emitDailyObservables(dayIndex: number): IObservableDayData {
    // 5% chance of dead battery / missing telemetry
    const telemetryMissing = this.pseudoRandom() < 0.05;

    // Invert fatigue to recovery with 10% sensor noise
    const noise = (this.pseudoRandom() - 0.5) * 0.12;
    const baseRecovery = 1.0 - this.groundTruth.trueFatigue;
    const noisyRecovery = Math.max(0.05, Math.min(0.98, baseRecovery + noise));
    const sleepDuration = Math.max(4.0, Math.min(9.5, noisyRecovery * 8.5 + (this.pseudoRandom() - 0.5)));

    // Task completions correlate with true fatigue, with behavioral noise
    const tasksCompleted = Math.max(0, Math.round(6 * (1.0 - this.groundTruth.trueFatigue) + (this.pseudoRandom() - 0.5)));
    const tasksDeferred = Math.max(0, Math.round(4 * this.groundTruth.trueFatigue + (this.pseudoRandom() - 0.5)));

    const meetingsCount = Math.round(2 + this.pseudoRandom() * 4);
    const meetingMinutes = meetingsCount * 45;

    return {
      dayIndex,
      sleepDurationHours: Math.round(sleepDuration * 10) / 10,
      sleepRecoveryScore: Math.round(noisyRecovery * 100) / 100,
      telemetryMissing,
      meetingsCount,
      meetingMinutes,
      tasksCompleted,
      tasksDeferred,
    };
  }

  /**
   * Post-hoc evaluation of an intervention against the private hidden ground truth.
   * ONLY called during post-hoc validation; LifeOS cannot call this during inference.
   */
  evaluateInterventionAgainstHiddenTruth(interventionType: string): { wasActuallyBeneficial: boolean; delta: number } {
    if (this.groundTruth.trueFatigue > 0.6) {
      if (interventionType.includes("focus_block") || interventionType.includes("rest") || interventionType.includes("reschedule")) {
        // High fatigue user genuinely benefited from rest/protection
        return { wasActuallyBeneficial: true, delta: 0.25 };
      }
    } else {
      if (interventionType.includes("focus_block") || interventionType.includes("deep_work") || interventionType.includes("stage_task") || interventionType.includes("sprint")) {
        // Well-rested user genuinely benefited from deep work or task progression
        return { wasActuallyBeneficial: true, delta: 0.20 };
      }
    }
    return { wasActuallyBeneficial: false, delta: -0.05 };
  }

  getHiddenGroundTruth(): IPrivateGroundTruth {
    return { ...this.groundTruth };
  }
}
