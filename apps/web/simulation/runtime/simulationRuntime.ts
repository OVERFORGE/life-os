/**
 * SimulationRuntime — Permanent Execution Runtime for Simulation Lab
 *
 * Manages simulation lifetime, continuous multi-day execution loops, time progression,
 * day rollover, termination policy evaluation, step emission into ReplayRecorder & DailyTickRecorder,
 * snapshot storage persistence via ISnapshotStorage, day boundary processing via IDailyLifecycleProcessor,
 * and canonical fact emission into TimelineRecorder.
 *
 * Uses frozen Simulation Kernel V1 (WorldSimulator) for single-step world physics.
 */

import { WorldSimulator } from "../world/engine/worldSimulator";
import { SimulatedWorldState, createInitialWorldState } from "../world/contracts/worldStateContracts";
import { SnapshotHasher } from "../execution/services/snapshotHasher";
import { ReplayHasher } from "../execution/services/replayHasher";
import {
  ReplayTranscript,
  DeterministicEngineDiagnostics,
} from "../execution/contracts/replayTranscriptContracts";
import { ReplayRecorder } from "./replayRecorder";
import { DailyTickRecorder } from "./dailyTickRecorder";
import { ReplayTranscriptBuilder } from "../execution/services/replayTranscriptBuilder";
import {
  ISimulationTerminationPolicy,
  DefaultTerminationPolicy,
  DefaultTerminationPolicyOptions,
} from "./terminationPolicy";

import { ISnapshotStorage } from "../storage/contracts/ISnapshotStorage";
import { NullSnapshotStorage } from "../storage/engine/nullSnapshotStorage";
import {
  ISnapshotPersistencePolicy,
  EveryTickPersistencePolicy,
} from "../storage/contracts/snapshotPersistencePolicy";
import {
  SimulationSnapshot,
  createDeterministicSnapshotId,
} from "../storage/contracts/snapshotStorageContracts";
import { SnapshotSerializer } from "../storage/services/snapshotSerializer";

import { DailySummary } from "./contracts/dailyLifecycleContracts";
import { DailySummaryRecorder } from "./dailySummaryRecorder";
import {
  IDailyLifecycleProcessor,
  DefaultDailyLifecycleProcessor,
} from "./dailyLifecycleProcessor";

import {
  SimulationTimeline,
  TimelineEventType,
} from "./contracts/timelineContracts";
import { TimelineRecorder } from "./timelineRecorder";
import { TimelineBuilder } from "../execution/services/timelineBuilder";
import { TimelineHasher } from "../execution/services/timelineHasher";

export interface SimulationRuntimeOptions {
  runUid: string;
  seed?: number;
  startDay?: number;
  startMinute?: number;
  tickIntervalMinutes?: number;
  terminationPolicy?: ISimulationTerminationPolicy | DefaultTerminationPolicyOptions;
  snapshotStorage?: ISnapshotStorage;
  snapshotPersistencePolicy?: ISnapshotPersistencePolicy;
  dailyLifecycleProcessor?: IDailyLifecycleProcessor;
}

export interface SimulationRuntimeResult {
  runUid: string;
  seed: number;
  totalTicksExecuted: number;
  startDay: number;
  finalDay: number;
  finalMinute: number;
  terminationReason: string;
  finalWorldState: SimulatedWorldState;
  finalWorldHash: string;
  replayTranscript: ReplayTranscript;
  replayHash: string;
  dailySummaries: readonly DailySummary[];
  timeline: SimulationTimeline;
  timelineHash: string;
}

export class SimulationRuntime {
  private options: {
    runUid: string;
    seed: number;
    startDay: number;
    startMinute: number;
    tickIntervalMinutes: number;
    terminationPolicy: ISimulationTerminationPolicy;
    snapshotStorage: ISnapshotStorage;
    snapshotPersistencePolicy: ISnapshotPersistencePolicy;
    dailyLifecycleProcessor: IDailyLifecycleProcessor;
  };
  private simulator: WorldSimulator;
  private currentState: SimulatedWorldState;
  private replayRecorder: ReplayRecorder;
  private dailyTickRecorder: DailyTickRecorder;
  private dailySummaryRecorder: DailySummaryRecorder;
  private timelineRecorder: TimelineRecorder;
  private totalTicks: number = 0;

