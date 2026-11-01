/**
 * AutonomousInterventionModel.ts
 * 
 * Milestone B — Phase B4: Work Package 4 / Loop 8
 * Human-In-The-Loop (HITL) Interactive Interventions & Governance
 */

import mongoose, { Schema, Document, Model } from "mongoose";
import { AutonomyLevel } from "../../../../../packages/execution-kernel/src/proactive/contracts/ProactiveContracts";

export interface IAutonomousInterventionDoc extends Document {
  interventionId: string;
  userId: string;
  actionId: string;
  autonomyLevel: AutonomyLevel;
  domain: string;
  proposal: Record<string, any>;
  signature: string;
  keyVersion: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "DISMISSED" | "EXPIRED";
  mutationEpoch?: number;
  expiresAt: Date;
  respondedAt?: Date;
  responseMetadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const AutonomousInterventionSchema = new Schema<IAutonomousInterventionDoc>(
  {
    interventionId: {
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
    actionId: {
      type: String,
      required: true,
      index: true,
    },
    autonomyLevel: {
      type: String,
      enum: ["L0", "L1", "L2", "L3", "L4", "L5"],
      required: true,
    },
    domain: {
      type: String,
      required: true,
    },
    proposal: {
      type: Schema.Types.Mixed,
      required: true,
    },
    signature: {
      type: String,
      required: true,
    },
    keyVersion: {
      type: Number,
      required: true,
      default: 1,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "DISMISSED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },
    mutationEpoch: {
      type: Number,
      default: 1,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    respondedAt: {
      type: Date,
    },
    responseMetadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: "autonomous_interventions",
  }
);

export const AutonomousInterventionModel: Model<IAutonomousInterventionDoc> =
  (mongoose.models.AutonomousIntervention as Model<IAutonomousInterventionDoc>) ||
  mongoose.model<IAutonomousInterventionDoc>("AutonomousIntervention", AutonomousInterventionSchema);

