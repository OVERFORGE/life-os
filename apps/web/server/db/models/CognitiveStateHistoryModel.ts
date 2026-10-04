import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICognitiveStateHistoryDoc extends Document {
  userId: string;
  timestamp: number;
  stress: {
    estimate: number;
    confidence: number;
    primaryFactors: string[];
  };
  energy: {
    estimate: number;
    confidence: number;
    primaryFactors: string[];
  };
  cognitiveLoad: {
    estimate: number;
    confidence: number;
    primaryFactors: string[];
  };
  focusReadiness: {
    estimate: number;
    confidence: number;
    primaryFactors: string[];
  };
  provenance: "PASSIVE_INFERENCE" | "USER_MICRO_CHECKIN" | "HYBRID";
  temporalValidity: {
    validFrom: number;
    validUntil: number;
    freshnessTimestamp: number;
  };
  disclaimer: string;
  createdAt: Date;
  updatedAt: Date;
}

const CognitiveDimensionSubSchema = new Schema(
  {
    estimate: { type: Number, required: true, min: 0.0, max: 1.0 },
    confidence: { type: Number, required: true, min: 0.0, max: 1.0 },
    primaryFactors: { type: [String], default: [] },
  },
  { _id: false }
);

const CognitiveStateHistorySchema = new Schema<ICognitiveStateHistoryDoc>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    timestamp: {
      type: Number,
      required: true,
      index: true,
    },
    stress: {
      type: CognitiveDimensionSubSchema,
      required: true,
    },
    energy: {
      type: CognitiveDimensionSubSchema,
      required: true,
    },
    cognitiveLoad: {
      type: CognitiveDimensionSubSchema,
      required: true,
    },
    focusReadiness: {
      type: CognitiveDimensionSubSchema,
      required: true,
    },
    provenance: {
      type: String,
      required: true,
      enum: ["PASSIVE_INFERENCE", "USER_MICRO_CHECKIN", "HYBRID"],
      default: "PASSIVE_INFERENCE",
    },
    temporalValidity: {
      validFrom: { type: Number, required: true },
      validUntil: { type: Number, required: true },
      freshnessTimestamp: { type: Number, required: true },
    },
    disclaimer: {
      type: String,
      default: "Operational readiness estimate only; not a medical assessment.",
    },
  },
  {
    collection: "cognitive_state_history",
    timestamps: true,
  }
);

// Compound index for user query
CognitiveStateHistorySchema.index({ userId: 1, timestamp: -1 });

// TTL index: 30 days (2,592,000 seconds)
CognitiveStateHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export const CognitiveStateHistoryModel: Model<ICognitiveStateHistoryDoc> =
  mongoose.models.CognitiveStateHistory ||
  mongoose.model<ICognitiveStateHistoryDoc>("CognitiveStateHistory", CognitiveStateHistorySchema);
