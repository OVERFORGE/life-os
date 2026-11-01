import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITemporalPartitionRevisionDoc extends Document {
  userId: string;
  dateStr: string; // YYYY-MM-DD
  partitionRevision: number;
  publishedReportRevision: number;
  stagedSweepRevision: number;
  sweepWorkerId?: string | null;
  sweepLeaseExpiresAt?: Date | null;
  lastModifiedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TemporalPartitionRevisionSchema = new Schema<ITemporalPartitionRevisionDoc>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    dateStr: {
      type: String,
      required: true,
      index: true,
    },
    partitionRevision: {
      type: Number,
      required: true,
      default: 0,
    },
    publishedReportRevision: {
      type: Number,
      required: true,
      default: 0,
    },
    stagedSweepRevision: {
      type: Number,
      default: 0,
    },
    sweepWorkerId: {
      type: String,
      default: null,
    },
    sweepLeaseExpiresAt: {
      type: Date,
      default: null,
    },
    lastModifiedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

TemporalPartitionRevisionSchema.index({ userId: 1, dateStr: 1 }, { unique: true });

export const TemporalPartitionRevisionModel: Model<ITemporalPartitionRevisionDoc> =
  mongoose.models.TemporalPartitionRevision ||
  mongoose.model<ITemporalPartitionRevisionDoc>(
    "TemporalPartitionRevision",
    TemporalPartitionRevisionSchema
  );

