import mongoose, { Schema, Document, Model } from "mongoose";

export interface IContextModeDoc extends Document {
  userId: string;
  mode: string;
  title: string;
  reason: string;
  startedAt: Date;
  expiresAt?: Date | null;
  isActive: boolean;
  config: {
    targetGoalIds?: string[];
    pausedGoalIds?: string[];
    allowUrgencyElevation?: boolean;
    suppressBurnoutAlarms?: boolean;
    minSleepProtectionHours?: number;
    velocityExpectationMultiplier?: number;
    stressToleranceMultiplier?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ContextModeConfigSchema = new Schema(
  {
    targetGoalIds: [{ type: String }],
    pausedGoalIds: [{ type: String }],
    allowUrgencyElevation: { type: Boolean, default: true },
    suppressBurnoutAlarms: { type: Boolean, default: false },
    minSleepProtectionHours: { type: Number, default: 7.0 },
    velocityExpectationMultiplier: { type: Number, default: 1.0 },
    stressToleranceMultiplier: { type: Number, default: 1.0 },
  },
  { _id: false }
);

const ContextModeSchema = new Schema<IContextModeDoc>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    mode: {
      type: String,
      required: true,
      enum: ["standard", "sprint", "sanctuary", "sabbatical"],
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      default: "",
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    config: {
      type: ContextModeConfigSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

ContextModeSchema.index({ userId: 1, isActive: 1 });

export const ContextModeModel: Model<IContextModeDoc> =
  mongoose.models.ContextMode ||
  mongoose.model<IContextModeDoc>("ContextMode", ContextModeSchema);
