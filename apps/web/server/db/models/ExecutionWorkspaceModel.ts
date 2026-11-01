import mongoose, { Schema, Document, Model } from "mongoose";
import type { IStepOutputSnapshot } from "../../../../../packages/execution-kernel/src/orchestration/contracts/WorkflowExecutionContracts";

export interface IExecutionWorkspaceDoc extends Document {
  executionId: string;
  userId: string;
  conversationId?: string;
  userRequest: string;
  goal: string;
  status: string;
  iteration: number;
  stateVersion: number;
  lastPersistedSeq: number;
  lastCommittedCheckpointId?: string;
  plan?: Record<string, any>;
  completedSteps: IStepOutputSnapshot[];
  scratchpad: Record<string, any>;
  pendingOperationId?: string | null;
  terminationReason?: string;
  recoveryContext?: {
    totalRecoveryAttempts: number;
    activeBranchId?: string;
    anchorCheckpointId?: string;
    nextEligibleRetryTimestamp?: number;
    reconciledActionIds?: string[];
  };
  evidenceArchived?: boolean;
  graphSnapshot?: Record<string, any>;
  activeReservations?: Array<any>;
  approvalExpiresAt?: Date | null;
  lock?: {
    workerId: string;
    leaseOwnerToken: string;
    leaseExpiresAt: Date;
    generation: number;
    acquiredAt?: Date;
  } | null;
  retentionExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ExecutionWorkspaceSchema = new Schema<IExecutionWorkspaceDoc>(
  {
    executionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      index: true,
    },
    userRequest: {
      type: String,
      required: true,
    },
    goal: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      default: "INITIALIZED",
      index: true,
    },
    iteration: {
      type: Number,
      required: true,
      default: 1,
    },
    stateVersion: {
      type: Number,
      required: true,
      default: 1,
    },
    lastPersistedSeq: {
      type: Number,
      required: true,
      default: 0,
    },
    lastCommittedCheckpointId: {
      type: String,
    },
    plan: {
      type: Schema.Types.Mixed,
    },
    completedSteps: {
      type: [Schema.Types.Mixed],
      default: [],
    } as any,
    scratchpad: {
      type: Schema.Types.Mixed,
      default: {},
    },
    pendingOperationId: {
      type: String,
      default: null,
    },
    terminationReason: {
      type: String,
    },
    recoveryContext: {
      type: Schema.Types.Mixed,
      default: null,
    },
    evidenceArchived: {
      type: Boolean,
      default: false,
    },
    graphSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
    },
    activeReservations: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    approvalExpiresAt: {
      type: Date,
      default: null,
    },
    lock: {
      workerId: { type: String },
      leaseOwnerToken: { type: String },
      leaseExpiresAt: { type: Date },
      generation: { type: Number, default: 0 },
      acquiredAt: { type: Date },
    },
    retentionExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

ExecutionWorkspaceSchema.index({ executionId: 1, userId: 1 }, { unique: true });
ExecutionWorkspaceSchema.index({ userId: 1, status: 1 });
ExecutionWorkspaceSchema.index({ "lock.leaseExpiresAt": 1 });
ExecutionWorkspaceSchema.index({ approvalExpiresAt: 1 });
ExecutionWorkspaceSchema.index({ retentionExpiresAt: 1 }, { expireAfterSeconds: 0 });

export const ExecutionWorkspaceModel: Model<IExecutionWorkspaceDoc> =
  mongoose.models.ExecutionWorkspace ||
  mongoose.model<IExecutionWorkspaceDoc>("ExecutionWorkspace", ExecutionWorkspaceSchema);
