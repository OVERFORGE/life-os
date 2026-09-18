/**
 * Simulation Runtime Orchestrator — Phase 1.3
 * Pure deterministic runtime virtual machine.
 * Persistence-agnostic, 100% replay-safe, wall-clock independent.
 */

import {
  RuntimeStatus,
  RuntimeStateDTO,
  RuntimeContextDTO,
  RuntimeConfigurationDTO,
  RuntimeMetricsDTO,
  RuntimeLogEntryDTO,
  SimulationPersonaDTO,
  RuntimeSnapshot,
} from "../types";
import { canAdvance, canPause, canResume, canFinish, canReset, assertTransition } from "./lifecycle";
import { buildConfiguration } from "./configuration";
import { buildRuntimeContext, generateRunUid } from "./context";
import { deriveRuntimeState } from "./state";
import { INITIAL_RUNTIME_METRICS, updateAdvanceMetrics, incrementPauseCount, incrementResumeCount } from "./metrics";

export class SimulationRuntimeEngine {
  public status: RuntimeStatus = "CREATED";
  public tick: number = 0;
  public seed: number = 42;
  public readonly context: Readonly<RuntimeContextDTO>;
  public readonly configuration: Readonly<RuntimeConfigurationDTO>;
  public metrics: RuntimeMetricsDTO = { ...INITIAL_RUNTIME_METRICS };
  public logs: RuntimeLogEntryDTO[] = [];
  public error: string | null = null;
  private logSequenceCounter: number = 0;

  constructor(
    persona: SimulationPersonaDTO,
    runUid?: string,
    seed: number = 42,
    configOverride?: Partial<RuntimeConfigurationDTO>,
    sequenceNumber: number = 1
  ) {
    const uid = runUid || generateRunUid(persona.code, sequenceNumber);
    this.seed = seed;
    this.context = buildRuntimeContext(persona, uid, seed);
    this.configuration = buildConfiguration(configOverride);
    this.addLog("LIFECYCLE", "INFO", `Runtime engine initialized for ${persona.code} (${persona.name})`);
  }

  /**
   * Restores a RuntimeEngine instance directly from a canonical RuntimeSnapshot.
   */
  public static restore(snapshot: RuntimeSnapshot): SimulationRuntimeEngine {
    // Create skeleton persona DTO from context
    const dummyPersona: SimulationPersonaDTO = {
      id: snapshot.context.personaId,
      personaUid: snapshot.context.personaUid,
      code: snapshot.context.personaCode,
      name: snapshot.context.personaName,
      description: "",
      archetype: "custom",
      templateId: null,
      templateVersion: "1.0.0",
      isTemplate: false,
      identity: {},
      traits: {},
      initialState: {},
      lifestyle: {},
      motivation: {},
      capabilities: {},
      memoryProfile: {},
      supportedScenarioTypes: [],
      metadata: {},
      behaviorPolicy: {},
      promptVersion: "1.0.0",
      personaVersion: snapshot.context.personaVersion,
      schemaVersion: "1.0.0",
      isLatest: true,
      previousVersionId: null,
      analytics: { simulationCount: 0, lastSimulationAt: null, averageOutcomeScore: null },
      validation: { passed: true, checksum: "", validatedAt: null },
      isActive: true,
      isDeleted: false,
      deletedAt: null,
      tags: [],
    };

    const engine = new SimulationRuntimeEngine(
      dummyPersona,
      snapshot.context.runUid,
      snapshot.seed,
      snapshot.configuration
    );

    engine.status = snapshot.status;
    engine.tick = snapshot.tick;
    engine.metrics = { ...snapshot.metrics };
    engine.logs = [...snapshot.logs];
    engine.error = snapshot.error;
    engine.logSequenceCounter = snapshot.logs.reduce((max, entry) => Math.max(max, entry.sequence ?? 0), 0);

    return engine;
  }

