import mongoose from "mongoose";
import { MemoryFormationPipeline, ConversationTurnInput, MemoryFormationResult } from "./MemoryFormationPipeline";
import { generateId } from "../shared/ids";

export type MemoryJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD_LETTER";

export interface MemoryTurnJob {
  jobId: string;
  userId: string;
  conversationId?: string;
  turn: ConversationTurnInput;
  status: MemoryJobStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryTimestamp?: number;
  lastError?: string;
  result?: MemoryFormationResult;
  createdAt: number;
  updatedAt: number;
  heartbeatAt?: number;
}

/**
 * Deterministic hash helper for turn deduplication
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * DurableMemoryJobQueue
 * 
 * Provides crash-consistent, idempotent, retry-capable asynchronous
 * memory formation background processing (Requirements 11, 12, 13).
 * 
 * Invariants:
 * - Persistent Storage Backing: Jobs are persisted to MongoDB MemoryJob collection.
 * - Worker Crash Recovery: Jobs survive worker process terminations and are recovered on restart.
 * - Deterministic Turn Deduplication: Duplicate requests map to identical jobId.
 * - Effectively-Once Outcome: Once a job completes, re-delivery returns cached result.
 * - Bounded Retries: Max 3 attempts with exponential backoff before transitioning to DEAD_LETTER.
 */
export class DurableMemoryJobQueue {
  private static instance: DurableMemoryJobQueue;
  private jobs: Map<string, MemoryTurnJob> = new Map();
  private pipeline: MemoryFormationPipeline;
  private isProcessing: boolean = false;

  constructor(pipeline?: MemoryFormationPipeline) {
    this.pipeline = pipeline || MemoryFormationPipeline.getInstance();
  }

  static getInstance(): DurableMemoryJobQueue {
    if (!DurableMemoryJobQueue.instance) {
      DurableMemoryJobQueue.instance = new DurableMemoryJobQueue();
    }
    return DurableMemoryJobQueue.instance;
  }

  private isDbConnected(): boolean {
    return Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  }

  clear(): void {
    this.jobs.clear();
    this.isProcessing = false;
  }

  /**
   * Enqueues a conversation turn for async durable memory formation.
   * Persists to MongoDB if connected and deduplicates identical turns.
   */
  async enqueueTurn(
    turn: ConversationTurnInput,
    options: { maxAttempts?: number; immediateProcess?: boolean } = {}
  ): Promise<MemoryTurnJob> {
    const turnHash = hashString(`${turn.userMessage}:::${turn.assistantResponse}`);
    const jobId = `job_mem_${turn.userId}_${turn.conversationId || "conv"}_${turnHash}`;

    // 1. Check in-memory store
    const existing = this.jobs.get(jobId);
    if (existing) {
      if (existing.status === "COMPLETED") {
        return existing;
      }
      if (
        existing.status === "PROCESSING" &&
        existing.heartbeatAt &&
        Date.now() - existing.heartbeatAt < 30000
      ) {
        return existing;
      }
    }

    // 2. Check DB if connected
    if (this.isDbConnected()) {
      try {
        const { MemoryJob } = await import("@/server/db/models/MemoryJob");
        const doc = await MemoryJob.findOne({ jobId }).lean();
        if (doc) {
          const mapped = this.mapDocToJob(doc);
          this.jobs.set(jobId, mapped);
          if (mapped.status === "COMPLETED") {
            return mapped;
          }
          if (
            mapped.status === "PROCESSING" &&
            mapped.heartbeatAt &&
            Date.now() - mapped.heartbeatAt < 30000
          ) {
            return mapped;
          }
        }
      } catch (dbErr) {
        console.warn("[MEMORY_QUEUE] DB read warning during enqueue:", dbErr);
      }
    }

    const now = Date.now();
    const job: MemoryTurnJob = existing || {
      jobId,
      userId: turn.userId,
      conversationId: turn.conversationId,
      turn,
      status: "PENDING",
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      createdAt: now,
      updatedAt: now,
      heartbeatAt: now,
    };

    if (existing) {
      job.status = "PENDING";
      job.updatedAt = now;
      job.heartbeatAt = now;
    }

    this.jobs.set(jobId, job);

    // Persist to MongoDB
    if (this.isDbConnected()) {
      try {
        const { MemoryJob } = await import("@/server/db/models/MemoryJob");
        await MemoryJob.findOneAndUpdate(
          { jobId },
          {
            $setOnInsert: {
              jobId,
              userId: mongoose.Types.ObjectId.isValid(job.userId)
                ? new mongoose.Types.ObjectId(job.userId)
                : job.userId,
              conversationId: job.conversationId || "default",
              turn: job.turn,
              status: "PENDING",
              attempts: 0,
              maxAttempts: job.maxAttempts,
              createdAt: new Date(now),
            },
            $set: {
              updatedAt: new Date(now),
              heartbeatAt: new Date(now),
            },
          },
          { upsert: true, new: true }
        );
      } catch (dbErr) {
        console.warn("[MEMORY_QUEUE] DB write warning during enqueue:", dbErr);
      }
    }

    if (options.immediateProcess !== false) {
      setTimeout(() => {
        this.processJob(jobId).catch((err) => {
          console.warn(`[MEMORY_QUEUE] Worker execution error for ${jobId}:`, err);
        });
      }, 0);
    }

    return job;
  }

