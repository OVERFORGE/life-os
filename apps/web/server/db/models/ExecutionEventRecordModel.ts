import mongoose, { Schema, Document, Model } from "mongoose";

export interface IExecutionEventRecordDoc extends Document {
  executionId: string;
  seq: number;
  eventId: string;
  checkpointId: string;
  type: string;
  source: string;
  timestamp: number;
  payload: any;
  causalityRef?: string;
  retentionExpiresAt?: Date | null;
  createdAt: Date;
}

const ExecutionEventRecordSchema = new Schema<IExecutionEventRecordDoc>(
  {
    executionId: {
      type: String,
      required: true,
      index: true,
    },
    seq: {
      type: Number,
      required: true,
    },
    eventId: {
      type: String,
      required: true,
      unique: true,
    },
    checkpointId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      index: true,
    },
    source: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Number,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    causalityRef: {
      type: String,
    },
    retentionExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound monotonic index: guarantee uniqueness of sequence number per execution
ExecutionEventRecordSchema.index({ executionId: 1, seq: 1 }, { unique: true });
ExecutionEventRecordSchema.index({ retentionExpiresAt: 1 }, { expireAfterSeconds: 0 });

export const ExecutionEventRecordModel: Model<IExecutionEventRecordDoc> =
  mongoose.models.ExecutionEventRecord ||
  mongoose.model<IExecutionEventRecordDoc>("ExecutionEventRecord", ExecutionEventRecordSchema);
