import crypto from "node:crypto";
import mongoose from "mongoose";
import { ExecutionWorkspaceModel } from "../../../../../apps/web/server/db/models/ExecutionWorkspaceModel";
import { ExecutionEventRecordModel } from "../../../../../apps/web/server/db/models/ExecutionEventRecordModel";
import { ActionAuditRecordModel } from "../../../../../apps/web/server/db/models/ActionAuditRecordModel";
import {
  IStepOutputSnapshot,
  IExecutionLockContext,
  IWorkflowExecutionRecord,
  WORKSPACE_STORAGE_BUDGETS,
  WorkflowExecutionPlan,
  StaleWorkspaceMutationError,
  WorkspaceNotFoundError,
  StepDataCorruptionError,
  CheckpointLedgerConsistencyError,
  PersistenceUnavailableError,
  StaleWorkerFencedError,
  WorkspaceSizeLimitExceededError,
} from "../contracts/WorkflowExecutionContracts";
import { ExecutionWorkspace } from "./ExecutionWorkspace";
import { ExecutionEventLedger } from "./ExecutionEventLedger";
import { StepDataResolver } from "./StepDataResolver";
import { WorkspaceStatus, TerminationReason } from "./WorkspaceStateMachine";

export interface CommitCheckpointParams {
  executionId: string;
  userId: string;
  userRequest?: string;
  goal?: string;
  conversationId?: string;
  workerId?: string;
  expectedVersion: number;
  expectedToken?: string;
  expectedGeneration?: number;
  checkpointId: string;
  events: Array<{
    seq: number;
    type: string;
    source: string;
    timestamp: number;
    payload?: any;
    causalityRef?: string;
  }>;
  snapshotUpdate: {
    userRequest?: string;
    goal?: string;
    conversationId?: string;
    status?: WorkspaceStatus;
    iteration?: number;
    plan?: WorkflowExecutionPlan;
    completedSteps?: IStepOutputSnapshot[];
    scratchpad?: Record<string, any>;
    pendingOperationId?: string | null;
    terminationReason?: TerminationReason;
    retentionExpiresAt?: Date | null;
  };
}

export interface RestoredWorkspaceData {
  workspace: ExecutionWorkspace;
  completedSteps: IStepOutputSnapshot[];
  plan?: WorkflowExecutionPlan;
  lock?: IExecutionLockContext | null;
  retentionExpiresAt?: Date | null;
  lastCommittedCheckpointId?: string;
}

export interface IExecutionPersistenceStore {
  actionAudits?: Map<string, any>;
  saveCheckpoint(params: CommitCheckpointParams): Promise<void>;
  restoreWorkspace(executionId: string, userId: string): Promise<RestoredWorkspaceData>;
  acquireLock(
    executionId: string,
    userId: string,
    workerId: string,
    leaseDurationMs?: number
  ): Promise<{ leaseOwnerToken: string; generation: number } | null>;
  renewLock(
    executionId: string,
    userId: string,
    leaseOwnerToken: string,
    generation: number,
    leaseDurationMs?: number
  ): Promise<boolean>;
  releaseLock(
    executionId: string,
    userId: string,
    leaseOwnerToken: string,
    generation: number
  ): Promise<void>;
}

