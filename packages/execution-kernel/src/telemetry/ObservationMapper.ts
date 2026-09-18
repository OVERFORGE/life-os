import { Observation, createFrozenObservation, ObservationType } from "./Observation";
import { DailyLogData } from "../repositories/DailyLogRepository";
import { TaskData } from "../repositories/TaskRepository";
import { GoalData } from "../repositories/GoalRepository";
import { EraData } from "../repositories/EraRepository";

export interface TelemetryExtractionInput {
  userId: string;
  generationTimestamp: number;   // Deterministic epoch timestamp supplied by TelemetryPayload
  dailyLogs: DailyLogData[];
  tasks: TaskData[];
  goals: GoalData[];
  activeEra?: EraData | null;
}

/**
 * Pure Functional Transformer: ObservationMapper
 * 
 * Maps raw database facts to normalized, immutable, versioned Observation[] instances.
 * NO Database queries, NO random values, NO Date.now() calls. 100% Deterministic Replay.
 */
export class ObservationMapper {
  static toObservations(input: TelemetryExtractionInput): Observation[] {
    const { userId, generationTimestamp, dailyLogs = [], tasks = [], goals = [], activeEra } = input;
    const observations: Observation[] = [];

    // Derive deterministic baseline timestamp from generationTimestamp or latest log
    const latestLogTime = dailyLogs.length > 0
      ? Math.max(...dailyLogs.map((l) => (l.date ? new Date(l.date).getTime() : 0)))
      : generationTimestamp;
    
    const baseTimestamp = latestLogTime > 0 ? latestLogTime : generationTimestamp;

    // 1. ObservationType: HighPhysiologicalStress
    for (const log of dailyLogs) {
      const logDateMs = log.date ? new Date(log.date).getTime() : baseTimestamp;
      const entityId = log._id ? String(log._id) : `log-${log.date}`;

      if (log.mental?.stress !== undefined && log.mental.stress !== null) {
        const raw = log.mental.stress;
        const norm = Math.min(1.0, Math.max(0.0, raw / 10.0));
        observations.push(
          createFrozenObservation({
            id: `obs-stress-${entityId}`,
            type: "HighPhysiologicalStress",
            userId,
            timestamp: logDateMs,
            generatedAt: generationTimestamp,
            generatedBy: "ObservationMapper-v1",
            confidence: 1.0,
            normalizedValue: norm,
            rawValue: raw,
            unit: "points",
            metadata: { windowDays: 14, rollingAverage: norm },
            ownership: {
              sourceCollection: "dailylogs",
              sourceEntityId: entityId,
              originatingSubsystem: "PhysiologyTelemetry",
              createdAt: logDateMs,
            },
          })
        );
      }

      // 2. ObservationType: EnergyDeficit
      if (log.mental?.energy !== undefined && log.mental.energy !== null) {
        const raw = log.mental.energy;
        const norm = Math.min(1.0, Math.max(0.0, (10.0 - raw) / 10.0));
        observations.push(
          createFrozenObservation({
            id: `obs-energy-${entityId}`,
            type: "EnergyDeficit",
            userId,
            timestamp: logDateMs,
            generatedAt: generationTimestamp,
            generatedBy: "ObservationMapper-v1",
            confidence: 1.0,
            normalizedValue: norm,
            rawValue: raw,
            unit: "points",
            metadata: { windowDays: 14, rollingAverage: norm },
            ownership: {
              sourceCollection: "dailylogs",
              sourceEntityId: entityId,
              originatingSubsystem: "PhysiologyTelemetry",
              createdAt: logDateMs,
            },
          })
        );
      }

      // 3. ObservationType: SleepDeprivation
      if (log.sleep?.hours !== undefined && log.sleep.hours !== null) {
        const raw = log.sleep.hours;
        const norm = Math.min(1.0, Math.max(0.0, Math.max(0, 8.0 - raw) / 8.0));
        observations.push(
          createFrozenObservation({
            id: `obs-sleep-${entityId}`,
            type: "SleepDeprivation",
            userId,
            timestamp: logDateMs,
            generatedAt: generationTimestamp,
            generatedBy: "ObservationMapper-v1",
            confidence: 1.0,
            normalizedValue: norm,
            rawValue: raw,
            unit: "hours",
            metadata: { windowDays: 14, targetHours: 8.0 },
            ownership: {
              sourceCollection: "dailylogs",
              sourceEntityId: entityId,
              originatingSubsystem: "PhysiologyTelemetry",
              createdAt: logDateMs,
            },
          })
        );
      }

      // 4. ObservationType: HabitDecay
      if (log.habits) {
        const habitKeys = Object.keys(log.habits);
        const completedHabits = habitKeys.filter((k) => log.habits![k] === true).length;
        const habitRatio = habitKeys.length > 0 ? completedHabits / habitKeys.length : 1.0;
        const decayNorm = Math.min(1.0, Math.max(0.0, 1.0 - habitRatio));

        observations.push(
          createFrozenObservation({
            id: `obs-habitdecay-${entityId}`,
            type: "HabitDecay",
            userId,
            timestamp: logDateMs,
            generatedAt: generationTimestamp,
            generatedBy: "ObservationMapper-v1",
            confidence: 0.90,
            normalizedValue: decayNorm,
            rawValue: completedHabits,
            unit: "ratio",
            metadata: { totalHabits: habitKeys.length, completedHabits },
            ownership: {
              sourceCollection: "dailylogs",
              sourceEntityId: entityId,
              originatingSubsystem: "BehavioralTelemetry",
              createdAt: logDateMs,
            },
          })
        );
      }
    }

    // 5. ObservationType: TaskExecutionVelocity
    if (tasks.length > 0) {
      const completedCount = tasks.filter((t) => t.status === "completed").length;
      const velocityRatio = Math.min(1.0, completedCount / tasks.length);

      observations.push(
        createFrozenObservation({
          id: `obs-task-velocity-${userId}`,
          type: "TaskExecutionVelocity",
          userId,
          timestamp: baseTimestamp,
          generatedAt: generationTimestamp,
          generatedBy: "ObservationMapper-v1",
          confidence: 0.95,
          normalizedValue: velocityRatio,
          rawValue: completedCount,
          unit: "count",
          metadata: { completionRate: velocityRatio, totalTasks: tasks.length },
          ownership: {
            sourceCollection: "tasks",
            sourceEntityId: `batch-tasks-${userId}`,
            originatingSubsystem: "ExecutionTelemetry",
            createdAt: baseTimestamp,
          },
        })
      );

      // 6. ObservationType: CadenceDrift
      const overdueTasks = tasks.filter((t) => t.status === "pending" && t.dueDate && new Date(t.dueDate).getTime() < baseTimestamp).length;
      const driftNorm = Math.min(1.0, overdueTasks / Math.max(1, tasks.length));

      observations.push(
        createFrozenObservation({
          id: `obs-cadence-drift-${userId}`,
          type: "CadenceDrift",
          userId,
          timestamp: baseTimestamp,
          generatedAt: generationTimestamp,
          generatedBy: "ObservationMapper-v1",
          confidence: 0.90,
          normalizedValue: driftNorm,
          rawValue: overdueTasks,
          unit: "count",
          metadata: { overdueCount: overdueTasks, totalTasks: tasks.length },
          ownership: {
            sourceCollection: "tasks",
            sourceEntityId: `batch-cadence-${userId}`,
            originatingSubsystem: "ExecutionTelemetry",
            createdAt: baseTimestamp,
          },
        })
      );
    }

    // 7. ObservationType: GoalTargetApproach
    for (const goal of goals) {
      const goalId = goal._id ? String(goal._id) : `goal-${goal.title}`;
      const progress = goal.progress ?? 0.0;
      const normProgress = Math.min(1.0, Math.max(0.0, progress / 100.0));

      observations.push(
        createFrozenObservation({
          id: `obs-goal-approach-${goalId}`,
          type: "GoalTargetApproach",
          userId,
          timestamp: baseTimestamp,
          generatedAt: generationTimestamp,
          generatedBy: "ObservationMapper-v1",
          confidence: 0.85,
          normalizedValue: normProgress,
          rawValue: progress,
          unit: "percent",
          metadata: { goalId, targetDate: goal.targetDate, trend: "stable" },
          ownership: {
            sourceCollection: "goals",
            sourceEntityId: goalId,
            originatingSubsystem: "CapacityTelemetry",
            createdAt: baseTimestamp,
          },
        })
      );
    }

    // 8. ObservationType: PhaseTransition
    if (activeEra) {
      const eraId = activeEra._id ? String(activeEra._id) : `era-${activeEra.name}`;
      const eraStartMs = activeEra.startDate ? new Date(activeEra.startDate).getTime() : baseTimestamp;

      observations.push(
        createFrozenObservation({
          id: `obs-phase-transition-${eraId}`,
          type: "PhaseTransition",
          userId,
          timestamp: eraStartMs,
          generatedAt: generationTimestamp,
          generatedBy: "ObservationMapper-v1",
          confidence: 1.0,
          normalizedValue: 1.0,
          rawValue: 1,
          unit: "state",
          metadata: { eraName: activeEra.name, focusDomain: activeEra.focusDomain },
          ownership: {
            sourceCollection: "eras",
            sourceEntityId: eraId,
            originatingSubsystem: "MacroTelemetry",
            createdAt: eraStartMs,
          },
        })
      );
    }

    // Deterministic Sort by timestamp ascending, then id ascending
    return observations.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return a.id.localeCompare(b.id);
    });
  }
}
