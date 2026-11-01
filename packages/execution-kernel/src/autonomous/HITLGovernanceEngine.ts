/**
 * HITLGovernanceEngine.ts
 * 
 * Milestone B — Phase B4: Work Package 4 / Loop 8 & Step 4 Loop 2
 * Human-In-The-Loop (HITL) Cryptographic Governance Engine
 * 
 * Features:
 * 1. HMAC-SHA256 tamper-proof signature generation.
 * 2. Constant-time timingSafeEqual verification with length pre-check (preventing side-channel timing attacks).
 * 3. Key rotation support with historical key retention and retired key version rejection.
 * 4. Dual-Mode Persistence:
 *    - Mode A: Atomic multi-document transactions (session.withTransaction).
 *    - Mode B: DIMIP staged intent promotion with worker leases and atomic epoch burn sweeper fencing.
 */

import crypto from "crypto";
import { AutonomousInterventionModel, IAutonomousInterventionDoc } from "../../../../apps/web/server/db/models/AutonomousInterventionModel";
import { OutboxEventModel } from "../../../../apps/web/server/db/models/OutboxEventModel";
import { OutboxStorageService } from "../events/persistence/OutboxStorageService";
import { AutonomyLevel } from "../proactive/contracts/ProactiveContracts";

export class TamperedInterventionError extends Error {
  public readonly statusCode = 400;
  constructor(message: string = "Cryptographic signature verification failed: payload has been tampered with.") {
    super(message);
    this.name = "TamperedInterventionError";
  }
}

export class ExpiredInterventionError extends Error {
  public readonly statusCode = 409;
  constructor(message: string = "Intervention has expired and can no longer be accepted.") {
    super(message);
    this.name = "ExpiredInterventionError";
  }
}

export class InvalidInterventionStateError extends Error {
  public readonly statusCode = 409;
  constructor(message: string = "Intervention is not in a valid PENDING state for response.") {
    super(message);
    this.name = "InvalidInterventionStateError";
  }
}

export class RetiredKeyVersionError extends Error {
  public readonly statusCode = 400;
  constructor(message: string = "Signing key version is retired and no longer accepted.") {
    super(message);
    this.name = "RetiredKeyVersionError";
  }
}

export interface HITLGovernanceEngineDependencies {
  interventionModel?: any;
  outboxModel?: any;
  outboxService?: OutboxStorageService;
  secretKey?: string;
  previousSecretKeys?: Map<number, string>;
  retiredKeyVersions?: Set<number>;
  activeKeyVersion?: number;
  workerId?: string;
  forceMode?: "MODE_A" | "MODE_B";
}

export interface CreateInterventionInput {
  interventionId?: string;
  userId: string;
  actionId: string;
  autonomyLevel: AutonomyLevel;
  domain: string;
  proposal: Record<string, any>;
  ttlMs?: number;
}

export interface RespondInterventionInput {
  interventionId: string;
  userId: string;
  response: "ACCEPTED" | "REJECTED" | "DISMISSED";
  signature: string;
  keyVersion?: number;
  metadata?: Record<string, any>;
  session?: any; // MongoDB client session for Mode A
}

export class HITLGovernanceEngine {
  private static instance: HITLGovernanceEngine;
  private interventionModel: any;
  private outboxModel: any;
  private outboxService: OutboxStorageService;
  private keys: Map<number, string> = new Map();
  private retiredKeys: Set<number> = new Set();
  private activeKeyVersion: number;
  private workerId: string;
  private forceMode?: "MODE_A" | "MODE_B";

  constructor(deps?: HITLGovernanceEngineDependencies) {
    this.interventionModel = deps?.interventionModel || AutonomousInterventionModel;
    this.outboxModel = deps?.outboxModel || OutboxEventModel;
    this.outboxService = deps?.outboxService || OutboxStorageService.getInstance();
    this.activeKeyVersion = deps?.activeKeyVersion || 1;
    this.workerId = deps?.workerId || `hitl_worker_${process.pid}_${Math.random().toString(36).slice(2, 7)}`;
    this.forceMode = deps?.forceMode;

    const primaryKey = deps?.secretKey || process.env.HITL_SIGNING_KEY || "aven-hitl-default-insecure-secret-dev";
    this.keys.set(this.activeKeyVersion, primaryKey);

    if (deps?.previousSecretKeys) {
      for (const [v, k] of deps.previousSecretKeys.entries()) {
        this.keys.set(v, k);
      }
    }

    if (deps?.retiredKeyVersions) {
      for (const rk of deps.retiredKeyVersions) {
        this.retiredKeys.add(rk);
      }
    }
  }

