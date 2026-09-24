import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITemporalSeriesTemplateDoc extends Document {
  seriesId: string;
  userId: string;
  title: string;
  kind: "HARD_EVENT" | "ROUTINE_BLOCK" | "WORK_SESSION" | "TRANSITION_BUFFER" | "EPHEMERAL_PING";
  locationContext: {
    category: "HOME" | "WORK_SITE" | "ACADEMIC" | "GYM" | "TRANSIT" | "THIRD_PLACE" | "VIRTUAL" | "CUSTOM";
    label?: string;
    customIdentifier?: string;
    requiresPhysicalTransit?: boolean;
  };
  recurrence: {
    frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
    interval: number;
    daysOfWeek?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    effectiveStartDate: string;
    effectiveEndDate?: string;
    count?: number;
  };
  baseStartTime: string; // HH:MM (24-hour format)
  baseDurationMinutes: number;
  linkedEntity?: {
    entityType: "task" | "goal" | "none";
    entityId?: string;
  };
  status: "ACTIVE" | "ARCHIVED";
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const RecurrenceRuleSchema = new Schema(
  {
    frequency: {
      type: String,
      enum: ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"],
      required: true,
      default: "WEEKLY",
    },
    interval: { type: Number, default: 1 },
    daysOfWeek: [{ type: Number, min: 0, max: 6 }],
    effectiveStartDate: {
      type: String,
      default: () => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      },
    },
    effectiveEndDate: { type: String },
    count: { type: Number },
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
      enum: ["task", "goal", "none"],
      default: "none",
    },
    entityId: { type: String },
  },
  { _id: false }
);

const TemporalSeriesTemplateSchema = new Schema<ITemporalSeriesTemplateDoc>(
  {
    seriesId: {
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
    locationContext: {
      type: LocationContextSchema,
      default: () => ({ category: "HOME", requiresPhysicalTransit: false }),
    },
    recurrence: {
      type: RecurrenceRuleSchema,
      required: true,
    },
    baseStartTime: {
      type: String,
      required: true, // HH:MM
    },
    baseDurationMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    linkedEntity: {
      type: LinkedEntitySchema,
      default: () => ({ entityType: "none" }),
    },
    status: {
      type: String,
      enum: ["ACTIVE", "ARCHIVED"],
      default: "ACTIVE",
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

TemporalSeriesTemplateSchema.index({ userId: 1, status: 1 });

export const TemporalSeriesTemplate: Model<ITemporalSeriesTemplateDoc> =
  mongoose.models.TemporalSeriesTemplate ||
  mongoose.model<ITemporalSeriesTemplateDoc>("TemporalSeriesTemplate", TemporalSeriesTemplateSchema);
