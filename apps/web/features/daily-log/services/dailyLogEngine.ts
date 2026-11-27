import crypto from "crypto";
import mongoose from "mongoose";
import { OutboxStorageService, OutboxEventDraft } from "@life-os/execution-kernel";
import { DailyLog } from "@/server/db/models/DailyLog";

export interface DailyLogMutationOptions {
  clientMutationId?: string;
  expectedVersion?: number;
  source?: string;
  dailyLogModel?: any;
  outboxService?: OutboxStorageService;
}

export interface UpsertDailyLogInput {
  userId: string;
  date: string;
  /** Full/partial structured sections to merge onto DailyLog */
  sections?: Record<string, any>;
  /** Explicit dot-notation field updates (e.g. { "physical.calories": 1850 }) */
  dotUpdates?: Record<string, any>;
  /** If true, preserve existing signals map when sections.signals is omitted */
  preserveSignals?: boolean;
  options?: DailyLogMutationOptions;
}

function toUserQueryId(userId: string): any {
  return mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;
}

function isDuplicateKeyError(err: any): boolean {
  return err?.code === 11000 || (err?.name === "MongoServerError" && err?.code === 11000);
}

function isConflictError(err: any): boolean {
  return (
    err?.name === "ConcurrencyConflictError" ||
    err?.code === "AGGREGATE_CONFLICT" ||
    /Concurrency conflict|Optimistic concurrency conflict|Version conflict|stale version/i.test(String(err?.message || ""))
  );
}

export async function ensureDailyLogShell(
  userId: string,
  date: string,
  dailyLogModel: any = DailyLog
): Promise<any> {
  const userObjId = toUserQueryId(userId);
  let doc = await dailyLogModel.findOne({ userId: userObjId, date });
  if (!doc) {
    try {
      doc = await dailyLogModel.create({
        userId: userObjId,
        date,
        signals: {},
        sleep: {},
        mental: {},
        physical: {},
        work: {},
        habits: {},
        planning: {},
        reflection: {},
        version: 0,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      });
    } catch (err: any) {
      if (!isDuplicateKeyError(err)) throw err;
      doc = await dailyLogModel.findOne({ userId: userObjId, date });
    }
  }

  if (doc && (doc.version === undefined || doc.mutationEpoch === undefined)) {
    await dailyLogModel.updateOne(
      { _id: doc._id, version: { $exists: false } },
      { $set: { version: 0, mutationEpoch: 0, recentMutationReceipts: [] } }
    );
    doc = await dailyLogModel.findById(doc._id);
  }

  return doc;
}

/**
 * Persists DailyLog updates through OutboxStorageService with optimistic concurrency,
 * deterministic receipt idempotency, and concurrent first-day creation protection.
 */
