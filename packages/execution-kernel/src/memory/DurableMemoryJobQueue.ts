import * as crypto from "node:crypto";
import mongoose from "mongoose";
import { MemoryFormationPipeline, ConversationTurnInput, MemoryFormationResult } from "./MemoryFormationPipeline";
import { MemoryRepository } from "./MemoryRepository";
import { generateId } from "../shared/ids";

export type MemoryJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD_LETTER";

export interface MemoryTurnJob {
  jobId: string;
  userId: string;
  conversationId?: string;
  turn: ConversationTurnInput;
  workerId?: string;
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

export type MemoryJobEventDispatcher = (job: MemoryTurnJob) => Promise<void>;

/**
 * Deterministic SHA-256 hash helper for turn deduplication (replaces weak 32-bit hash)
 */
function hashTurnIdentity(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 24);
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
  private eventDispatcher?: MemoryJobEventDispatcher;
  private inFlightPromises: Set<Promise<unknown>> = new Set();
  private workerId: string = generateId("mem_worker");

  constructor(pipeline?: MemoryFormationPipeline, eventDispatcher?: MemoryJobEventDispatcher) {
    this.pipeline = pipeline || MemoryFormationPipeline.getInstance();
    this.eventDispatcher = eventDispatcher;
  }

  static getInstance(): DurableMemoryJobQueue {
    if (!DurableMemoryJobQueue.instance) {
      DurableMemoryJobQueue.instance = new DurableMemoryJobQueue();
    }
    return DurableMemoryJobQueue.instance;
  }

  setEventDispatcher(dispatcher?: MemoryJobEventDispatcher): void {
    this.eventDispatcher = dispatcher;
  }

  private isDbConnected(): boolean {
    return Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  }

  clear(): void {
    this.jobs.clear();
  }

  async drainInFlight(): Promise<void> {
    if (this.inFlightPromises.size === 0) return;
    await Promise.allSettled(Array.from(this.inFlightPromises));
  }

  private trackBackgroundWork(promise: Promise<unknown>): void {
    this.inFlightPromises.add(promise);
    promise.finally(() => {
      this.inFlightPromises.delete(promise);
    });
  }

