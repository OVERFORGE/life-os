/**
 * ExecutionGraphDerivedModel.ts
 * 
 * Derived DAG projection state for Execution Graph unblocking.
 * Milestone B — Step 2 V2.2 Canonical Projection Model.
 */

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGraphNodeSubdoc {
  id: string;
  title: string;
  status: "pending" | "completed" | "blocked" | "in_progress";
  dependencies: string[]; // Node IDs that this node depends upon
  appliedVersion: number;
}

export interface IExecutionGraphDerivedDoc extends Document {
  graphId: string;
  userId: string;
  nodes: IGraphNodeSubdoc[];
  unblockedTaskIds: string[];
  appliedGraphRevision: number;
  projectionRevision: number;
  sourceTaskCount: number;
  sourceVersionSum: number;
  sourceMaxVersion: number;
  derivedFromCausalSequence?: number;
  lastEventId: string;
  lastAppliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GraphNodeSchema = new Schema<IGraphNodeSubdoc>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "completed", "blocked", "in_progress"],
      default: "pending",
    },
    dependencies: [{ type: String }],
    appliedVersion: { type: Number, default: 0 },
  },
  { _id: false }
);

const ExecutionGraphDerivedSchema = new Schema<IExecutionGraphDerivedDoc>(
  {
    graphId: {
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
    nodes: [GraphNodeSchema],
    unblockedTaskIds: [{ type: String }],
    appliedGraphRevision: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    projectionRevision: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    sourceTaskCount: {
      type: Number,
      required: true,
      default: 0,
    },
    sourceVersionSum: {
      type: Number,
      required: true,
      default: 0,
    },
    sourceMaxVersion: {
      type: Number,
      required: true,
      default: 0,
    },
    derivedFromCausalSequence: {
      type: Number,
      default: 0,
      index: true,
    },
    lastEventId: {
      type: String,
      required: true,
      default: "",
    },
    lastAppliedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

ExecutionGraphDerivedSchema.index({ userId: 1 });
ExecutionGraphDerivedSchema.index({ graphId: 1, projectionRevision: 1 });

export const ExecutionGraphDerivedModel: Model<IExecutionGraphDerivedDoc> =
  mongoose.models.ExecutionGraphDerived ||
  mongoose.model<IExecutionGraphDerivedDoc>(
    "ExecutionGraphDerived",
    ExecutionGraphDerivedSchema
  );