function computeRetentionTimes(
  status?: string,
  terminationReason?: string,
  explicitRetention?: Date | null
): { workspaceRetention: Date | null; eventsRetention: Date | null } {
  if (
    status === "PAUSED_AWAITING_CONFIRMATION" ||
    terminationReason === "AMBIGUOUS_EXTERNAL_MUTATION"
  ) {
    return { workspaceRetention: null, eventsRetention: null };
  }

  if (
    status === "COMPLETED" ||
    status === "CANCELLED_BY_USER" ||
    (status === "TERMINATED_FAILED" && terminationReason !== "AMBIGUOUS_EXTERNAL_MUTATION")
  ) {
    const wsRetention = explicitRetention || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const evRetention = new Date(wsRetention.getTime() + 24 * 60 * 60 * 1000);
    return { workspaceRetention: wsRetention, eventsRetention: evRetention };
  }

  if (explicitRetention) {
    return {
      workspaceRetention: explicitRetention,
      eventsRetention: new Date(explicitRetention.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  return { workspaceRetention: null, eventsRetention: null };
}

/**
 * MockExecutionPersistenceStore
 * 
 * In-memory persistence store simulating MongoDB replica-set transaction boundaries,
 * CAS fencing, deterministic event ledgering, and retention buffers for isolated testing.
 */
export class MockExecutionPersistenceStore implements IExecutionPersistenceStore {
  public workspaces = new Map<string, any>();
  public events = new Map<string, any[]>();
  public actionAudits = new Map<string, any>();

  async saveCheckpoint(params: CommitCheckpointParams): Promise<void> {
    const serialized = JSON.stringify({ ...params.snapshotUpdate, events: params.events });
    const bytes = Buffer.byteLength(serialized, "utf8");
    if (bytes > WORKSPACE_STORAGE_BUDGETS.maxDocumentBytes) {
      throw new WorkspaceSizeLimitExceededError(
        `Checkpoint payload of ${bytes}B exceeds document budget of ${WORKSPACE_STORAGE_BUDGETS.maxDocumentBytes}B`
      );
    }

    const key = `${params.executionId}_${params.userId}`;
    const existing = this.workspaces.get(key);
    const { workspaceRetention, eventsRetention } = computeRetentionTimes(
      params.snapshotUpdate.status,
      params.snapshotUpdate.terminationReason,
      params.snapshotUpdate.retentionExpiresAt
    );

    if (!existing) {
      if (params.expectedVersion !== 1) {
        throw new StaleWorkspaceMutationError(params.expectedVersion, 0);
      }

      const eventDocs = params.events.map((ev) => ({
        executionId: params.executionId,
        seq: ev.seq,
        eventId: `evt_${params.executionId}_s${ev.seq}_${params.checkpointId}`,
        checkpointId: params.checkpointId,
        type: ev.type,
        source: ev.source,
        timestamp: ev.timestamp,
        payload: ev.payload || {},
        causalityRef: ev.causalityRef,
        retentionExpiresAt: eventsRetention,
      }));

      this.events.set(params.executionId, eventDocs);

      const newDoc: any = {
        executionId: params.executionId,
        userId: params.userId,
        conversationId: params.conversationId || params.snapshotUpdate.conversationId,
        userRequest: params.userRequest || params.snapshotUpdate.userRequest || "",
        goal: params.goal || params.snapshotUpdate.goal || "",
        status: params.snapshotUpdate.status || "INITIALIZED",
        iteration: params.snapshotUpdate.iteration || 1,
        stateVersion: 1,
        lastPersistedSeq: eventDocs.length > 0 ? eventDocs[eventDocs.length - 1].seq : 0,
        lastCommittedCheckpointId: params.checkpointId,
        plan: params.snapshotUpdate.plan,
        completedSteps: params.snapshotUpdate.completedSteps || [],
        scratchpad: params.snapshotUpdate.scratchpad || {},
        pendingOperationId: params.snapshotUpdate.pendingOperationId || null,
        terminationReason: params.snapshotUpdate.terminationReason,
        lock: params.expectedToken
          ? {
              workerId: params.workerId || "worker_test",
              leaseOwnerToken: params.expectedToken,
              leaseExpiresAt: new Date(Date.now() + 60000),
              generation: params.expectedGeneration || 1,
              acquiredAt: new Date(),
            }
          : null,
        retentionExpiresAt: workspaceRetention,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.workspaces.set(key, newDoc);
      return;
    }

    // CAS version check
    if (existing.stateVersion !== params.expectedVersion) {
      throw new StaleWorkspaceMutationError(params.expectedVersion, existing.stateVersion);
    }

    // Fencing token check
    if (params.expectedToken !== undefined && existing.lock) {
      if (
        existing.lock.leaseOwnerToken !== params.expectedToken ||
        existing.lock.generation !== params.expectedGeneration
      ) {
        throw new StaleWorkerFencedError(
          `Worker token/generation mismatch: expected (${params.expectedToken}, gen ${params.expectedGeneration}), current (${existing.lock.leaseOwnerToken}, gen ${existing.lock.generation})`
        );
      }
    }

    // Transactional event append
    const currentEvents = this.events.get(params.executionId) || [];
    const eventDocs = params.events.map((ev) => ({
      executionId: params.executionId,
      seq: ev.seq,
      eventId: `evt_${params.executionId}_s${ev.seq}_${params.checkpointId}`,
      checkpointId: params.checkpointId,
      type: ev.type,
      source: ev.source,
      timestamp: ev.timestamp,
      payload: ev.payload || {},
      causalityRef: ev.causalityRef,
      retentionExpiresAt: eventsRetention,
    }));

    const updatedEvents = [...currentEvents, ...eventDocs];
    this.events.set(params.executionId, updatedEvents);

    // Update snapshot
    const updatedDoc = {
      ...existing,
      ...params.snapshotUpdate,
      stateVersion: params.expectedVersion + 1,
      lastCommittedCheckpointId: params.checkpointId,
      lastPersistedSeq: eventDocs.length > 0 ? eventDocs[eventDocs.length - 1].seq : existing.lastPersistedSeq,
      retentionExpiresAt: workspaceRetention,
      updatedAt: new Date(),
    };

    // Release lock on terminal or paused
    if (
      params.snapshotUpdate.status === "COMPLETED" ||
      params.snapshotUpdate.status === "CANCELLED_BY_USER" ||
      params.snapshotUpdate.status === "TERMINATED_FAILED" ||
      params.snapshotUpdate.status === "PAUSED_AWAITING_CONFIRMATION"
    ) {
      updatedDoc.lock = null;
    }

    this.workspaces.set(key, updatedDoc);
  }

  async restoreWorkspace(executionId: string, userId: string): Promise<RestoredWorkspaceData> {
    const key = `${executionId}_${userId}`;
    const doc = this.workspaces.get(key);
    if (!doc) {
      throw new WorkspaceNotFoundError(executionId, userId);
    }

    const allEvents = this.events.get(executionId) || [];
    const relevantEvents = allEvents
      .filter((ev) => ev.seq <= doc.lastPersistedSeq)
      .sort((a, b) => a.seq - b.seq);

    if (doc.lastPersistedSeq > 0) {
      if (relevantEvents.length === 0) {
        throw new CheckpointLedgerConsistencyError(
          `Workspace lastPersistedSeq is ${doc.lastPersistedSeq}, but 0 events found.`
        );
      }

      for (let i = 0; i < relevantEvents.length; i++) {
        if (relevantEvents[i].seq !== i + 1) {
          throw new CheckpointLedgerConsistencyError(
            `Sequence gap in event ledger: expected seq ${i + 1}, found ${relevantEvents[i].seq}.`
          );
        }
        if (!relevantEvents[i].checkpointId) {
          throw new CheckpointLedgerConsistencyError(
            `Event ${relevantEvents[i].eventId} has missing checkpointId.`
          );
        }
      }

      if (relevantEvents[relevantEvents.length - 1].seq !== doc.lastPersistedSeq) {
        throw new CheckpointLedgerConsistencyError(
          `Terminal event seq (${relevantEvents[relevantEvents.length - 1].seq}) != lastPersistedSeq (${doc.lastPersistedSeq}).`
        );
      }

      if (
        doc.lastCommittedCheckpointId &&
        relevantEvents[relevantEvents.length - 1].checkpointId !== doc.lastCommittedCheckpointId
      ) {
        throw new CheckpointLedgerConsistencyError(
          `Terminal event checkpointId != workspace lastCommittedCheckpointId.`
        );
      }
    }

    const completedSteps: IStepOutputSnapshot[] = (doc.completedSteps || []) as any;
    for (const step of completedSteps) {
      const valid = StepDataResolver.verifySnapshotIntegrity(step);
      if (!valid) {
        throw new StepDataCorruptionError(
          `Integrity hash mismatch on step "${step.stepId}". Data tampering detected.`
        );
      }
    }

    const workspace = new ExecutionWorkspace({
      executionId: doc.executionId,
      userId: doc.userId,
      conversationId: doc.conversationId,
      userRequest: doc.userRequest,
      goal: doc.goal,
    });

    workspace.status = doc.status;
    workspace.iteration = doc.iteration;
    workspace.stateVersion = doc.stateVersion;
    workspace.terminationReason = doc.terminationReason;

    const scratchpad = doc.scratchpad || {};
    for (const [k, v] of Object.entries(scratchpad)) {
      workspace.setScratchpad(k, v);
    }

    return {
      workspace,
      completedSteps,
      plan: doc.plan,
      lock: doc.lock,
      retentionExpiresAt: doc.retentionExpiresAt,
      lastCommittedCheckpointId: doc.lastCommittedCheckpointId,
    };
  }

  async acquireLock(
    executionId: string,
    userId: string,
    workerId: string,
    leaseDurationMs: number = 60000
  ): Promise<{ leaseOwnerToken: string; generation: number } | null> {
    const key = `${executionId}_${userId}`;
    const doc = this.workspaces.get(key);
    if (!doc) return null;

    const now = Date.now();
    const currentLock = doc.lock;

    if (currentLock && currentLock.leaseExpiresAt.getTime() > now) {
      // Lease is currently active and unexpired
      return null;
    }

    const token = `lease_${crypto.randomUUID()}`;
    const generation = (currentLock?.generation || 0) + 1;

    doc.lock = {
      workerId,
      leaseOwnerToken: token,
      leaseExpiresAt: new Date(now + leaseDurationMs),
      generation,
      acquiredAt: new Date(now),
    };

    return { leaseOwnerToken: token, generation };
  }

  async renewLock(
    executionId: string,
    userId: string,
    leaseOwnerToken: string,
    generation: number,
    leaseDurationMs: number = 60000
  ): Promise<boolean> {
    const key = `${executionId}_${userId}`;
    const doc = this.workspaces.get(key);
    if (!doc || !doc.lock) return false;

    if (doc.lock.leaseOwnerToken !== leaseOwnerToken || doc.lock.generation !== generation) {
      return false;
    }

    doc.lock.leaseExpiresAt = new Date(Date.now() + leaseDurationMs);
    return true;
  }

  async releaseLock(
    executionId: string,
    userId: string,
    leaseOwnerToken: string,
    generation: number
  ): Promise<void> {
    const key = `${executionId}_${userId}`;
    const doc = this.workspaces.get(key);
    if (!doc || !doc.lock) return;

    if (doc.lock.leaseOwnerToken === leaseOwnerToken && doc.lock.generation === generation) {
      doc.lock = null;
    }
  }
}

/**
 * ExecutionPersistenceService
 * 
 * Authoritative persistence gateway governing MongoDB multi-document ACID transactions,
 * monotonic event sequence integrity, atomic CAS worker fencing, and safe retention policies.
 */
export class ExecutionPersistenceService {
  private static instance: ExecutionPersistenceService | null = null;
  private testStore: IExecutionPersistenceStore | null = null;

  public static getInstance(): ExecutionPersistenceService {
    if (!this.instance) {
      this.instance = new ExecutionPersistenceService();
    }
    return this.instance;
  }

  public static resetInstance(): void {
    this.instance = null;
  }

  public setTestStore(store: IExecutionPersistenceStore | null): void {
    this.testStore = store;
  }

  public getTestStore(): IExecutionPersistenceStore | null {
    return this.testStore;
  }

  private assertDatabaseConnected(): void {
    if (this.testStore) return;
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      throw new PersistenceUnavailableError(
        `MongoDB persistence is not connected (readyState=${mongoose.connection?.readyState ?? 0}). Failing closed.`
      );
    }
  }

  /**
   * Commits a checkpoint atomically inside a MongoDB transaction.
   */
  async commitCheckpoint(params: CommitCheckpointParams): Promise<void> {
    const serialized = JSON.stringify({ ...params.snapshotUpdate, events: params.events });
    const bytes = Buffer.byteLength(serialized, "utf8");
    if (bytes > WORKSPACE_STORAGE_BUDGETS.maxDocumentBytes) {
      throw new WorkspaceSizeLimitExceededError(
        `Checkpoint payload of ${bytes}B exceeds maximum document budget of ${WORKSPACE_STORAGE_BUDGETS.maxDocumentBytes}B`
      );
    }

    if (this.testStore) {
      return this.testStore.saveCheckpoint(params);
    }

    this.assertDatabaseConnected();

    const session = await mongoose.startSession();
    try {
      const { workspaceRetention, eventsRetention } = computeRetentionTimes(
        params.snapshotUpdate.status,
        params.snapshotUpdate.terminationReason,
        params.snapshotUpdate.retentionExpiresAt
      );

      await session.withTransaction(async () => {
        const existing = await ExecutionWorkspaceModel.findOne({
          executionId: params.executionId,
          userId: params.userId,
        }).session(session);

        if (!existing && params.expectedVersion === 1) {
          // Boundary 1: Workflow Initialized
          const eventDocs = params.events.map((ev) => ({
            executionId: params.executionId,
            seq: ev.seq,
            eventId: `evt_${params.executionId}_s${ev.seq}_${params.checkpointId}`,
            checkpointId: params.checkpointId,
            type: ev.type,
            source: ev.source,
            timestamp: ev.timestamp,
            payload: ev.payload || {},
            causalityRef: ev.causalityRef,
            retentionExpiresAt: eventsRetention,
          }));

          if (eventDocs.length > 0) {
            await ExecutionEventRecordModel.insertMany(eventDocs, { session, ordered: true });
          }

          const initialDoc = new ExecutionWorkspaceModel({
            executionId: params.executionId,
            userId: params.userId,
            conversationId: params.conversationId || params.snapshotUpdate.conversationId,
            userRequest: params.userRequest || params.snapshotUpdate.userRequest || "",
            goal: params.goal || params.snapshotUpdate.goal || "",
            status: params.snapshotUpdate.status || "INITIALIZED",
            iteration: params.snapshotUpdate.iteration || 1,
            stateVersion: 1,
            lastPersistedSeq: eventDocs.length > 0 ? eventDocs[eventDocs.length - 1].seq : 0,
            lastCommittedCheckpointId: params.checkpointId,
            plan: params.snapshotUpdate.plan,
            completedSteps: params.snapshotUpdate.completedSteps || [],
            scratchpad: params.snapshotUpdate.scratchpad || {},
            pendingOperationId: params.snapshotUpdate.pendingOperationId || null,
            terminationReason: params.snapshotUpdate.terminationReason,
            lock: params.expectedToken
              ? {
                  workerId: params.workerId || "worker_default",
                  leaseOwnerToken: params.expectedToken,
                  leaseExpiresAt: new Date(Date.now() + 60000),
                  generation: params.expectedGeneration || 1,
                  acquiredAt: new Date(),
                }
              : null,
            retentionExpiresAt: workspaceRetention,
          });

          await initialDoc.save({ session });
          return;
        }

        // Updating existing workspace checkpoint
        const eventDocs = params.events.map((ev) => ({
          executionId: params.executionId,
          seq: ev.seq,
          eventId: `evt_${params.executionId}_s${ev.seq}_${params.checkpointId}`,
          checkpointId: params.checkpointId,
          type: ev.type,
          source: ev.source,
          timestamp: ev.timestamp,
          payload: ev.payload || {},
          causalityRef: ev.causalityRef,
          retentionExpiresAt: eventsRetention,
        }));

        if (eventDocs.length > 0) {
          await ExecutionEventRecordModel.insertMany(eventDocs, { session, ordered: true });
        }

        const updateQuery: Record<string, any> = {
          executionId: params.executionId,
          userId: params.userId,
          stateVersion: params.expectedVersion,
        };

        if (params.expectedToken !== undefined) {
          updateQuery["lock.leaseOwnerToken"] = params.expectedToken;
          updateQuery["lock.generation"] = params.expectedGeneration;
        }

        const updateFields: Record<string, any> = {
          ...params.snapshotUpdate,
          stateVersion: params.expectedVersion + 1,
          lastCommittedCheckpointId: params.checkpointId,
          retentionExpiresAt: workspaceRetention,
          updatedAt: new Date(),
        };

        if (eventDocs.length > 0) {
          updateFields.lastPersistedSeq = eventDocs[eventDocs.length - 1].seq;
        }

        // Clean Terminal Invariant & release locks
        if (
          params.snapshotUpdate.status === "COMPLETED" ||
          params.snapshotUpdate.status === "CANCELLED_BY_USER" ||
          params.snapshotUpdate.status === "TERMINATED_FAILED" ||
          params.snapshotUpdate.status === "PAUSED_AWAITING_CONFIRMATION"
        ) {
          updateFields.lock = null;
        }

        const updateResult = await ExecutionWorkspaceModel.updateOne(
          updateQuery,
          { $set: updateFields },
          { session }
        );

        if (updateResult.matchedCount !== 1) {
          throw new StaleWorkspaceMutationError(params.expectedVersion, params.expectedVersion + 1);
        }
      });
    } catch (err: any) {
      if (
        err?.errorLabels?.has?.("UnknownTransactionCommitResult") ||
        (err?.message && err.message.includes("UnknownTransactionCommitResult"))
      ) {
        // Inspect authoritative primary replica
        const doc = await (ExecutionWorkspaceModel as any)
          .findOne({ executionId: params.executionId, userId: params.userId })
          .read("primary");

        if (
          doc &&
          doc.lastCommittedCheckpointId === params.checkpointId &&
          doc.stateVersion === params.expectedVersion + 1
        ) {
          return; // Confirmed committed!
        }

        if (doc && doc.stateVersion === params.expectedVersion) {
          const eventCount = await (ExecutionEventRecordModel as any)
            .countDocuments({ checkpointId: params.checkpointId })
            .read("primary");

          if (eventCount === 0) {
            throw err; // Confirmed rolled back by driver
          } else {
            throw new Error(
              `[UNRESOLVED_TRANSACTION_STATE]: Events exist on primary for checkpointId ${params.checkpointId} but workspace was uncommitted.`
            );
          }
        }
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Reconstitutes an ExecutionWorkspace from persistent storage.
   */
  async restoreWorkspace(executionId: string, userId: string): Promise<RestoredWorkspaceData> {
    if (this.testStore) {
      return this.testStore.restoreWorkspace(executionId, userId);
    }

    this.assertDatabaseConnected();

    const doc = await ExecutionWorkspaceModel.findOne({ executionId, userId });
    if (!doc) {
      throw new WorkspaceNotFoundError(executionId, userId);
    }

    const eventDocs = await ExecutionEventRecordModel.find({
      executionId,
      seq: { $lte: doc.lastPersistedSeq },
    }).sort({ seq: 1 });

    if (doc.lastPersistedSeq > 0) {
      if (eventDocs.length === 0) {
        throw new CheckpointLedgerConsistencyError(
          `Workspace lastPersistedSeq is ${doc.lastPersistedSeq}, but zero events were found.`
        );
      }

      for (let i = 0; i < eventDocs.length; i++) {
        if (eventDocs[i].seq !== i + 1) {
          throw new CheckpointLedgerConsistencyError(
            `Sequence gap detected in event ledger: expected seq ${i + 1}, found ${eventDocs[i].seq}.`
          );
        }
        if (!eventDocs[i].checkpointId || eventDocs[i].checkpointId.trim() === "") {
          throw new CheckpointLedgerConsistencyError(
            `Persisted event ${eventDocs[i].eventId} has missing or empty checkpointId.`
          );
        }
      }

      if (eventDocs[eventDocs.length - 1].seq !== doc.lastPersistedSeq) {
        throw new CheckpointLedgerConsistencyError(
          `Terminal event sequence (${eventDocs[eventDocs.length - 1].seq}) does not match workspace lastPersistedSeq (${doc.lastPersistedSeq}).`
        );
      }

      if (
        doc.lastCommittedCheckpointId &&
        eventDocs[eventDocs.length - 1].checkpointId !== doc.lastCommittedCheckpointId
      ) {
        throw new CheckpointLedgerConsistencyError(
          `Terminal event checkpointId (${eventDocs[eventDocs.length - 1].checkpointId}) does not match workspace lastCommittedCheckpointId (${doc.lastCommittedCheckpointId}).`
        );
      }
    }

    const completedSteps: IStepOutputSnapshot[] = (doc.completedSteps || []) as any;
    for (const step of completedSteps) {
      const valid = StepDataResolver.verifySnapshotIntegrity(step);
      if (!valid) {
        throw new StepDataCorruptionError(
          `Integrity hash mismatch on step "${step.stepId}". Data tampering or storage corruption detected.`
        );
      }
    }

    const workspace = new ExecutionWorkspace({
      executionId: doc.executionId,
      userId: doc.userId,
      conversationId: doc.conversationId,
      userRequest: doc.userRequest,
      goal: doc.goal,
    });

    workspace.status = doc.status as WorkspaceStatus;
    workspace.iteration = doc.iteration;
    workspace.stateVersion = doc.stateVersion;
    workspace.terminationReason = doc.terminationReason as TerminationReason;

    const scratchpadObj = doc.scratchpad || {};
    for (const [key, val] of Object.entries(scratchpadObj)) {
      workspace.setScratchpad(key, val);
    }

    return {
      workspace,
      completedSteps,
      plan: doc.plan as any,
      lock: doc.lock as any,
      retentionExpiresAt: doc.retentionExpiresAt,
      lastCommittedCheckpointId: doc.lastCommittedCheckpointId,
    };
  }

  /**
   * Atomically acquires or claims an expired worker lease lock on an ExecutionWorkspace.
   */
  async acquireLock(
    executionId: string,
    userId: string,
    workerId: string,
    leaseDurationMs: number = 60000
  ): Promise<{ leaseOwnerToken: string; generation: number } | null> {
    if (this.testStore) {
      return this.testStore.acquireLock(executionId, userId, workerId, leaseDurationMs);
    }

    this.assertDatabaseConnected();

    const leaseOwnerToken = `lease_${crypto.randomUUID()}`;
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    const updatedDoc = await ExecutionWorkspaceModel.findOneAndUpdate(
      {
        executionId,
        userId,
        $or: [
          { lock: null },
          { "lock.leaseExpiresAt": { $lte: now } },
        ],
      },
      {
        $set: {
          "lock.workerId": workerId,
          "lock.leaseOwnerToken": leaseOwnerToken,
          "lock.leaseExpiresAt": leaseExpiresAt,
          "lock.acquiredAt": now,
        },
        $inc: {
          "lock.generation": 1,
        },
      },
      { new: true }
    );

    if (!updatedDoc || !updatedDoc.lock) {
      return null;
    }

    return {
      leaseOwnerToken: updatedDoc.lock.leaseOwnerToken,
      generation: updatedDoc.lock.generation,
    };
  }

  /**
   * Renews an active worker lease lock using CAS fencing.
   */
  async renewLock(
    executionId: string,
    userId: string,
    leaseOwnerToken: string,
    generation: number,
    leaseDurationMs: number = 60000
  ): Promise<boolean> {
    if (this.testStore) {
      return this.testStore.renewLock(executionId, userId, leaseOwnerToken, generation, leaseDurationMs);
    }

    this.assertDatabaseConnected();

    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    const res = await ExecutionWorkspaceModel.updateOne(
      {
        executionId,
        userId,
        "lock.leaseOwnerToken": leaseOwnerToken,
        "lock.generation": generation,
      },
      {
        $set: {
          "lock.leaseExpiresAt": leaseExpiresAt,
        },
      }
    );

    return res.matchedCount === 1;
  }

  /**
   * Releases an active worker lease lock on an ExecutionWorkspace.
   */
  async releaseLock(
    executionId: string,
    userId: string,
    leaseOwnerToken: string,
    generation: number
  ): Promise<void> {
    if (this.testStore) {
      return this.testStore.releaseLock(executionId, userId, leaseOwnerToken, generation);
    }

    this.assertDatabaseConnected();

    await ExecutionWorkspaceModel.updateOne(
      {
        executionId,
        userId,
        "lock.leaseOwnerToken": leaseOwnerToken,
        "lock.generation": generation,
      },
      {
        $set: {
          lock: null,
        },
      }
    );
  }
}