  /**
   * Processes a specific job with strict idempotency and persistence updates.
   */
  async processJob(jobId: string): Promise<MemoryTurnJob> {
    let job = this.jobs.get(jobId);

    // Fetch from DB if not in memory
    if (!job && this.isDbConnected()) {
      try {
        const { MemoryJob } = await import("@/server/db/models/MemoryJob");
        const doc = await MemoryJob.findOne({ jobId }).lean();
        if (doc) {
          job = this.mapDocToJob(doc);
          this.jobs.set(jobId, job);
        }
      } catch (err) {
        console.warn("[MEMORY_QUEUE] DB fetch warning in processJob:", err);
      }
    }

    if (!job) {
      throw new Error(`[MEMORY_QUEUE_ERROR]: Job ${jobId} not found`);
    }

    // Idempotency: Already completed jobs are never re-executed
    if (job.status === "COMPLETED") {
      return job;
    }

    const now = Date.now();
    job.status = "PROCESSING";
    job.attempts += 1;
    job.heartbeatAt = now;
    job.updatedAt = now;

    // Persist PROCESSING status
    if (this.isDbConnected()) {
      try {
        const { MemoryJob } = await import("@/server/db/models/MemoryJob");
        await MemoryJob.updateOne(
          { jobId },
          {
            $set: {
              status: "PROCESSING",
              attempts: job.attempts,
              heartbeatAt: new Date(now),
              updatedAt: new Date(now),
            },
          }
        );
      } catch (err) {
        console.warn("[MEMORY_QUEUE] DB update warning for PROCESSING:", err);
      }
    }

    try {
      // Execute formation pipeline
      const result = await this.pipeline.processConversationTurn(job.turn);

      job.status = "COMPLETED";
      job.result = result;
      job.updatedAt = Date.now();
      job.lastError = undefined;

      if (this.isDbConnected()) {
        try {
          const { MemoryJob } = await import("@/server/db/models/MemoryJob");
          await MemoryJob.updateOne(
            { jobId },
            {
              $set: {
                status: "COMPLETED",
                result,
                updatedAt: new Date(),
              },
            }
          );
        } catch (err) {
          console.warn("[MEMORY_QUEUE] DB update warning for COMPLETED:", err);
        }
      }

      return job;
    } catch (err: any) {
      job.updatedAt = Date.now();
      job.lastError = err.message || String(err);

      if (job.attempts >= job.maxAttempts) {
        job.status = "DEAD_LETTER";
      } else {
        job.status = "FAILED";
        job.nextRetryTimestamp = Date.now() + Math.pow(2, job.attempts) * 1000;
      }

      if (this.isDbConnected()) {
        try {
          const { MemoryJob } = await import("@/server/db/models/MemoryJob");
          await MemoryJob.updateOne(
            { jobId },
            {
              $set: {
                status: job.status,
                lastError: job.lastError,
                nextRetryTimestamp: job.nextRetryTimestamp ? new Date(job.nextRetryTimestamp) : null,
                updatedAt: new Date(),
              },
            }
          );
        } catch (dbErr) {
          console.warn("[MEMORY_QUEUE] DB update warning for FAILED:", dbErr);
        }
      }

      throw err;
    }
  }

