import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMemoryJobDoc extends Document {
  jobId: string;
  userId: mongoose.Types.ObjectId;
  conversationId?: string;
  turn: {
    userId: string;
    userMessage: string;
    assistantResponse: string;
    conversationId?: string;
  };
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD_LETTER";
  attempts: number;
  maxAttempts: number;
  nextRetryTimestamp?: Date;
  lastError?: string;
  result?: any;
  heartbeatAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MemoryJobSchema = new Schema<IMemoryJobDoc>(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      default: "default",
    },
    turn: {
      userId: { type: String, required: true },
      userMessage: { type: String, required: true },
      assistantResponse: { type: String, default: "" },
      conversationId: { type: String },
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "DEAD_LETTER"],
      default: "PENDING",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    nextRetryTimestamp: {
      type: Date,
    },
    lastError: {
      type: String,
    },
    result: {
      type: Schema.Types.Mixed,
    },
    heartbeatAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

MemoryJobSchema.index({ status: 1, heartbeatAt: 1 });
MemoryJobSchema.index({ userId: 1, status: 1 });

export const MemoryJob: Model<IMemoryJobDoc> =
  (mongoose.models.MemoryJob as Model<IMemoryJobDoc>) ||
  mongoose.model<IMemoryJobDoc>("MemoryJob", MemoryJobSchema);
