import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAutonomousExecutionLedgerDoc extends Document {
  executionId: string;
  userId: string;
  capabilityURN: string;
  parameters: Record<string, any>;
  riskClass: "LOW";
  reversibility: "REVERSIBLE_EXACT";
  externalSideEffectClass: "NONE" | "REVERSIBLE_EXTERNAL";
  providerGuarantee: "ATOMIC" | "IDEMPOTENT_RETRY";
  policyRuleId: string;
  epistemicConfidence: number;
  rationale: string;
  compensationAction: {
    capabilityURN: string;
    parameters: Record<string, any>;
    expectedReversionEffect: string;
  };
  executedAt: number;
  undoneAt?: number;
  userFeedback?: "APPROVED" | "REVERSED";
  stateSnapshotBefore?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const AutonomousExecutionLedgerSchema = new Schema<IAutonomousExecutionLedgerDoc>(
  {
    executionId: {
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
    capabilityURN: {
      type: String,
      required: true,
    },
    parameters: {
      type: Schema.Types.Mixed,
      default: {},
    },
    riskClass: {
      type: String,
      enum: ["LOW"],
      required: true,
    },
    reversibility: {
      type: String,
      enum: ["REVERSIBLE_EXACT"],
      required: true,
    },
    externalSideEffectClass: {
      type: String,
      enum: ["NONE", "REVERSIBLE_EXTERNAL"],
      required: true,
    },
    providerGuarantee: {
      type: String,
      enum: ["ATOMIC", "IDEMPOTENT_RETRY"],
      required: true,
    },
    policyRuleId: {
      type: String,
      required: true,
    },
    epistemicConfidence: {
      type: Number,
      required: true,
      min: 0.0,
      max: 1.0,
    },
    rationale: {
      type: String,
      required: true,
    },
    compensationAction: {
      type: Schema.Types.Mixed,
      required: true,
    },
    executedAt: {
      type: Number,
      required: true,
      index: true,
    },
    undoneAt: {
      type: Number,
    },
    userFeedback: {
      type: String,
      enum: ["APPROVED", "REVERSED"],
    },
    stateSnapshotBefore: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: "autonomous_execution_ledger",
  }
);

AutonomousExecutionLedgerSchema.index({ userId: 1, executedAt: -1 });

export const AutonomousExecutionLedgerModel: Model<IAutonomousExecutionLedgerDoc> =
  (mongoose.models?.AutonomousExecutionLedger as Model<IAutonomousExecutionLedgerDoc>) ||
  mongoose.model<IAutonomousExecutionLedgerDoc>("AutonomousExecutionLedger", AutonomousExecutionLedgerSchema);
