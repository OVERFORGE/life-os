import crypto from "crypto";
import mongoose from "mongoose";
import { OutboxStorageService, OutboxEventDraft } from "@life-os/execution-kernel";
import { User } from "@/server/db/models/User";

export interface UserProfileMutationOptions {
  clientMutationId?: string;
  expectedVersion?: number;
  source?: string;
  userModel?: any;
  outboxService?: OutboxStorageService;
}

function isConflictError(err: any): boolean {
  return (
    err?.name === "ConcurrencyConflictError" ||
    err?.code === "AGGREGATE_CONFLICT" ||
    /Concurrency conflict|Optimistic concurrency conflict|Version conflict|stale version/i.test(String(err?.message || ""))
  );
}

/**
 * Updates User profile/preferences/dietary snapshot through OutboxStorageService
 * with monotonic versioning and idempotency receipt protection.
 */
export async function updateUserProfileWithOutbox(
  userId: string,
  domainUpdates: Record<string, any>,
  options?: UserProfileMutationOptions
): Promise<{
  success: boolean;
  user?: any;
  newVersion?: number;
  deduplicated?: boolean;
  error?: string;
  code?: string;
  statusCode?: number;
}> {
  const userModel = options?.userModel || User;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();
  const explicitExpectedVersion = options?.expectedVersion;
  const maxRetries = explicitExpectedVersion !== undefined ? 1 : 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let existing = await userModel.findById(userId);
    if (!existing) {
      return { success: false, error: "User not found", code: "NOT_FOUND", statusCode: 404 };
    }

    if (existing.version === undefined || existing.mutationEpoch === undefined) {
      await userModel.updateOne(
        { _id: existing._id, version: { $exists: false } },
        { $set: { version: 0, mutationEpoch: 0, recentMutationReceipts: [] } }
      );
      existing = await userModel.findById(existing._id);
      if (!existing) {
        return { success: false, error: "User not found", code: "NOT_FOUND", statusCode: 404 };
      }
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
      .update(JSON.stringify({ aggregateId, nextVersion, domainUpdates }))
      .digest("hex")
      .slice(0, 24);
    const clientMutationId =
      options?.clientMutationId || `mut_user_profile_${aggregateId}_v${nextVersion}_${diffHash}`;

    const eventDraft: OutboxEventDraft = {
      userId: String(userId),
      category: "DOMAIN_EVENT",
      type: "domain.user.profile_updated",
      aggregateId,
      aggregateType: "user_profile",
      aggregateVersion: nextVersion,
      source: options?.source || "web.user.profile",
      payload: {
        userId: String(userId),
        updatedFields: Object.keys(domainUpdates),
        weight: domainUpdates.weight,
        dietMode: domainUpdates.dietMode,
        updatedAt: occurredAt.toISOString(),
      },
      occurredAt,
    };

    try {
      const commitResult = await outboxService.persistWithStandaloneFencing({
        userId: String(userId),
        aggregateModel: userModel,
        aggregateId,
        clientMutationId,
        diffHash,
        expectedVersion: currentVersion,
        fencingEpoch: currentEpoch,
        domainUpdates,
        eventDrafts: [eventDraft],
      });
      const updatedUser = await userModel.findById(aggregateId);
      return {
        success: true,
        user: updatedUser,
        newVersion: nextVersion,
        deduplicated: Boolean(commitResult.isIdempotentReplay),
      };
    } catch (err: any) {
      if (isConflictError(err) && explicitExpectedVersion === undefined) {
        continue;
      }
      if (isConflictError(err)) {
        return {
          success: false,
          error: err?.message || "Optimistic concurrency conflict",
          code: "AGGREGATE_CONFLICT",
          statusCode: 409,
        };
      }
      throw err;
    }
  }

  return {
    success: false,
    error: "Concurrent User profile update conflict after retries",
    code: "AGGREGATE_CONFLICT",
    statusCode: 409,
  };
}
