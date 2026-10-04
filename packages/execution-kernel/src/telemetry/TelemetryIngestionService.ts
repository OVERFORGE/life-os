import { DailyLogRepository, DailyLogData } from "../repositories/DailyLogRepository";
import { TaskRepository, TaskData } from "../repositories/TaskRepository";
import { GoalRepository, GoalData } from "../repositories/GoalRepository";
import { EraRepository, EraData } from "../repositories/EraRepository";
import { getSubsystemWindowDays } from "./TelemetryWindowRegistry";
import { calculateTelemetryQuality, TelemetryQuality } from "./TelemetryQuality";
import { ObservationMapper } from "./ObservationMapper";
import { Observation } from "./Observation";

import { ObservationPipeline } from "./pipeline/ObservationPipeline";

export interface ReplayMetadata {
  replayId: string;
  isReplay: boolean;
  fixtureVersion: string;
}

export interface TelemetryPayload {
  schemaVersion: 1;
  telemetryVersion: "1.0.0";
  extractionVersion: "1.0.0";
  userId: string;
  generationTimestamp: number;
  telemetryWindow: number;
  observations: Observation[];
  raw14DayLogs: DailyLogData[];
  activeTasks: TaskData[];
  activeGoals: GoalData[];
  activeEra: EraData | null;
  telemetryQuality: TelemetryQuality;
  replayMetadata: ReplayMetadata;
}

export class TelemetryIngestionService {
  private static instance: TelemetryIngestionService;

  static getInstance(): TelemetryIngestionService {
    if (!TelemetryIngestionService.instance) {
      TelemetryIngestionService.instance = new TelemetryIngestionService();
    }
    return TelemetryIngestionService.instance;
  }

  /**
   * Ingests, normalizes, and packages telemetry across all registered repositories
   * and the continuous passive observation pipeline concurrently.
   */
  async ingestTelemetry(userId: string, targetTimestamp?: number): Promise<TelemetryPayload> {
    const windowDays = getSubsystemWindowDays("LifeStateEngine"); // 14 Days

    // Determine generation timestamp deterministically if targetTimestamp is supplied
    const initialNow = targetTimestamp || Date.now();
    const windowStartMs = initialNow - windowDays * 24 * 60 * 60 * 1000;

    // Concurrent batch read
    const [raw14DayLogs, activeTasks, activeGoals, activeEra, passiveObservations] = await Promise.all([
      DailyLogRepository.getInstance().findLogsForWindow(userId, windowDays),
      TaskRepository.getInstance().findAllActiveTasks(userId),
      GoalRepository.getInstance().findAllActiveGoals(userId),
      EraRepository.getInstance().findActiveEra(userId),
      ObservationPipeline.getInstance().getObservationsForWindow(userId, windowStartMs, initialNow),
    ]);

    const logDates = raw14DayLogs
      .filter((l) => Boolean(l.date))
      .map((l) => new Date(l.date));

    const latestLogTime = logDates.length > 0 ? Math.max(...logDates.map((d) => d.getTime())) : initialNow;
    const generationTimestamp = targetTimestamp || (latestLogTime > 0 ? latestLogTime : initialNow);

    const telemetryQuality = calculateTelemetryQuality(logDates, windowDays, 0.90, generationTimestamp);

    // Map manual observations deterministically
    const manualObservations = ObservationMapper.toObservations({
      userId,
      generationTimestamp,
      dailyLogs: raw14DayLogs,
      tasks: activeTasks,
      goals: activeGoals,
      activeEra,
    });

    // Merge passive and manual observations with deterministic deduplication
    const obsMap = new Map<string, Observation>();
    for (const pObs of passiveObservations) {
      obsMap.set(pObs.id, pObs);
    }
    for (const mObs of manualObservations) {
      obsMap.set(mObs.id, mObs);
    }
    const observations = Array.from(obsMap.values());

    return Object.freeze({
      schemaVersion: 1,
      telemetryVersion: "1.0.0",
      extractionVersion: "1.0.0",
      userId,
      generationTimestamp,
      telemetryWindow: windowDays,
      observations,
      raw14DayLogs,
      activeTasks,
      activeGoals,
      activeEra,
      telemetryQuality,
      replayMetadata: Object.freeze({
        replayId: `replay-${userId}-${generationTimestamp}`,
        isReplay: false,
        fixtureVersion: "live-db",
      }),
    });
  }

  /**
   * Hydrates static telemetry fixtures for deterministic replay testing.
   */
  static hydrateForReplay(input: {
    userId: string;
    dailyLogs: DailyLogData[];
    tasks: TaskData[];
    goals: GoalData[];
    activeEra?: EraData | null;
    generationTimestamp?: number;
  }): TelemetryPayload {
    const windowDays = 14;
    const generationTimestamp = input.generationTimestamp || 1785096398950; // Static deterministic epoch ms

    const logDates = input.dailyLogs
      .filter((l) => Boolean(l.date))
      .map((l) => new Date(l.date));

    const telemetryQuality = calculateTelemetryQuality(logDates, windowDays, 0.90, generationTimestamp);
    
    const observations = ObservationMapper.toObservations({
      userId: input.userId,
      generationTimestamp,
      dailyLogs: input.dailyLogs,
      tasks: input.tasks,
      goals: input.goals,
      activeEra: input.activeEra,
    });

    return Object.freeze({
      schemaVersion: 1,
      telemetryVersion: "1.0.0",
      extractionVersion: "1.0.0",
      userId: input.userId,
      generationTimestamp,
      telemetryWindow: windowDays,
      observations,
      raw14DayLogs: input.dailyLogs,
      activeTasks: input.tasks,
      activeGoals: input.goals,
      activeEra: input.activeEra || null,
      telemetryQuality,
      replayMetadata: Object.freeze({
        replayId: `golden-replay-${input.userId}`,
        isReplay: true,
        fixtureVersion: "golden-v1",
      }),
    });
  }
}
