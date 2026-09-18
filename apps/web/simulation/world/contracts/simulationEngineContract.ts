/**
 * Simulation Engine Contracts — Standardized Engine & Pipeline Specifications
 *
 * Defines canonical SimulationEngine interface, SimulationContext container,
 * EngineResult immutable outputs, rich EngineDiagnostics metadata, and change accuracy helpers.
 */

import { SimulatedWorldState } from "./worldStateContracts";
import { SimulationConfig } from "../../config/simulationConfig";
import { SubsystemRNGManager } from "../../engine/subsystemRngManager";
import { DeterministicEventBus } from "../../events/deterministicEventBus";
import { EventScheduler } from "../../events/eventScheduler";
import { SimulationEvent } from "../../events/contracts/eventContracts";
import { ActivityDefinitionRegistry } from "./activityDefinitionRegistry";

export enum PipelineStage {
  CLOCK_ADVANCEMENT = 1,
  ROUTINE_EVALUATION = 2,
  SESSION_ENGINE = 3,
  ENVIRONMENT_ENGINE = 4,
  BIOMETRIC_ENGINE = 5,
  RELATIONSHIP_ENGINE = 6,
  PROJECT_ENGINE = 7,
  SCHEDULER_ENGINE = 8,
  EVENT_GENERATION = 9,
  DECISION_GATING = 10,
}

export interface EngineDiagnostics {
  engineName: string;
  engineVersion: string;
  stage: PipelineStage;
  executionTimeMs: number;
  stateChangesCount: number;
  changedStatePaths: string[];
  eventsCount: number;
  warnings: string[];
  inputSummary: string;
  outputSummary: string;
}

export interface EngineResult<TUpdate = Record<string, unknown>> {
  engineName: string;
  stage: PipelineStage;
  stateUpdates: TUpdate;
  events: SimulationEvent[];
  diagnostics?: EngineDiagnostics;
}

export interface SimulationContext {
  runUid: string;
  seed: number;
  tick: number;
  virtualDay: number;
  virtualMinute: number;
  config: SimulationConfig;
  rngManager: SubsystemRNGManager;
  eventBus: DeterministicEventBus;
  eventScheduler: EventScheduler;
  activityRegistry: typeof ActivityDefinitionRegistry;
}

export interface SimulationEngine<TUpdate = Record<string, unknown>> {
  readonly name: string;
  readonly version: string;
  readonly stage: PipelineStage;
  readonly dependencies?: readonly string[];
  execute(
    state: Readonly<SimulatedWorldState>,
    context: Readonly<SimulationContext>
  ): EngineResult<TUpdate>;
}

/**
 * Computes exact array of state property names that actually changed in state.
 */
export function computeAccurateStateChanges(
  before: Record<string, unknown>,
  updates: Record<string, unknown>
): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(updates)) {
    const beforeVal = JSON.stringify(before[key]);
    const afterVal = JSON.stringify(updates[key]);
    if (beforeVal !== afterVal) {
      changed.push(key);
    }
  }
  return changed;
}
