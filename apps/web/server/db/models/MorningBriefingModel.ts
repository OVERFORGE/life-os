import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMorningBriefingDoc extends Document {
  briefingId: string;
  userId: string;
  date: string;
  audioUrl?: string;
  transcript: string;
  keyInsights: string[];
  proposedScheduleAdjustments: any[];
  readinessScore: number;
  userInteracted: boolean;
  optimizationAccepted?: boolean;
  generatedAt: number;
  createdAt: Date;
  updatedAt: Date;
}

const MorningBriefingSchema = new Schema<IMorningBriefingDoc>(
  {
    briefingId: {
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
    date: {
      type: String,
      required: true,
      index: true,
    },
    audioUrl: {
      type: String,
    },
    transcript: {
      type: String,
      required: true,
    },
    keyInsights: {
      type: [String],
      default: [],
    },
    proposedScheduleAdjustments: {
      type: [Schema.Types.Mixed] as any,
      default: [],
    },
    readinessScore: {
      type: Number,
      required: true,
      min: 0.0,
      max: 1.0,
    },
    userInteracted: {
      type: Boolean,
      default: false,
    },
    optimizationAccepted: {
      type: Boolean,
      default: false,
    },
    generatedAt: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "morning_briefings",
  }
);

// Unique compound index: one briefing per user per day
MorningBriefingSchema.index({ userId: 1, date: 1 }, { unique: true });
// 90-day TTL index
MorningBriefingSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const MorningBriefingModel: Model<IMorningBriefingDoc> =
  (mongoose.models?.MorningBriefing as Model<IMorningBriefingDoc>) ||
  mongoose.model<IMorningBriefingDoc>("MorningBriefing", MorningBriefingSchema);