export async function upsertDailyLogWithOutbox(input: UpsertDailyLogInput): Promise<{
  success: boolean;
  log?: any;
  newVersion?: number;
  deduplicated?: boolean;
  error?: string;
  code?: string;
  statusCode?: number;
}> {
  const { userId, date, sections, dotUpdates, preserveSignals = true, options } = input;
  const dailyLogModel = options?.dailyLogModel || DailyLog;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();
  const explicitExpectedVersion = options?.expectedVersion;
  const maxRetries = explicitExpectedVersion !== undefined ? 1 : 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const existing = await ensureDailyLogShell(userId, date, dailyLogModel);
    if (!existing) {
      return { success: false, error: "Failed to initialize DailyLog shell", statusCode: 500 };
    }

    const currentVersion = typeof existing.version === "number" ? existing.version : 0;
    const currentEpoch = typeof existing.mutationEpoch === "number" ? existing.mutationEpoch : 0;

    if (explicitExpectedVersion !== undefined && explicitExpectedVersion !== currentVersion) {
      return {
        success: false,
        error: `Version conflict: aggregate version is ${currentVersion}, expected ${explicitExpectedVersion}`,
        code: "AGGREGATE_CONFLICT",
        statusCode: 409,
      };
    }

    const domainUpdates: Record<string, any> = {};
    const updatedSections: string[] = [];

    if (sections) {
      for (const [k, v] of Object.entries(sections)) {
        if (k === "userId" || k === "date" || k === "_id" || k === "version" || k === "mutationEpoch" || k === "recentMutationReceipts") {
          continue;
        }
        if (v !== undefined) {
          domainUpdates[k] = v;
          updatedSections.push(k);
        }
      }
      if (preserveSignals && domainUpdates.signals === undefined && existing.signals !== undefined) {
        domainUpdates.signals = existing.signals;
      }
    }

    if (dotUpdates) {
      for (const [pathKey, val] of Object.entries(dotUpdates)) {
        domainUpdates[pathKey] = val;
        const root = pathKey.split(".")[0];
        if (root && !updatedSections.includes(root)) {
          updatedSections.push(root);
        }
      }
    }

    const nextVersion = currentVersion + 1;
    const aggregateId = String(existing._id);
    const occurredAt = new Date();
    const diffHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ aggregateId, date, nextVersion, domainUpdates }))
      .digest("hex")
      .slice(0, 24);
    const clientMutationId =
      options?.clientMutationId || `mut_dailylog_${aggregateId}_v${nextVersion}_${diffHash}`;

    const mergedSleep = domainUpdates.sleep || existing.sleep || {};
    const mergedMental = domainUpdates.mental || existing.mental || {};
    const mergedWork = domainUpdates.work || existing.work || {};
    const mergedPhysical = domainUpdates.physical || existing.physical || {};

    const sleepHours =
      typeof domainUpdates["sleep.hours"] === "number"
        ? domainUpdates["sleep.hours"]
        : typeof mergedSleep.hours === "number"
          ? mergedSleep.hours
          : undefined;
    const sleepQuality =
      typeof domainUpdates["sleep.quality"] === "number"
        ? domainUpdates["sleep.quality"]
        : typeof mergedSleep.quality === "number"
          ? mergedSleep.quality
          : undefined;
    const mentalMood =
      typeof domainUpdates["mental.mood"] === "number"
        ? domainUpdates["mental.mood"]
        : typeof mergedMental.mood === "number"
          ? mergedMental.mood
          : undefined;
    const mentalEnergy =
      typeof domainUpdates["mental.energy"] === "number"
        ? domainUpdates["mental.energy"]
        : typeof mergedMental.energy === "number"
          ? mergedMental.energy
          : undefined;
    const mentalStress =
      typeof domainUpdates["mental.stress"] === "number"
        ? domainUpdates["mental.stress"]
        : typeof mergedMental.stress === "number"
          ? mergedMental.stress
          : undefined;
    const mentalFocus =
      typeof domainUpdates["mental.focus"] === "number"
        ? domainUpdates["mental.focus"]
        : typeof mergedMental.focus === "number"
          ? mergedMental.focus
          : undefined;
    const deepWorkHours =
      typeof domainUpdates["work.deepWorkHours"] === "number"
        ? domainUpdates["work.deepWorkHours"]
        : typeof mergedWork.deepWorkHours === "number"
          ? mergedWork.deepWorkHours
          : undefined;
    const calories =
      typeof domainUpdates["physical.calories"] === "number"
        ? domainUpdates["physical.calories"]
        : typeof mergedPhysical.calories === "number"
          ? mergedPhysical.calories
          : undefined;

    const eventDraft: OutboxEventDraft = {
      userId: String(userId),
      category: "DOMAIN_EVENT",
      type: "domain.daily_log.updated",
      aggregateId,
      aggregateType: "dailylog",
      aggregateVersion: nextVersion,
      source: options?.source || "web.daily_log.save",
      payload: {
        logId: aggregateId,
        userId: String(userId),
        date,
        updatedSections,
        ...(sleepHours !== undefined ? { sleepHours } : {}),
        ...(sleepQuality !== undefined ? { sleepQuality } : {}),
        ...(mentalMood !== undefined ? { mentalMood } : {}),
        ...(mentalEnergy !== undefined ? { mentalEnergy } : {}),
        ...(mentalStress !== undefined ? { mentalStress } : {}),
        ...(mentalFocus !== undefined ? { mentalFocus } : {}),
        ...(deepWorkHours !== undefined ? { deepWorkHours } : {}),
        ...(calories !== undefined ? { calories } : {}),
        updatedAt: occurredAt.toISOString(),
      },
      occurredAt,
    };

    try {
      const commitResult = await outboxService.persistWithStandaloneFencing({
        userId: String(userId),
        aggregateModel: dailyLogModel,
        aggregateId,
        clientMutationId,
        diffHash,
        expectedVersion: currentVersion,
        fencingEpoch: currentEpoch,
        domainUpdates,
        eventDrafts: [eventDraft],
      });

      const updatedLog = await dailyLogModel.findById(aggregateId);
      return {
        success: true,
        log: updatedLog,
        newVersion: nextVersion,
        deduplicated: Boolean(commitResult.isIdempotentReplay),
      };
    } catch (err: any) {
      if (isConflictError(err)) {
        if (explicitExpectedVersion !== undefined) {
          return {
            success: false,
            error: err?.message || "Optimistic concurrency conflict",
            code: "AGGREGATE_CONFLICT",
            statusCode: 409,
          };
        }
        continue;
      }
      throw err;
    }
  }

  return {
    success: false,
    error: "Concurrent DailyLog update conflict after retries",
    code: "AGGREGATE_CONFLICT",
    statusCode: 409,
  };
}
