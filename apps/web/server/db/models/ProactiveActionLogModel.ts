import mongoose, { Schema, Document, Model } from "mongoose";
import { AutonomyLevel, ProactiveDomain } from "../../../../../packages/execution-kernel/src/proactive/contracts/ProactiveContracts";

export interface IProactiveActionLogDoc extends Document {
  actionId: string;
  userId: string;
  candidateId: string;
  autonomyLevel: AutonomyLevel;
  domain: ProactiveDomain;
  triggerRule: string;
  confidenceScore: number;
  actionValueScore: number;
  interruptionCostScore: number;
  notificationDispatched: boolean;
  userResponse?: "APPROVED" | "REJECTED" | "DISMISSED" | "IGNORED";
  executionCommitted: boolean;
  executionError?: string;
  executedAt: number;
  dedupKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProactiveActionLogSchema = new Schema<IProactiveActionLogDoc>(
  {
    actionId: {
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
    candidateId: {
      type: String,
      required: true,
    },
    autonomyLevel: {
      type: String,
      enum: ["L0", "L1", "L2", "L3", "L4", "L5"],
      required: true,
    },
    domain: {
      type: String,
      enum: ["SCHEDULE", "HEALTH", "FOCUS", "TASK", "SYSTEM"],
      required: true,
    },
    triggerRule: {
      type: String,
      required: true,
    },
    confidenceScore: {
      type: Number,
      required: true,
      min: 0.0,
      max: 1.0,
    },
    actionValueScore: {
      type: Number,
      required: true,
      min: 0.0,
      max: 1.0,
    },
    interruptionCostScore: {
      type: Number,
      required: true,
      min: 0.0,
      max: 2.0,
    },
    notificationDispatched: {
      type: Boolean,
      default: false,
    },
    userResponse: {
      type: String,
      enum: ["APPROVED", "REJECTED", "DISMISSED", "IGNORED"],
    },
    executionCommitted: {
      type: Boolean,
      default: false,
    },
    executionError: {
      type: String,
    },
    executedAt: {
      type: Number,
      required: true,
    },
    dedupKey: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "proactive_action_log",
  }
);

// 60-day TTL index
ProactiveActionLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });
ProactiveActionLogSchema.index({ userId: 1, executedAt: -1 });

export const ProactiveActionLogModel: Model<IProactiveActionLogDoc> =
  (mongoose.models?.ProactiveActionLog as Model<IProactiveActionLogDoc>) ||
  mongoose.model<IProactiveActionLogDoc>("ProactiveActionLog", ProactiveActionLogSchema);
