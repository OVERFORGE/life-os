import mongoose, { Schema, Document, Model } from "mongoose";

export interface IIncidentDoc extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  domain: string;
  severity: string;
  status: string;
  startedAt: Date;
  resolvedAt?: Date | null;
  expectedDurationHours: number;
  summary: string;
  symptomsOrSignals: string[];
  operationalConstraints: {
    suppressWorkouts?: boolean;
    maxWorkloadHoursPerDay?: number;
    enforcedSleepTargetHours?: number;
    suspendedGoalIds?: string[];
    notes?: string;
  };
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const OperationalConstraintsSchema = new Schema(
  {
    suppressWorkouts: { type: Boolean, default: false },
    maxWorkloadHoursPerDay: { type: Number },
    enforcedSleepTargetHours: { type: Number },
    suspendedGoalIds: [{ type: String }],
    notes: { type: String },
  },
  { _id: false }
);

const IncidentSchema = new Schema<IIncidentDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    domain: {
      type: String,
      required: true,
      enum: ["health", "work", "environment", "personal", "academic"],
      index: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ["minor", "moderate", "major", "critical"],
      default: "moderate",
    },
    status: {
      type: String,
      required: true,
      enum: ["active", "mitigating", "resolved", "historical"],
      default: "active",
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    expectedDurationHours: {
      type: Number,
      required: true,
      default: 72, // Default 3 days
    },
    summary: {
      type: String,
      required: true,
    },
    symptomsOrSignals: [{ type: String }],
    operationalConstraints: {
      type: OperationalConstraintsSchema,
      default: () => ({}),
    },
    tags: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

IncidentSchema.index({ userId: 1, status: 1, domain: 1 });

export const Incident: Model<IIncidentDoc> =
  (mongoose.models.Incident as Model<IIncidentDoc>) ||
  mongoose.model<IIncidentDoc>("Incident", IncidentSchema);
