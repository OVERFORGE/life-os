import mongoose, { Schema, Document, Model } from "mongoose";
import { PreferenceAuthority } from "../../../user/PreferenceContracts";

export interface IUserPreferenceItemDoc {
  key: string;
  value: any;
  authority: PreferenceAuthority;
  provenance: {
    source: string;
    sourceId: string;
    subsystem: string;
    extractedAt: number;
    fingerprint?: string;
  };
  confidence: number;
  lastReinforced: number;
  decayHalfLifeDays?: number;
  metadata?: Record<string, unknown>;
}

export interface IUserDeepProfileDoc extends Document {
  userId: string;
  identity: {
    name: string;
    timezone: string;
    role: string;
  };
  preferences: IUserPreferenceItemDoc[];
  operationalConstraints: string[];
  cognitiveBaseline: {
    avgFocusMinutes: number;
    peakHours: number[];
  };
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserPreferenceItemSchema = new Schema(
  {
    key: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    authority: {
      type: String,
      required: true,
      enum: ["EXPLICIT_HARD", "EXPLICIT_SOFT", "CANDIDATE", "LEARNED", "SYSTEM_DEFAULT"],
      default: "SYSTEM_DEFAULT",
    },
    provenance: { type: Schema.Types.Mixed, required: true },
    confidence: { type: Number, required: true, min: 0.0, max: 1.0, default: 1.0 },
    lastReinforced: { type: Number, required: true },
    decayHalfLifeDays: { type: Number },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const UserDeepProfileSchema = new Schema<IUserDeepProfileDoc>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    identity: {
      name: { type: String, default: "" },
      timezone: { type: String, default: "UTC" },
      role: { type: String, default: "" },
    },
    preferences: {
      type: [UserPreferenceItemSchema],
      default: [],
    },
    operationalConstraints: {
      type: [String],
      default: [],
    },
    cognitiveBaseline: {
      avgFocusMinutes: { type: Number, default: 45 },
      peakHours: { type: [Number], default: [9, 10, 11, 14, 15] },
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    collection: "user_deep_profiles",
    timestamps: true,
  }
);

export const UserDeepProfileModel: Model<IUserDeepProfileDoc> =
  mongoose.models.UserDeepProfile ||
  mongoose.model<IUserDeepProfileDoc>("UserDeepProfile", UserDeepProfileSchema);
