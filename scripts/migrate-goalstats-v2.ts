/**
 * migrate-goalstats-v2.ts
 * 
 * Milestone B — Step 2 Loop 1 Migration
 * Backfills userId, derivedFromVersions, and projectionRevision on legacy GoalStats documents.
 */

import mongoose from "mongoose";
import { GoalStatsModel } from "../apps/web/server/db/models/GoalStatsModel";
import { Goal } from "../apps/web/features/goals/models/Goal";

export async function migrateGoalStatsV2(options: { dryRun?: boolean; mongoUri?: string } = {}) {
  const dryRun = options.dryRun ?? false;
  const uri = options.mongoUri || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/life-os";

  const isConnected = mongoose.connection.readyState === 1;
  if (!isConnected) {
    await mongoose.connect(uri);
  }

  const legacyDocs = await GoalStatsModel.find({
    $or: [
      { userId: { $exists: false } },
      { userId: "" },
      { derivedFromVersions: { $exists: false } },
      { projectionRevision: { $exists: false } },
    ],
  });

  const report = {
    totalScanned: legacyDocs.length,
    migrated: 0,
    skipped: 0,
    errors: [] as string[],
  };

  for (const doc of legacyDocs) {
    try {
      let userId = doc.userId;
      if (!userId) {
        const parentGoal = await Goal.findById(doc.goalId).lean();
        if (parentGoal && parentGoal.userId) {
          userId = parentGoal.userId.toString();
        } else {
          report.skipped++;
          report.errors.push(`Goal ${doc.goalId} has no parent Goal or userId.`);
          continue;
        }
      }

      const updates: Record<string, any> = {
        userId,
      };

      if (!doc.derivedFromVersions) {
        updates.derivedFromVersions = {
          goalVersion: 0,
          taskVersions: {},
        };
      }

      if (typeof doc.projectionRevision !== "number") {
        updates.projectionRevision = 0;
      }

      if (!dryRun) {
        await GoalStatsModel.updateOne({ _id: doc._id }, { $set: updates });
      }

      report.migrated++;
    } catch (err: any) {
      report.errors.push(`Error migrating doc ${doc._id}: ${err.message}`);
    }
  }

  return report;
}

if (require.main === module) {
  const isDryRun = process.argv.includes("--dry-run");
  migrateGoalStatsV2({ dryRun: isDryRun })
    .then((res) => {
      console.log(`[MIGRATION] Complete. Migrated: ${res.migrated}, Skipped: ${res.skipped}, Errors: ${res.errors.length}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[MIGRATION ERROR]", err);
      process.exit(1);
    });
}
