import mongoose, { Schema, Document, Model } from "mongoose";

export type MutationReceiptStatus = "COMMITTED" | "ABORTED_BY_RECOVERY";

export interface IMutationReceiptDoc extends Document {
  receiptId: string;
  userId: string;
  aggregateId: string;
  clientMutationId: string;
  version: number;
  fencingEpoch: number;
  diffHash: string;
  status: MutationReceiptStatus;
  appliedAt: Date;
  retentionExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MutationReceiptSchema = new Schema<IMutationReceiptDoc>(
  {
    receiptId: {
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
    aggregateId: {
      type: String,
      required: true,
      index: true,
    },
    clientMutationId: {
      type: String,
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
    },
    fencingEpoch: {
      type: Number,
      required: true,
    },
    diffHash: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["COMMITTED", "ABORTED_BY_RECOVERY"],
      index: true,
    },
    appliedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    retentionExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

MutationReceiptSchema.index({ aggregateId: 1, clientMutationId: 1 });
MutationReceiptSchema.index({ retentionExpiresAt: 1 });

export const MutationReceiptModel: Model<IMutationReceiptDoc> =
  mongoose.models.MutationReceipt ||
  mongoose.model<IMutationReceiptDoc>("MutationReceipt", MutationReceiptSchema);
