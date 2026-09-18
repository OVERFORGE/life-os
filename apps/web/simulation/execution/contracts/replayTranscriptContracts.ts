/**
 * ReplayTranscript Contracts — Versioned Replay Schema V1
 *
 * Defines the canonical, versioned ReplayTranscript schema ("1.0.0").
 * Excludes non-deterministic runtime values (executionTimeMs, process IDs, wall-clock timestamps).
 */

import { SimulationEvent } from "../../events/contracts/eventContracts";
import { PipelineStage } from "../../world/contracts/simulationEngineContract";

export const REPLAY_SCHEMA_VERSION = "1.0.0" as const;

export interface DeterministicEngineDiagnostics {
  engineName: string;
  engineVersion: string;
  stage: PipelineStage;
  stateChangesCount: number;
  changedStatePaths: string[];
  eventsCount: number;
  warnings: string[];
  inputSummary: string;
  outputSummary: string;
}

export interface ReplayTickStep {
  tick: number;
  virtualDay: number;
  virtualMinute: number;
  worldHash: string;
  events: SimulationEvent[];
  diagnostics: DeterministicEngineDiagnostics[];
  decisionGatingRequired?: boolean;
  decisionGatingReason?: string;
}

export interface ReplayTranscript {
  replayVersion: typeof REPLAY_SCHEMA_VERSION;
  runUid: string;
  seed: number;
  ticks: ReplayTickStep[];
}