  static getInstance(deps?: HITLGovernanceEngineDependencies): HITLGovernanceEngine {
    if (!HITLGovernanceEngine.instance) {
      HITLGovernanceEngine.instance = new HITLGovernanceEngine(deps);
    }
    return HITLGovernanceEngine.instance;
  }

  public rotateKey(newKeyVersion: number, newKeySecret: string, retireVersions?: number[]): void {
    this.keys.set(newKeyVersion, newKeySecret);
    this.activeKeyVersion = newKeyVersion;
    if (retireVersions) {
      for (const rv of retireVersions) {
        this.retiredKeys.add(rv);
      }
    }
  }

  public retireKeyVersion(keyVersion: number): void {
    this.retiredKeys.add(keyVersion);
  }

  public getCanonicalPayloadString(
    interventionId: string,
    userId: string,
    actionId: string,
    proposal: Record<string, any>,
    expiresAtMs: number,
    keyVersion: number
  ): string {
    return `${interventionId}:${userId}:${actionId}:${JSON.stringify(proposal)}:${expiresAtMs}:${keyVersion}`;
  }

  public generateSignature(
    interventionId: string,
    userId: string,
    actionId: string,
    proposal: Record<string, any>,
    expiresAtMs: number,
    keyVersion: number = this.activeKeyVersion
  ): string {
    const key = this.keys.get(keyVersion);
    if (!key) {
      throw new Error(`Signing key version ${keyVersion} not configured.`);
    }

    const payload = this.getCanonicalPayloadString(interventionId, userId, actionId, proposal, expiresAtMs, keyVersion);
    return crypto.createHmac("sha256", key).update(payload).digest("hex");
  }

