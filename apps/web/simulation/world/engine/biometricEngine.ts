/**
 * BiometricEngine — Stage 5: Biological State Evolution
 */

import {
  SimulationEngine,
  PipelineStage,
  EngineResult,
  SimulationContext,
  computeAccurateStateChanges,
} from "../contracts/simulationEngineContract";
import { SimulatedWorldState, Biometrics } from "../contracts/worldStateContracts";
import { getCircadianMultiplier } from "./timeProgressionProfiles";
import { createSimulationEvent, SimulationEvent } from "../../events/contracts/eventContracts";

export class BiometricEngine implements SimulationEngine<{ biometrics: Biometrics }> {
  public readonly name = "BiometricEngine";
  public readonly version = "1.0.0";
  public readonly stage = PipelineStage.BIOMETRIC_ENGINE;
  public readonly dependencies = ["SessionEngine"];

  public execute(
    state: Readonly<SimulatedWorldState>,
    context: Readonly<SimulationContext>
  ): EngineResult<{ biometrics: Biometrics }> {
    const startTime = Date.now();
    const events: SimulationEvent[] = [];

    const defId = state.activeSession?.definitionId ?? "ROUTINE";
    const profile = context.activityRegistry.getDefinition(defId);
    const circadian = getCircadianMultiplier(context.virtualMinute);

    const current = state.biometrics;

    const focusDelta = profile.baseFocusDeltaPerMin * (profile.baseFocusDeltaPerMin < 0 ? (1 / circadian.focusMultiplier) : circadian.focusMultiplier);
    const newFocus = Math.max(0, Math.min(100, current.focus + focusDelta));

    const energyDelta = profile.baseEnergyDeltaPerMin * (profile.baseEnergyDeltaPerMin < 0 ? (1 / circadian.energyMultiplier) : circadian.energyMultiplier);
    const newEnergy = Math.max(0, Math.min(100, current.energy + energyDelta));

    const fatigueDelta = profile.baseFatigueDeltaPerMin * circadian.fatigueMultiplier;
    const newFatigue = Math.max(0, Math.min(100, current.fatigue + fatigueDelta));

    const sleepPressureDelta = defId === "SLEEP" ? context.config.biometrics.sleepRecoveryRate : context.config.biometrics.baseSleepPressureRate * circadian.sleepPressureMultiplier;
    const newSleepPressure = Math.max(0, Math.min(100, current.sleepPressure + sleepPressureDelta));

    const newHunger = Math.max(0, Math.min(100, current.hunger + profile.baseHungerDeltaPerMin));
    const newHydration = Math.max(0, Math.min(100, current.hydration + profile.baseHydrationDeltaPerMin));
    const newStress = Math.max(0, Math.min(100, current.stress + profile.baseStressDeltaPerMin));

    const updatedBiometrics: Biometrics = {
      energy: Math.round(newEnergy * 10) / 10,
      focus: Math.round(newFocus * 10) / 10,
      fatigue: Math.round(newFatigue * 10) / 10,
      sleepPressure: Math.round(newSleepPressure * 10) / 10,
      hunger: Math.round(newHunger * 10) / 10,
      hydration: Math.round(newHydration * 10) / 10,
      stress: Math.round(newStress * 10) / 10,
    };

    if (updatedBiometrics.energy <= context.config.biometrics.criticalEnergyThreshold && current.energy > context.config.biometrics.criticalEnergyThreshold) {
      events.push(
        createSimulationEvent({
          eventType: "ENERGY_LOW",
          runUid: context.runUid,
          sequenceNumber: context.eventBus.getNextSequenceNumber(),
          eventIndex: 1,
          pipelineStage: this.stage,
          subsystem: "BIOMETRIC",
          virtualDay: context.virtualDay,
          virtualMinute: context.virtualMinute,
          virtualTimestamp: `${context.virtualDay} • ${context.virtualMinute}`,
          title: "Energy Depleted Warning",
          description: `Energy reserve dropped to ${updatedBiometrics.energy}%. Rest or meal recommended.`,
          payload: { energy: updatedBiometrics.energy },
        })
      );
    }

    if (updatedBiometrics.sleepPressure >= context.config.biometrics.criticalSleepPressureThreshold && current.sleepPressure < context.config.biometrics.criticalSleepPressureThreshold) {
      events.push(
        createSimulationEvent({
          eventType: "SLEEP_NEEDED",
          runUid: context.runUid,
          sequenceNumber: context.eventBus.getNextSequenceNumber(),
          eventIndex: 2,
          pipelineStage: this.stage,
          subsystem: "BIOMETRIC",
          virtualDay: context.virtualDay,
          virtualMinute: context.virtualMinute,
          virtualTimestamp: `${context.virtualDay} • ${context.virtualMinute}`,
          title: "Critical Sleep Drive",
          description: `Sleep pressure reached ${updatedBiometrics.sleepPressure}%. Sleep required soon.`,
          payload: { sleepPressure: updatedBiometrics.sleepPressure },
        })
      );
    }

    const updates = { biometrics: updatedBiometrics };
    const changedPaths = computeAccurateStateChanges(
      state as unknown as Record<string, unknown>,
      updates as unknown as Record<string, unknown>
    );

    return {
      engineName: this.name,
      stage: this.stage,
      stateUpdates: updates,
      events,
      diagnostics: {
        engineName: this.name,
        engineVersion: this.version,
        stage: this.stage,
        executionTimeMs: Date.now() - startTime,
        stateChangesCount: changedPaths.length,
        changedStatePaths: changedPaths,
        eventsCount: events.length,
        warnings: [],
        inputSummary: `energy=${current.energy}, focus=${current.focus}`,
        outputSummary: `newEnergy=${updatedBiometrics.energy}, newFocus=${updatedBiometrics.focus}`,
      },
    };
  }
}