  constructor(options: SimulationRuntimeOptions) {
    let terminationPolicy: ISimulationTerminationPolicy;
    if (options.terminationPolicy && "evaluate" in options.terminationPolicy) {
      terminationPolicy = options.terminationPolicy as ISimulationTerminationPolicy;
    } else {
      terminationPolicy = new DefaultTerminationPolicy(
        (options.terminationPolicy as DefaultTerminationPolicyOptions) ?? {}
      );
    }

    this.options = {
      runUid: options.runUid,
      seed: options.seed ?? 42,
      startDay: options.startDay ?? 1,
      startMinute: options.startMinute ?? 480,
      tickIntervalMinutes: options.tickIntervalMinutes ?? 1,
      terminationPolicy,
      snapshotStorage: options.snapshotStorage ?? new NullSnapshotStorage(),
      snapshotPersistencePolicy: options.snapshotPersistencePolicy ?? new EveryTickPersistencePolicy(),
      dailyLifecycleProcessor: options.dailyLifecycleProcessor ?? new DefaultDailyLifecycleProcessor(),
    };

    this.simulator = new WorldSimulator(this.options.seed);
    this.replayRecorder = new ReplayRecorder();
    this.dailyTickRecorder = new DailyTickRecorder();
    this.dailySummaryRecorder = new DailySummaryRecorder();
    this.timelineRecorder = new TimelineRecorder();
    this.currentState = createInitialWorldState(
      this.options.runUid,
      this.options.startDay,
      this.options.startMinute
    );
  }

  public getWorldState(): Readonly<SimulatedWorldState> {
    return this.currentState;
  }

