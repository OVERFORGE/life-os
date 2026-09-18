import mongoose, { Schema, Document, Model } from "mongoose";

export interface IActionAuditRecordDoc extends Document {
  idempotencyKey: string;
  actionId: string;
  userId: string;
  domain: string;
  actionType: string;
  status: string;
  payload: any;
  result?: any;
  error?: string;
  timestamp: number;
  createdAt: Date;
  updatedAt: Date;
}

const ActionAuditRecordSchema = new Schema<IActionAuditRecordDoc>(
  {
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
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
    domain: {
      type: String,
      required: true,
    },
    actionType: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: [
        "PENDING",
        "EXECUTING",
        "SUCCEEDED",
        "FAILED",
        "COMPENSATING",
        "COMPENSATED",
        "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED",
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
    timestamp: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const ActionAuditRecordModel: Model<IActionAuditRecordDoc> =
  mongoose.models.ActionAuditRecord ||
  mongoose.model<IActionAuditRecordDoc>("ActionAuditRecord", ActionAuditRecordSchema);
