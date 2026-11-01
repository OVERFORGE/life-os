import mongoose, { Schema, Document, Model } from "mongoose";

export type ObservationProjectionStatus = "PENDING" | "APPLIED";

export interface IBehavioralObservationDoc extends Document {
  observationId: string;
  userId: string;
  source: string;
  category: "EXECUTION" | "PHYSICAL" | "COGNITIVE" | "ROUTINE" | "TEMPORAL";
  type: string;
  causalSequence: number;
  observedAt: Date;
  data: Record<string, any>;
  projectionStatus: ObservationProjectionStatus;
  createdAt: Date;
  updatedAt: Date;
}

const BehavioralObservationSchema = new Schema(
  {
    observationId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    source: { type: String, required: true },
    category: {
      type: String,
      enum: ["EXECUTION", "PHYSICAL", "COGNITIVE", "ROUTINE", "TEMPORAL"],
      required: true,
    },
    type: { type: String, required: true },
    causalSequence: { type: Number, required: true },
    observedAt: { type: Date, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    projectionStatus: {
      type: String,
      enum: ["PENDING", "APPLIED"],
      default: "PENDING",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Indexes
BehavioralObservationSchema.index({ userId: 1, projectionStatus: 1 });
BehavioralObservationSchema.index({ userId: 1, source: 1, causalSequence: 1 });
BehavioralObservationSchema.index({ userId: 1, observedAt: 1 });
// 90-day TTL index
BehavioralObservationSchema.index({ observedAt: 1 }, { expireAfterSeconds: 7776000 });

export const BehavioralObservationModel: Model<IBehavioralObservationDoc> =
  (mongoose.models.BehavioralObservation as Model<IBehavioralObservationDoc>) ||
  mongoose.model<IBehavioralObservationDoc>(
    "BehavioralObservation",
    BehavioralObservationSchema
  );

