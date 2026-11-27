import crypto from "crypto";
import mongoose from "mongoose";
import { OutboxStorageService, OutboxEventDraft } from "@life-os/execution-kernel";
import { WeightLog } from "@/server/db/models/WeightLog";

export interface WeightLogMutationOptions {
  clientMutationId?: string;
  expectedVersion?: number;
  source?: string;
  weightLogModel?: any;
  outboxService?: OutboxStorageService;
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

async function ensureWeightLogShell(
  userId: string,
  date: string,
  initialWeight: number,
  weightLogModel: any = WeightLog
): Promise<any> {
  const userObjId = toUserQueryId(userId);
  let doc = await weightLogModel.findOne({ userId: userObjId, date });
  if (!doc) {
    try {
      doc = await weightLogModel.create({
        userId: userObjId,
        date,
        weight: initialWeight,
        deletedAt: null,
        version: 0,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      });
    } catch (err: any) {
      if (!isDuplicateKeyError(err)) throw err;
      doc = await weightLogModel.findOne({ userId: userObjId, date });
    }
  }

  if (doc && (doc.version === undefined || doc.mutationEpoch === undefined)) {
    await weightLogModel.updateOne(
      { _id: doc._id, version: { $exists: false } },
      { $set: { version: 0, mutationEpoch: 0, recentMutationReceipts: [] } }
    );
    doc = await weightLogModel.findById(doc._id);
  }

  return doc;
}

export async function upsertWeightLogWithOutbox(
  userId: string,
  date: string,
  weight: number,
  options?: WeightLogMutationOptions
): Promise<{
  success: boolean;
  log?: any;
  newVersion?: number;
  deduplicated?: boolean;
  error?: string;
  code?: string;
  statusCode?: number;
}> {
  const weightLogModel = options?.weightLogModel || WeightLog;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();
  const explicitExpectedVersion = options?.expectedVersion;
  const maxRetries = explicitExpectedVersion !== undefined ? 1 : 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const existing = await ensureWeightLogShell(userId, date, weight, weightLogModel);
    if (!existing) {
      return { success: false, error: "Failed to initialize WeightLog shell", statusCode: 500 };
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

    const nextVersion = currentVersion + 1;
    const aggregateId = String(existing._id);
    const occurredAt = new Date();
    const diffHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ aggregateId, date, nextVersion, weight }))
      .digest("hex")
      .slice(0, 24);
    const clientMutationId =
      options?.clientMutationId || `mut_weight_${aggregateId}_v${nextVersion}_${diffHash}`;

    const eventDraft: OutboxEventDraft = {
      userId: String(userId),
      category: "DOMAIN_EVENT",
      type: "domain.weight.logged",
      aggregateId,
      aggregateType: "weight_log",
      aggregateVersion: nextVersion,
      source: options?.source || "web.health.weight.upsert",
      payload: {
        weightLogId: aggregateId,
        userId: String(userId),
        date,
        weight,
        deleted: false,
        loggedAt: occurredAt.toISOString(),
      },
      occurredAt,
    };

    try {
      const commitResult = await outboxService.persistWithStandaloneFencing({
        userId: String(userId),
        aggregateModel: weightLogModel,
        aggregateId,
        clientMutationId,
        diffHash,
        expectedVersion: currentVersion,
        fencingEpoch: currentEpoch,
        domainUpdates: { weight, deletedAt: null },
        eventDrafts: [eventDraft],
      });
      const updatedLog = await weightLogModel.findById(aggregateId);
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
    error: "Concurrent WeightLog update conflict after retries",
    code: "AGGREGATE_CONFLICT",
    statusCode: 409,
  };
}

export async function deleteWeightLogWithOutbox(
  userId: string,
  date: string,
  options?: WeightLogMutationOptions
): Promise<{
  success: boolean;
  deleted?: boolean;
  error?: string;
  code?: string;
  statusCode?: number;
}> {
  const weightLogModel = options?.weightLogModel || WeightLog;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();
  const userObjId = toUserQueryId(userId);

  const existing = await weightLogModel.findOne({ userId: userObjId, date });
  if (!existing || existing.deletedAt) {
    return { success: true, deleted: false };
  }

  if (existing.version === undefined || existing.mutationEpoch === undefined) {
    await weightLogModel.updateOne(
      { _id: existing._id, version: { $exists: false } },
      { $set: { version: 0, mutationEpoch: 0, recentMutationReceipts: [] } }
    );
  }

  const currentVersion = typeof existing.version === "number" ? existing.version : 0;
  const currentEpoch = typeof existing.mutationEpoch === "number" ? existing.mutationEpoch : 0;

  if (options?.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
    return {
      success: false,
      error: `Version conflict: aggregate version is ${currentVersion}, expected ${options.expectedVersion}`,
      code: "AGGREGATE_CONFLICT",
      statusCode: 409,
    };
  }

  const nextVersion = currentVersion + 1;
  const aggregateId = String(existing._id);
  const occurredAt = new Date();
  const clientMutationId =
    options?.clientMutationId || `mut_weight_del_${aggregateId}_v${nextVersion}`;

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.weight.logged",
    aggregateId,
    aggregateType: "weight_log",
    aggregateVersion: nextVersion,
    source: options?.source || "web.health.weight.delete",
    payload: {
      weightLogId: aggregateId,
      userId: String(userId),
      date,
      weight: null,
      deleted: true,
      loggedAt: occurredAt.toISOString(),
    },
    occurredAt,
  };

  await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: weightLogModel,
    aggregateId,
    clientMutationId,
    diffHash: `diff_weight_del_${aggregateId}_${nextVersion}`,
    expectedVersion: currentVersion,
    fencingEpoch: currentEpoch,
    domainUpdates: { deletedAt: occurredAt },
    eventDrafts: [eventDraft],
  });

  return { success: true, deleted: true };
}
