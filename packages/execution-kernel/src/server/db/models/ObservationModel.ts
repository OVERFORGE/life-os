import mongoose, { Schema, Document, Model } from "mongoose";

export interface IObservationDoc extends Document {
  id: string; // Deterministic unique ID: obs-{type}-{sourceId}-{timestamp}
  type: string;
  userId: string;
  timestamp: number;
  generatedAt: number;
  normalizedValue: number;
  rawValue: any;
  unit: string;
  confidence: number;
  metadata: Record<string, unknown>;
  provenance: {
    source: string;
    sourceId: string;
    subsystem: string;
    extractedAt: number;
    fingerprint?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ObservationSchema = new Schema<IObservationDoc>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      index: true,
    },
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
    generatedAt: {
      type: Number,
      required: true,
    },
    normalizedValue: {
      type: Number,
      required: true,
      min: 0.0,
      max: 1.0,
    },
    rawValue: {
      type: Schema.Types.Mixed,
      required: true,
    },
    unit: {
      type: String,
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0.0,
      max: 1.0,
      default: 1.0,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    provenance: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    collection: "telemetry_observations",
    timestamps: true,
  }
);

// Compound indexes for high-speed multi-source queries
ObservationSchema.index({ userId: 1, timestamp: -1 });
ObservationSchema.index({ userId: 1, type: 1, timestamp: -1 });

// TTL index: auto-expire raw observations after 90 days (7,776,000 seconds)
ObservationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export const ObservationModel: Model<IObservationDoc> =
  mongoose.models.ObservationRecord ||
  mongoose.model<IObservationDoc>("ObservationRecord", ObservationSchema);