  /**
   * Enqueues a conversation turn for async durable memory formation.
   * Persists to MongoDB synchronously first (source of truth), then dispatches
   * via Inngest event (or local dev fallback when Inngest is unavailable).
   */
  async enqueueTurn(
    turn: ConversationTurnInput,
    options: { maxAttempts?: number; immediateProcess?: boolean } = {}
  ): Promise<MemoryTurnJob> {
    const identityMaterial = [
      turn.userId,
      turn.conversationId || "conv",
      turn.requestId || turn.turnId || `${turn.userMessage}:::${turn.assistantResponse || ""}`,
    ].join("::");
    const turnHash = hashTurnIdentity(identityMaterial);
    const jobId = `job_mem_${turn.userId}_${turn.conversationId || "conv"}_${turnHash}`;

    const existing = this.jobs.get(jobId);
    if (existing) {
      if (existing.status === "COMPLETED" || existing.status === "DEAD_LETTER") {
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

    if (this.isDbConnected()) {
      const { MemoryJob } = await import("@/server/db/models/MemoryJob");
      const doc = await MemoryJob.findOne({ jobId }).lean();
      if (doc) {
        const mapped = this.mapDocToJob(doc);
        this.jobs.set(jobId, mapped);
        if (mapped.status === "COMPLETED" || mapped.status === "DEAD_LETTER") {
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
    }

    const now = Date.now();
    const enrichedTurn: ConversationTurnInput = {
      ...turn,
      sourceJobId: jobId,
    };

    const job: MemoryTurnJob = existing || {
      jobId,
      userId: turn.userId,
      conversationId: turn.conversationId,
      turn: enrichedTurn,
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

    if (this.isDbConnected()) {
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
            turn: enrichedTurn,
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
    }

    if (options.immediateProcess !== false) {
      if (this.eventDispatcher) {
        const dispatchPromise = this.eventDispatcher(job).catch((dispatchErr) => {
          console.warn(
            `[MEMORY_QUEUE] Event dispatch failed for ${jobId} (job remains PENDING in DB for sweeper):`,
            dispatchErr
          );
        });
        this.trackBackgroundWork(dispatchPromise);
      } else if (options.immediateProcess === true || !process.env.INNGEST_EVENT_KEY) {
        const localPromise = Promise.resolve()
          .then(() => this.processJob(jobId))
          .catch((err) => {
            console.warn(`[MEMORY_QUEUE] Local worker execution error for ${jobId}:`, err);
          });
        this.trackBackgroundWork(localPromise);
      }
    }

    return job;
  }

  /**
   * Atomically claims and processes a durable memory job.
   * Respects COMPLETED idempotency, DEAD_LETTER halts, and backoff windows.
   */
  async processJob(jobId: string, options: { staleTimeoutMs?: number } = {}): Promise<MemoryTurnJob> {
    const staleTimeoutMs = options.staleTimeoutMs ?? 30000;
    const now = Date.now();
    let job: MemoryTurnJob | undefined = undefined;

    if (this.isDbConnected()) {
      const { MemoryJob } = await import("@/server/db/models/MemoryJob");
      const nowDate = new Date(now);
      const staleThreshold = new Date(now - staleTimeoutMs);

      const claimedDoc = await MemoryJob.findOneAndUpdate(
        {
          jobId,
          $or: [
            { status: "PENDING" },
            {
              status: "FAILED",
              $or: [
                { nextRetryTimestamp: { $exists: false } },
                { nextRetryTimestamp: null },
                { nextRetryTimestamp: { $lte: nowDate } },
              ],
            },
            { status: "PROCESSING", heartbeatAt: { $lt: staleThreshold } },
          ],
        },
        {
          $set: {
            status: "PROCESSING",
            workerId: this.workerId,
            heartbeatAt: nowDate,
            updatedAt: nowDate,
          },
          $inc: { attempts: 1 },
        },
        { new: true }
      ).lean();

      if (!claimedDoc) {
        const currentDoc = await MemoryJob.findOne({ jobId }).lean();
        if (!currentDoc) {
          throw new Error(`[MEMORY_QUEUE_ERROR]: Job ${jobId} not found`);
        }
        const mapped = this.mapDocToJob(currentDoc);
        this.jobs.set(jobId, mapped);
        if (mapped.status === "COMPLETED") {
          return mapped;
        }
        if (mapped.status === "DEAD_LETTER") {
          throw new Error(`[DEAD_LETTER_HALT]: Job ${jobId} is DEAD_LETTER and requires explicit requeue`);
        }
        return mapped;
      }

      job = this.mapDocToJob(claimedDoc);
      this.jobs.set(jobId, job);
    } else {
      job = this.jobs.get(jobId);
      if (!job) {
        throw new Error(`[MEMORY_QUEUE_ERROR]: Job ${jobId} not found`);
      }
      if (job.status === "COMPLETED") {
        return job;
      }
      if (job.status === "DEAD_LETTER") {
        throw new Error(`[DEAD_LETTER_HALT]: Job ${jobId} is DEAD_LETTER and requires explicit requeue`);
      }
      if (
        job.status === "PROCESSING" &&
        job.heartbeatAt &&
        now - job.heartbeatAt <= staleTimeoutMs
      ) {
        return job;
      }
      if (job.status === "FAILED" && job.nextRetryTimestamp && job.nextRetryTimestamp > now) {
        return job;
      }

      job.status = "PROCESSING";
      job.workerId = this.workerId;
      job.attempts += 1;
      job.heartbeatAt = now;
      job.updatedAt = now;
    }

    try {
      const turnInput: ConversationTurnInput = {
        ...job.turn,
        sourceJobId: job.jobId,
      };
      const result = await this.pipeline.processConversationTurn(turnInput);

      job.status = "COMPLETED";
      job.result = result;
      job.updatedAt = Date.now();
      job.lastError = undefined;
      job.nextRetryTimestamp = undefined;

      if (this.isDbConnected()) {
        const { MemoryJob } = await import("@/server/db/models/MemoryJob");
        await MemoryJob.updateOne(
          { jobId, workerId: this.workerId },
          {
            $set: {
              status: "COMPLETED",
              result,
              lastError: null,
              nextRetryTimestamp: null,
              updatedAt: new Date(),
            },
          }
        );
      }

      return job;
    } catch (err: any) {
      job.updatedAt = Date.now();
      job.lastError = err.message || String(err);

      if (job.attempts >= job.maxAttempts) {
        job.status = "DEAD_LETTER";
        job.nextRetryTimestamp = undefined;
      } else {
        job.status = "FAILED";
        job.nextRetryTimestamp = Date.now() + Math.pow(2, job.attempts) * 1000;
      }

      if (this.isDbConnected()) {
        const { MemoryJob } = await import("@/server/db/models/MemoryJob");
        await MemoryJob.updateOne(
          { jobId, workerId: this.workerId },
          {
            $set: {
              status: job.status,
              lastError: job.lastError,
              nextRetryTimestamp: job.nextRetryTimestamp ? new Date(job.nextRetryTimestamp) : null,
              updatedAt: new Date(),
            },
          }
        );
      }

      throw err;
    }
  }

  /**
   * Explicitly resets a DEAD_LETTER job back to PENDING for operator replay.
   */
  async requeueDeadLetterJob(jobId: string): Promise<boolean> {
    const inMem = this.jobs.get(jobId);
    if (inMem && inMem.status === "DEAD_LETTER") {
      inMem.status = "PENDING";
      inMem.attempts = 0;
      inMem.nextRetryTimestamp = undefined;
      inMem.updatedAt = Date.now();
    }

    if (!this.isDbConnected()) {
      return Boolean(inMem);
    }

    const { MemoryJob } = await import("@/server/db/models/MemoryJob");
    const res = await MemoryJob.updateOne(
      { jobId, status: "DEAD_LETTER" },
      {
        $set: {
          status: "PENDING",
          attempts: 0,
          nextRetryTimestamp: null,
          updatedAt: new Date(),
        },
      }
    );
    return res.matchedCount > 0;
  }

  /**
   * Bounded sweeper invoked by scheduled Inngest cron or local maintenance:
   * reaps expired PROCESSING leases, processes due PENDING/FAILED jobs, and repairs PENDING_EMBEDDING.
   */
  async sweepAndProcessDueJobs(options: {
    maxJobs?: number;
    staleTimeoutMs?: number;
    backfillEmbeddings?: boolean;
  } = {}): Promise<{
    reapedCount: number;
    claimedCount: number;
    completedCount: number;
    failedCount: number;
    embeddingsRepaired: number;
  }> {
    const maxJobs = Math.max(1, Math.min(options.maxJobs ?? 20, 100));
    const staleTimeoutMs = options.staleTimeoutMs ?? 30000;
    const reapedCount = this.isDbConnected()
      ? await this.reapStaleWorkersFromDatabase(staleTimeoutMs)
      : this.reapStaleWorkers(staleTimeoutMs);

    let claimedCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    const now = Date.now();

    if (this.isDbConnected()) {
      const { MemoryJob } = await import("@/server/db/models/MemoryJob");
      const nowDate = new Date(now);
      const dueDocs = await MemoryJob.find({
        $or: [
          { status: "PENDING" },
          {
            status: "FAILED",
            $or: [
              { nextRetryTimestamp: { $exists: false } },
              { nextRetryTimestamp: null },
              { nextRetryTimestamp: { $lte: nowDate } },
            ],
          },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(maxJobs)
        .select({ jobId: 1 })
        .lean();

      for (const doc of dueDocs) {
        claimedCount++;
        try {
          const done = await this.processJob(doc.jobId, { staleTimeoutMs });
          if (done.status === "COMPLETED") completedCount++;
        } catch {
          failedCount++;
        }
      }
    } else {
      for (const job of this.jobs.values()) {
        if (claimedCount >= maxJobs) break;
        const isDueFailed =
          job.status === "FAILED" && (!job.nextRetryTimestamp || job.nextRetryTimestamp <= now);
        if (job.status === "PENDING" || isDueFailed) {
          claimedCount++;
          try {
            const done = await this.processJob(job.jobId, { staleTimeoutMs });
            if (done.status === "COMPLETED") completedCount++;
          } catch {
            failedCount++;
          }
        }
      }
    }

    let embeddingsRepaired = 0;
    if (options.backfillEmbeddings !== false) {
      try {
        const repair = await MemoryRepository.getInstance().backfillPendingEmbeddings(10);
        embeddingsRepaired = repair.repaired;
      } catch {
        // Non-blocking
      }
    }

    return {
      reapedCount,
      claimedCount,
      completedCount,
      failedCount,
      embeddingsRepaired,
    };
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