  /**
   * Constant-time timingSafeEqual verification with length pre-check (AC-03 & Invariant 2.2).
   */
  public verifySignature(
    interventionId: string,
    userId: string,
    actionId: string,
    proposal: Record<string, any>,
    expiresAtMs: number,
    keyVersion: number,
    candidateSignature: string
  ): boolean {
    if (this.retiredKeys.has(keyVersion)) {
      throw new RetiredKeyVersionError(`Key version ${keyVersion} is retired.`);
    }

    const key = this.keys.get(keyVersion);
    if (!key) return false;

    // Fixed-length pre-check: HMAC-SHA256 hex string must be exactly 64 characters
    if (typeof candidateSignature !== "string" || candidateSignature.length !== 64) {
      return false;
    }

    const expectedSignature = this.generateSignature(interventionId, userId, actionId, proposal, expiresAtMs, keyVersion);

    try {
      const candidateBuf = Buffer.from(candidateSignature, "hex");
      const expectedBuf = Buffer.from(expectedSignature, "hex");

      if (candidateBuf.length !== expectedBuf.length || candidateBuf.length !== 32) {
        return false;
      }

      return crypto.timingSafeEqual(candidateBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  public async createIntervention(input: CreateInterventionInput): Promise<any> {
    const interventionId = input.interventionId || `hitl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ttlMs = input.ttlMs || 1000 * 60 * 60 * 24;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const keyVersion = this.activeKeyVersion;

    const signature = this.generateSignature(
      interventionId,
      input.userId,
      input.actionId,
      input.proposal,
      expiresAt.getTime(),
      keyVersion
    );

    const doc = {
      interventionId,
      userId: input.userId,
      actionId: input.actionId,
      autonomyLevel: input.autonomyLevel,
      domain: input.domain,
      proposal: input.proposal,
      signature,
      keyVersion,
      status: "PENDING",
      mutationEpoch: 1,
      expiresAt,
    };

    const created = await this.interventionModel.create(doc);
    return Array.isArray(created) ? created[0] : created;
  }

  /**
   * Responds to an intervention with cryptographic verification and dual-mode atomicity.
   */
  public async respondIntervention(input: RespondInterventionInput): Promise<any> {
    const intervention = await this.interventionModel.findOne({
      interventionId: input.interventionId,
      userId: input.userId,
    });

    if (!intervention) {
      const err: any = new Error(`Intervention ${input.interventionId} not found.`);
      err.statusCode = 404;
      throw err;
    }

    const keyVersion = input.keyVersion || intervention.keyVersion || this.activeKeyVersion;
    if (this.retiredKeys.has(keyVersion)) {
      throw new RetiredKeyVersionError();
    }

    const now = new Date();
    const expiresAtMs = intervention.expiresAt instanceof Date
      ? intervention.expiresAt.getTime()
      : new Date(intervention.expiresAt).getTime();

    // 1. Verify cryptographic signature with constant-time equality and length pre-check
    const isValidSignature = this.verifySignature(
      intervention.interventionId,
      intervention.userId,
      intervention.actionId,
      intervention.proposal,
      expiresAtMs,
      keyVersion,
      input.signature
    );

    if (!isValidSignature) {
      throw new TamperedInterventionError();
    }

    // 2. Check expiration
    if (now.getTime() > expiresAtMs) {
      await this.interventionModel.updateOne(
        { interventionId: input.interventionId, status: "PENDING" },
        { $set: { status: "EXPIRED" } }
      );
      throw new ExpiredInterventionError();
    }

    if (intervention.status !== "PENDING") {
      throw new InvalidInterventionStateError();
    }

    // 3. Dual-Mode Persistence
    const currentEpoch = intervention.mutationEpoch || 1;
    const isModeA = this.forceMode === "MODE_A" || (input.session && this.forceMode !== "MODE_B");

    if (isModeA && input.session) {
      // Mode A: Multi-document transaction
      const session = input.session;
      const updateResult = await this.interventionModel.updateOne(
        {
          interventionId: input.interventionId,
          userId: input.userId,
          status: "PENDING",
          mutationEpoch: currentEpoch,
          expiresAt: { $gt: now },
        },
        {
          $set: {
            status: input.response,
            respondedAt: now,
            responseMetadata: input.metadata || {},
          },
          $inc: { mutationEpoch: 1 },
        },
        { session }
      );

      if ((updateResult.modifiedCount || updateResult.matchedCount || 0) === 0) {
        throw new InvalidInterventionStateError();
      }

      await this.outboxModel.create(
        [
          {
            eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            userId: input.userId,
            category: "DOMAIN_EVENT",
            type: "domain.intervention.responded",
            aggregateId: input.interventionId,
            aggregateType: "AutonomousIntervention",
            aggregateVersion: currentEpoch + 1,
            eventOrdinal: 1,
            causalSequence: 1,
            occurredAt: now,
            recordedAt: now,
            correlationId: input.interventionId,
            source: "hitl.ingress",
            payload: {
              interventionId: input.interventionId,
              userId: input.userId,
              actionId: intervention.actionId,
              response: input.response,
              respondedAt: now,
            },
            metadata: input.metadata || {},
            deliveryStatus: "PENDING",
            leaseGeneration: 0,
            attempts: 0,
            maxAttempts: 5,
            nextAttemptAt: now,
          },
        ],
        { session }
      );
    } else {
      // Mode B: DIMIP with Worker Lease and Atomic Epoch Burn Fencing
      const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // Step 3.1: Create PENDING_COMMIT outbox intent with worker lease
      const outboxDoc = {
        eventId,
        userId: input.userId,
        category: "DOMAIN_EVENT",
        type: "domain.intervention.responded",
        aggregateId: input.interventionId,
        aggregateType: "AutonomousIntervention",
        aggregateVersion: currentEpoch + 1,
        eventOrdinal: 1,
        causalSequence: 1,
        occurredAt: now,
        recordedAt: now,
        correlationId: input.interventionId,
        source: "hitl.ingress",
        payload: {
          interventionId: input.interventionId,
          userId: input.userId,
          actionId: intervention.actionId,
          response: input.response,
          respondedAt: now,
        },
        metadata: input.metadata || {},
        deliveryStatus: "PENDING_COMMIT",
        leasedByWorkerId: this.workerId,
        leaseExpiresAt: new Date(now.getTime() + 15000),
        leaseGeneration: 1,
        mutationIntent: {
          clientMutationId: `hitl_${input.interventionId}_${input.response}`,
          fencingEpoch: currentEpoch,
        },
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: now,
      };

      await this.outboxModel.create(outboxDoc);

      // Step 3.2: Atomic CAS update on intervention
      const updateResult = await this.interventionModel.updateOne(
        {
          interventionId: input.interventionId,
          userId: input.userId,
          status: "PENDING",
          mutationEpoch: currentEpoch,
          expiresAt: { $gt: now },
        },
        {
          $set: {
            status: input.response,
            respondedAt: now,
            responseMetadata: input.metadata || {},
          },
          $inc: { mutationEpoch: 1 },
        }
      );

      if ((updateResult.modifiedCount || updateResult.matchedCount || 0) === 0) {
        // CAS failed! Clean up outbox intent to prevent zombie promotion
        await this.outboxModel.updateOne(
          { eventId },
          { $set: { deliveryStatus: "ABORTED" } }
        );
        throw new InvalidInterventionStateError();
      }

      // Step 3.3: Promote outbox event from PENDING_COMMIT to PENDING
      await this.outboxModel.updateOne(
        { eventId, deliveryStatus: "PENDING_COMMIT" },
        {
          $set: { deliveryStatus: "PENDING" },
          $unset: { leasedByWorkerId: 1, leaseExpiresAt: 1 },
        }
      );
    }

    return this.interventionModel.findOne({ interventionId: input.interventionId });
  }

  /**
   * Sweeper Recovery Protocol for Stalled DIMIP Intents (Loop 2 & ADR-39)
   * Prevents delayed worker races via Atomic Epoch Burn fencing.
   */
  public async reconcileStalledDimipIntent(intentEvent: any): Promise<"PROMOTED" | "ABORTED" | "SKIPPED_ACTIVE"> {
    const now = new Date();
    if (intentEvent.leaseExpiresAt && new Date(intentEvent.leaseExpiresAt).getTime() > now.getTime()) {
      return "SKIPPED_ACTIVE";
    }

    // 1. Acquire intent lease via CAS
    const leaseClaim = await this.outboxModel.updateOne(
      {
        eventId: intentEvent.eventId,
        deliveryStatus: "PENDING_COMMIT",
        leaseGeneration: intentEvent.leaseGeneration,
      },
      {
        $set: {
          leasedByWorkerId: this.workerId,
          leaseExpiresAt: new Date(now.getTime() + 15000),
        },
        $inc: { leaseGeneration: 1 },
      }
    );

    if ((leaseClaim.matchedCount || leaseClaim.modifiedCount || 0) === 0) {
      return "SKIPPED_ACTIVE"; // Another recovery worker acquired lease
    }

    const interventionId = intentEvent.aggregateId || intentEvent.payload?.interventionId;
    const userId = intentEvent.userId;
    const intentEpoch = intentEvent.mutationIntent?.fencingEpoch || 1;

    const intervention = await this.interventionModel.findOne({ interventionId, userId });
    if (!intervention) {
      await this.outboxModel.updateOne({ eventId: intentEvent.eventId }, { $set: { deliveryStatus: "ABORTED" } });
      return "ABORTED";
    }

    if (intervention.status === "PENDING") {
      // Sweeper executes Atomic Epoch Burn on AutonomousInterventionModel!
      const burn = await this.interventionModel.updateOne(
        {
          interventionId,
          userId,
          status: "PENDING",
          mutationEpoch: intentEpoch,
        },
        { $inc: { mutationEpoch: 1 } }
      );

      if ((burn.matchedCount || burn.modifiedCount || 0) === 1) {
        // Burn succeeded! Worker is fenced out. Mark outbox event ABORTED.
        await this.outboxModel.updateOne(
          { eventId: intentEvent.eventId },
          { $set: { deliveryStatus: "ABORTED" } }
        );
        return "ABORTED";
      } else {
        // Burn failed: delayed worker committed just now!
        const recheck = await this.interventionModel.findOne({ interventionId, userId });
        if (recheck && (recheck.status === "ACCEPTED" || recheck.status === "REJECTED")) {
          await this.outboxModel.updateOne(
            { eventId: intentEvent.eventId },
            { $set: { deliveryStatus: "PENDING" }, $unset: { leasedByWorkerId: 1, leaseExpiresAt: 1 } }
          );
          return "PROMOTED";
        }
      }
    } else if (intervention.status === "ACCEPTED" || intervention.status === "REJECTED" || intervention.status === "DISMISSED") {
      // Worker already committed! Promote outbox event to PENDING!
      await this.outboxModel.updateOne(
        { eventId: intentEvent.eventId },
        { $set: { deliveryStatus: "PENDING" }, $unset: { leasedByWorkerId: 1, leaseExpiresAt: 1 } }
      );
      return "PROMOTED";
    }

    return "ABORTED";
  }
}
