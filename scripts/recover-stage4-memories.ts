/**
 * recover-stage4-memories.ts
 *
 * Explicit, operator-invoked, dry-run-capable, bounded, idempotent recovery CLI
 * for historical MemoryJob replay. Never invoked automatically at app startup.
 *
 * Usage:
 *   npx tsx scripts/recover-stage4-memories.ts --dry-run --batch-size=25
 *   npx tsx scripts/recover-stage4-memories.ts --status=FAILED,DEAD_LETTER --batch-size=20
 */

import mongoose from "mongoose";
import { DurableMemoryJobQueue } from "../packages/execution-kernel/src/memory/DurableMemoryJobQueue";
import { MemoryJob } from "../apps/web/server/db/models/MemoryJob";
import { PersonalMemory } from "../apps/web/server/db/models/PersonalMemory";

export interface ReplayCliOptions {
  dryRun: boolean;
  batchSize: number;
  statuses: string[];
  userId?: string;
  before?: Date;
  requeueDeadLetter: boolean;
  mongoUri?: string;
}

export interface ReplayCliReport {
  dryRun: boolean;
  scannedJobs: number;
  eligibleJobs: number;
  skippedAlreadyBacked: number;
  requeuedDeadLetters: number;
  replayedCompleted: number;
  replayedFailed: number;
  eligibleJobIds: string[];
}

export async function runHistoricalMemoryReplay(
  options: ReplayCliOptions
): Promise<ReplayCliReport> {
  const batchSize = Math.max(1, Math.min(options.batchSize || 25, 200));
  const dryRun = options.dryRun ?? true;
  const statuses =
    options.statuses.length > 0 ? options.statuses : ["FAILED", "DEAD_LETTER", "PENDING"];

  if (mongoose.connection.readyState !== 1) {
    const uri = options.mongoUri || process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("[RECOVERY_CLI_ERROR]: MONGODB_URI is required when DB is disconnected.");
    }
    await mongoose.connect(uri);
  }

  const filter: Record<string, any> = {
    status: { $in: statuses },
  };
  if (options.userId) {
    filter.userId = mongoose.Types.ObjectId.isValid(options.userId)
      ? new mongoose.Types.ObjectId(options.userId)
      : options.userId;
  }
  if (options.before) {
    filter.createdAt = { $lte: options.before };
  }

  const jobs = await MemoryJob.find(filter)
    .sort({ createdAt: 1 })
    .limit(batchSize)
    .lean();

  const report: ReplayCliReport = {
    dryRun,
    scannedJobs: jobs.length,
    eligibleJobs: 0,
    skippedAlreadyBacked: 0,
    requeuedDeadLetters: 0,
    replayedCompleted: 0,
    replayedFailed: 0,
    eligibleJobIds: [],
  };

  const queue = DurableMemoryJobQueue.getInstance();

  for (const job of jobs) {
    const userIdStr = job.userId?.toString() || job.turn?.userId;
    const existingBacked = await PersonalMemory.countDocuments({
      userId: mongoose.Types.ObjectId.isValid(userIdStr)
        ? new mongoose.Types.ObjectId(userIdStr)
        : userIdStr,
      sourceJobId: job.jobId,
    });

    if (existingBacked > 0) {
      report.skippedAlreadyBacked++;
      continue;
    }

    report.eligibleJobs++;
    report.eligibleJobIds.push(job.jobId);

    if (dryRun) {
      continue;
    }

    if (job.status === "DEAD_LETTER") {
      if (!options.requeueDeadLetter) {
        continue;
      }
      const requeued = await queue.requeueDeadLetterJob(job.jobId);
      if (requeued) report.requeuedDeadLetters++;
    } else if (job.status === "COMPLETED") {
      // Explicitly reset pre-Stage-4 COMPLETED job ONLY when no sourceJobId-backed memories exist
      await MemoryJob.updateOne(
        { jobId: job.jobId, status: "COMPLETED" },
        { $set: { status: "PENDING", nextRetryTimestamp: null, updatedAt: new Date() } }
      );
    } else if (job.status === "FAILED") {
      await MemoryJob.updateOne(
        { jobId: job.jobId, status: "FAILED" },
        { $set: { nextRetryTimestamp: new Date(0), updatedAt: new Date() } }
      );
    }

    try {
      const done = await queue.processJob(job.jobId);
      if (done.status === "COMPLETED") {
        report.replayedCompleted++;
      } else {
        report.replayedFailed++;
      }
    } catch {
      report.replayedFailed++;
    }
  }

  return report;
}

function parseCliArgs(argv: string[]): ReplayCliOptions {
  const opts: ReplayCliOptions = {
    dryRun: false,
    batchSize: 25,
    statuses: ["FAILED", "DEAD_LETTER", "PENDING"],
    requeueDeadLetter: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--requeue-dead-letter") opts.requeueDeadLetter = true;
    else if (arg.startsWith("--batch-size=")) {
      opts.batchSize = Number(arg.split("=")[1]) || 25;
    } else if (arg.startsWith("--status=")) {
      opts.statuses = arg
        .split("=")[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--user-id=")) {
      opts.userId = arg.split("=")[1].trim();
    } else if (arg.startsWith("--before=")) {
      const d = new Date(arg.split("=")[1].trim());
      if (!Number.isNaN(d.getTime())) opts.before = d;
    }
  }
  return opts;
}

if (
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].endsWith("recover-stage4-memories.ts")
) {
  const opts = parseCliArgs(process.argv.slice(2));
  runHistoricalMemoryReplay(opts)
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[RECOVERY_CLI_FATAL]:", err);
      process.exit(1);
    });
}
