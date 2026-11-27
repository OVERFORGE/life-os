import crypto from "crypto";
import mongoose from "mongoose";
import { OutboxStorageService, OutboxEventDraft } from "@life-os/execution-kernel";
import { NutritionLog } from "@/server/db/models/NutritionLog";
import { DailyLog } from "@/server/db/models/DailyLog";
import { upsertDailyLogWithOutbox } from "@/features/daily-log/services/dailyLogEngine";

export interface NutritionLogMutationOptions {
  clientMutationId?: string;
  expectedVersion?: number;
  source?: string;
  nutritionLogModel?: any;
  dailyLogModel?: any;
  outboxService?: OutboxStorageService;
}

export interface SaveNutritionLogInput {
  userId: string;
  date: string;
  meals: any[];
  dailyTotals?: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
  options?: NutritionLogMutationOptions;
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

export function computeNutritionTotals(meals: any[]): {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
} {
  return (meals || []).reduce(
    (acc, meal) => ({
      calories: Math.round(acc.calories + (Number(meal?.macros?.calories) || 0)),
      protein: Number((acc.protein + (Number(meal?.macros?.protein) || 0)).toFixed(1)),
      carbs: Number((acc.carbs + (Number(meal?.macros?.carbs) || 0)).toFixed(1)),
      fats: Number((acc.fats + (Number(meal?.macros?.fats) || 0)).toFixed(1)),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );
}

export async function ensureNutritionLogShell(
  userId: string,
  date: string,
  nutritionLogModel: any = NutritionLog
): Promise<any> {
  const userObjId = toUserQueryId(userId);
  let doc = await nutritionLogModel.findOne({ userId: userObjId, date });
  if (!doc) {
    try {
      doc = await nutritionLogModel.create({
        userId: userObjId,
        date,
        meals: [],
        dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        version: 0,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      });
    } catch (err: any) {
      if (!isDuplicateKeyError(err)) throw err;
      doc = await nutritionLogModel.findOne({ userId: userObjId, date });
    }
  }

  if (doc && (doc.version === undefined || doc.mutationEpoch === undefined)) {
    await nutritionLogModel.updateOne(
      { _id: doc._id, version: { $exists: false } },
      { $set: { version: 0, mutationEpoch: 0, recentMutationReceipts: [] } }
    );
    doc = await nutritionLogModel.findById(doc._id);
  }

  return doc;
}

/**
 * Persists NutritionLog through OutboxStorageService and durably syncs DailyLog.physical.calories
 * through OutboxStorageService (zero unawaited fire-and-forget writes).
 */
export async function saveNutritionLogWithOutbox(input: SaveNutritionLogInput): Promise<{
  success: boolean;
  log?: any;
  dailyTotals?: { calories: number; protein: number; carbs: number; fats: number };
  newVersion?: number;
  deduplicated?: boolean;
  error?: string;
  code?: string;
  statusCode?: number;
}> {
  const { userId, date, meals, options } = input;
  const nutritionLogModel = options?.nutritionLogModel || NutritionLog;
  const dailyLogModel = options?.dailyLogModel || DailyLog;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();
  const explicitExpectedVersion = options?.expectedVersion;
  const maxRetries = explicitExpectedVersion !== undefined ? 1 : 3;

  const normalizedTotals = input.dailyTotals
    ? {
        calories: Number(input.dailyTotals.calories) || 0,
        protein: Number(input.dailyTotals.protein) || 0,
        carbs: Number(input.dailyTotals.carbs) || 0,
        fats: Number(input.dailyTotals.fats) || 0,
      }
    : computeNutritionTotals(meals);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const existing = await ensureNutritionLogShell(userId, date, nutritionLogModel);
    if (!existing) {
      return { success: false, error: "Failed to initialize NutritionLog shell", statusCode: 500 };
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
      .update(JSON.stringify({ aggregateId, date, nextVersion, mealsCount: meals.length, normalizedTotals }))
      .digest("hex")
      .slice(0, 24);
    const clientMutationId =
      options?.clientMutationId || `mut_nutrition_${aggregateId}_v${nextVersion}_${diffHash}`;

    const eventDraft: OutboxEventDraft = {
      userId: String(userId),
      category: "DOMAIN_EVENT",
      type: "domain.nutrition.logged",
      aggregateId,
      aggregateType: "nutrition_log",
      aggregateVersion: nextVersion,
      source: options?.source || "web.nutrition.log",
      payload: {
        logId: aggregateId,
        userId: String(userId),
        date,
        mealsCount: meals.length,
        dailyTotals: normalizedTotals,
        loggedAt: occurredAt.toISOString(),
      },
      occurredAt,
    };

    try {
      const commitResult = await outboxService.persistWithStandaloneFencing({
        userId: String(userId),
        aggregateModel: nutritionLogModel,
        aggregateId,
        clientMutationId,
        diffHash,
        expectedVersion: currentVersion,
        fencingEpoch: currentEpoch,
        domainUpdates: {
          meals,
          dailyTotals: normalizedTotals,
        },
        eventDrafts: [eventDraft],
      });

      const updatedLog = await nutritionLogModel.findById(aggregateId);

      // Durable cross-module sync to DailyLog via Outbox (awaited, not fire-and-forget)
      await upsertDailyLogWithOutbox({
        userId,
        date,
        dotUpdates: { "physical.calories": normalizedTotals.calories },
        preserveSignals: true,
        options: {
          clientMutationId: `${clientMutationId}_daily_cal_sync`,
          source: `${options?.source || "web.nutrition.log"}.daily_sync`,
          dailyLogModel,
          outboxService,
        },
      });

      return {
        success: true,
        log: updatedLog,
        dailyTotals: normalizedTotals,
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
    error: "Concurrent NutritionLog update conflict after retries",
    code: "AGGREGATE_CONFLICT",
    statusCode: 409,
  };
}
