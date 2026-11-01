/**
 * AutonomousLeaseManager.ts
 * 
 * Milestone B — Phase B4: Work Package 2 / Loop 3
 * Distributed Lease Fencing Manager for Autonomous Execution
 */

import { AutonomousExecutionLeaseModel, IAutonomousExecutionLeaseDoc } from "../../../../apps/web/server/db/models/AutonomousExecutionLeaseModel";
import { FencingToken, createFencingToken, formatFencingTokenString } from "./FencingToken";

export interface AutonomousLeaseManagerDependencies {
  leaseModel?: any;
}

export class AutonomousLeaseManager {
  private leaseModel: any;

  constructor(deps?: AutonomousLeaseManagerDependencies) {
    this.leaseModel = deps?.leaseModel || AutonomousExecutionLeaseModel;
  }

  /**
   * Idempotently ensure the singleton lease document exists for a user.
   * Does NOT overwrite an existing lease record.
   */
  public async ensureLeaseRecord(userId: string): Promise<void> {
    const existing = await this.leaseModel.findOne({ userId });
    if (!existing) {
      try {
        await this.leaseModel.create({
          userId,
          leaseHolder: "",
          epoch: 0,
          acquiredAt: new Date(0),
          expiresAt: new Date(0),
          heartbeatAt: new Date(0),
          status: "EXPIRED",
          fencingToken: "",
        });
      } catch (err: any) {
        // Ignore duplicate key race condition if created concurrently
        if (err?.code !== 11000 && !String(err?.message).includes("duplicate")) {
          throw err;
        }
      }
    }
  }

  /**
   * Acquire execution lease using atomic CAS without upsert.
   * Increments the epoch strictly monotonically.
   */
  public async acquireLease(
    userId: string,
    workerId: string,
    ttlMs: number = 30000
  ): Promise<FencingToken | null> {
    await this.ensureLeaseRecord(userId);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const filter = {
      userId,
      $or: [
        { status: "EXPIRED" },
        { expiresAt: { $lt: now } },
        { status: "RELEASED" },
      ],
    };

    const update = {
      $inc: { epoch: 1 },
      $set: {
        leaseHolder: workerId,
        acquiredAt: now,
        expiresAt,
        heartbeatAt: now,
        status: "ACTIVE",
      },
    };

    const updated = await this.leaseModel.findOneAndUpdate(filter, update, { new: true });
    if (!updated) {
      return null;
    }

    const token = createFencingToken(updated.epoch, workerId, updated.acquiredAt, updated.expiresAt);
    // Optionally update the formatted fencingToken string in the record
    await this.leaseModel.updateOne(
      { userId, epoch: updated.epoch },
      { $set: { fencingToken: token.token } }
    );

    return token;
  }

  /**
   * Renew an active lease before expiration (worker heartbeat).
   * Strict CAS ensures stale or superseded workers cannot extend a lost lease.
   */
  public async renewLease(
    userId: string,
    workerId: string,
    epoch: number,
    ttlMs: number = 30000
  ): Promise<FencingToken | null> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const filter = {
      userId,
      leaseHolder: workerId,
      epoch,
      status: "ACTIVE",
      expiresAt: { $gte: now },
    };

    const update = {
      $set: {
        expiresAt,
        heartbeatAt: now,
      },
    };

    const updated = await this.leaseModel.findOneAndUpdate(filter, update, { new: true });
    if (!updated) {
      return null;
    }

    return createFencingToken(epoch, workerId, updated.acquiredAt, updated.expiresAt);
  }

  /**
   * Gracefully release an active lease.
   */
  public async releaseLease(
    userId: string,
    workerId: string,
    epoch: number
  ): Promise<boolean> {
    const filter = {
      userId,
      leaseHolder: workerId,
      epoch,
      status: "ACTIVE",
    };

    const update = {
      $set: {
        status: "RELEASED",
        expiresAt: new Date(),
      },
    };

    const res = await this.leaseModel.updateOne(filter, update);
    return (res.modifiedCount || res.matchedCount || 0) > 0;
  }

  /**
   * Inspect current lease record.
   */
  public async getLease(userId: string): Promise<IAutonomousExecutionLeaseDoc | null> {
    return this.leaseModel.findOne({ userId });
  }

  /**
   * Verify if a worker still holds a valid active lease.
   */
  public async isLeaseActive(
    userId: string,
    workerId: string,
    epoch: number
  ): Promise<boolean> {
    const now = new Date();
    const lease = await this.leaseModel.findOne({
      userId,
      leaseHolder: workerId,
      epoch,
      status: "ACTIVE",
      expiresAt: { $gt: now },
    });
    return !!lease;
  }
}

