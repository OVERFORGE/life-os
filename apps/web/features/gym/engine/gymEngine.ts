/**
 * apps/web/features/gym/engine/gymEngine.ts
 *
 * Canonical Gym Engine for LifeOS.
 * Centralizes all WorkoutSession mutations: logging, updating, and soft deletion.
 * Guarantees that every mutation flows through OutboxStorageService with:
 * - Monotonic aggregate versioning
 * - Fencing epoch verification
 * - Durable L1/L2 receipts
 * - Canonical outbox events (domain.health.workout_logged, domain.physical.session_deleted)
 * - Explicit dateOnly timezone alignment
 */

import mongoose from "mongoose";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import {
  OutboxStorageService,
  OutboxEventDraft,
} from "@life-os/execution-kernel";

export interface LogSessionInput {
  routineId?: string;
  splitDayName?: string;
  workoutType?: string;
  date?: Date | string;
  dateOnly?: string; // YYYY-MM-DD
  durationSeconds: number;
  calories?: number;
  strainScore?: number;
  exercises?: any[];
  timezone?: string;
}

export interface GymEngineOptions {
  clientMutationId?: string;
  outboxService?: OutboxStorageService;
  workoutModel?: any;
}

/**
 * Resolves local calendar date YYYY-MM-DD from Date/ISO string and optional timezone.
 */
export function resolveDateOnly(dateInput?: Date | string, timezone?: string): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);

  if (timezone) {
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return formatter.format(d); // "YYYY-MM-DD"
    } catch {
      // Fallback to UTC if timezone is invalid
    }
  }

  return d.toISOString().slice(0, 10);
}

/* ─────────────────────────────────────────────────────────── */
/* logSession                                                  */
/* ─────────────────────────────────────────────────────────── */

export async function logSession(
  userId: string,
  input: LogSessionInput,
  options?: GymEngineOptions
) {
  const workoutModel = options?.workoutModel || WorkoutSession;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();

  const sessionId = new mongoose.Types.ObjectId();
  const occurredAt = input.date ? new Date(input.date) : new Date();
  const dateOnly = input.dateOnly || resolveDateOnly(occurredAt, input.timezone);
  const clientMutationId = options?.clientMutationId || `mut_workout_${sessionId}_v1`;
  const diffHash = `diff_workout_${sessionId}_1`;

  const domainUpdates: Record<string, any> = {
    userId: String(userId),
    routineId: input.routineId || undefined,
    splitDayName: input.splitDayName || "",
    workoutType: input.workoutType || "workout",
    date: occurredAt,
    dateOnly,
    durationSeconds: input.durationSeconds || 0,
    calories: input.calories || 0,
    strainScore: input.strainScore || 0,
    status: "active",
    exercises: input.exercises || [],
  };

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.health.workout_logged",
    aggregateId: String(sessionId),
    aggregateType: "workout",
    aggregateVersion: 1,
    source: "web.gym.session",
    payload: {
      sessionId: String(sessionId),
      userId: String(userId),
      date: occurredAt.toISOString(),
      dateOnly,
      workoutType: domainUpdates.workoutType,
      durationSeconds: domainUpdates.durationSeconds,
      durationMinutes: Math.round(domainUpdates.durationSeconds / 60),
      calories: domainUpdates.calories,
      strainScore: domainUpdates.strainScore,
      exercisesCount: domainUpdates.exercises?.length || 0,
      exercises: domainUpdates.exercises,
    },
    occurredAt,
  };

  await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: workoutModel,
    aggregateId: String(sessionId),
    clientMutationId,
    diffHash,
    expectedVersion: 0,
    fencingEpoch: 0,
    domainUpdates,
    eventDrafts: [eventDraft],
    isCreation: true,
  });

  const session = await workoutModel.findById(sessionId);
  return { success: true, session, newVersion: 1 };
}

/* ─────────────────────────────────────────────────────────── */
/* updateSession                                               */
/* ─────────────────────────────────────────────────────────── */

