import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITemporalOccurrenceDoc extends Document {
  occurrenceId: string;
  userId: string;
  seriesId?: string;
  title: string;
  kind: "HARD_EVENT" | "ROUTINE_BLOCK" | "WORK_SESSION" | "TRANSITION_BUFFER" | "EPHEMERAL_PING";
  dateOnly: string; // YYYY-MM-DD
  plannedInterval: {
    dateOnly: string;
    startMinute: number;
    endMinute: number;
    durationMinutes: number;
    startIsoUtc: string;
    endIsoUtc: string;
    timezone: string;
    isMidnightCrossing: boolean;
  };
  locationContext: {
    category: "HOME" | "WORK_SITE" | "ACADEMIC" | "GYM" | "TRANSIT" | "THIRD_PLACE" | "VIRTUAL" | "CUSTOM";
    label?: string;
    customIdentifier?: string;
    requiresPhysicalTransit?: boolean;
  };
  rigidity: "UNMOVABLE" | "ELASTIC" | "OPTIONAL";
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "CANCELLED" | "RESCHEDULED";
  linkedEntity?: {
    entityType: "task" | "goal" | "workout" | "none";
    entityId?: string;
    taskTitle?: string;
  };
  version: number;
  overrideType: "NONE" | "SINGLE_INSTANCE_MODIFIED" | "SINGLE_INSTANCE_CANCELLED";
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const PlannedIntervalSchema = new Schema(
  {
    dateOnly: { type: String, required: true },
    startMinute: { type: Number, required: true, min: 0, max: 1439 },
    endMinute: { type: Number, required: true },
    durationMinutes: { type: Number, required: true, min: 0 },
    startIsoUtc: { type: String, required: true },
    endIsoUtc: { type: String, required: true },
    timezone: { type: String, required: true, default: "UTC" },
    isMidnightCrossing: { type: Boolean, default: false },
  },
  { _id: false }
);

const LocationContextSchema = new Schema(
  {
    category: {
      type: String,
      enum: ["HOME", "WORK_SITE", "ACADEMIC", "GYM", "TRANSIT", "THIRD_PLACE", "VIRTUAL", "CUSTOM"],
      default: "HOME",
    },
    label: { type: String, default: "" },
    customIdentifier: { type: String },
    requiresPhysicalTransit: { type: Boolean, default: true },
  },
  { _id: false }
);

const LinkedEntitySchema = new Schema(
  {
    entityType: {
      type: String,
      enum: ["task", "goal", "workout", "none"],
      default: "none",
    },
    entityId: { type: String },
    taskTitle: { type: String },
  },
  { _id: false }
);

const TemporalOccurrenceSchema = new Schema<ITemporalOccurrenceDoc>(
  {
    occurrenceId: {
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
    seriesId: {
      type: String,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    kind: {
      type: String,
      enum: ["HARD_EVENT", "ROUTINE_BLOCK", "WORK_SESSION", "TRANSITION_BUFFER", "EPHEMERAL_PING"],
      required: true,
      index: true,
    },
    dateOnly: {
      type: String,
      required: true,
      index: true,
    },
    plannedInterval: {
      type: PlannedIntervalSchema,
      required: true,
    },
    locationContext: {
      type: LocationContextSchema,
      default: () => ({ category: "HOME", requiresPhysicalTransit: false }),
    },
    rigidity: {
      type: String,
      enum: ["UNMOVABLE", "ELASTIC", "OPTIONAL"],
      default: "ELASTIC",
    },
    status: {
      type: String,
      enum: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "SKIPPED", "CANCELLED", "RESCHEDULED"],
      default: "SCHEDULED",
      index: true,
    },
    linkedEntity: {
      type: LinkedEntitySchema,
      default: () => ({ entityType: "none" }),
    },
    version: {
      type: Number,
      default: 1,
    },
    overrideType: {
      type: String,
      enum: ["NONE", "SINGLE_INSTANCE_MODIFIED", "SINGLE_INSTANCE_CANCELLED"],
      default: "NONE",
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Compound indexes for fast query resolution and day-level concurrency locking
TemporalOccurrenceSchema.index({ userId: 1, dateOnly: 1 });
TemporalOccurrenceSchema.index({ userId: 1, status: 1, dateOnly: 1 });
TemporalOccurrenceSchema.index({ userId: 1, seriesId: 1, dateOnly: 1 });

export const TemporalOccurrence: Model<ITemporalOccurrenceDoc> =
  mongoose.models.TemporalOccurrence ||
  mongoose.model<ITemporalOccurrenceDoc>("TemporalOccurrence", TemporalOccurrenceSchema);
