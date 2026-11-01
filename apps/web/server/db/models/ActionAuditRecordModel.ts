import mongoose, { Schema, Document, Model } from "mongoose";

export interface IActionAuditRecordDoc extends Document {
  idempotencyKey: string;
  actionId: string;
  userId: string;
  executionId?: string;
  stepId?: string;
  workerId?: string;
  leaseOwnerToken?: string;
  generation?: number;
  domain?: string;
  actionType: string;
  requestFingerprint?: string;
  status:
    | "PENDING"
    | "DISPATCH_INTENT_RECORDED"
    | "OUTCOME_UNKNOWN"
    | "SUCCEEDED"
    | "FAILED_CONFIRMED"
    | "RECONCILIATION_REQUIRED"
    | "EXECUTING"
    | "FAILED"
    | "QUARANTINED";
  payload: any;
  result?: any;
  error?: string;
  dispatchedAt?: Date;
  completedAt?: Date;
  leaseExpiresAt?: Date;
  fencingEpoch?: number;
  timestamp: number;
  createdAt: Date;
  updatedAt: Date;
}

const ActionAuditRecordSchema = new Schema<IActionAuditRecordDoc>(
  {
    idempotencyKey: {
      type: String,
      required: true,
      index: true,
    },
    actionId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    executionId: {
      type: String,
      index: true,
    },
    stepId: {
      type: String,
      index: true,
    },
    workerId: {
      type: String,
    },
    leaseOwnerToken: {
      type: String,
    },
    generation: {
      type: Number,
      default: 0,
    },
    domain: {
      type: String,
      default: "general",
    },
    actionType: {
      type: String,
      required: true,
      index: true,
    },
    requestFingerprint: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: [
        "PENDING",
        "DISPATCH_INTENT_RECORDED",
        "OUTCOME_UNKNOWN",
        "SUCCEEDED",
        "FAILED_CONFIRMED",
        "RECONCILIATION_REQUIRED",
        "EXECUTING",
        "FAILED",
        "QUARANTINED",
      ],
      default: "PENDING",
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    result: {
      type: Schema.Types.Mixed,
    },
    error: {
      type: String,
    },
    dispatchedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    leaseExpiresAt: {
      type: Date,
      index: true,
    },
    fencingEpoch: {
      type: Number,
      default: 1,
    },
    timestamp: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index on { userId: 1, idempotencyKey: 1 } for strict multi-tenant isolation
ActionAuditRecordSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
ActionAuditRecordSchema.index({ executionId: 1, stepId: 1 });
ActionAuditRecordSchema.index({ status: 1, dispatchedAt: 1 });
ActionAuditRecordSchema.index({ userId: 1, status: 1 });
ActionAuditRecordSchema.index({ status: 1, leaseExpiresAt: 1 });

export const ActionAuditRecordModel: Model<IActionAuditRecordDoc> =
  mongoose.models.ActionAuditRecord ||
  mongoose.model<IActionAuditRecordDoc>("ActionAuditRecord", ActionAuditRecordSchema);