export async function updateSession(
  userId: string,
  sessionId: string,
  updates: Partial<LogSessionInput>,
  expectedVersion?: number,
  options?: GymEngineOptions
) {
  const workoutModel = options?.workoutModel || WorkoutSession;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();

  const session = await workoutModel.findOne({ _id: sessionId, userId });
  if (!session) {
    return { success: false, error: "Workout session not found", statusCode: 404 };
  }

  if (session.status === "archived") {
    return { success: false, error: "Cannot modify an archived workout session", statusCode: 400 };
  }

  const currentVersion = typeof session.version === "number" ? session.version : 0;
  const currentEpoch = typeof session.mutationEpoch === "number" ? session.mutationEpoch : 0;

  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    return {
      success: false,
      error: `Version conflict: aggregate version is ${currentVersion}, expected ${expectedVersion}`,
      code: "AGGREGATE_CONFLICT",
      statusCode: 409,
    };
  }

  const nextVersion = currentVersion + 1;
  const clientMutationId = options?.clientMutationId || `mut_workout_upd_${sessionId}_v${nextVersion}`;
  const diffHash = `diff_workout_upd_${sessionId}_${nextVersion}`;
  const updatedAt = new Date();

  const domainUpdates: Record<string, any> = {};
  if (updates.exercises !== undefined) domainUpdates.exercises = updates.exercises;
  if (updates.durationSeconds !== undefined) domainUpdates.durationSeconds = updates.durationSeconds;
  if (updates.splitDayName !== undefined) domainUpdates.splitDayName = updates.splitDayName;
  if (updates.workoutType !== undefined) domainUpdates.workoutType = updates.workoutType;
  if (updates.calories !== undefined) domainUpdates.calories = updates.calories;
  if (updates.strainScore !== undefined) domainUpdates.strainScore = updates.strainScore;
  if (updates.date !== undefined) {
    domainUpdates.date = new Date(updates.date);
    domainUpdates.dateOnly = updates.dateOnly || resolveDateOnly(domainUpdates.date, updates.timezone);
  } else if (updates.dateOnly !== undefined) {
    domainUpdates.dateOnly = updates.dateOnly;
  }

  const targetDateOnly = domainUpdates.dateOnly || session.dateOnly || resolveDateOnly(session.date);

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.health.workout_logged",
    aggregateId: String(sessionId),
    aggregateType: "workout",
    aggregateVersion: nextVersion,
    source: "web.gym.session.update",
    payload: {
      sessionId: String(sessionId),
      userId: String(userId),
      isUpdate: true,
      date: new Date(domainUpdates.date || session.date || updatedAt).toISOString(),
      dateOnly: targetDateOnly,
      workoutType: domainUpdates.workoutType || session.workoutType,
      durationSeconds: domainUpdates.durationSeconds !== undefined ? domainUpdates.durationSeconds : session.durationSeconds,
      calories: domainUpdates.calories !== undefined ? domainUpdates.calories : session.calories,
      strainScore: domainUpdates.strainScore !== undefined ? domainUpdates.strainScore : session.strainScore,
      exercises: domainUpdates.exercises || session.exercises,
      updatedAt: updatedAt.toISOString(),
    },
    occurredAt: updatedAt,
  };

  await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: workoutModel,
    aggregateId: String(sessionId),
    clientMutationId,
    diffHash,
    expectedVersion: currentVersion,
    fencingEpoch: currentEpoch,
    domainUpdates,
    eventDrafts: [eventDraft],
  });

  const updatedSession = await workoutModel.findById(sessionId);
  return { success: true, session: updatedSession, newVersion: nextVersion };
}

/* ─────────────────────────────────────────────────────────── */
/* deleteSession (Soft Archival)                               */
/* ─────────────────────────────────────────────────────────── */

export async function deleteSession(
  userId: string,
  sessionId: string,
  expectedVersion?: number,
  options?: GymEngineOptions
) {
  const workoutModel = options?.workoutModel || WorkoutSession;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();

  const session = await workoutModel.findOne({ _id: sessionId, userId });
  if (!session) {
    return { success: false, error: "Workout session not found", statusCode: 404 };
  }

  if (session.status === "archived") {
    return { success: true, session, newVersion: session.version };
  }

  const currentVersion = typeof session.version === "number" ? session.version : 0;
  const currentEpoch = typeof session.mutationEpoch === "number" ? session.mutationEpoch : 0;

  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    return {
      success: false,
      error: `Version conflict: aggregate version is ${currentVersion}, expected ${expectedVersion}`,
      code: "AGGREGATE_CONFLICT",
      statusCode: 409,
    };
  }

  const nextVersion = currentVersion + 1;
  const clientMutationId = options?.clientMutationId || `mut_workout_del_${sessionId}_v${nextVersion}`;
  const diffHash = `diff_workout_del_${sessionId}_${nextVersion}`;
  const archivedAt = new Date();
  const dateOnly = session.dateOnly || resolveDateOnly(session.date);

  const domainUpdates = {
    status: "archived",
    archivedAt,
  };

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.physical.session_deleted",
    aggregateId: String(sessionId),
    aggregateType: "workout",
    aggregateVersion: nextVersion,
    source: "web.gym.session.delete",
    payload: {
      sessionId: String(sessionId),
      userId: String(userId),
      date: session.date ? new Date(session.date).toISOString() : archivedAt.toISOString(),
      dateOnly,
      deletedAt: archivedAt.toISOString(),
    },
    occurredAt: archivedAt,
  };

  await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: workoutModel,
    aggregateId: String(sessionId),
    clientMutationId,
    diffHash,
    expectedVersion: currentVersion,
    fencingEpoch: currentEpoch,
    domainUpdates,
    eventDrafts: [eventDraft],
  });

  const archivedSession = await workoutModel.findById(sessionId);
  return { success: true, session: archivedSession, newVersion: nextVersion };
}

export const gymEngine = {
  logSession,
  updateSession,
  deleteSession,
  resolveDateOnly,
};
