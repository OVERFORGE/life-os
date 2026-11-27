import mongoose, { Schema, Document, Model } from "mongoose";

export interface IExecutionTraceStepSubdoc {
  stepId: string;
  layer: string;
  component: string;
  operation: string;
  status: string;
  startedAtMs: number;
  durationMs: number;
  inputs?: any;
  decision?: any;
  outputs?: any;
  error?: string;
}

export interface IExecutionTraceRecordDoc extends Document {
  traceId: string;
  parentTraceId?: string;
  requestId: string;
  executionId: string;
  conversationId?: string;
  userId: string;
  surface: string;
  status: "RUNNING" | "COMPLETED" | "AWAITING_CONFIRMATION" | "AWAITING_CLARIFICATION" | "FAILED";
  routingStrategy?: string;
  terminationReason?: string;
  startedAt: Date;
  endedAt?: Date;
  durationMs: number;
  userMessagePreview?: string;
  finalResponsePreview?: string;
  finalFrontendPayload?: any;
  steps: IExecutionTraceStepSubdoc[];
  llmCalls: any[];
  kernelActionIds: string[];
  outboxEventIds: string[];
  langsmithRunId?: string;
  langsmithUrl?: string;
  retentionExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ExecutionTraceStepSchema = new Schema<IExecutionTraceStepSubdoc>(
  {
    stepId: { type: String, required: true },
    layer: { type: String, required: true },
    component: { type: String, required: true },
    operation: { type: String, required: true },
    status: { type: String, required: true },
    startedAtMs: { type: Number, required: true },
    durationMs: { type: Number, required: true },
    inputs: { type: Schema.Types.Mixed },
    decision: { type: Schema.Types.Mixed },
    outputs: { type: Schema.Types.Mixed },
    error: { type: String },
  },
  { _id: false }
);

const ExecutionTraceRecordSchema = new Schema<IExecutionTraceRecordDoc>(
  {
    traceId: { type: String, required: true, unique: true, index: true },
    parentTraceId: { type: String, index: true },
    requestId: { type: String, required: true, index: true },
    executionId: { type: String, required: true, index: true },
    conversationId: { type: String, index: true },
    userId: { type: String, required: true, index: true },
    surface: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["RUNNING", "COMPLETED", "AWAITING_CONFIRMATION", "AWAITING_CLARIFICATION", "FAILED"],
      default: "RUNNING",
      index: true,
    },
    routingStrategy: { type: String, index: true },
    terminationReason: { type: String },
    startedAt: { type: Date, required: true, index: true },
    endedAt: { type: Date },
    durationMs: { type: Number, default: 0 },
    userMessagePreview: { type: String },
    finalResponsePreview: { type: String },
    finalFrontendPayload: { type: Schema.Types.Mixed },
    steps: { type: [ExecutionTraceStepSchema], default: [] },
    llmCalls: { type: Schema.Types.Mixed, default: [] },
    kernelActionIds: { type: [String], default: [] },
    outboxEventIds: { type: [String], default: [] },
    langsmithRunId: { type: String },
    langsmithUrl: { type: String },
    retentionExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ExecutionTraceRecordSchema.index({ startedAt: -1 });
ExecutionTraceRecordSchema.index({ userId: 1, startedAt: -1 });
ExecutionTraceRecordSchema.index({ retentionExpiresAt: 1 }, { expireAfterSeconds: 0 });

export const ExecutionTraceRecordModel: Model<IExecutionTraceRecordDoc> =
  mongoose.models.ExecutionTraceRecord ||
  mongoose.model<IExecutionTraceRecordDoc>("ExecutionTraceRecord", ExecutionTraceRecordSchema);