  /**
   * Produces a 100% canonical state snapshot for persistence or replay.
   */
  public snapshot(): RuntimeSnapshot {
    return {
      status: this.status,
      tick: this.tick,
      seed: this.seed,
      configuration: { ...this.configuration },
      context: { ...this.context },
      metrics: { ...this.metrics },
      logs: [...this.logs],
      error: this.error,
    };
  }

  /** Returns derived execution state DTO */
  public getState(): RuntimeStateDTO {
    return deriveRuntimeState(this.status, this.tick, this.configuration);
  }

  /** Start simulation session */
  public start(): RuntimeStateDTO {
    assertTransition(this.status, "INITIALIZING");
    this.status = "INITIALIZING";
    this.addLog("LIFECYCLE", "INFO", "FSM transition CREATED → INITIALIZING");

    assertTransition(this.status, "RUNNING");
    this.status = "RUNNING";
    this.addLog("LIFECYCLE", "INFO", `Runtime started — ${this.getState().formattedTimestamp}`);

    return this.getState();
  }

  /**
   * Advance simulation clock deterministically by N ticks.
   * Design Semantics: Virtual clock time in LifeOS simulation always advances monotonically tick-by-tick
   * ("time always advances"), regardless of whether individual kernel execution steps succeed or encounter failures.
   */
  public advance(ticks: number = 1): RuntimeStateDTO {

    if (!canAdvance(this.status)) {
      throw new Error(`Cannot advance simulation run while in state ${this.status}`);
    }

    const validTicks = Math.max(1, ticks);
    this.tick += validTicks;
    const additionalMinutes = validTicks * this.configuration.tickIntervalMinutes;

    this.metrics = updateAdvanceMetrics(this.metrics, validTicks, additionalMinutes);

    const newState = this.getState();
    this.addLog("TICK", "TICK", `+${validTicks} tick(s) → ${newState.formattedTimestamp}`);

    return newState;
  }

  /** Pause simulation session */
  public pause(): RuntimeStateDTO {
    if (!canPause(this.status)) {
      throw new Error(`Cannot pause simulation run in state ${this.status}`);
    }
    assertTransition(this.status, "PAUSED");
    this.status = "PAUSED";
    this.metrics = incrementPauseCount(this.metrics);
    this.addLog("LIFECYCLE", "WARN", `Runtime paused — ${this.getState().formattedTimestamp}`);

    return this.getState();
  }

  /** Resume simulation session */
  public resume(): RuntimeStateDTO {
    if (!canResume(this.status)) {
      throw new Error(`Cannot resume simulation run in state ${this.status}`);
    }
    assertTransition(this.status, "RUNNING");
    this.status = "RUNNING";
    this.metrics = incrementResumeCount(this.metrics);
    this.addLog("LIFECYCLE", "INFO", `Runtime resumed — ${this.getState().formattedTimestamp}`);

    return this.getState();
  }

  /** Finish / Complete simulation session */
  public finish(): RuntimeStateDTO {
    if (!canFinish(this.status)) {
      throw new Error(`Cannot finish simulation run in state ${this.status}`);
    }
    assertTransition(this.status, "COMPLETED");
    this.status = "COMPLETED";
    this.addLog("LIFECYCLE", "INFO", `Runtime completed — ${this.getState().formattedTimestamp}`);

    return this.getState();
  }

  /** Reset simulation session back to tick 0 / CREATED */
  public reset(): RuntimeStateDTO {
    if (!canReset(this.status)) {
      throw new Error(`Cannot reset simulation run in state ${this.status}`);
    }
    this.status = "CREATED";
    this.tick = 0;
    this.error = null;
    this.metrics = { ...INITIAL_RUNTIME_METRICS };
    this.addLog("LIFECYCLE", "INFO", "Runtime reset — tick 0 (Day 1 • 08:00)");

    return this.getState();
  }

  /** Append deterministic execution log entry (sequence-indexed) */
  private addLog(
    action: string,
    level: RuntimeLogEntryDTO["level"],
    message: string
  ): void {
    this.logSequenceCounter += 1;
    this.logs.unshift({
      sequence: this.logSequenceCounter,
      tick: this.tick,
      level,
      message,
      action,
      details: "",
    });
  }
}
