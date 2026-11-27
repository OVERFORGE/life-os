import crypto from "crypto";
import mongoose from "mongoose";
import { OutboxStorageService, OutboxEventDraft, AggregateType } from "@life-os/execution-kernel";

export interface CatalogMutationOptions {
  clientMutationId?: string;
  source?: string;
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
 * Creates a new catalog/config/proposal document through OutboxStorageService.
 */
export async function createCatalogDocWithOutbox(params: {
  userId: string;
  model: any;
  aggregateType: AggregateType;
  eventType: string;
  domain: string;
  docFields: Record<string, any>;
  options?: CatalogMutationOptions;
}): Promise<{ success: boolean; doc?: any; deduplicated?: boolean; error?: string }> {
  const { userId, model, aggregateType, eventType, domain, docFields, options } = params;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();
  const docId = new mongoose.Types.ObjectId();
  const aggregateId = String(docId);
  const occurredAt = new Date();
  const diffHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ aggregateType, userId, docFields }))
    .digest("hex")
    .slice(0, 24);
  const clientMutationId =
    options?.clientMutationId || `mut_${aggregateType}_create_${aggregateId}_${diffHash}`;

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: eventType,
    aggregateId,
    aggregateType,
    aggregateVersion: 1,
    source: options?.source || `web.${domain}.create`,
    payload: {
      userId: String(userId),
      domain,
      action: "created",
      aggregateType,
      aggregateId,
      occurredAt: occurredAt.toISOString(),
    },
    occurredAt,
  };

  const commit = await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: model,
    aggregateId,
    clientMutationId,
    diffHash,
    expectedVersion: 0,
    fencingEpoch: 0,
    isCreation: true,
    domainUpdates: {
      ...docFields,
      userId: docFields.userId ?? userId,
    },
    eventDrafts: [eventDraft],
  });

  const createdDoc = await model.findById(aggregateId);
  return {
    success: true,
    doc: createdDoc,
    deduplicated: Boolean(commit.isIdempotentReplay),
  };
}

/**
 * Updates or upserts a tenant-scoped catalog/config/proposal document through OutboxStorageService.
 */
export async function upsertCatalogDocWithOutbox(params: {
  userId: string;
  model: any;
  filter: Record<string, any>;
  aggregateType: AggregateType;
  eventType: string;
  domain: string;
  updateFields: Record<string, any>;
  createFields?: Record<string, any>;
  createIfMissing?: boolean;
  options?: CatalogMutationOptions;
}): Promise<{ success: boolean; doc?: any; notFound?: boolean; deduplicated?: boolean; error?: string }> {
  const {
    userId,
    model,
    filter,
    aggregateType,
    eventType,
    domain,
    updateFields,
    createFields,
    createIfMissing = false,
    options,
  } = params;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();

  for (let attempt = 0; attempt < 3; attempt++) {
    let existing = await model.findOne(filter);
    if (!existing) {
      if (!createIfMissing) {
        return { success: false, notFound: true, error: `${aggregateType} not found` };
      }
      return createCatalogDocWithOutbox({
        userId,
        model,
        aggregateType,
        eventType,
        domain,
        docFields: { ...(createFields || {}), ...updateFields },
        options,
      });
    }

    if (existing.version === undefined || existing.mutationEpoch === undefined) {
      await model.updateOne(
        { _id: existing._id, version: { $exists: false } },
        { $set: { version: 0, mutationEpoch: 0, recentMutationReceipts: [] } }
      );
      existing = await model.findById(existing._id);
      if (!existing) {
        return { success: false, notFound: true, error: `${aggregateType} not found` };
      }
    }

    const currentVersion = typeof existing.version === "number" ? existing.version : 0;
    const currentEpoch = typeof existing.mutationEpoch === "number" ? existing.mutationEpoch : 0;
    const nextVersion = currentVersion + 1;
    const aggregateId = String(existing._id);
    const occurredAt = new Date();
    const diffHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ aggregateType, aggregateId, nextVersion, updateFields }))
      .digest("hex")
      .slice(0, 24);
    const clientMutationId =
      options?.clientMutationId || `mut_${aggregateType}_upd_${aggregateId}_v${nextVersion}_${diffHash}`;

    const eventDraft: OutboxEventDraft = {
      userId: String(userId),
      category: "DOMAIN_EVENT",
      type: eventType,
      aggregateId,
      aggregateType,
      aggregateVersion: nextVersion,
      source: options?.source || `web.${domain}.update`,
      payload: {
        userId: String(userId),
        domain,
        action: "updated",
        aggregateType,
        aggregateId,
        occurredAt: occurredAt.toISOString(),
      },
      occurredAt,
    };

    try {
      const commit = await outboxService.persistWithStandaloneFencing({
        userId: String(userId),
        aggregateModel: model,
        aggregateId,
        clientMutationId,
        diffHash,
        expectedVersion: currentVersion,
        fencingEpoch: currentEpoch,
        domainUpdates: updateFields,
        eventDrafts: [eventDraft],
      });
      const updated = await model.findById(aggregateId);
      return {
        success: true,
        doc: updated,
        deduplicated: Boolean(commit.isIdempotentReplay),
      };
    } catch (err: any) {
      if (isConflictError(err)) continue;
      throw err;
    }
  }

  return { success: false, error: `Concurrent ${aggregateType} update conflict` };
}

