/**
 * PartitionLeaseModel.ts
 * 
 * Distributed mutual exclusion model for aggregate partition processing.
 * Milestone B — Step 2 V2.2 Canonical Partition Leasing.
 */

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPartitionLeaseDoc extends Document {
  partitionKey: string; // "${userId}:${aggregateType}:${aggregateId}"
  userId: string;
  aggregateType: string;
  aggregateId: string;
  leasedByWorkerId: string | null;
  status: "ACTIVE" | "RELEASED";
  leaseExpiresAt: Date | null;
  leaseGeneration: number;
  createdAt: Date;
  updatedAt: Date;
}

const PartitionLeaseSchema = new Schema<IPartitionLeaseDoc>(
  {
    partitionKey: {
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
    aggregateType: {
      type: String,
      required: true,
    },
    aggregateId: {
      type: String,
      required: true,
    },
    leasedByWorkerId: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "RELEASED"],
      default: "RELEASED",
      index: true,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    leaseGeneration: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

PartitionLeaseSchema.index({ status: 1, leaseExpiresAt: 1 });
PartitionLeaseSchema.index({ userId: 1, aggregateType: 1, aggregateId: 1 });

export const PartitionLeaseModel: Model<IPartitionLeaseDoc> =
  mongoose.models.PartitionLease ||
  mongoose.model<IPartitionLeaseDoc>("PartitionLease", PartitionLeaseSchema);
