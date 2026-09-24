import mongoose, { Schema, Document, Model } from "mongoose";

export interface IExecutionChronicleDoc extends Document {
  chronicleId: string;
  userId: string;
  occurrenceId?: string;
  entityType: "task" | "goal" | "workout" | "routine" | "general";
  entityId?: string;
  title: string;
  startedAtMs: number;
  endedAtMs: number;
  durationMinutes: number;
  interruptionsCount: number;
  completedWorkUnits: string[];
  notes?: string;
  source: "aven_voice" | "web_manual" | "mobile_touch" | "desktop_heartbeat" | "imported";
  createdAt: Date;
}

const ExecutionChronicleSchema = new Schema<IExecutionChronicleDoc>(
  {
    chronicleId: {
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
    occurrenceId: {
      type: String,
      index: true,
    },
    entityType: {
      type: String,
      enum: ["task", "goal", "workout", "routine", "general"],
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    startedAtMs: {
      type: Number,
      required: true,
      index: true,
    },
    endedAtMs: {
      type: Number,
      required: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    interruptionsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    completedWorkUnits: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      default: "",
    },
    source: {
      type: String,
      enum: ["aven_voice", "web_manual", "mobile_touch", "desktop_heartbeat", "imported"],
      default: "web_manual",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Append-only immutable chronicle
  }
);

ExecutionChronicleSchema.index({ userId: 1, startedAtMs: 1 });
ExecutionChronicleSchema.index({ userId: 1, entityId: 1, startedAtMs: 1 });

export const ExecutionChronicle: Model<IExecutionChronicleDoc> =
  mongoose.models.ExecutionChronicle ||
  mongoose.model<IExecutionChronicleDoc>("ExecutionChronicle", ExecutionChronicleSchema);