  /**
   * Reaps orphaned / crashed worker jobs whose lease expired in the in-memory queue.
   * If MongoDB is connected, asynchronously reconciles database worker leases as well.
   */
  reapStaleWorkers(timeoutMs: number = 30000): number {
    const now = Date.now();
    let recoveredCount = 0;

    // 1. In-memory check
    for (const job of this.jobs.values()) {
      if (job.status === "PROCESSING" && job.heartbeatAt && now - job.heartbeatAt > timeoutMs) {
        if (job.attempts < job.maxAttempts) {
          job.status = "PENDING";
          job.updatedAt = now;
          recoveredCount++;
        } else {
          job.status = "DEAD_LETTER";
          job.updatedAt = now;
        }
      }
    }

    // 2. Asynchronous DB cleanup if connected
    if (this.isDbConnected()) {
      this.reapStaleWorkersFromDatabase(timeoutMs).catch((err) => {
        console.warn("[MEMORY_QUEUE] DB reapStaleWorkers warning:", err);
      });
    }

    return recoveredCount;
  }

  /**
   * Database-backed stale worker cleanup for production background workers.
   */
  async reapStaleWorkersFromDatabase(timeoutMs: number = 30000): Promise<number> {
    if (!this.isDbConnected()) return 0;
    const now = Date.now();
    try {
      const { MemoryJob } = await import("@/server/db/models/MemoryJob");
      const threshold = new Date(now - timeoutMs);

      // Reset stale PROCESSING jobs to PENDING
      const res = await MemoryJob.updateMany(
        {
          status: "PROCESSING",
          heartbeatAt: { $lt: threshold },
          attempts: { $lt: 3 },
        },
        {
          $set: {
            status: "PENDING",
            updatedAt: new Date(),
          },
        }
      );

      // Transition exhausted jobs to DEAD_LETTER
      await MemoryJob.updateMany(
        {
          status: "PROCESSING",
          heartbeatAt: { $lt: threshold },
          attempts: { $gte: 3 },
        },
        {
          $set: {
            status: "DEAD_LETTER",
            updatedAt: new Date(),
          },
        }
      );

      return res.modifiedCount || 0;
    } catch (err) {
      console.warn("[MEMORY_QUEUE] DB reapStaleWorkers warning:", err);
      return 0;
    }
  }

  /**
   * Recovers pending or orphaned jobs from MongoDB after a process restart.
   */
  async recoverOrphanedJobsFromDatabase(timeoutMs: number = 30000): Promise<number> {
    if (!this.isDbConnected()) {
      return 0;
    }

    try {
      const { MemoryJob } = await import("@/server/db/models/MemoryJob");
      const threshold = new Date(Date.now() - timeoutMs);

      const docs = await MemoryJob.find({
        $or: [
          { status: "PENDING" },
          { status: "PROCESSING", heartbeatAt: { $lt: threshold } },
        ],
      }).lean();

      let recovered = 0;
      for (const doc of docs) {
        const job = this.mapDocToJob(doc);
        if (job.status === "PROCESSING") {
          job.status = job.attempts >= job.maxAttempts ? "DEAD_LETTER" : "PENDING";
        }
        this.jobs.set(job.jobId, job);
        recovered++;
      }

      return recovered;
    } catch (err) {
      console.warn("[MEMORY_QUEUE] recoverOrphanedJobsFromDatabase warning:", err);
      return 0;
    }
  }

  getJob(jobId: string): MemoryTurnJob | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(userId?: string): MemoryTurnJob[] {
    const all = Array.from(this.jobs.values());
    return userId ? all.filter((j) => j.userId === userId) : all;
  }

  private mapDocToJob(doc: any): MemoryTurnJob {
    return {
      jobId: doc.jobId,
      userId: doc.userId?.toString() || doc.userId,
      conversationId: doc.conversationId,
      turn: doc.turn,
      status: doc.status,
      attempts: doc.attempts || 0,
      maxAttempts: doc.maxAttempts || 3,
      nextRetryTimestamp: doc.nextRetryTimestamp ? new Date(doc.nextRetryTimestamp).getTime() : undefined,
      lastError: doc.lastError,
      result: doc.result,
      createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : Date.now(),
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).getTime() : Date.now(),
      heartbeatAt: doc.heartbeatAt ? new Date(doc.heartbeatAt).getTime() : Date.now(),
    };
  }
}
