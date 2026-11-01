/**
 * packages/execution-kernel/src/temporal/migration/backfillTemporalFencing.ts
 *
 * Idempotent, safe migration utility to backfill optimistic concurrency fencing fields
 * (mutationEpoch and recentMutationReceipts) on legacy TemporalOccurrence documents.
 *
 * Key Invariants:
 * - Independent field repair: Repairs mutationEpoch if missing, recentMutationReceipts if missing.
 * - Does NOT overwrite existing valid values or existing receipts.
 * - Preserves version (default 1) and all domain fields.
 * - Supports dryRun mode for safe pre-flight audits.
 * - Idempotent: Subsequent executions modify 0 documents.
 * - Never runs automatically in production.
 */

export interface BackfillReport {
  totalScanned: number;
  repairedEpochCount: number;
  repairedReceiptsCount: number;
  unmodifiedCount: number;
  errors: string[];
}

export interface BackfillOptions {
  dryRun?: boolean;
  batchSize?: number;
}

export async function backfillTemporalFencing(
  temporalModel: any,
  options: BackfillOptions = {}
): Promise<BackfillReport> {
  const dryRun = options.dryRun ?? false;
  const batchSize = options.batchSize ?? 500;

  const report: BackfillReport = {
    totalScanned: 0,
    repairedEpochCount: 0,
    repairedReceiptsCount: 0,
    unmodifiedCount: 0,
    errors: [],
  };

  try {
    // 1. Query documents missing either mutationEpoch or recentMutationReceipts
    const query = {
      $or: [
        { mutationEpoch: { $exists: false } },
        { mutationEpoch: null },
        { recentMutationReceipts: { $exists: false } },
        { recentMutationReceipts: null },
      ],
    };

    let cursor = temporalModel.find(query);
    if (typeof cursor.limit === "function") {
      cursor = cursor.limit(batchSize);
    }
    if (typeof cursor.lean === "function") {
      cursor = cursor.lean();
    }

    const unversionedDocs: any[] = await cursor;
    report.totalScanned = unversionedDocs.length;

    for (const doc of unversionedDocs) {
      const updates: Record<string, any> = {};

      if (doc.mutationEpoch === undefined || doc.mutationEpoch === null) {
        updates.mutationEpoch = 0;
        report.repairedEpochCount++;
      }

      if (doc.recentMutationReceipts === undefined || doc.recentMutationReceipts === null) {
        updates.recentMutationReceipts = [];
        report.repairedReceiptsCount++;
      }

      if (Object.keys(updates).length > 0) {
        if (!dryRun) {
          await temporalModel.updateOne({ _id: doc._id }, { $set: updates });
        }
      } else {
        report.unmodifiedCount++;
      }
    }
  } catch (err: any) {
    report.errors.push(err.message || String(err));
  }

  return report;
}

