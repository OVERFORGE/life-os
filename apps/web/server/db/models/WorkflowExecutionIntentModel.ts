/**
 * WorkflowExecutionIntentModel.ts
 * 
 * Milestone B — Phase B4: Work Package 3 / Loop 6
 * Mongoose Schema and Model for Durable Workflow Execution Intent (DWCP)
 */

import mongoose, { Schema, Document, Model } from "mongoose";
import { AggregateType } from "../../../../../packages/execution-kernel/src/events/contracts/CanonicalEventContracts";

export interface IWorkflowStepIntent {
  stepIndex: number;
  stepMutationId: string;
  aggregateId: string;
  aggregateType: AggregateType;
  expectedVersion: number;
  domainUpdates: Record<string, any>;
  events: any[];
  status: "PENDING" | "COMMITTED" | "FAILED";
  appliedAt?: Date;
  compensationDiff?: Record<string, any>;
}

export interface IWorkflowExecutionIntentDoc extends Document {
  workflowId: string;
  userId: string;
  fencingEpoch: number;
  workerId: string;
  workflowType: string;
  status: "STAGED" | "EXECUTING" | "COMMITTED" | "FAILED" | "FAILED_TERMINAL" | "COMPENSATING" | "COMPENSATED" | "QUARANTINED";
  steps: IWorkflowStepIntent[];
  errorMessage?: string;
  stagedAt: Date;
  committedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowStepIntentSchema = new Schema<IWorkflowStepIntent>(
  {
    stepIndex: { type: Number, required: true },
    stepMutationId: { type: String, required: true },
    aggregateId: { type: String, required: true },
    aggregateType: { type: String, required: true },
    expectedVersion: { type: Number, required: true },
    domainUpdates: { type: Schema.Types.Mixed, default: {} },
    events: { type: Schema.Types.Mixed, default: [] },
    status: {
      type: String,
      enum: ["PENDING", "COMMITTED", "FAILED"],
      default: "PENDING",
    },
    appliedAt: { type: Date },
    compensationDiff: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const WorkflowExecutionIntentSchema = new Schema<IWorkflowExecutionIntentDoc>(
  {
    workflowId: {
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
    fencingEpoch: {
      type: Number,
      required: true,
      index: true,
    },
    workerId: {
      type: String,
      required: true,
    },
    workflowType: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "STAGED",
        "EXECUTING",
        "COMMITTED",
        "FAILED",
        "FAILED_TERMINAL",
        "COMPENSATING",
        "COMPENSATED",
        "QUARANTINED",
      ],
      default: "STAGED",
      index: true,
    },
    steps: {
      type: [WorkflowStepIntentSchema],
      default: [],
    },
    errorMessage: { type: String },
    stagedAt: { type: Date, default: Date.now },
    committedAt: { type: Date },
    completedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: "workflow_execution_intents",
  }
);

export const WorkflowExecutionIntentModel: Model<IWorkflowExecutionIntentDoc> =
  (mongoose.models.WorkflowExecutionIntent as Model<IWorkflowExecutionIntentDoc>) ||
  mongoose.model<IWorkflowExecutionIntentDoc>("WorkflowExecutionIntent", WorkflowExecutionIntentSchema);
