import mongoose, { Schema, Document, Model } from "mongoose";

export type ConsumerLedgerStatus =
  | "SUCCEEDED"
  | "SKIPPED_STALE"
  | "FAILED_RETRYABLE"
  | "FAILED_TERMINAL"
  | "PENDING_RETRY";

export interface IConsumerProcessingLedgerDoc extends Document {
  ledgerKey: string;
  userId: string;
  consumerName: string;
  eventId: string;
  aggregateId: string;
  aggregateVersion: number;
  causalSequence: number;
  status: ConsumerLedgerStatus;
  processedAt: Date;
  executionDurationMs: number;
  leaseGeneration: number;
  errorDetails?: string | null;
  retentionExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ConsumerProcessingLedgerSchema = new Schema<IConsumerProcessingLedgerDoc>(
  {
    ledgerKey: {
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
    consumerName: {
      type: String,
      required: true,
      index: true,
    },
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    aggregateId: {
      type: String,
      required: true,
    },
    aggregateVersion: {
      type: Number,
      required: true,
    },
    causalSequence: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["SUCCEEDED", "SKIPPED_STALE", "FAILED_RETRYABLE", "FAILED_TERMINAL", "PENDING_RETRY"],
      index: true,
    },
    processedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    executionDurationMs: {
      type: Number,
      required: true,
      default: 0,
    },
    leaseGeneration: {
      type: Number,
      required: true,
      default: 0,
    },
    errorDetails: {
      type: String,
      default: null,
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

ConsumerProcessingLedgerSchema.index({ userId: 1, consumerName: 1, status: 1 });
ConsumerProcessingLedgerSchema.index({ aggregateId: 1, causalSequence: 1 });

export const ConsumerProcessingLedgerModel: Model<IConsumerProcessingLedgerDoc> =
  mongoose.models.ConsumerProcessingLedger ||
  mongoose.model<IConsumerProcessingLedgerDoc>(
    "ConsumerProcessingLedger",
    ConsumerProcessingLedgerSchema
  );
