import mongoose, { Schema, Document, Model } from "mongoose";
import { AttributionCategory, InterventionTargetMetric } from "../../../interventions/contracts/InterventionContracts";

export interface IMeasurementWindowDoc {
  measurementAt: number;
  observedDelta?: number;
  confoundersDetected?: string[];
  attributionConfidence?: number;
  evaluatedStatus?: AttributionCategory;
  measuredAt?: number;
}

export interface IInterventionRecordDoc extends Document {
  interventionId: string;
  userId: string;
  triggerType: "PROACTIVE_ENGINE" | "AVEN_CONVERSATION" | "SCHEDULED_DAEMON";
  crossDomainTensionId?: string;
  stateBefore: {
    lifeState: string;
    cognitiveLoad: number;
    goalPressure: number;
  };
  proposedAction: {
    capabilityURN: string;
    parameters: any;
  };
  expectedOutcome: {
    targetMetric: InterventionTargetMetric;
    expectedDelta: number;
  };
  executedAt: number;
  windows: {
    t4h: IMeasurementWindowDoc;
    t24h: IMeasurementWindowDoc;
  };
  learningImplicationRecorded: boolean;
  userFeedback?: "THUMBS_UP" | "THUMBS_DOWN" | "NEUTRAL";
  createdAt: Date;
  updatedAt: Date;
}

const MeasurementWindowSchema = new Schema(
  {
    measurementAt: { type: Number, required: true },
    observedDelta: { type: Number },
    confoundersDetected: { type: [String], default: [] },
    attributionConfidence: { type: Number, min: 0.0, max: 1.0 },
    evaluatedStatus: {
      type: String,
      enum: ["EFFECTIVE", "LIKELY_EFFECTIVE", "UNCERTAIN", "INEFFECTIVE", "ADVERSE", "NOT_MEASURABLE"],
    },
    measuredAt: { type: Number },
  },
  { _id: false }
);

const InterventionRecordSchema = new Schema<IInterventionRecordDoc>(
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
    triggerType: {
      type: String,
      required: true,
      enum: ["PROACTIVE_ENGINE", "AVEN_CONVERSATION", "SCHEDULED_DAEMON"],
    },
    crossDomainTensionId: {
      type: String,
    },
    stateBefore: {
      lifeState: { type: String, default: "NORMAL" },
      cognitiveLoad: { type: Number, default: 0.5 },
      goalPressure: { type: Number, default: 0.5 },
    },
    proposedAction: {
      capabilityURN: { type: String, required: true },
      parameters: { type: Schema.Types.Mixed, default: {} },
    },
    expectedOutcome: {
      targetMetric: {
        type: String,
        required: true,
        enum: ["task_completion_rate", "stress_reduction", "focus_duration"],
      },
      expectedDelta: { type: Number, required: true },
    },
    executedAt: {
      type: Number,
      required: true,
    },
    windows: {
      t4h: { type: MeasurementWindowSchema, required: true },
      t24h: { type: MeasurementWindowSchema, required: true },
    },
    learningImplicationRecorded: {
      type: Boolean,
      default: false,
    },
    userFeedback: {
      type: String,
      enum: ["THUMBS_UP", "THUMBS_DOWN", "NEUTRAL"],
    },
  },
  {
    collection: "intervention_records",
    timestamps: true,
  }
);

InterventionRecordSchema.index({ userId: 1, "windows.t4h.measurementAt": 1 });
InterventionRecordSchema.index({ userId: 1, "windows.t24h.measurementAt": 1 });

export const InterventionRecordModel: Model<IInterventionRecordDoc> =
  mongoose.models.InterventionRecord ||
  mongoose.model<IInterventionRecordDoc>("InterventionRecord", InterventionRecordSchema);