/**
 * Deletes a tenant-scoped catalog/config document through OutboxStorageService
 * (fenced outbox commit + physical delete so existing list queries stay clean).
 */
export async function deleteCatalogDocWithOutbox(params: {
  userId: string;
  model: any;
  filter: Record<string, any>;
  aggregateType: AggregateType;
  eventType: string;
  domain: string;
  options?: CatalogMutationOptions;
}): Promise<{ success: boolean; notFound?: boolean; deduplicated?: boolean; error?: string }> {
  const { userId, model, filter, aggregateType, eventType, domain, options } = params;
  const outboxService = options?.outboxService || OutboxStorageService.getInstance();

  const existing = await model.findOne(filter);
  if (!existing) {
    return { success: false, notFound: true, error: `${aggregateType} not found` };
  }

  if (existing.version === undefined || existing.mutationEpoch === undefined) {
    await model.updateOne(
      { _id: existing._id, version: { $exists: false } },
      { $set: { version: 0, mutationEpoch: 0, recentMutationReceipts: [] } }
    );
  }

  const currentVersion = typeof existing.version === "number" ? existing.version : 0;
  const currentEpoch = typeof existing.mutationEpoch === "number" ? existing.mutationEpoch : 0;
  const nextVersion = currentVersion + 1;
  const aggregateId = String(existing._id);
  const occurredAt = new Date();
  const diffHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ aggregateType, aggregateId, nextVersion, deleted: true }))
    .digest("hex")
    .slice(0, 24);
  const clientMutationId =
    options?.clientMutationId || `mut_${aggregateType}_del_${aggregateId}_v${nextVersion}_${diffHash}`;

  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: eventType,
    aggregateId,
    aggregateType,
    aggregateVersion: nextVersion,
    source: options?.source || `web.${domain}.delete`,
    payload: {
      userId: String(userId),
      domain,
      action: "deleted",
      aggregateType,
      aggregateId,
      occurredAt: occurredAt.toISOString(),
    },
    occurredAt,
  };

  const commit = await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: model,
    aggregateId,
    clientMutationId,
    diffHash,
    expectedVersion: currentVersion,
    fencingEpoch: currentEpoch,
    isDeletion: true,
    domainUpdates: { deletedAt: occurredAt },
    eventDrafts: [eventDraft],
  });

  // Preserve physical removal semantics for catalog collections without deletedAt filters
  await model.deleteOne({ _id: existing._id, userId: existing.userId });

  return {
    success: true,
    deduplicated: Boolean(commit.isIdempotentReplay),
  };
}
