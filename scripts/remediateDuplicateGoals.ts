import mongoose from "mongoose";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env") });

export async function remediateDuplicateGoals(): Promise<{
  scannedCount: number;
  backfilledCount: number;
  archivedCount: number;
  canonicalCount: number;
}> {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required");
  }

  const isConnected = mongoose.connection.readyState === 1;
  if (!isConnected) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database handle unavailable");
  }

  const goalsCollection = db.collection("goals");
  const allGoals = await goalsCollection.find({}).sort({ createdAt: 1 }).toArray();

  let backfilledCount = 0;
  let archivedCount = 0;

  // Group goals by normalized userId and normalized title
  const clusters = new Map<string, any[]>();

  for (const goal of allGoals) {
    const rawUserId = goal.userId ? goal.userId.toString() : "unknown";
    const rawTitle = (goal.title || "").trim().toLowerCase();
    const clusterKey = `${rawUserId}:::${rawTitle}`;

    if (!clusters.has(clusterKey)) {
      clusters.set(clusterKey, []);
    }
    clusters.get(clusterKey)!.push(goal);
  }

  for (const [key, cluster] of clusters.entries()) {
    if (cluster.length === 1) {
      const g = cluster[0];
      const updates: any = {};
      if (g.status === undefined) {
        updates.status = "active";
      }
      if (typeof g.userId !== "string" && g.userId) {
        updates.userId = g.userId.toString();
      }
      if (Object.keys(updates).length > 0) {
        await goalsCollection.updateOne({ _id: g._id }, { $set: updates });
        backfilledCount++;
      }
    } else {
      // Multiple goals with same normalized title for same user
      // The earliest created document is the canonical goal
      const canonical = cluster[0];
      const canonicalUpdates: any = { status: "active" };
      if (typeof canonical.userId !== "string" && canonical.userId) {
        canonicalUpdates.userId = canonical.userId.toString();
      }
      await goalsCollection.updateOne({ _id: canonical._id }, { $set: canonicalUpdates });

      // All subsequent duplicates are safely archived (preserving original title)
      for (let i = 1; i < cluster.length; i++) {
        const dup = cluster[i];
        const dupUpdates: any = {
          status: "archived",
          archivedAt: new Date(),
          remediationReason: "DUPLICATE_CONSOLIDATION_V2",
          canonicalGoalId: canonical._id.toString(),
        };
        if (typeof dup.userId !== "string" && dup.userId) {
          dupUpdates.userId = dup.userId.toString();
        }
        await goalsCollection.updateOne({ _id: dup._id }, { $set: dupUpdates });
        archivedCount++;
      }
    }
  }

  // Verification Assertion: Ensure 0 duplicate active/proposed goals remain
  const duplicateCheck = await goalsCollection
    .aggregate([
      { $match: { status: { $in: ["active", "proposed"] } } },
      {
        $group: {
          _id: { userId: "$userId", title: { $toLower: "$title" } },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (duplicateCheck.length > 0) {
    throw new Error(`Remediation failed: ${duplicateCheck.length} duplicate active goal clusters still exist`);
  }

  if (!isConnected) {
    await mongoose.disconnect();
  }

  return {
    scannedCount: allGoals.length,
    backfilledCount,
    archivedCount,
    canonicalCount: clusters.size,
  };
}

if (require.main === module) {
  remediateDuplicateGoals()
    .then((res) => {
      console.log("Goal remediation completed successfully:", res);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Goal remediation error:", err);
      process.exit(1);
    });
}
