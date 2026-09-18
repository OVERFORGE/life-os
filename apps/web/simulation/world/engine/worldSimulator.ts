/**
 * WorldSimulator — Pure 10-Stage Pipeline Orchestrator (Frozen Kernel V1)
 *
 * Coordinates execution of standardized domain engines via EngineRegistry and
 * delegates single-authority state merging to IStateCommitter.
 */

import { SimulatedWorldState } from "../contracts/worldStateContracts";
import { IStateCommitter } from "../contracts/IStateCommitter";
import { DeterministicStateCommitter } from "./deterministicStateCommitter";
import { EngineRegistry } from "./engineRegistry";
import {
  SimulationEngine,
  SimulationContext,
  EngineDiagnostics,
} from "../contracts/simulationEngineContract";
import { DEFAULT_SIMULATION_CONFIG, SimulationConfig } from "../../config/simulationConfig";
import { SubsystemRNGManager } from "../../engine/subsystemRngManager";
import { DeterministicEventBus } from "../../events/deterministicEventBus";
import { EventScheduler } from "../../events/eventScheduler";
import { SimulationEvent } from "../../events/contracts/eventContracts";
import { ActivityDefinitionRegistry } from "../contracts/activityDefinitionRegistry";

import { RoutineEngine } from "./routineEngine";
import { SessionEngine } from "./sessionEngine";
import { EnvironmentEngine } from "./environmentEngine";
import { BiometricEngine } from "./biometricEngine";
import { RelationshipEngine } from "./relationshipEngine";
import { ProjectEngine } from "./projectEngine";
import { deriveTimeFromTicks } from "../../engine/clock";

export interface WorldAdvanceResult {
  state: SimulatedWorldState;
  eventsSummary: string[];
  publishedEvents: SimulationEvent[];
  diagnostics: EngineDiagnostics[];
}

export class WorldSimulator {
  private config: SimulationConfig;
  private rngManager: SubsystemRNGManager;
  public readonly eventBus: DeterministicEventBus;
  public readonly eventScheduler: EventScheduler;
  private stateCommitter: IStateCommitter;
  private engineRegistry: EngineRegistry;
  private orderedEngines: SimulationEngine<any>[];

  constructor(
    masterSeed: number = 42,
    config?: SimulationConfig,
    eventBus?: DeterministicEventBus,
    eventScheduler?: EventScheduler,
    stateCommitter?: IStateCommitter
  ) {
    this.config = config ?? { ...DEFAULT_SIMULATION_CONFIG, masterSeed };
    this.rngManager = new SubsystemRNGManager(masterSeed);
    this.eventBus = eventBus ?? new DeterministicEventBus();
    this.eventScheduler = eventScheduler ?? new EventScheduler();
    this.stateCommitter = stateCommitter ?? new DeterministicStateCommitter();
    this.engineRegistry = new EngineRegistry();

    // Register 10-stage domain engines into EngineRegistry
    this.engineRegistry.register(new RoutineEngine());
    this.engineRegistry.register(new SessionEngine());
    this.engineRegistry.register(new EnvironmentEngine());
    this.engineRegistry.register(new BiometricEngine());
    this.engineRegistry.register(new RelationshipEngine());
    this.engineRegistry.register(new ProjectEngine());

    // Compute topological execution order via EngineRegistry
    this.orderedEngines = this.engineRegistry.getOrderedEngines();
  }

  /**
   * Executes exactly 1 virtual minute through the 10-stage deterministic pipeline.
   */
  public tickMinute(currentState: SimulatedWorldState): {
    state: SimulatedWorldState;
    publishedEvents: SimulationEvent[];
    diagnostics: EngineDiagnostics[];
  } {
    // Stage 1: Clock Advancement
    const nextVirtualMinute = currentState.virtualMinute + 1;
    const derivedTime = deriveTimeFromTicks(nextVirtualMinute, 1, 480, 1);
    const virtualDay = derivedTime.currentDay;

    const context: SimulationContext = {
      runUid: currentState.runUid,
      seed: this.config.masterSeed,
      tick: currentState.version,
      virtualDay,
      virtualMinute: nextVirtualMinute,
      config: this.config,
      rngManager: this.rngManager,
      eventBus: this.eventBus,
      eventScheduler: this.eventScheduler,
      activityRegistry: ActivityDefinitionRegistry,
    };

    let workingState: SimulatedWorldState = {
      ...currentState,
      version: currentState.version + 1,
      virtualDay,
      virtualMinute: nextVirtualMinute,
    };

    const diagnosticsList: EngineDiagnostics[] = [];
    const patchesToCommit: Partial<SimulatedWorldState>[] = [];
    const eventsBeforeCount = this.eventBus.getHistory().length;

    // Stages 2 through 7: Sequential Engine Pipeline Execution
    for (const engine of this.orderedEngines) {
      const result = engine.execute(workingState, context);

      patchesToCommit.push(result.stateUpdates as Partial<SimulatedWorldState>);

      // Immediate read-view update for subsequent pipeline stage dependencies
      workingState = {
        ...workingState,
        ...result.stateUpdates,
      };

      for (const evt of result.events) {
        this.eventBus.publish(evt);
      }

      if (result.diagnostics) {
        diagnosticsList.push(result.diagnostics);
      }
    }

    // Single-authority state commit via IStateCommitter
    const committedState = this.stateCommitter.commit(currentState, [
      { version: currentState.version + 1, virtualDay, virtualMinute: nextVirtualMinute },
      ...patchesToCommit,
    ]);

    // Stage 8: Notification / Scheduler Engine
    const timestampVirtual = `${virtualDay} • ${nextVirtualMinute}`;
    this.eventScheduler.checkAndFire(
      currentState.runUid,
      virtualDay,
      nextVirtualMinute,
      timestampVirtual,
      this.eventBus
    );

    // Stage 9: Deterministic Event Collection
    const stepEvents = [...this.eventBus.getHistory().slice(eventsBeforeCount)];

    return {
      state: committedState,
      publishedEvents: stepEvents,
      diagnostics: diagnosticsList,
    };
  }

  /**
   * Multi-minute batch advancement loop.
   */
  public advanceTime(initialState: SimulatedWorldState, targetMinutes: number = 1): WorldAdvanceResult {
    let state = { ...initialState };
    const eventsSummary: string[] = [];
    const allDiagnostics: EngineDiagnostics[] = [];
    const count = Math.max(1, targetMinutes);

    const historyBeforeCount = this.eventBus.getHistory().length;

    for (let i = 0; i < count; i++) {
      const step = this.tickMinute(state);
      state = step.state;
      allDiagnostics.push(...step.diagnostics);
    }

    const publishedEvents = [...this.eventBus.getHistory().slice(historyBeforeCount)];
    for (const evt of publishedEvents) {
      eventsSummary.push(`${evt.virtualTimestamp} - [${evt.eventType}] ${evt.title}`);
    }

    return { state, eventsSummary, publishedEvents, diagnostics: allDiagnostics };
  }
}