  /**
   * Executes continuous simulation step-by-step until termination policy triggers.
   */
  public run(): SimulationRuntimeResult {
    let terminationReason = "Completed execution";
    let activeDay = this.currentState.virtualDay;

    // Emit SIMULATION_STARTED fact event into TimelineRecorder
    this.timelineRecorder.recordEvent(this.options.runUid, {
      tick: 0,
      virtualDay: this.currentState.virtualDay,
      virtualMinute: this.currentState.virtualMinute,
      type: TimelineEventType.SIMULATION_STARTED,
      payload: {
        seed: this.options.seed,
        startDay: this.options.startDay,
        startMinute: this.options.startMinute,
      },
    });

    while (true) {
      // 1. Evaluate ISimulationTerminationPolicy strategy before step
      const termCheck = this.options.terminationPolicy.evaluate({
        currentTick: this.totalTicks,
        currentDay: this.currentState.virtualDay,
        startDay: this.options.startDay,
      });

      if (termCheck.terminate) {
        terminationReason = termCheck.reason ?? "Termination policy satisfied";
        break;
      }

      // 2. Execute 1 virtual minute via Kernel V1 WorldSimulator
      const step = this.simulator.tickMinute(this.currentState);
      this.currentState = step.state;
      this.totalTicks += 1;

      // 3. Compute deterministic world hash & emit tick step into ReplayRecorder and DailyTickRecorder
      const worldHash = SnapshotHasher.computeWorldHash(
        this.currentState as unknown as Record<string, unknown>
      );

      const deterministicDiagnostics: DeterministicEngineDiagnostics[] = step.diagnostics.map((d) => ({
        engineName: d.engineName,
        engineVersion: d.engineVersion,
        stage: d.stage,
        stateChangesCount: d.stateChangesCount,
        changedStatePaths: d.changedStatePaths,
        eventsCount: d.eventsCount,
        warnings: d.warnings,
        inputSummary: d.inputSummary,
        outputSummary: d.outputSummary,
      }));

      const tickStep = {
        tick: this.currentState.version,
        virtualDay: this.currentState.virtualDay,
        virtualMinute: this.currentState.virtualMinute,
        worldHash,
        events: step.publishedEvents,
        diagnostics: deterministicDiagnostics,
      };

      this.replayRecorder.recordStep(tickStep);
      this.dailyTickRecorder.recordStep(tickStep);

      // Emit TICK_EXECUTED fact event into TimelineRecorder
      this.timelineRecorder.recordEvent(this.options.runUid, {
        tick: this.currentState.version,
        virtualDay: this.currentState.virtualDay,
        virtualMinute: this.currentState.virtualMinute,
        type: TimelineEventType.TICK_EXECUTED,
        payload: {
          worldHash,
          eventsCount: step.publishedEvents.length,
        },
      });

      // 4. Evaluate Snapshot Persistence Policy & Save Snapshot via Storage Provider
      if (
        this.options.snapshotPersistencePolicy.shouldPersist({
          tick: this.currentState.version,
          virtualDay: this.currentState.virtualDay,
          virtualMinute: this.currentState.virtualMinute,
          hasEmittedEvents: step.publishedEvents.length > 0,
        })
      ) {
        const snapshotId = createDeterministicSnapshotId(
          this.options.runUid,
          this.currentState.version,
          this.currentState.virtualDay,
          this.currentState.virtualMinute
        );

        const snapshot: SimulationSnapshot = {
          snapshotId,
          runUid: this.options.runUid,
          tick: this.currentState.version,
          virtualDay: this.currentState.virtualDay,
          virtualMinute: this.currentState.virtualMinute,
          worldState: this.currentState,
          worldHash,
          virtualTimestamp: {
            day: this.currentState.virtualDay,
            minute: this.currentState.virtualMinute,
          },
        };

        const serializedContent = SnapshotSerializer.serialize(snapshot);
        this.options.snapshotStorage.save(snapshot, serializedContent);

        // Emit SNAPSHOT_CREATED fact event into TimelineRecorder
        this.timelineRecorder.recordEvent(this.options.runUid, {
          tick: this.currentState.version,
          virtualDay: this.currentState.virtualDay,
          virtualMinute: this.currentState.virtualMinute,
          type: TimelineEventType.SNAPSHOT_CREATED,
          payload: {
            snapshotId,
            worldHash,
          },
        });
      }

      // 5. Detect Day Boundary Crossing & Invoke IDailyLifecycleProcessor Coordinator
      if (this.currentState.virtualDay > activeDay) {
        const completedDay = activeDay;
        const dayTicks = this.dailyTickRecorder.getRecordedSteps();

        const lifecycleResult = this.options.dailyLifecycleProcessor.processDayTransition({
          previousDay: completedDay,
          newDay: this.currentState.virtualDay,
          previousDayTicks: dayTicks,
          currentState: this.currentState,
        });

        this.dailySummaryRecorder.recordSummary(lifecycleResult.dailySummary);

        // Emit DAY_COMPLETED fact event into TimelineRecorder
        this.timelineRecorder.recordEvent(this.options.runUid, {
          tick: this.currentState.version,
          virtualDay: this.currentState.virtualDay,
          virtualMinute: this.currentState.virtualMinute,
          type: TimelineEventType.DAY_COMPLETED,
          payload: {
            day: completedDay,
            focusMinutes: lifecycleResult.dailySummary.focusMinutes,
            completedActivities: lifecycleResult.dailySummary.completedActivities,
          },
        });

        this.dailyTickRecorder.clear(); // O(1) active day tick recorder reset
        activeDay = this.currentState.virtualDay;
      }
    }

    const finalWorldHash = SnapshotHasher.computeWorldHash(
      this.currentState as unknown as Record<string, unknown>
    );

    // Assemble final ReplayTranscript via ReplayTranscriptBuilder
    const replayTranscript = ReplayTranscriptBuilder.buildTranscript(
      this.options.runUid,
      this.options.seed,
      this.replayRecorder.getRecordedSteps()
    );

    const replayHash = ReplayHasher.computeReplayHash(replayTranscript);

    // Emit SIMULATION_FINISHED fact event into TimelineRecorder
    this.timelineRecorder.recordEvent(this.options.runUid, {
      tick: this.currentState.version,
      virtualDay: this.currentState.virtualDay,
      virtualMinute: this.currentState.virtualMinute,
      type: TimelineEventType.SIMULATION_FINISHED,
      payload: {
        finalDay: this.currentState.virtualDay,
        totalTicks: this.totalTicks,
        replayHash,
      },
    });

    // Assemble canonical SimulationTimeline via TimelineBuilder and compute timelineHash via TimelineHasher
    const timeline = TimelineBuilder.buildTimeline(
      this.options.runUid,
      this.options.seed,
      this.timelineRecorder.getEvents()
    );

    const timelineHash = TimelineHasher.computeTimelineHash(timeline);

    return {
      runUid: this.options.runUid,
      seed: this.options.seed,
      totalTicksExecuted: this.totalTicks,
      startDay: this.options.startDay,
      finalDay: this.currentState.virtualDay,
      finalMinute: this.currentState.virtualMinute,
      terminationReason,
      finalWorldState: this.currentState,
      finalWorldHash,
      replayTranscript,
      replayHash,
      dailySummaries: this.dailySummaryRecorder.getSummaries(),
      timeline,
      timelineHash,
    };
  }
}
